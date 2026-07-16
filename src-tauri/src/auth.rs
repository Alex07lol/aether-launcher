use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const MS_CLIENT_ID: &str = "000000004C12AE29"; // Minecraft Launcher Client ID (pre-approved for Xbox Live)
const PORT: u16 = 53124;
const REDIRECT_URI: &str = "http://127.0.0.1:53124";

#[derive(Serialize, Deserialize, Clone)]
pub struct AuthProfile {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub user_type: String, // "microsoft" or "offline"
}

#[derive(Deserialize)]
struct MsTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Serialize)]
struct XboxLiveProperties {
    #[serde(rename = "AuthMethod")]
    auth_method: String,
    #[serde(rename = "SiteName")]
    site_name: String,
    #[serde(rename = "RpsTicket")]
    rps_ticket: String,
}

#[derive(Serialize)]
struct XboxLiveRequest {
    #[serde(rename = "Properties")]
    properties: XboxLiveProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Deserialize)]
struct XboxLiveResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: HashMap<String, Vec<HashMap<String, String>>>,
}

#[derive(Serialize)]
struct XstsProperties {
    #[serde(rename = "SandboxId")]
    sandbox_id: String,
    #[serde(rename = "UserTokens")]
    user_tokens: Vec<String>,
}

#[derive(Serialize)]
struct XstsRequest {
    #[serde(rename = "Properties")]
    properties: XstsProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Serialize)]
struct MinecraftLoginRequest {
    #[serde(rename = "identityToken")]
    identity_token: String,
}

#[derive(Deserialize)]
struct MinecraftLoginResponse {
    access_token: String,
    username: String,
    id: String,
}

// Scramble/Encryption key for storing tokens securely
const XOR_KEY: &[u8] = b"AetherLauncherSecureAuthTokenKey2026";

fn get_token_file_path() -> PathBuf {
    let mut path = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    if let Some(home) = std::env::var_os("HOME") {
        path = PathBuf::from(home);
    }
    path.push(".minecraft");
    path.push("aether_auth.bin");
    path
}

fn open_url(url: &str) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(&["/C", "start", "", url])
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(url)
            .spawn();
    }
}

