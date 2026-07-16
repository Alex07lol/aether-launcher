import { useLauncherStore } from '../state/useLauncherStore';
import type { UserProfile } from '../state/useLauncherStore';
import { invoke } from '@tauri-apps/api/core';

// Detect if running inside Tauri environment
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface IAuthService {
  loginOffline(username: string): Promise<UserProfile>;
  loginMicrosoft(): Promise<UserProfile>;
  loginRefresh(): Promise<UserProfile>;
  logout(): Promise<void>;
  refreshSession(profile: UserProfile): Promise<UserProfile>;
}

class AuthService implements IAuthService {
  async loginOffline(username: string): Promise<UserProfile> {
    useLauncherStore.getState().setIsAuthenticating(true);
    
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 600));
    
    const profile: UserProfile = {
      username,
      uuid: this.generateUUID(username),
      accessToken: 'offline_token_' + Math.random().toString(36).substring(2),
      userType: 'offline',
    };
    
    useLauncherStore.getState().setCurrentUser(profile);
    useLauncherStore.getState().setIsAuthenticating(false);
    return profile;
  }

  async loginMicrosoft(): Promise<UserProfile> {
    useLauncherStore.getState().setIsAuthenticating(true);
    
    if (isTauri) {
      try {
        console.log('[AuthService] Initiating native Microsoft login...');
        const profile = await invoke<UserProfile>('login_microsoft');
        useLauncherStore.getState().setCurrentUser(profile);
        useLauncherStore.getState().setIsAuthenticating(false);
        return profile;
      } catch (e: any) {
        useLauncherStore.getState().setIsAuthenticating(false);
        throw new Error(e.toString());
      }
    } else {
      // Browser preview mock
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const profile: UserProfile = {
        username: 'AetherExplorer',
        uuid: 'ms-' + Math.random().toString(36).substring(2, 10),
        accessToken: 'ms_token_' + Math.random().toString(36).substring(2),
        userType: 'microsoft',
      };
      useLauncherStore.getState().setCurrentUser(profile);
      useLauncherStore.getState().setIsAuthenticating(false);
      return profile;
    }
  }

  async loginRefresh(): Promise<UserProfile> {
    if (isTauri) {
      console.log('[AuthService] Attempting Microsoft secure token refresh...');
      const profile = await invoke<UserProfile>('login_refresh');
      return profile;
    } else {
      // Browser fallback mock
      const profile: UserProfile = {
        username: 'AetherExplorer',
        uuid: 'ms-refreshed',
        accessToken: 'ms_refreshed_token_' + Math.random().toString(36).substring(2),
        userType: 'microsoft',
      };
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
    useLauncherStore.getState().setCurrentUser(null);
  }

  async refreshSession(profile: UserProfile): Promise<UserProfile> {
    if (profile.userType === 'microsoft') {
      return this.loginRefresh();
    }
    return {
      ...profile,
      accessToken: 'refreshed_token_' + Math.random().toString(36).substring(2),
    };
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
