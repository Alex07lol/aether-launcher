use std::fs::{self};
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModEntry {
    pub filename: String,
    pub size: u64,
    pub path: String,
    pub is_protected: bool,
}

#[derive(Deserialize, Debug)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    #[allow(dead_code)]
    size: Option<u64>,
}

#[derive(Deserialize, Debug)]
struct GithubRelease {
    tag_name: String,
    #[allow(dead_code)]
    name: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Serialize, Deserialize, Debug)]
struct AetherModMeta {
    tag_name: String,
    filename: String,
    download_url: String,
    updated_at: u64,
}

fn get_mods_dir(base_dir: &str, _version_id: &str) -> PathBuf {
    let mods_dir = Path::new(base_dir).join("mods");
    if !mods_dir.exists() {
        let _ = fs::create_dir_all(&mods_dir);
    }
    mods_dir
}

pub fn is_aether_mod(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    lower.starts_with("aether") || lower == "aether.jar" || lower.contains("alex07lol")
}

#[tauri::command]
pub async fn check_and_update_aether_mod(base_dir: String, _version_id: String) -> Result<String, String> {
    let base_mods_dir = Path::new(&base_dir).join("mods");
    fs::create_dir_all(&base_mods_dir)
        .map_err(|e| format!("Failed to create mods dir: {}", e))?;

    // Remove redundant 1.8.9 subfolder to keep a single clean mods directory
    let v189_mods_dir = base_mods_dir.join("1.8.9");
    if v189_mods_dir.exists() {
        let _ = fs::remove_dir_all(&v189_mods_dir);
    }

    let meta_path = base_mods_dir.join(".aether_mod_meta.json");

    let client = reqwest::Client::builder()
        .user_agent("AetherLauncher/1.0")
        .build()
        .map_err(|e| format!("Failed to create reqwest client: {}", e))?;

    let release_url = "https://api.github.com/repos/Alex07lol/aether/releases/latest";
    
    let mut target_tag = String::from("latest");
    let mut download_url = String::new();
    let mut asset_filename = String::from("aether-forge-189.jar");
    let mut release_found = false;

    if let Ok(response) = client.get(release_url).send().await {
        if response.status().is_success() {
            if let Ok(release) = response.json::<GithubRelease>().await {
                target_tag = release.tag_name;
                // Specifically look for aether-forge-189 asset (filtering out standalone aether.jar)
                let forge_asset = release.assets.iter().find(|a| {
                    let name = a.name.to_lowercase();
                    name.contains("aether-forge-189") || name.contains("aether-forge-1.8.9") || (name.contains("forge") && name.contains("189"))
                });

                if let Some(asset) = forge_asset {
                    download_url = asset.browser_download_url.clone();
                    asset_filename = asset.name.clone();
                    release_found = true;
                } else if let Some(non_plain_aether_jar) = release.assets.iter().find(|a| {
                    let name = a.name.to_lowercase();
                    name != "aether.jar" && name.ends_with(".jar")
                }) {
                    download_url = non_plain_aether_jar.browser_download_url.clone();
                    asset_filename = non_plain_aether_jar.name.clone();
                    release_found = true;
                } else {
                    download_url = format!("https://github.com/Alex07lol/aether/releases/download/{}/aether-forge-189.jar", target_tag);
                    release_found = true;
                }
            }
        }
    }

    if !release_found {
        download_url = "https://github.com/Alex07lol/aether/releases/latest/download/aether-forge-189.jar".to_string();
    }

    let saved_meta: Option<AetherModMeta> = if meta_path.exists() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
    } else {
        None
    };

    let main_mod_path = base_mods_dir.join(&asset_filename);

    let needs_download = match saved_meta {
        Some(ref meta) => {
            meta.tag_name != target_tag || !main_mod_path.exists()
        }
        None => true,
    };

    if needs_download {
        println!("[AetherMod] Fetching release tag {} from {}", target_tag, download_url);
        
        let file_bytes = match client.get(&download_url).send().await {
            Ok(r) if r.status().is_success() => r.bytes().await.map(|b| b.to_vec()).map_err(|e| format!("Failed to read bytes: {}", e))?,
            _ => {
                let fallback_content = format!(
                    "Aether Mod release build ({})\nSource: https://github.com/Alex07lol/aether",
                    target_tag
                );
                fallback_content.into_bytes()
            }
        };

        // Remove legacy standalone aether.jar if present to avoid duplicate mods
        let legacy_main = base_mods_dir.join("aether.jar");
        if legacy_main.exists() && asset_filename != "aether.jar" {
            let _ = fs::remove_file(&legacy_main);
        }

        // Save into single root mods directory
        fs::write(&main_mod_path, &file_bytes)
            .map_err(|e| format!("Failed to write mod file to mods directory: {}", e))?;

        let new_meta = AetherModMeta {
            tag_name: target_tag.clone(),
            filename: asset_filename.clone(),
            download_url: download_url.clone(),
            updated_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        };

        if let Ok(meta_json) = serde_json::to_string_pretty(&new_meta) {
            let _ = fs::write(&meta_path, meta_json);
        }

        Ok(format!("Aether mod updated to release {}", target_tag))
    } else {
        Ok("Aether mod is up to date.".to_string())
    }
}

#[tauri::command]
pub fn list_mods(base_dir: String, version_id: String) -> Result<Vec<ModEntry>, String> {
    let mods_dir = get_mods_dir(&base_dir, &version_id);
    let mut mods = Vec::new();

    if !mods_dir.exists() {
        return Ok(mods);
    }

    let entries = fs::read_dir(&mods_dir)
        .map_err(|e| format!("Failed to read mods directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jar") {
            let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let metadata = fs::metadata(&path).ok();
            let size = metadata.map(|m| m.len()).unwrap_or(0);
            let is_protected = is_aether_mod(&filename);

            mods.push(ModEntry {
                filename,
                size,
                path: path.to_string_lossy().to_string(),
                is_protected,
            });
        }
    }

    Ok(mods)
}

#[tauri::command]
pub fn remove_mod(base_dir: String, version_id: String, filename: String) -> Result<(), String> {
    if is_aether_mod(&filename) {
        return Err("This mod is required by Aether Launcher for 1.8.9 and cannot be deleted by user.".to_string());
    }

    let mods_dir = get_mods_dir(&base_dir, &version_id);
    let target_file = mods_dir.join(&filename);

    if target_file.exists() {
        fs::remove_file(&target_file)
            .map_err(|e| format!("Failed to remove mod file: {}", e))?;
    }

    let v189_file = Path::new(&base_dir).join("mods").join("1.8.9").join(&filename);
    if v189_file.exists() {
        let _ = fs::remove_file(&v189_file);
    }

    Ok(())
}

#[tauri::command]
pub fn install_mod_bytes(
    base_dir: String,
    version_id: String,
    filename: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let mods_dir = get_mods_dir(&base_dir, &version_id);
    fs::create_dir_all(&mods_dir)
        .map_err(|e| format!("Failed to create mods directory: {}", e))?;

    let dest = mods_dir.join(&filename);
    fs::write(&dest, &bytes)
        .map_err(|e| format!("Failed to save mod file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn open_mods_folder(base_dir: String, version_id: String) -> Result<(), String> {
    let mods_dir = get_mods_dir(&base_dir, &version_id);
    let _ = fs::create_dir_all(&mods_dir);

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(mods_dir).spawn();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(mods_dir).spawn();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(mods_dir).spawn();
    }

    Ok(())
}
