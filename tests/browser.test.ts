import { expect, test } from 'bun:test';
import { browserCommand } from '../server/browser';

test('browser launch uses the system opener with the chosen local URL', () => {
  const url = 'http://127.0.0.1:4300/';
  expect(browserCommand(url, 'linux', false)).toEqual(['xdg-open', [url]]);
  expect(browserCommand(url, 'darwin', false)).toEqual(['open', [url]]);
  expect(browserCommand(url, 'win32', false)).toEqual(['rundll32.exe', ['url.dll,FileProtocolHandler', url]]);
  expect(browserCommand(url, 'linux', true)).toEqual(['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${url}'`]]);
});
