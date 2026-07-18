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
    path.push(".aether-launcher");
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

fn add_jars_recursive(dir: &Path, classpath: &mut String) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                add_jars_recursive(&path, classpath);
            } else if path.extension().and_then(|s| s.to_str()) == Some("jar") {
                let path_str = path.to_string_lossy().to_string();
                if path_str.contains("natives") || classpath.contains(&path_str) {
                    continue;
                }
                #[cfg(target_os = "windows")]
                classpath.push_str(";");
                #[cfg(not(target_os = "windows"))]
                classpath.push_str(":");
                classpath.push_str(&path_str);
            }
        }
    }
}

fn extract_natives_recursive(dir: &Path, natives_dir: &Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                extract_natives_recursive(&path, natives_dir);
            } else if path.is_file() && path.to_string_lossy().contains("natives") && path.extension().and_then(|s| s.to_str()) == Some("jar") {
                if let Ok(file) = std::fs::File::open(&path) {
                    if let Ok(mut archive) = zip::ZipArchive::new(file) {
                        for i in 0..archive.len() {
                            if let Ok(mut inner_file) = archive.by_index(i) {
                                let name = inner_file.name();
                                if name.ends_with(".dll") || name.ends_with(".so") || name.ends_with(".dylib") {
                                    if let Some(filename) = Path::new(name).file_name() {
                                        let dest_path = natives_dir.join(filename);
                                        if let Ok(mut dest_file) = std::fs::File::create(&dest_path) {
                                            let _ = std::io::copy(&mut inner_file, &mut dest_file);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[derive(serde::Serialize)]
pub struct SystemRamInfo {
    pub total_mb: u64,
    pub available_mb: u64,
}

#[tauri::command]
pub fn get_system_ram() -> SystemRamInfo {
    let mut total_mb = 8192u64;
    let mut available_mb = 4096u64;

    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/proc/meminfo") {
            let mut total_kb = 0u64;
            let mut avail_kb = 0u64;
            for line in content.lines() {
                if line.starts_with("MemTotal:") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        total_kb = parts[1].parse().unwrap_or(0);
                    }
                } else if line.starts_with("MemAvailable:") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        avail_kb = parts[1].parse().unwrap_or(0);
                    }
                }
            }
            if total_kb > 0 {
                total_mb = total_kb / 1024;
            }
            if avail_kb > 0 {
                available_mb = avail_kb / 1024;
            } else if total_kb > 0 {
                available_mb = total_mb * 3 / 4;
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("powershell")
            .args(&["-Command", "(Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum / 1MB"])
            .output()
        {
            let str_val = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if let Ok(val) = str_val.parse::<f64>() {
                total_mb = val as u64;
                available_mb = (val * 0.75) as u64;
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sysctl").arg("-n").arg("hw.memsize").output() {
            let str_val = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if let Ok(bytes) = str_val.parse::<u64>() {
                total_mb = bytes / (1024 * 1024);
                available_mb = total_mb * 3 / 4;
            }
        }
    }

    SystemRamInfo {
        total_mb,
        available_mb,
    }
}

#[tauri::command]
pub fn detect_intel_cpu() -> bool {
    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/proc/cpuinfo") {
            if content.to_lowercase().contains("intel") {
                return true;
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(id) = std::env::var("PROCESSOR_IDENTIFIER") {
            if id.to_lowercase().contains("intel") {
                return true;
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sysctl").arg("-n").arg("machdep.cpu.brand_string").output() {
            let brand = String::from_utf8_lossy(&output.stdout);
            if brand.to_lowercase().contains("intel") {
                return true;
            }
        }
    }
    false
}

#[tauri::command]
pub async fn launch_game(
    app: AppHandle,
    version_id: String,
    minecraft_dir: String,
    java_path: String,
    min_memory: u32,
    max_memory: u32,
    custom_args: String,
    enable_intel_perf: bool,
    width: u32,
    height: u32,
    full_screen: bool,
    is_forge: bool,
    username: String,
    uuid: String,
    access_token: String,
) -> Result<(), String> {
    // 1. Resolve Java Path: Use custom configured path if valid, otherwise auto-detect/install
    let resolved_java = if !java_path.trim().is_empty() && java_path != "java" && Path::new(&java_path).exists() {
        java_path
    } else {
        detect_or_install_java(app.clone()).await?
    };

    #[derive(serde::Deserialize)]
    struct PythonCommandResult {
        success: bool,
        command: Option<Vec<String>>,
    }

    if is_forge {
        let py_bin = crate::installer::get_python_executable().unwrap_or_else(|_| "python3".to_string());
        let script_path = Path::new(&minecraft_dir).join("scripts").join("forge_installer.py");
        let script = if script_path.exists() { script_path } else { PathBuf::from("scripts/forge_installer.py") };

        let output = std::process::Command::new(&py_bin)
            .arg(&script)
            .arg("get-command")
            .arg("--mc-version")
            .arg(&version_id)
            .arg("--minecraft-dir")
            .arg(&minecraft_dir)
            .arg("--username")
            .arg(&username)
            .arg("--uuid")
            .arg(&uuid)
            .arg("--access-token")
            .arg(&access_token)
            .arg("--java-path")
            .arg(&resolved_java)
            .output();

        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if let Ok(res) = serde_json::from_str::<PythonCommandResult>(stdout.trim()) {
                if res.success {
                    if let Some(mut py_cmd) = res.command {
                        if !py_cmd.is_empty() {
                            let java_exe = py_cmd.remove(0);

                            let min_ram = if min_memory > 0 { min_memory } else { 1024 };
                            let max_ram = if max_memory > 0 { max_memory } else { 4096 };

                            let mut final_args = vec![
                                format!("-Xms{}M", min_ram),
                                format!("-Xmx{}M", max_ram),
                                "-XX:+UseG1GC".to_string(),
                                "-XX:+UnlockExperimentalVMOptions".to_string(),
                                "-XX:G1NewSizePercent=20".to_string(),
                                "-XX:G1ReservePercent=20".to_string(),
                                "-XX:MaxGCPauseMillis=50".to_string(),
                                "-XX:G1HeapRegionSize=32M".to_string(),
                                "-XX:+AlwaysPreTouch".to_string(),
                                "-XX:+DisableExplicitGC".to_string(),
                            ];

                            let is_intel = enable_intel_perf || detect_intel_cpu();
                            if is_intel {
                                final_args.push("-XX:+UseFastAccessorMethods".to_string());
                                final_args.push("-XX:+OptimizeStringConcat".to_string());
                                final_args.push("-XX:+UseStringDeduplication".to_string());
                            }

                            if !custom_args.trim().is_empty() {
                                for arg in custom_args.split_whitespace() {
                                    final_args.push(arg.to_string());
                                }
                            }

                            final_args.extend(py_cmd);

                            if width > 0 {
                                final_args.push("--width".to_string());
                                final_args.push(width.to_string());
                            }
                            if height > 0 {
                                final_args.push("--height".to_string());
                                final_args.push(height.to_string());
                            }
                            if full_screen {
                                final_args.push("--fullscreen".to_string());
                            }

                            println!("[Launcher] Invoking Minecraft via minecraft-launcher-lib: {} {:?}", java_exe, final_args);

                            let mut child = Command::new(java_exe)
                                .args(&final_args)
                                .stdout(Stdio::piped())
                                .stderr(Stdio::piped())
                                .spawn()
                                .map_err(|e| format!("Failed to spawn Minecraft subprocess: {}", e))?;

                            let stdout = child.stdout.take().ok_or_else(|| "Failed to capture stdout stream".to_string())?;
                            let stderr = child.stderr.take().ok_or_else(|| "Failed to capture stderr stream".to_string())?;

                            let app_clone1 = app.clone();
                            let app_clone2 = app.clone();

                            tokio::spawn(async move {
                                let mut reader = BufReader::new(stdout).lines();
                                while let Ok(Some(line)) = reader.next_line().await {
                                    let _ = app_clone1.emit("game-log", format!("[STDOUT] {}", line));
                                }
                            });

                            tokio::spawn(async move {
                                let mut reader = BufReader::new(stderr).lines();
                                while let Ok(Some(line)) = reader.next_line().await {
                                    let _ = app_clone2.emit("game-log", format!("[STDERR] {}", line));
                                }
                            });

                            tokio::spawn(async move {
                                let code = match child.wait().await {
                                    Ok(status) => status.code().unwrap_or(0),
                                    Err(_) => -1,
                                };
                                println!("[Launcher] Minecraft process exited with code: {}", code);
                                let _ = app.emit("game-exit", code);
                            });

                            return Ok(());
                        }
                    }
                }
            }
        }
    }

    // 2. Classpath & Natives Scaffolding
    let base = Path::new(&minecraft_dir);
    let version_jar = base.join("versions").join(&version_id).join(format!("{}.jar", version_id));

    let mut classpath = version_jar.to_string_lossy().to_string();

    // Scan libraries/ recursively for JVM classpath additions
    let lib_dir = base.join("libraries");
    if lib_dir.exists() {
        add_jars_recursive(&lib_dir, &mut classpath);
    }

    // Scan versions/ recursively for any installed Forge version JARs
    let versions_dir = base.join("versions");
    if versions_dir.exists() {
        add_jars_recursive(&versions_dir, &mut classpath);
    }

    // Dynamic extraction of LWJGL native binaries
    let natives_dir = base.join("versions").join(&version_id).join("natives");
    std::fs::create_dir_all(&natives_dir).ok();
    if lib_dir.exists() {
        extract_natives_recursive(&lib_dir, &natives_dir);
    }

    // 3. Assemble JVM & Game arguments
    let mut args = Vec::new();

    // Memory settings
    let min_ram = if min_memory > 0 { min_memory } else { 1024 };
    let max_ram = if max_memory > 0 { max_memory } else { 4096 };
    args.push(format!("-Xms{}M", min_ram));
    args.push(format!("-Xmx{}M", max_ram));

    // Mandated Always-On High Performance JVM Optimizations
    let default_optimizations = [
        "-XX:+UseG1GC",
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:G1NewSizePercent=20",
        "-XX:G1ReservePercent=20",
        "-XX:MaxGCPauseMillis=50",
        "-XX:G1HeapRegionSize=32M",
        "-XX:+AlwaysPreTouch",
        "-XX:+DisableExplicitGC",
    ];

    for opt in default_optimizations.iter() {
        args.push(opt.to_string());
    }

    // Intel Processor Performance Optimization Flags
    let is_intel = enable_intel_perf || detect_intel_cpu();
    if is_intel {
        println!("[Launcher] Intel CPU / Performance mode active. Injecting Intel JVM vectorization flags.");
        let intel_flags = [
            "-XX:+UseFastAccessorMethods",
            "-XX:+OptimizeStringConcat",
            "-XX:+UseStringDeduplication",
        ];
        for flag in intel_flags.iter() {
            args.push(flag.to_string());
        }
    }

    // Custom User JVM Args
    if !custom_args.trim().is_empty() {
        for arg in custom_args.split_whitespace() {
            args.push(arg.to_string());
        }
    }

    args.push(format!("-Djava.library.path={}", natives_dir.to_string_lossy()));

    args.push("-cp".to_string());
    args.push(classpath);

    // Forge vs Vanilla entrypoint
    if is_forge {
        args.push("net.minecraft.launchwrapper.Launch".to_string());
        args.push("--tweakClass".to_string());
        args.push("net.minecraftforge.fml.common.launcher.FMLTweaker".to_string());
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
    args.push("1.8".to_string());

    // Display Window Dimensions & Fullscreen Flags
    if width > 0 {
        args.push("--width".to_string());
        args.push(width.to_string());
    }
    if height > 0 {
        args.push("--height".to_string());
        args.push(height.to_string());
    }
    if full_screen {
        args.push("--fullscreen".to_string());
    }

    println!("[Launcher] Invoking Minecraft: {} {:?}", resolved_java, args);

    // Spawn Subprocess using tokio process command to pipe asynchronously
    let mut child = Command::new(resolved_java)
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