pub fn save_secure_token(token: &str) -> Result<(), String> {
    let path = get_token_file_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    
    // Encrypt using basic XOR cipher to prevent plain-text token exposure on disk
    let data = token.as_bytes();
    let mut encrypted = Vec::with_capacity(data.len());
    for (i, &byte) in data.iter().enumerate() {
        encrypted.push(byte ^ XOR_KEY[i % XOR_KEY.len()]);
    }

    let mut file = File::create(path).map_err(|e| format!("Failed to create token storage file: {}", e))?;
    file.write_all(&encrypted).map_err(|e| format!("Failed to write encrypted token: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_secure_token() -> Result<Option<String>, String> {
    let path = get_token_file_path();
    if !path.exists() {
        return Ok(None);
    }

    let mut file = File::open(path).map_err(|e| format!("Failed to open token storage file: {}", e))?;
    let mut encrypted = Vec::new();
    file.read_to_end(&mut encrypted).map_err(|e| format!("Failed to read token file: {}", e))?;

    let mut decrypted = Vec::with_capacity(encrypted.len());
    for (i, &byte) in encrypted.iter().enumerate() {
        decrypted.push(byte ^ XOR_KEY[i % XOR_KEY.len()]);
    }

    let token = String::from_utf8(decrypted).map_err(|e| format!("Failed to parse decrypted token: {}", e))?;
    Ok(Some(token))
}

#[tauri::command]
pub fn clear_secure_token() -> Result<(), String> {
    let path = get_token_file_path();
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

// Perform loopback server flow to capture OAuth code
fn acquire_oauth_code() -> Result<String, String> {
    let listener = TcpListener::bind(format!("127.0.0.1:{}", PORT))
        .map_err(|e| format!("OAuth loopback port already in use: {}", e))?;

    // Format Microsoft login URL
    let login_url = format!(
        "https://login.live.com/oauth20_authorize.srf?client_id={}&response_type=code&redirect_uri={}&scope=XboxLive.signin%20offline_access",
        MS_CLIENT_ID, REDIRECT_URI
    );

    // Open link in browser
    open_url(&login_url);

    // Listen for code redirection
    for stream_res in listener.incoming() {
        let mut stream = stream_res.map_err(|e| format!("Failed to accept connection: {}", e))?;
        let mut buffer = [0; 2048];
        let bytes_read = stream.read(&mut buffer).map_err(|e| format!("Failed to read stream: {}", e))?;
        let request = String::from_utf8_lossy(&buffer[..bytes_read]);

        if let Some(code_idx) = request.find("code=") {
            let rest = &request[code_idx + 5..];
            let end_idx = rest.find(' ').unwrap_or(rest.len());
            let raw_code = &rest[..end_idx];
            
            // Extract the actual code (strip query parameters if any)
            let code = raw_code.split('&').next().unwrap_or(raw_code).to_string();

            // Send successful login response to browser
            let html = "<html><head><title>Aether Launcher</title><style>body { background: #030712; color: #38bdf8; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; } h1 { font-size: 24px; text-shadow: 0 0 10px rgba(56,189,248,0.5); }</style></head><body><div><h1>Authentication Successful!</h1><p>You can now close this tab and return to the launcher.</p></div></body></html>";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html.len(), html
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();

            return Ok(code);
        }
    }

    Err("OAuth loopback listener terminated unexpectedly".to_string())
}

#[tauri::command]
pub async fn login_microsoft(_app: AppHandle) -> Result<AuthProfile, String> {
    // 1. Get OAuth Code
    let code = acquire_oauth_code()?;

    let client = Client::builder()
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;

    // 2. Exchange Code for MS Tokens
    let mut params = HashMap::new();
    params.insert("client_id", MS_CLIENT_ID);
    params.insert("code", &code);
    params.insert("grant_type", "authorization_code");
    params.insert("redirect_uri", REDIRECT_URI);

    let ms_res = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to exchange OAuth code: {}", e))?;

    let ms_tokens = ms_res
        .json::<MsTokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse Microsoft tokens: {}", e))?;

    // Store the refresh token securely if present
    if let Some(refresh) = ms_tokens.refresh_token.as_deref() {
        let _ = save_secure_token(refresh);
    }

    authenticate_minecraft_flow(&client, &ms_tokens.access_token).await
}

#[tauri::command]
pub async fn login_refresh() -> Result<AuthProfile, String> {
    // 1. Load saved refresh token
    let refresh_token = match load_secure_token()? {
        Some(token) => token,
        None => return Err("No saved accounts found. Please log in first.".to_string()),
    };

    let client = Client::builder()
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    // 2. Refresh MS tokens
    let mut params = HashMap::new();
    params.insert("client_id", MS_CLIENT_ID);
    params.insert("refresh_token", &refresh_token);
    params.insert("grant_type", "refresh_token");
    params.insert("redirect_uri", REDIRECT_URI);

    let ms_res = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to refresh Microsoft token: {}", e))?;

    let ms_tokens = ms_res
        .json::<MsTokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse refreshed tokens: {}", e))?;

    // Save the new refresh token securely
    if let Some(refresh) = ms_tokens.refresh_token.as_deref() {
        let _ = save_secure_token(refresh);
    }

    authenticate_minecraft_flow(&client, &ms_tokens.access_token).await
}

// Inner flow: MS Access Token -> Xbox Live -> XSTS -> Minecraft Services
async fn authenticate_minecraft_flow(client: &Client, ms_access_token: &str) -> Result<AuthProfile, String> {
    // 3. Authenticate with Xbox Live
    let xbl_req = XboxLiveRequest {
        properties: XboxLiveProperties {
            auth_method: "RPS".to_string(),
            site_name: "user.auth.xboxlive.com".to_string(),
            rps_ticket: format!("d={}", ms_access_token),
        },
        relying_party: "http://auth.xboxlive.com".to_string(),
        token_type: "JWT".to_string(),
    };

    let xbl_res = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&xbl_req)
        .send()
        .await
        .map_err(|e| format!("Xbox Live Authentication request failed: {}", e))?;

    let xbl_data = xbl_res
        .json::<XboxLiveResponse>()
        .await
        .map_err(|e| format!("Failed to parse Xbox Live response: {}", e))?;

    // Retrieve user hash (uhs) from claim display properties
    let user_hash = xbl_data
        .display_claims
        .get("xui")
        .and_then(|xui| xui.first())
        .and_then(|claim| claim.get("uhs"))
        .ok_or_else(|| "Could not find user hash (uhs) in Xbox Live claim claims".to_string())?;

    // 4. Authenticate XSTS
    let xsts_req = XstsRequest {
        properties: XstsProperties {
            sandbox_id: "RETAIL".to_string(),
            user_tokens: vec![xbl_data.token.clone()],
        },
        relying_party: "rp://api.minecraftservices.com/".to_string(),
        token_type: "JWT".to_string(),
    };

    let xsts_res = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&xsts_req)
        .send()
        .await
        .map_err(|e| format!("XSTS authentication request failed: {}", e))?;

    let xsts_data = xsts_res
        .json::<XboxLiveResponse>()
        .await
        .map_err(|e| format!("Failed to parse XSTS token response: {}", e))?;

    // 5. Minecraft Services Login
    let mc_req = MinecraftLoginRequest {
        identity_token: format!("XBL3.0 x={};{}", user_hash, xsts_data.token),
    };

    let mc_res = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&mc_req)
        .send()
        .await
        .map_err(|e| format!("Minecraft login with Xbox failed: {}", e))?;

    let mc_data = mc_res
        .json::<MinecraftLoginResponse>()
        .await
        .map_err(|e| format!("Failed to parse Minecraft authentication response: {}", e))?;

    Ok(AuthProfile {
        username: mc_data.username,
        uuid: mc_data.id,
        access_token: mc_data.access_token,
        user_type: "microsoft".to_string(),
    })
}
