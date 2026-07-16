/**
 * Formats a file size in bytes to a human-readable string.
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Validates a Minecraft offline username.
 */
export function validateUsername(username: string): boolean {
  const regex = /^[a-zA-Z0-9_]{3,16}$/;
  return regex.test(username);
}

/**
 * Returns RAM options list in MB.
 */
export function getRamPresets(): { value: number; label: string }[] {
  return [
    { value: 1024, label: '1 GB' },
    { value: 2048, label: '2 GB' },
    { value: 3072, label: '3 GB' },
    { value: 4096, label: '4 GB (Recommended)' },
    { value: 6144, label: '6 GB' },
    { value: 8192, label: '8 GB' },
    { value: 12288, label: '12 GB' },
    { value: 16384, label: '16 GB' },
  ];
}
