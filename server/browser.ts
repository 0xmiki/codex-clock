import { spawn } from 'node:child_process';

export function browserCommand(url: string, platform = process.platform, wsl = Boolean(process.env.WSL_DISTRO_NAME)): [string, string[]] {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['rundll32.exe', ['url.dll,FileProtocolHandler', url]];
  if (wsl) return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${url}'`]];
  return ['xdg-open', [url]];
}

export function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const [command, args] = browserCommand(url);
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Browser opener exited with code ${code}`)));
    // A browser launcher may stay alive with the browser. It must not keep the server alive.
    child.unref();
  });
}
