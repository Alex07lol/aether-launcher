use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};

// Resolves absolute path of token/auth storage
fn get_base_dir() -> PathBuf {
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = std::env::var_os("APPDATA") {
            path = PathBuf::from(app_data);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(home) = std::env::var_os("HOME") {
            path = PathBuf::from(home);
        }
    }
    path.push(".minecraft");
    path
}

#[tauri::command]
pub async fn detect_or_install_java(_app: AppHandle) -> Result<String, String> {
    // 1. Detect System Java first
    if let Ok(output) = std::process::Command::new("java").arg("-version").output() {
        if output.status.success() {
            return Ok("java".to_string());
        }
    }

    // Check standard paths
    let common_paths = [
        "/usr/bin/java",
        "/usr/lib/jvm/default-java/bin/java",
        "/usr/lib/jvm/java-17-openjdk/bin/java",
        "/usr/lib/jvm/java-8-openjdk/bin/java",
        "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe",
        "C:\\Program Files\\Java\\jre1.8.0_361\\bin\\java.exe",
    ];

    for path in common_paths.iter() {
        if Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    // 2. Install Java if missing: Download adoptium temurin 17 package
    let base = get_base_dir();
    let java_dest = base.join("runtime").join("java");
    let java_bin = if cfg!(target_os = "windows") {
        java_dest.join("bin").join("java.exe")
    } else {
        java_dest.join("bin").join("java")
    };

    if java_bin.exists() {
        return Ok(java_bin.to_string_lossy().to_string());
    }

    println!("[JavaInstaller] Java not found. Commencing automated download...");

    let url = if cfg!(target_os = "windows") {
        "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.8.1%2B1/OpenJDK17U-jre_x64_windows_hotspot_17.0.8.1_1.zip"
    } else {
        "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.8.1%2B1/OpenJDK17U-jre_x64_linux_hotspot_17.0.8.1_1.tar.gz"
    };

    let zip_path = base.join("java_package.tmp");
    
    // Ensure parent directories exist
    if let Some(parent) = zip_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // Download zip package
    let client = reqwest::Client::new();
    let response = client.get(url).send().await.map_err(|e| format!("Failed to download Java: {}", e))?;
    let content = response.bytes().await.map_err(|e| format!("Failed to read Java bytes: {}", e))?;
    std::fs::write(&zip_path, &content).map_err(|e| format!("Failed to write Java temp archive: {}", e))?;

    // Extract using system commands to bypass compiling extra decompression crates
    let _ = std::fs::create_dir_all(&java_dest);

    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("powershell")
            .args(&[
                "-Command",
                &format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force", zip_path.to_string_lossy(), java_dest.to_string_lossy())
            ])
            .status()
            .map_err(|e| format!("Failed to execute powershell unzip: {}", e))?;
        
        if !status.success() {
            return Err("Powershell Expand-Archive returned error code".to_string());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = std::process::Command::new("tar")
            .args(&[
                "-xzf",
                &zip_path.to_string_lossy().to_string(),
                "-C",
                &java_dest.to_string_lossy().to_string(),
                "--strip-components=1"
            ])
            .status()
            .map_err(|e| format!("Failed to execute tar extraction: {}", e))?;

        if !status.success() {
            return Err("tar command returned error code".to_string());
        }
    }

    let _ = std::fs::remove_file(zip_path);

    if java_bin.exists() {
        // Set execute permissions on linux
        #[cfg(not(target_os = "windows"))]
        {
            let _ = std::process::Command::new("chmod")
                .arg("+x")
                .arg(&java_bin)
                .status();
        }
        Ok(java_bin.to_string_lossy().to_string())
    } else {
        Err("Failed to install Java: binary executable not found post-extraction".to_string())
    }
}

#[tauri::command]
pub async fn launch_game(
    app: AppHandle,
    version_id: String,
    minecraft_dir: String,
    max_memory: u32,
    custom_args: String,
    is_forge: bool,
    username: String,
    uuid: String,
    access_token: String,
) -> Result<(), String> {
    // 1. Detect/Install Java
    let java_path = detect_or_install_java(app.clone()).await?;

    // 2. Classpath scaffolding
    let base = Path::new(&minecraft_dir);
    let version_jar = base.join("versions").join(&version_id).join(format!("{}.jar", version_id));

    let mut classpath = version_jar.to_string_lossy().to_string();

    // Scan libraries/ for JVM classpath additions
    let lib_dir = base.join("libraries");
    if lib_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(lib_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("jar") {
                    #[cfg(target_os = "windows")]
                    {
                        classpath.push_str(";");
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        classpath.push_str(":");
                    }
                    classpath.push_str(&path.to_string_lossy());
                }
            }
        }
    }

    // 3. Assemble arguments
    let mut args = Vec::new();

    // Memory settings
    args.push(format!("-Xmx{}M", max_memory));
    args.push("-Xms512M".to_string());

    // JVM Args
    if !custom_args.trim().is_empty() {
        for arg in custom_args.split_whitespace() {
            args.push(arg.to_string());
        }
    }

    args.push("-cp".to_string());
    args.push(classpath);

    // Forge vs Vanilla entrypoint
    if is_forge {
        args.push("net.minecraft.launchwrapper.Launch".to_string());
        args.push("--tweakClass".to_string());
        args.push("net.minecraft.forge.fml.common.launcher.FMLTweaker".to_string());
    } else {
        args.push("net.minecraft.client.main.Main".to_string());
    }

    // Game arguments
    args.push("--username".to_string());
    args.push(username);
    args.push("--uuid".to_string());
    args.push(uuid);
    args.push("--accessToken".to_string());
    args.push(access_token);
    args.push("--version".to_string());
    args.push(version_id);
    args.push("--gameDir".to_string());
    args.push(minecraft_dir.clone());
    args.push("--assetsDir".to_string());
    args.push(base.join("assets").to_string_lossy().to_string());
    args.push("--assetIndex".to_string());
    args.push("1.8".to_string()); // Default asset index

    println!("[Launcher] Invoking Minecraft: {} {:?}", java_path, args);

    // Spawn Subprocess using tokio process command to pipe asynchronously
    let mut child = Command::new(java_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Minecraft subprocess: {}", e))?;

    let stdout = child.stdout.take().ok_or_else(|| "Failed to capture stdout stream".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Failed to capture stderr stream".to_string())?;

    let app_clone1 = app.clone();
    let app_clone2 = app.clone();

    // Stream Stdout logs in real-time
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone1.emit("game-log", format!("[STDOUT] {}", line));
        }
    });

    // Stream Stderr logs in real-time
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone2.emit("game-log", format!("[STDERR] {}", line));
        }
    });

    // Monitor exit code
    tokio::spawn(async move {
        let code = match child.wait().await {
            Ok(status) => status.code().unwrap_or(0),
            Err(_) => -1,
        };
        println!("[Launcher] Minecraft process exited with code: {}", code);
        let _ = app.emit("game-exit", code);
    });

    Ok(())
}
