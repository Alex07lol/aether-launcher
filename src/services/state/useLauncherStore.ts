import { create } from 'zustand';

// Navigation types
export type ActiveTab = 'dashboard' | 'library' | 'settings' | 'auth';

// User Auth types
export interface UserProfile {
  username: string;
  uuid: string;
  accessToken: string;
  userType: 'mojang' | 'microsoft' | 'offline';
}

// Download state types
export interface DownloadStatus {
  status: 'idle' | 'checking' | 'downloading' | 'verifying' | 'extracting' | 'completed' | 'failed';
  progress: number;
  totalSize: number;
  downloadedSize: number;
  speed: string; // e.g. "5.4 MB/s"
  currentFile: string;
  error?: string;
}

// Updater state types
export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'failed';
  version?: string;
  progress: number;
  error?: string;
}

// Launcher Settings types
export interface LauncherSettings {
  minecraftDir: string;
  javaPath: string;
  maxMemory: number; // in MB
  minMemory: number; // in MB
  width: number;
  height: number;
  fullScreen: boolean;
  theme: 'blue-glass' | 'carbon-black' | 'nebula-purple';
  enableBetaVersions: boolean;
  language: 'en' | 'es' | 'de';
}

// Version types
export interface GameVersion {
  id: string;
  name: string;
  type: 'release' | 'snapshot' | 'beta' | 'modded';
  releaseTime: string;
  url?: string;
}

interface LauncherState {
  // Navigation
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // Authentication
  currentUser: UserProfile | null;
  setCurrentUser: (user: UserProfile | null) => void;
  isAuthenticating: boolean;
  setIsAuthenticating: (loading: boolean) => void;

  // Downloader
  downloadStatus: DownloadStatus;
  setDownloadStatus: (status: Partial<DownloadStatus>) => void;
  resetDownloadStatus: () => void;

  // Updater
  updateStatus: UpdateStatus;
  setUpdateStatus: (status: Partial<UpdateStatus>) => void;

  // Settings
  settings: LauncherSettings;
  updateSettings: (settings: Partial<LauncherSettings>) => void;

  // Version Manager
  selectedVersion: string | null;
  setSelectedVersion: (versionId: string | null) => void;
  availableVersions: GameVersion[];
  setAvailableVersions: (versions: GameVersion[]) => void;
  isLoadingVersions: boolean;
  setIsLoadingVersions: (loading: boolean) => void;
}

export const useLauncherStore = create<LauncherState>((set) => ({
  // Navigation
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Authentication
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  isAuthenticating: false,
  setIsAuthenticating: (loading) => set({ isAuthenticating: loading }),

  // Downloader
  downloadStatus: {
    status: 'idle',
    progress: 0,
    totalSize: 0,
    downloadedSize: 0,
    speed: '0 KB/s',
    currentFile: '',
  },
  setDownloadStatus: (status) =>
    set((state) => ({ downloadStatus: { ...state.downloadStatus, ...status } })),
  resetDownloadStatus: () =>
    set({
      downloadStatus: {
        status: 'idle',
        progress: 0,
        totalSize: 0,
        downloadedSize: 0,
        speed: '0 KB/s',
        currentFile: '',
      },
    }),

  // Updater
  updateStatus: {
    status: 'idle',
    progress: 0,
  },
  setUpdateStatus: (status) =>
    set((state) => ({ updateStatus: { ...state.updateStatus, ...status } })),

  // Settings
  settings: {
    minecraftDir: '',
    javaPath: '',
    maxMemory: 4096,
    minMemory: 1024,
    width: 854,
    height: 480,
    fullScreen: false,
    theme: 'blue-glass',
    enableBetaVersions: false,
    language: 'en',
  },
  updateSettings: (newSettings) =>
    set((state) => ({ settings: { ...state.settings, ...newSettings } })),

  // Version Manager
  selectedVersion: null,
  setSelectedVersion: (versionId) => set({ selectedVersion: versionId }),
  availableVersions: [],
  setAvailableVersions: (versions) => set({ availableVersions: versions }),
  isLoadingVersions: false,
  setIsLoadingVersions: (loading) => set({ isLoadingVersions: loading }),
}));
