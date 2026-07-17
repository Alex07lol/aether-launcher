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

#[derive(serde::Deserialize)]
struct ForgeProfileJson {
    #[serde(rename = "versionInfo")]
    version_info: ForgeVersionInfo,
    install: ForgeInstallData,
}

#[derive(serde::Deserialize)]
struct ForgeInstallData {
    #[serde(rename = "filePath")]
    file_path: Option<String>,
}

#[derive(serde::Deserialize)]
struct ForgeVersionInfo {
    libraries: Vec<ForgeLibraryItem>,
}

#[derive(serde::Deserialize)]
struct ForgeLibraryItem {
    name: String,
    url: Option<String>,
}

fn parse_maven_name(name: &str) -> Option<(PathBuf, String)> {
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];

    let filename = format!("{}-{}.jar", artifact, version);
    let rel_path = PathBuf::from(&group).join(artifact).join(version).join(&filename);
    let maven_subpath = format!("{}/{}/{}/{}", group, artifact, version, filename);

    Some((rel_path, maven_subpath))
}

const EMBEDDED_FORGE_UNIVERSAL: &[u8] = include_bytes!("../embedded/forge-1.8.9-universal.jar");
const EMBEDDED_LAUNCHWRAPPER: &[u8] = include_bytes!("../embedded/launchwrapper-1.12.jar");
const EMBEDDED_ASM: &[u8] = include_bytes!("../embedded/asm-all-5.0.3.jar");

#[tauri::command]
pub async fn install_forge(
    app: AppHandle,
    mc_version: String,
    forge_version: String,
    minecraft_dir: String,
) -> Result<(), String> {
    let lib_dir = Path::new(&minecraft_dir).join("libraries");
    std::fs::create_dir_all(&lib_dir).map_err(|e| format!("Failed to create libraries directory: {}", e))?;

    let forge_lib_dir = lib_dir
        .join("net")
        .join("minecraftforge")
        .join("forge")
        .join(format!("{}-{}-{}", mc_version, forge_version, mc_version));

    let universal_jar_name = format!("forge-{}-{}-{}.jar", mc_version, forge_version, mc_version);
    let universal_dest = forge_lib_dir.join(&universal_jar_name);

    // 1. Unpack embedded Forge universal jar
    std::fs::create_dir_all(&forge_lib_dir).ok();
    let is_valid_universal = std::fs::metadata(&universal_dest)
        .map(|m| m.len() > 1_000_000)
        .unwrap_or(false);

    if !is_valid_universal {
        let _ = app.emit("forge-progress", ForgeProgress {
            status: "extracting".to_string(),
            progress: 30,
            message: "Unpacking pre-bundled Forge core...".to_string(),
        });
        std::fs::write(&universal_dest, EMBEDDED_FORGE_UNIVERSAL)
            .map_err(|e| format!("Failed to write pre-bundled Forge jar: {}", e))?;
    }

    // 2. Unpack embedded Launchwrapper jar
    let lw_dir = lib_dir.join("net").join("minecraft").join("launchwrapper").join("1.12");
    std::fs::create_dir_all(&lw_dir).ok();
    let lw_dest = lw_dir.join("launchwrapper-1.12.jar");
    if !lw_dest.exists() || std::fs::metadata(&lw_dest).map(|m| m.len() < 10_000).unwrap_or(true) {
        let _ = std::fs::write(&lw_dest, EMBEDDED_LAUNCHWRAPPER);
    }

    // 3. Unpack embedded ASM jar
    let asm_dir = lib_dir.join("org").join("ow2").join("asm").join("asm-all").join("5.0.3");
    std::fs::create_dir_all(&asm_dir).ok();
    let asm_dest = asm_dir.join("asm-all-5.0.3.jar");
    if !asm_dest.exists() || std::fs::metadata(&asm_dest).map(|m| m.len() < 10_000).unwrap_or(true) {
        let _ = std::fs::write(&asm_dest, EMBEDDED_ASM);
    }

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

    // 2. Extract installer zip contents (universal jar + parse install_profile.json)
    let reader = std::io::Cursor::new(&bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("Invalid zip archive: {}", e))?;

    // Extract install_profile.json
    let profile_content = {
        let mut profile_file = archive.by_name("install_profile.json").map_err(|e| format!("Missing install_profile.json: {}", e))?;
        let mut content = String::new();
        std::io::Read::read_to_string(&mut profile_file, &mut content).map_err(|e| format!("Failed to read install_profile.json: {}", e))?;
        content
    };

    let profile: ForgeProfileJson = serde_json::from_str(&profile_content).map_err(|e| format!("Failed to parse install_profile.json: {}", e))?;

    // Extract universal forge jar into libraries/net/minecraftforge/forge/{version}/...
    std::fs::create_dir_all(&forge_lib_dir).ok();

    let inner_jar_name = profile.install.file_path.unwrap_or_else(|| format!("forge-{}-{}-{}-universal.jar", mc_version, forge_version, mc_version));

    let mut extracted = false;
    if let Ok(mut inner_jar) = archive.by_name(&inner_jar_name) {
        if let Ok(mut out_file) = std::fs::File::create(&universal_dest) {
            if std::io::copy(&mut inner_jar, &mut out_file).is_ok() {
                extracted = true;
            }
        }
    }

    if !extracted {
        for i in 0..archive.len() {
            if let Ok(mut inner_file) = archive.by_index(i) {
                let name = inner_file.name().to_string();
                if name.ends_with(".jar") && (name.contains("universal") || name.contains("forge")) {
                    if let Ok(mut out_file) = std::fs::File::create(&universal_dest) {
                        let _ = std::io::copy(&mut inner_file, &mut out_file);
                        let _ = extracted;
                        break;
                    }
                }
            }
        }
    }

    let final_size = std::fs::metadata(&universal_dest).map(|m| m.len()).unwrap_or(0);
    if final_size < 1_000_000 {
        let _ = std::fs::remove_file(&universal_dest);
        return Err(format!("Failed to extract valid Forge universal jar (size: {} bytes)", final_size));
    }

    // 3. Download required libraries from Maven/Mojang mirrors
    let total_libs = profile.version_info.libraries.len();
    for (idx, lib) in profile.version_info.libraries.iter().enumerate() {
        if let Some((rel_path, maven_subpath)) = parse_maven_name(&lib.name) {
            let full_dest = lib_dir.join(&rel_path);
            if !full_dest.exists() {
                if let Some(parent) = full_dest.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }

                let _ = app.emit("forge-progress", ForgeProgress {
                    status: "extracting".to_string(),
                    progress: 40 + ((idx as f32 / total_libs as f32) * 50.0) as u32,
                    message: format!("Downloading Forge library ({}/{}): {}", idx + 1, total_libs, lib.name),
                });

                let mut urls = Vec::new();
                if let Some(ref custom_url) = lib.url {
                    urls.push(format!("{}{}", custom_url, maven_subpath));
                }
                urls.push(format!("https://libraries.minecraft.net/{}", maven_subpath));
                urls.push(format!("https://maven.minecraftforge.net/{}", maven_subpath));
                urls.push(format!("https://repo1.maven.org/maven2/{}", maven_subpath));

                for download_url in urls {
                    if let Ok(dl_res) = client.get(&download_url).send().await {
                        if dl_res.status().is_success() {
                            if let Ok(dl_bytes) = dl_res.bytes().await {
                                let _ = std::fs::write(&full_dest, &dl_bytes);
                                break;
                            }
                        }
                    }
                }
            }
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
