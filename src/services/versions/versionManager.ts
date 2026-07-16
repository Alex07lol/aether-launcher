import { useLauncherStore } from '../state/useLauncherStore';
import type { GameVersion } from '../state/useLauncherStore';

export interface IVersionManager {
  fetchVersions(): Promise<GameVersion[]>;
}

class VersionManager implements IVersionManager {
  async fetchVersions(): Promise<GameVersion[]> {
    const store = useLauncherStore.getState();
    store.setIsLoadingVersions(true);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const versions: GameVersion[] = [
      { id: '1.8.9', name: '1.8.9', type: 'release', releaseTime: '2015-12-09' },
      { id: '1.7.10', name: '1.7.10', type: 'release', releaseTime: '2014-06-26' },
    ];

    store.setAvailableVersions(versions);
    if (!store.selectedVersion && versions.length > 0) {
      store.setSelectedVersion(versions[0].id);
    }
    store.setIsLoadingVersions(false);

    return versions;
  }
}

export const versionManager = new VersionManager();
export default versionManager;
