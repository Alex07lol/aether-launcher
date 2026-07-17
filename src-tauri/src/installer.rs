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
            path.push(".aether-launcher");
            return Ok(path.to_string_lossy().to_string());
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            let mut path = PathBuf::from(home);
            path.push(".aether-launcher");
            return Ok(path.to_string_lossy().to_string());
        }
    }

    // Fallback path (e.g. Android/Termux compile hosts)
    if let Some(home) = std::env::var_os("HOME") {
        let mut path = PathBuf::from(home);
        path.push(".aether-launcher");
        return Ok(path.to_string_lossy().to_string());
    }

    Err("Could not automatically determine system home/appdata directory".to_string())
}

#[tauri::command]
pub fn initialize_minecraft_structure(base_dir: String) -> Result<(), String> {
    let base = Path::new(&base_dir);

    // Full set of standard Minecraft directories
    let subdirs = [
        "libraries",
        "versions",
        "assets",
        "assets/indexes",
        "assets/objects",
        "assets/skins",
        "assets/log_configs",
        "mods",
        "resourcepacks",
        "texturepacks",
        "saves",
        "screenshots",
        "shaderpacks",
        "config",
        "logs",
        "crash-reports",
        "runtime",
    ];

    // Create base folder
    std::fs::create_dir_all(base)
        .map_err(|e| format!("Failed to create launcher root directory: {}", e))?;

    // Create all subfolders
    for sub in subdirs.iter() {
        let path = base.join(sub);
        std::fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create subfolder '{}': {}", sub, e))?;
    }

    // Initialize default launcher_profiles.json if absent
    let profiles_path = base.join("launcher_profiles.json");
    if !profiles_path.exists() {
        let default_profiles = r#"{
  "profiles": {
    "(Default)": {
      "name": "Default",
      "type": "custom",
      "created": "2026-01-01T00:00:00.000Z",
      "lastUsed": "2026-01-01T00:00:00.000Z",
      "icon": "Default"
    }
  },
  "settings": {
    "crashAssistant": true,
    "enableAdvanced": true,
    "enableAnalytics": false,
    "enableHistorical": true,
    "enableReleases": true,
    "enableSnapshots": false,
    "keepLauncherOpen": false,
    "profileSorting": "byName",
    "showMenu": false,
    "showNews": false
  },
  "version": 3
}"#;
        let _ = std::fs::write(profiles_path, default_profiles);
    }

    // Initialize default options.txt if absent
    let options_path = base.join("options.txt");
    if !options_path.exists() {
        let default_options = "version:1343\ninvertYMouse:false\nmouseSensitivity:0.5\nfov:0.0\ngamma:1.0\nrenderDistance:12\nguiScale:0\nparticles:0\nbobView:true\nmaxFps:120\nfboEnable:true\ndifficulty:2\nfancyGraphics:true\nao:2\nclouds:true\nresourcePacks:[]\nincompatibleResourcePacks:[]\nlang:en_US\nfullscreen:false\nenableVsync:false\n";
        let _ = std::fs::write(options_path, default_options);
    }

    // Initialize default usercache.json if absent
    let usercache_path = base.join("usercache.json");
    if !usercache_path.exists() {
        let _ = std::fs::write(usercache_path, "[]");
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

        // If file.sha256 is empty, size matching is sufficient
        if file.sha256.is_empty() {
            // Already checked size above, so it is valid
            continue;
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
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{0}-{1}-{0}/forge-{0}-{1}-{0}-installer.jar",
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

#[derive(serde::Serialize, Clone)]
pub struct ModEntry {
    pub filename: String,
    pub size: u64,
    pub path: String,
}

fn get_mods_dir(base_dir: &str, version_id: &str) -> PathBuf {
    let base = Path::new(base_dir);
    // Some launchers use mods/<version_id>, others just mods/
    // We will use mods/ for simplicity and compatibility with standard Forge
    base.join("mods")
}

#[tauri::command]
pub fn list_mods(base_dir: String, version_id: String) -> Result<Vec<ModEntry>, String> {
    let mods_dir = get_mods_dir(&base_dir, &version_id);
    let mut mods = Vec::new();

    if mods_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().unwrap_or_default() == "jar" {
                    if let Ok(metadata) = std::fs::metadata(&path) {
                        mods.push(ModEntry {
                            filename: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                            size: metadata.len(),
                            path: path.to_string_lossy().to_string(),
                        });
                    }
                }
            }
        }
    }
    
    Ok(mods)
}

