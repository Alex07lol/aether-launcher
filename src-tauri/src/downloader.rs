use std::fs::{OpenOptions, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::time::Instant;
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;
use std::sync::Arc;
use reqwest::header::{HeaderValue, RANGE};
use reqwest::Client;
use tauri::{AppHandle, Emitter};
use std::sync::OnceLock;

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    url: String,
    dest_path: String,
    bytes_downloaded: u64,
    total_bytes: u64,
    progress: f32,
    speed: String,
    current_file: String,
    status: String,
}

fn cancel_tokens() -> &'static Arc<Mutex<std::collections::HashSet<String>>> {
    static TOKENS: OnceLock<Arc<Mutex<std::collections::HashSet<String>>>> = OnceLock::new();
    TOKENS.get_or_init(|| Arc::new(Mutex::new(std::collections::HashSet::new())))
}

#[tauri::command]
pub async fn cancel_download(url: String) -> Result<(), String> {
    let mut tokens = cancel_tokens().lock().await;
    tokens.insert(url);
    Ok(())
}

fn get_http_client() -> &'static Client {
    static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .pool_max_idle_per_host(10)
            .build()
            .unwrap_or_default()
    })
}

#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    url: String,
    dest_path: String,
    expected_sha256: Option<String>,
) -> Result<String, String> {
    // Check if cancellation token was set, clear it if so
    {
        let mut tokens = cancel_tokens().lock().await;
        tokens.remove(&url);
    }

    let dest_file_path = Path::new(&dest_path);
    
    // Ensure parent directory exists
    if let Some(parent) = dest_file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories: {}", e))?;
    }

    let client = get_http_client();

    // 1. Support Resuming: Check if the file already exists and get its size
    let mut start_byte = 0;
    if dest_file_path.exists() {
        if let Ok(metadata) = std::fs::metadata(dest_file_path) {
            start_byte = metadata.len();
        }
    }

    // 2. Perform GET Request
    let mut request = client.get(&url);
    if start_byte > 0 {
        // Send Range header to resume download
        request = request.header(RANGE, HeaderValue::from_str(&format!("bytes={}-", start_byte)).unwrap());
    }

    let mut response = request
        .send()
        .await
        .map_err(|e| format!("Network request failed: {}", e))?;

    let status = response.status();
    
    // Check if server supports range requests if we sent one
    let is_resume = start_byte > 0 && (status == reqwest::StatusCode::PARTIAL_CONTENT);
    
    let total_bytes = if is_resume {
        // If resuming, Content-Length is the REMAINING bytes. Total is start_byte + remaining.
        let remaining = response.content_length().unwrap_or(0);
        start_byte + remaining
    } else {
        // If not resuming (or server ignored range), reset start_byte to 0
        start_byte = 0;
        response.content_length().unwrap_or(0)
    };

    // Open file in write/append mode
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(is_resume)
        .truncate(!is_resume)
        .open(dest_file_path)
        .map_err(|e| format!("Failed to open destination file: {}", e))?;

    // Move write cursor if appending
    if is_resume {
        file.seek(SeekFrom::End(0)).map_err(|e| format!("Seek failed: {}", e))?;
    }

    let mut bytes_downloaded = start_byte;
    let mut last_emit = Instant::now();
    let start_time = Instant::now();
    let file_name = dest_file_path.file_name().unwrap_or_default().to_string_lossy().to_string();

    // Loop through response body chunks
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Error while downloading stream: {}", e))? {
        // Check for cancellation
        {
            let tokens = cancel_tokens().lock().await;
            if tokens.contains(&url) {
                return Err("Download cancelled by user".to_string());
            }
        }

        file.write_all(&chunk).map_err(|e| format!("Failed to write to disk: {}", e))?;
        bytes_downloaded += chunk.len() as u64;

        // Limit event emission frequency to avoid flooding ipc (e.g., every 150ms)
        if last_emit.elapsed().as_millis() > 150 || bytes_downloaded == total_bytes {
            last_emit = Instant::now();
            let elapsed = start_time.elapsed().as_secs_f64();
            
            // Speed calculation
            let bytes_since_start = bytes_downloaded - start_byte;
            let speed_bps = if elapsed > 0.0 { bytes_since_start as f64 / elapsed } else { 0.0 };
            let speed = format_speed(speed_bps);
            
            let progress = if total_bytes > 0 {
                (bytes_downloaded as f32 / total_bytes as f32) * 100.0
            } else {
                0.0
            };

            let payload = ProgressPayload {
                url: url.clone(),
                dest_path: dest_path.clone(),
                bytes_downloaded,
                total_bytes,
                progress,
                speed,
                current_file: file_name.clone(),
                status: "downloading".to_string(),
            };

            // Emit to all windows
            let _ = app.emit("download-progress", payload);
        }
    }

    // Flush file buffers to disk
    file.sync_all().map_err(|e| format!("Failed to sync file buffer: {}", e))?;

    // 3. Verify SHA-256 if expected hash is provided and not empty
    if let Some(ref expected_hash) = expected_sha256 {
        if !expected_hash.is_empty() {
            // Update status to verifying
            let _ = app.emit("download-progress", ProgressPayload {
                url: url.clone(),
                dest_path: dest_path.clone(),
                bytes_downloaded,
                total_bytes,
                progress: 100.0,
                speed: "0 KB/s".to_string(),
                current_file: file_name.clone(),
                status: "verifying".to_string(),
            });

            let calculated_hash = calculate_sha256(dest_file_path)?;
            if calculated_hash.to_lowercase() != expected_hash.to_lowercase() {
                // Remove corrupted file so it gets redownloaded on retry
                let _ = std::fs::remove_file(dest_file_path);
                return Err(format!(
                    "SHA256 verification failed! Expected: {}, Calculated: {}",
                    expected_hash, calculated_hash
                ));
            }
        }
    }

    // Final Success emit
    let _ = app.emit("download-progress", ProgressPayload {
        url: url.clone(),
        dest_path: dest_path.clone(),
        bytes_downloaded,
        total_bytes,
        progress: 100.0,
        speed: "0 KB/s".to_string(),
        current_file: file_name.clone(),
        status: "completed".to_string(),
    });

    Ok(dest_path)
}

pub fn calculate_sha256(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file for hashing: {}", e))?;
    let mut reader = std::io::BufReader::with_capacity(256 * 1024, file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 256 * 1024]; // 256KB buffer for high throughput

    loop {
        let n = reader.read(&mut buffer).map_err(|e| format!("Error reading file for hashing: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

fn format_speed(bps: f64) -> String {
    if bps >= 1024.0 * 1024.0 {
        format!("{:.1} MB/s", bps / (1024.0 * 1024.0))
    } else if bps >= 1024.0 {
        format!("{:.1} KB/s", bps / 1024.0)
    } else {
        format!("{:.0} B/s", bps)
    }
}
