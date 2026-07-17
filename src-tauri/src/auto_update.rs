use reqwest::header::USER_AGENT;
use serde::Deserialize;
use std::env;
use std::fs;
use tauri::AppHandle;
use tauri::Emitter;

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(serde::Serialize, Clone)]
struct UpdateProgress {
    status: String,
    message: String,
}

#[tauri::command]
pub async fn check_and_update_launcher(app: AppHandle) -> Result<String, String> {
    let current_version = env!("CARGO_PKG_VERSION");
    let repo_url = "https://api.github.com/repos/Alex07lol/aether-launcher/releases/latest";

    let client = reqwest::Client::new();
    let res = client
        .get(repo_url)
        .header(USER_AGENT, "Aether-Launcher-Updater")
        .send()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("GitHub API error: {}", res.status()));
    }

    let release: GitHubRelease = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;

    // Compare tags (assuming tag is v0.1.0 or similar)
    let latest_version = release.tag_name.trim_start_matches('v').trim_start_matches('V');
    
    if latest_version == current_version {
        return Ok(format!("Launcher is up to date (version {})", current_version));
    }

    let _ = app.emit("launcher-update-progress", UpdateProgress {
        status: "downloading".to_string(),
        message: format!("Downloading launcher update v{}...", latest_version),
    });

    // Check if system has pacman (Arch Linux)
    let has_pacman = std::process::Command::new("which")
        .arg("pacman")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let pacman_asset = if has_pacman {
        release.assets.iter().find(|a| a.name.ends_with(".pkg.tar.zst"))
    } else {
        None
    };

    if let Some(asset) = pacman_asset {
        let download_res = client
            .get(&asset.browser_download_url)
            .header(USER_AGENT, "Aether-Launcher-Updater")
            .send()
            .await
            .map_err(|e| format!("Failed to download update: {}", e))?;

        let bytes = download_res
            .bytes()
            .await
            .map_err(|e| format!("Failed to read update bytes: {}", e))?;

        let mut temp_path = env::temp_dir();
        temp_path.push(&asset.name);

        fs::write(&temp_path, &bytes).map_err(|e| format!("Failed to write package file: {}", e))?;

        let _ = app.emit("launcher-update-progress", UpdateProgress {
            status: "installing".to_string(),
            message: "Running pacman -U to update package...".to_string(),
        });

        // Run pkexec pacman -U or sudo pacman -U
        let temp_str = temp_path.to_string_lossy().to_string();
        
        let pkexec_res = tokio::process::Command::new("pkexec")
            .arg("pacman")
            .arg("-U")
            .arg("--noconfirm")
            .arg(&temp_str)
            .status()
            .await;

        let installed = match pkexec_res {
            Ok(status) => status.success(),
            Err(_) => false,
        };

        if !installed {
            let sudo_res = tokio::process::Command::new("sudo")
                .arg("pacman")
                .arg("-U")
                .arg("--noconfirm")
                .arg(&temp_str)
                .status()
                .await;

            if let Ok(status) = sudo_res {
                if !status.success() {
                    let _ = fs::remove_file(&temp_path);
                    return Err(format!("Pacman update failed with exit code {}", status));
                }
            } else {
                let _ = fs::remove_file(&temp_path);
                return Err("Failed to execute pacman update command.".to_string());
            }
        }

        let _ = fs::remove_file(&temp_path);

        let _ = app.emit("launcher-update-progress", UpdateProgress {
            status: "completed".to_string(),
            message: "Arch package updated successfully. Restarting...".to_string(),
        });

        std::process::exit(0);
    }

    // Default fallback (Windows or standard Linux binary)
    let os = std::env::consts::OS;
    let target_asset_name = match os {
        "windows" => "aether-launcher.exe",
        "linux" => "aether-launcher",
        _ => return Err(format!("Unsupported OS for auto-update: {}", os)),
    };

    let asset = release.assets.iter().find(|a| a.name == target_asset_name)
        .ok_or_else(|| format!("Could not find {} in the latest release.", target_asset_name))?;

    let download_res = client
        .get(&asset.browser_download_url)
        .header(USER_AGENT, "Aether-Launcher-Updater")
        .send()
        .await
        .map_err(|e| format!("Failed to download update: {}", e))?;

    let bytes = download_res
        .bytes()
        .await
        .map_err(|e| format!("Failed to read update bytes: {}", e))?;

    // Save to temp file
    let mut temp_path = env::temp_dir();
    temp_path.push(format!("{}.tmp", target_asset_name));

    fs::write(&temp_path, &bytes).map_err(|e| format!("Failed to write temp file: {}", e))?;

    // Ensure it's executable on Linux
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(mut perms) = fs::metadata(&temp_path).map(|m| m.permissions()) {
            perms.set_mode(0o755);
            let _ = fs::set_permissions(&temp_path, perms);
        }
    }

    let _ = app.emit("launcher-update-progress", UpdateProgress {
        status: "installing".to_string(),
        message: "Applying update...".to_string(),
    });

    // Replace the current executable
    self_replace::self_replace(&temp_path).map_err(|e| format!("Failed to replace executable: {}", e))?;

    // Clean up temp file
    let _ = fs::remove_file(&temp_path);

    let _ = app.emit("launcher-update-progress", UpdateProgress {
        status: "completed".to_string(),
        message: "Update applied successfully. Restarting...".to_string(),
    });

    // Automatically restart
    std::process::exit(0);
}
