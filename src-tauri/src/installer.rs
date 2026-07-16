use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct ManifestFile {
    pub path: String,       // Relative path under base_dir, e.g. "libraries/lwjgl.jar"
    pub url: String,        // Remote download URL
    pub sha256: String,     // Expected hex-encoded SHA-256 hash
    pub size: u64,          // Expected size in bytes
}

#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct VersionManifest {
    pub version: String,
    pub files: Vec<ManifestFile>,
}

#[tauri::command]
pub fn get_minecraft_dir() -> Result<String, String> {
    // Detect Windows and Linux automatically at compile-time/runtime
    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = std::env::var_os("APPDATA") {
            let mut path = PathBuf::from(app_data);
            path.push(".minecraft");
            return Ok(path.to_string_lossy().to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let mut path = PathBuf::from(home);
            path.push(".minecraft");
            return Ok(path.to_string_lossy().to_string());
        }
    }

    // Fallback path (e.g. Android/Termux compile hosts)
    if let Some(home) = std::env::var_os("HOME") {
        let mut path = PathBuf::from(home);
        path.push(".minecraft");
        return Ok(path.to_string_lossy().to_string());
    }

    Err("Could not automatically determine system home/appdata directory".to_string())
}

#[tauri::command]
pub fn initialize_minecraft_structure(base_dir: String) -> Result<(), String> {
    let base = Path::new(&base_dir);

    // Mandated directories: .minecraft root, libraries, versions, assets, mods
    let subdirs = ["libraries", "versions", "assets", "mods"];

    // Create .minecraft base folder
    std::fs::create_dir_all(base)
        .map_err(|e| format!("Failed to create .minecraft root directory: {}", e))?;

    // Create subfolders
    for sub in subdirs.iter() {
        let path = base.join(sub);
        std::fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create subfolder '{}': {}", sub, e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn verify_manifest(
    base_dir: String,
    manifest_json: String,
    force_repair: bool,
) -> Result<Vec<ManifestFile>, String> {
    let manifest: VersionManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| format!("Failed to parse version manifest JSON: {}", e))?;

    let base = Path::new(&base_dir);
    let mut files_to_download = Vec::new();

    for file in manifest.files {
        let abs_path = base.join(&file.path);

        if !abs_path.exists() {
            files_to_download.push(file);
            continue;
        }

        // Fast check: If size matches and force_repair is false, we can skip SHA256 hashing
        if !force_repair {
            if let Ok(metadata) = std::fs::metadata(&abs_path) {
                if metadata.len() == file.size {
                    // Size matches, assume file is valid to speed up launch check
                    continue;
                }
            }
        }

        // If force_repair is true, or size is mismatched, calculate SHA-256 to ensure file integrity
        match crate::downloader::calculate_sha256(&abs_path) {
            Ok(hash) => {
                if hash.to_lowercase() != file.sha256.to_lowercase() {
                    // Mismatched hash, needs update/repair
                    let _ = std::fs::remove_file(&abs_path); // Remove corrupted/outdated file
                    files_to_download.push(file);
                }
            }
            Err(_) => {
                // If hashing fails, mark as download target
                let _ = std::fs::remove_file(&abs_path);
                files_to_download.push(file);
            }
        }
    }

    Ok(files_to_download)
}

#[tauri::command]
pub fn clear_minecraft_cache(base_dir: String) -> Result<(), String> {
    let base = Path::new(&base_dir);
    if base.exists() {
        let subdirs = ["libraries", "versions", "assets", "mods"];
        for sub in subdirs.iter() {
            let path = base.join(sub);
            if path.exists() {
                let _ = std::fs::remove_dir_all(&path);
            }
        }
    }
    Ok(())
}

#[derive(serde::Serialize, Clone)]
struct ForgeProgress {
    status: String,
    progress: u32,
    message: String,
}

#[tauri::command]
pub fn get_forge_version(mc_version: String) -> Result<String, String> {
    match mc_version.as_str() {
        "1.8.9" => Ok("11.15.1.2318".to_string()),
        "1.7.10" => Ok("10.13.4.1614".to_string()),
        _ => Err(format!("Minecraft version {} does not have a pre-configured Forge release.", mc_version)),
    }
}