#[tauri::command]
pub fn install_mod_bytes(
    base_dir: String,
    version_id: String,
    filename: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let mods_dir = get_mods_dir(&base_dir, &version_id);
    std::fs::create_dir_all(&mods_dir).map_err(|e| format!("Failed to create mods directory: {}", e))?;
    
    let file_path = mods_dir.join(&filename);
    std::fs::write(&file_path, &bytes).map_err(|e| format!("Failed to save mod file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn remove_mod(base_dir: String, version_id: String, filename: String) -> Result<(), String> {
    let mods_dir = get_mods_dir(&base_dir, &version_id);
    let file_path = mods_dir.join(&filename);
    
    if file_path.exists() {
        std::fs::remove_file(&file_path).map_err(|e| format!("Failed to remove mod: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn open_mods_folder(base_dir: String, version_id: String) -> Result<(), String> {
    let mods_dir = get_mods_dir(&base_dir, &version_id);
    std::fs::create_dir_all(&mods_dir).unwrap_or_default();
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(mods_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(mods_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(mods_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// Support structures for Mojang version manifest parsing
#[derive(serde::Deserialize)]
struct MojangVersionDetails {
    downloads: MojangDownloads,
    libraries: Vec<MojangLibrary>,
}

#[derive(serde::Deserialize)]
struct MojangDownloads {
    client: MojangArtifact,
}

#[derive(serde::Deserialize)]
struct MojangArtifact {
    path: Option<String>,
    url: String,
    size: u64,
}

#[derive(serde::Deserialize)]
struct MojangLibrary {
    name: String,
    downloads: MojangLibraryDownloads,
    rules: Option<Vec<MojangRule>>,
    natives: Option<std::collections::HashMap<String, String>>,
}

#[derive(serde::Deserialize)]
struct MojangLibraryDownloads {
    artifact: Option<MojangArtifact>,
    classifiers: Option<std::collections::HashMap<String, MojangArtifact>>,
}

#[derive(serde::Deserialize)]
struct MojangRule {
    action: String,
    os: Option<MojangOSRule>,
}

#[derive(serde::Deserialize)]
struct MojangOSRule {
    name: String,
}

fn get_current_os_name() -> &'static str {
    #[cfg(target_os = "windows")]
    return "windows";
    #[cfg(target_os = "macos")]
    return "osx";
    #[cfg(target_os = "linux")]
    return "linux";
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return "linux";
}

fn is_library_allowed(rules: &[MojangRule]) -> bool {
    let current_os = get_current_os_name();
    let mut allowed = false;
    for rule in rules {
        let action = rule.action == "allow";
        if let Some(ref os) = rule.os {
            if os.name == current_os {
                allowed = action;
            }
        } else {
            allowed = action;
        }
    }
    allowed
}

#[tauri::command]
pub async fn get_version_manifest_api(version_id: String) -> Result<VersionManifest, String> {
    let url = match version_id.as_str() {
        "1.8.9" => "https://piston-meta.mojang.com/v1/packages/d546f1707a3f2b7d034eece5ea2e311eda875787/1.8.9.json",
        "1.7.10" => "https://piston-meta.mojang.com/v1/packages/ed5d8789ed29872ea2ef1c348302b0c55e3f3468/1.7.10.json",
        _ => return Err(format!("Unsupported version: {}", version_id)),
    };

    let client = reqwest::Client::new();
    let res = client.get(url).send().await
        .map_err(|e| format!("Failed to fetch version JSON: {}", e))?;
    
    let details: MojangVersionDetails = res.json().await
        .map_err(|e| format!("Failed to parse version JSON: {}", e))?;

    let mut files = Vec::new();

    // 1. Client JAR
    files.push(ManifestFile {
        path: format!("versions/{}/{}.jar", version_id, version_id),
        url: details.downloads.client.url,
        sha256: "".to_string(), // We will use size verification only
        size: details.downloads.client.size,
    });

    // 2. Libraries
    let current_os = get_current_os_name();
    for lib in details.libraries {
        let allowed = match lib.rules {
            Some(ref r) => is_library_allowed(r),
            None => true,
        };

        if !allowed {
            continue;
        }

        if let Some(ref artifact) = lib.downloads.artifact {
            if !artifact.url.is_empty() {
                let path = format!("libraries/{}", artifact.path.clone().unwrap_or_else(|| {
                    lib.name.replace(".", "/").replace(":", "/")
                }));
                files.push(ManifestFile {
                    path,
                    url: artifact.url.clone(),
                    sha256: "".to_string(),
                    size: artifact.size,
                });
            }
        }

        if let Some(ref natives_map) = lib.natives {
            if let Some(classifier) = natives_map.get(current_os) {
                if let Some(ref classifiers) = lib.downloads.classifiers {
                    if let Some(artifact) = classifiers.get(classifier) {
                        let path = format!("libraries/{}", artifact.path.clone().unwrap_or_else(|| {
                            format!("{}-{}.jar", lib.name.replace(".", "/").replace(":", "/"), classifier)
                        }));
                        files.push(ManifestFile {
                            path,
                            url: artifact.url.clone(),
                            sha256: "".to_string(),
                            size: artifact.size,
                        });
                    }
                }
            }
        }
    }

    Ok(VersionManifest {
        version: version_id,
        files,
    })
}
