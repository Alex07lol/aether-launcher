import { useLauncherStore } from '../state/useLauncherStore';
import type { UserProfile } from '../state/useLauncherStore';
import { invoke } from '@tauri-apps/api/core';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface DeviceCodeInfo {
  user_code: string;
  device_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
  message?: string;
}

export interface IAuthService {
  loginOffline(username: string): Promise<UserProfile>;
  initiateDeviceCode(): Promise<DeviceCodeInfo>;
  pollDeviceCode(deviceCode: string, interval: number): Promise<UserProfile>;
  loginMicrosoft(): Promise<UserProfile>;
  loginRefresh(): Promise<UserProfile>;
  logout(): Promise<void>;
  refreshSession(profile: UserProfile): Promise<UserProfile>;
}

interface AccountEntry {
  username: string;
  uuid: string;
  accessToken: string;
  userType: 'mojang' | 'microsoft' | 'offline';
  created: string;
  lastUsed: string;
}

interface AccountsFileStore {
  activeAccountUuid: string | null;
  accounts: Record<string, AccountEntry>;
}

class AuthService implements IAuthService {
  private getAccountsStore(): AccountsFileStore {
    try {
      const stored = localStorage.getItem('aether_accounts');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to parse accounts store from localStorage:', e);
    }
    return { activeAccountUuid: null, accounts: {} };
  }

  private saveAccountsStore(store: AccountsFileStore): void {
    try {
      localStorage.setItem('aether_accounts', JSON.stringify(store, null, 2));
    } catch (e) {
      console.error('Failed to save accounts store to localStorage:', e);
    }

    if (isTauri) {
      invoke('save_accounts_json', { jsonContent: JSON.stringify(store, null, 2) }).catch((err) => {
        console.error('[AuthService] Failed to save accounts.json via Tauri:', err);
      });
    }
  }

  public recordLogin(profile: UserProfile): void {
    const store = this.getAccountsStore();
    const now = new Date().toISOString();
    const existing = store.accounts[profile.uuid];

    store.accounts[profile.uuid] = {
      username: profile.username,
      uuid: profile.uuid,
      accessToken: profile.accessToken,
      userType: profile.userType,
      created: existing ? existing.created : now,
      lastUsed: now,
    };
    store.activeAccountUuid = profile.uuid;

    this.saveAccountsStore(store);
  }

  async loginOffline(username: string): Promise<UserProfile> {
    useLauncherStore.getState().setIsAuthenticating(true);
    
    await new Promise((resolve) => setTimeout(resolve, 600));
    
    const profile: UserProfile = {
      username,
      uuid: this.generateUUID(username),
      accessToken: 'offline_token_' + Math.random().toString(36).substring(2),
      userType: 'offline',
    };
    
    this.recordLogin(profile);
    useLauncherStore.getState().setCurrentUser(profile);
    useLauncherStore.getState().setIsAuthenticating(false);
    return profile;
  }

  async initiateDeviceCode(): Promise<DeviceCodeInfo> {
    if (isTauri) {
      return await invoke<DeviceCodeInfo>('initiate_device_code');
    } else {
      return {
        user_code: 'ABCD-EFGH',
        device_code: 'mock_device_code_123',
        verification_uri: 'https://microsoft.com/devicelogin',
        interval: 3,
        expires_in: 900,
      };
    }
  }

  async pollDeviceCode(deviceCode: string, interval: number): Promise<UserProfile> {
    useLauncherStore.getState().setIsAuthenticating(true);
    if (isTauri) {
      try {
        const profile = await invoke<UserProfile>('poll_device_code_token', {
          deviceCode,
          interval,
        });
        this.recordLogin(profile);
        useLauncherStore.getState().setCurrentUser(profile);
        useLauncherStore.getState().setIsAuthenticating(false);
        return profile;
      } catch (e: any) {
        useLauncherStore.getState().setIsAuthenticating(false);
        throw new Error(e.toString());
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const profile: UserProfile = {
        username: 'AetherExplorer',
        uuid: 'ms-' + Math.random().toString(36).substring(2, 10),
        accessToken: 'ms_token_' + Math.random().toString(36).substring(2),
        userType: 'microsoft',
      };
      this.recordLogin(profile);
      useLauncherStore.getState().setCurrentUser(profile);
      useLauncherStore.getState().setIsAuthenticating(false);
      return profile;
    }
  }

  async loginMicrosoft(): Promise<UserProfile> {
    useLauncherStore.getState().setIsAuthenticating(true);
    
    if (isTauri) {
      try {
        console.log('[AuthService] Initiating Device Code Microsoft login...');
        const profile = await invoke<UserProfile>('login_microsoft');
        this.recordLogin(profile);
        useLauncherStore.getState().setCurrentUser(profile);
        useLauncherStore.getState().setIsAuthenticating(false);
        return profile;
      } catch (e: any) {
        useLauncherStore.getState().setIsAuthenticating(false);
        throw new Error(e.toString());
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const profile: UserProfile = {
        username: 'AetherExplorer',
        uuid: 'ms-' + Math.random().toString(36).substring(2, 10),
        accessToken: 'ms_token_' + Math.random().toString(36).substring(2),
        userType: 'microsoft',
      };
      this.recordLogin(profile);
      useLauncherStore.getState().setCurrentUser(profile);
      useLauncherStore.getState().setIsAuthenticating(false);
      return profile;
    }
  }

  async loginRefresh(): Promise<UserProfile> {
    if (isTauri) {
      console.log('[AuthService] Attempting Microsoft secure token refresh...');
      const profile = await invoke<UserProfile>('login_refresh');
      this.recordLogin(profile);
      return profile;
    } else {
      const profile: UserProfile = {
        username: 'AetherExplorer',
        uuid: 'ms-refreshed',
        accessToken: 'ms_refreshed_token_' + Math.random().toString(36).substring(2),
        userType: 'microsoft',
      };
      this.recordLogin(profile);
      return profile;
    }
  }

  async logout(): Promise<void> {
    if (isTauri) {
      try {
        await invoke('clear_secure_token');
      } catch (e) {
        console.error('[AuthService] Clear secure token failed:', e);
      }
    }

    const store = this.getAccountsStore();
    store.activeAccountUuid = null;
    this.saveAccountsStore(store);

    useLauncherStore.getState().setCurrentUser(null);
  }

  async refreshSession(profile: UserProfile): Promise<UserProfile> {
    if (profile.userType === 'microsoft') {
      return this.loginRefresh();
    }
    const refreshed: UserProfile = {
      ...profile,
      accessToken: 'refreshed_token_' + Math.random().toString(36).substring(2),
    };
    this.recordLogin(refreshed);
    return refreshed;
  }

  private generateUUID(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hex}-${hex.substring(0, 4)}-${hex.substring(4, 8)}-1234-567890abcdef`;
  }
}

export const authService = new AuthService();
export default authService;
