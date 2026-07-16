import { useLauncherStore } from '../state/useLauncherStore';

export interface IUpdaterService {
  checkForUpdates(): Promise<boolean>;
  installUpdate(): Promise<void>;
}

class UpdaterService implements IUpdaterService {
  async checkForUpdates(): Promise<boolean> {
    const store = useLauncherStore.getState();
    store.setUpdateStatus({ status: 'checking', progress: 0 });

    // Simulate update API delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // For demonstration, say an update is available (v2.0.0)
    store.setUpdateStatus({
      status: 'available',
      version: '2.0.0-beta',
      progress: 0,
    });

    return true;
  }

  async installUpdate(): Promise<void> {
    const store = useLauncherStore.getState();
    if (store.updateStatus.status !== 'available') return;

    store.setUpdateStatus({ status: 'downloading', progress: 0 });

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        store.setUpdateStatus({
          status: 'ready',
          progress: 100,
        });
      } else {
        store.setUpdateStatus({ progress });
      }
    }, 300);
  }
}

export const updaterService = new UpdaterService();
export default updaterService;
