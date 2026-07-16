// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod downloader;
mod installer;
mod auth;
mod launcher;

// A placeholder greet command for frontend IPC testing
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Aether Launcher Backend.", name)
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Fix for WebKitGTK rendering/composition bugs on Linux (e.g. blank window or nothing showing up)
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    // Conditional plugin registration to satisfy both desktop configurations and mobile compile hosts
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = tauri::Builder::default().plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = tauri::Builder::default();

    builder
        .invoke_handler(tauri::generate_handler![
            greet,
            downloader::download_file,
            downloader::cancel_download,
            installer::get_minecraft_dir,
            installer::initialize_minecraft_structure,
            installer::verify_manifest,
            installer::clear_minecraft_cache,
            installer::get_forge_version,
            installer::install_forge,
            auth::login_microsoft,
            auth::login_refresh,
            auth::clear_secure_token,
            auth::load_secure_token,
            launcher::detect_or_install_java,
            launcher::launch_game
        ])
        .setup(|app| {
            // Retrieve main window instance
            if let Some(_window) = app.get_webview_window("main") {
                // Apply visual vibrancy effects natively on Windows
                #[cfg(target_os = "windows")]
                {
                    use window_vibrancy::{apply_acrylic, apply_mica, apply_blur};
                    // Try Acrylic -> Mica -> Blur fallbacks
                    if let Err(_) = apply_acrylic(&_window, Some((6, 18, 36, 120))) {
                        if let Err(_) = apply_mica(&_window, None) {
                            let _ = apply_blur(&_window, Some((6, 18, 36, 120)));
                        }
                    }
                }

                // Apply visual vibrancy effects natively on macOS
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                    let _ = apply_vibrancy(&_window, NSVisualEffectMaterial::HudWindow, None, None);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