#[tauri::command]
pub async fn install_forge(
    app: AppHandle,
    mc_version: String,
    forge_version: String,
    minecraft_dir: String,
) -> Result<(), String> {
    let lib_dir = Path::new(&minecraft_dir).join("libraries");
    std::fs::create_dir_all(&lib_dir).map_err(|e| format!("Failed to create libraries directory: {}", e))?;

    // 1. Emit downloading event
    let _ = app.emit("forge-progress", ForgeProgress {
        status: "downloading".to_string(),
        progress: 10,
        message: "Connecting to Forge servers...".to_string(),
    });

    let url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{0}-{1}/forge-{0}-{1}-installer.jar",
        mc_version, forge_version
    );

    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| {
        let _ = app.emit("forge-progress", ForgeProgress {
            status: "failed".to_string(),
            progress: 0,
            message: format!("Download request failed: {}", e),
        });
        format!("Download request failed: {}", e)
    })?;

    if !res.status().is_success() {
        let err_msg = format!("Server returned status code: {}", res.status());
        let _ = app.emit("forge-progress", ForgeProgress {
            status: "failed".to_string(),
            progress: 0,
            message: err_msg.clone(),
        });
        return Err(err_msg);
    }

    let _ = app.emit("forge-progress", ForgeProgress {
        status: "downloading".to_string(),
        progress: 30,
        message: "Downloading installer archive...".to_string(),
    });

    let bytes = res.bytes().await.map_err(|e| {
        let _ = app.emit("forge-progress", ForgeProgress {
            status: "failed".to_string(),
            progress: 0,
            message: format!("Failed to read downloaded bytes: {}", e),
        });
        format!("Failed to read downloaded bytes: {}", e)
    })?;

    // 2. Save the installer jar itself
    let installer_name = format!("forge-{}-{}-installer.jar", mc_version, forge_version);
    let installer_path = lib_dir.join(&installer_name);
    std::fs::write(&installer_path, &bytes).map_err(|e| {
        let _ = app.emit("forge-progress", ForgeProgress {
            status: "failed".to_string(),
            progress: 0,
            message: format!("Failed to write installer jar to disk: {}", e),
        });
        format!("Failed to write installer jar to disk: {}", e)
    })?;

    // 3. Emit extracting event
    let _ = app.emit("forge-progress", ForgeProgress {
        status: "extracting".to_string(),
        progress: 60,
        message: "Extracting Forge libraries...".to_string(),
    });

    let reader = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| {
        let _ = app.emit("forge-progress", ForgeProgress {
            status: "failed".to_string(),
            progress: 0,
            message: format!("Failed to read zip archive: {}", e),
        });
        format!("Failed to parse zip archive: {}", e)
    })?;

    // Extract all inner jar files to libraries directory
    let archive_len = archive.len();
    for i in 0..archive_len {
        let mut file = match archive.by_index(i) {
            Ok(file) => file,
            Err(_) => continue,
        };

        let name = file.name().to_string();
        if name.ends_with(".jar") {
            let path = Path::new(&name);
            if let Some(filename) = path.file_name() {
                let dest_path = lib_dir.join(filename);
                if let Ok(mut dest_file) = std::fs::File::create(&dest_path) {
                    let _ = std::io::copy(&mut file, &mut dest_file);
                }
            }
        }

        // Limit event emission frequency
        if i % 10 == 0 || i == archive_len - 1 {
            let progress_percent = 60 + ((i as f32 / archive_len as f32) * 30.0) as u32;
            let _ = app.emit("forge-progress", ForgeProgress {
                status: "extracting".to_string(),
                progress: progress_percent,
                message: format!("Extracting library {} of {}...", i + 1, archive_len),
            });
        }
    }

    // 4. Emit completed event
    let _ = app.emit("forge-progress", ForgeProgress {
        status: "completed".to_string(),
        progress: 100,
        message: "Forge installation successfully completed!".to_string(),
    });

    Ok(())
}

