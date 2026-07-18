import { useLauncherStore } from '../state/useLauncherStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Detect if running inside Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface ManifestFile {
  path: string;
  url: string;
  sha256: string;
  size: number;
}

export interface VersionManifest {
  version: string;
  files: ManifestFile[];
}

interface DownloadProgressPayload {
  url: string;
  dest_path: string;
  bytes_downloaded: number;
  total_bytes: number;
  progress: number;
  speed: string;
  current_file: string;
  status: 'idle' | 'checking' | 'downloading' | 'verifying' | 'completed' | 'failed';
}

export interface IDownloaderService {
  startDownload(versionId: string): Promise<void>;
  repairInstallation(versionId: string): Promise<void>;
  cancelDownload(versionId?: string): Promise<void>;
}

// Global listener for Tauri download progress events (throttled via requestAnimationFrame for 60fps UI smoothness)
let animFrameId: number | null = null;
if (isTauri) {
  listen<DownloadProgressPayload>('download-progress', (event) => {
    if (animFrameId !== null) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(() => {
      const { progress, speed, current_file, status, bytes_downloaded, total_bytes } = event.payload;
      useLauncherStore.getState().setDownloadStatus({
        status,
        progress: Math.round(progress),
        downloadedSize: bytes_downloaded,
        totalSize: total_bytes,
        speed,
        currentFile: current_file,
      });
      animFrameId = null;
    });
  });
}

// Generates manifest file mappings for version checks
export const getVersionManifest = (versionId: string): VersionManifest => {
  return {
    version: versionId,
    files: [
      {
        path: `versions/${versionId}/${versionId}.jar`,
        // Standard small binary release zip for tests
        url: 'https://github.com/tauri-apps/tauri/archive/refs/tags/tauri-v2.0.0.zip', 
        sha256: '992a7f5d68d4d7756f7ef0cfdf2b79a528e202534f37476839352e85a5a5a5a5', // Custom SHA-256 for testing mismatches/repairs
        size: 10485760 // 10MB
      },
      {
        path: `libraries/lwjgl-3.3.1.jar`,
        url: 'https://github.com/tauri-apps/tauri/archive/refs/tags/tauri-v2.0.0.zip',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // Blank/empty SHA matches standard installer check
        size: 5242880 // 5MB
      }
    ]
  };
};

class DownloaderService implements IDownloaderService {
  private downloadInterval: number | null = null;
  private currentDownloadUrl: string | null = null;

  async startDownload(versionId: string): Promise<void> {
    await this.runUpdateOrRepair(versionId, false);
  }

  async repairInstallation(versionId: string): Promise<void> {
    await this.runUpdateOrRepair(versionId, true);
  }

