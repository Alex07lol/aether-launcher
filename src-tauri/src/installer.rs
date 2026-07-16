use std::path::{Path, PathBuf};

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