  async runUpdateOrRepair(versionId: string, forceRepair: boolean): Promise<void> {
    const store = useLauncherStore.getState();
    if (store.downloadStatus.status === 'downloading') return;

    store.setDownloadStatus({
      status: 'checking',
      progress: 0,
      speed: '0 KB/s',
      currentFile: 'Verifying files against manifest...',
      error: undefined,
    });

    if (isTauri) {
      try {
        let minecraftDir = store.settings.minecraftDir;
        if (isTauri && (!minecraftDir || minecraftDir.includes('/home/aether'))) {
          try {
            minecraftDir = await invoke<string>('get_minecraft_dir');
          } catch (e) {
            minecraftDir = '/home/aether/.aether-launcher';
          }
        }
        if (!minecraftDir) minecraftDir = '/home/aether/.aether-launcher';
        
        // 1. Scaffold directories: .aether-launcher, libraries, versions, assets, mods
        console.log(`[Installer] Initializing structure in ${minecraftDir}`);
        await invoke('initialize_minecraft_structure', { baseDir: minecraftDir });

        // 2. Load manifest from Mojang API via Rust
        const manifest = await invoke<VersionManifest>('get_version_manifest_api', { versionId });
        const manifestJson = JSON.stringify(manifest);

        // 3. Compare versions & identify changed/mismatched files only
        console.log(`[Updates] Comparing version files (forceRepair=${forceRepair})`);
        const filesToDownload: ManifestFile[] = await invoke('verify_manifest', {
          baseDir: minecraftDir,
          manifestJson,
          forceRepair
        });

        if (filesToDownload.length === 0) {
          console.log('[Updates] All files are up to date.');
          store.setDownloadStatus({
            status: 'completed',
            progress: 100,
            currentFile: 'All files verified and up to date.',
          });
          return;
        }

        console.log(`[Updates] Need to download ${filesToDownload.length} file(s).`);

        // 4. Download changed files only
        const totalSize = filesToDownload.reduce((sum, f) => sum + f.size, 0);
        let downloadedBytes = 0;

        for (let i = 0; i < filesToDownload.length; i++) {
          const file = filesToDownload[i];
          const destPath = `${minecraftDir}/${file.path}`;

          store.setDownloadStatus({
            status: 'downloading',
            progress: Math.round((downloadedBytes / totalSize) * 100),
            speed: 'Connecting...',
            currentFile: `Downloading ${file.path.split('/').pop()}...`,
          });

          // Invoke downloader for changed file
          this.currentDownloadUrl = file.url;
          try {
            await invoke('download_file', {
              url: file.url,
              destPath,
              expectedSha256: file.sha256
            });
          } finally {
            this.currentDownloadUrl = null;
          }

          downloadedBytes += file.size;
        }

        store.setDownloadStatus({
          status: 'completed',
          progress: 100,
          currentFile: 'All files downloaded and verified!',
        });
      } catch (err: any) {
        console.error('[Updates] Update/Repair error:', err);
        store.setDownloadStatus({
          status: 'failed',
          error: err.toString(),
          speed: '0 KB/s',
          currentFile: `Error: ${err}`,
        });
      }
    } else {
      // Fallback: Run browser simulation
      this.runBrowserSimulation(versionId);
    }
  }

  async cancelDownload(versionId?: string): Promise<void> {
    console.log('[Downloader] Cancelling download for:', versionId);
    const store = useLauncherStore.getState();
    
    if (isTauri) {
      if (this.currentDownloadUrl) {
        try {
          await invoke('cancel_download', { url: this.currentDownloadUrl });
        } catch (e) {
          console.error('Cancel invoke failed:', e);
        }
      }
    } else {
      this.clearDownloadInterval();
    }

    store.setDownloadStatus({
      status: 'idle',
      progress: 0,
      currentFile: 'Download cancelled',
    });
  }

  private runBrowserSimulation(versionId: string) {
    const store = useLauncherStore.getState();
    store.setDownloadStatus({
      status: 'downloading',
      currentFile: `${versionId}.jar`,
    });

    let downloaded = store.downloadStatus.downloadedSize || 0;
    const total = 100 * 1024 * 1024; // 100MB

    this.downloadInterval = window.setInterval(() => {
      const currentStatus = useLauncherStore.getState().downloadStatus;
      if (currentStatus.status !== 'downloading') {
        this.clearDownloadInterval();
        return;
      }

      // Add random download chunk
      const chunkSize = (Math.random() * 4 + 2) * 1024 * 1024;
      downloaded += chunkSize;

      if (downloaded >= total) {
        downloaded = total;
        store.setDownloadStatus({
          status: 'verifying',
          progress: 100,
          downloadedSize: total,
          speed: '0 KB/s',
          currentFile: 'Verifying SHA-256 signature...',
        });

        this.clearDownloadInterval();

        // Simulate SHA256 verification phase
        setTimeout(() => {
          store.setDownloadStatus({
            status: 'completed',
            progress: 100,
            currentFile: 'Verification Successful!',
          });
        }, 1200);
      } else {
        const progress = Math.round((downloaded / total) * 100);
        const speed = (Math.random() * 5 + 8).toFixed(1) + ' MB/s';
        
        store.setDownloadStatus({
          progress,
          downloadedSize: downloaded,
          totalSize: total,
          speed,
          currentFile: `${versionId}.jar`,
        });
      }
    }, 400);
  }

  private clearDownloadInterval() {
    if (this.downloadInterval !== null) {
      clearInterval(this.downloadInterval);
      this.downloadInterval = null;
    }
  }
}

export const downloaderService = new DownloaderService();
export default downloaderService;
