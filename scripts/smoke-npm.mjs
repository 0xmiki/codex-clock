import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, symlink, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { get } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the published layout, with no source-tree or development dependencies.
const root = await mkdtemp(join(tmpdir(), 'codex-watch-node-smoke-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const runNpm = args => execFileSync(npm, args, { encoding: 'utf8', shell: process.platform === 'win32' });
const packed = JSON.parse(runNpm(['pack', '--json', '--pack-destination', root]))[0];
assert(packed.files.every(file => file.path === 'package.json' || file.path === 'README.md' || file.path === 'bin/codex-clock.cjs' || file.path === 'dist/server.mjs' || file.path.startsWith('dist/web/')));
runNpm(['install', '--prefix', root, '--no-audit', '--no-fund', join(root, packed.filename)]);
const installed = join(root, 'node_modules/codex-clock');
const cli = join(installed, 'bin/codex-clock.cjs');
const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
assert.equal(metadata.name, 'codex-clock');
assert.deepEqual(metadata.bin, { 'codex-clock': 'bin/codex-clock.cjs' });
assert.equal(metadata.os, undefined);
assert.equal(metadata.cpu, undefined);
assert.equal(metadata.dependencies, undefined);
const shims = join(root, 'node-only');
await mkdir(shims);
await symlink(process.execPath, join(shims, process.platform === 'win32' ? 'node.exe' : 'node'));
const isolatedEnv = { ...process.env, PATH: shims, CODEX_WATCH_DEV: '0' };
assert.match(execFileSync(process.execPath, [cli, '--help'], { env: isolatedEnv, cwd: root, encoding: 'utf8' }), /Codex Clock/);
assert.throws(() => execFileSync(process.execPath, [cli, '--port', '0'], { env: isolatedEnv, cwd: root, stdio: 'pipe' }));

async function check(live, autoOpen = false) {
  const reservation = createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const marker = join(root, `browser-${port}.json`);
  const env = { ...(live ? process.env : isolatedEnv), CODEX_WATCH_DEV: '0', WSL_DISTRO_NAME: '', CODEX_CLOCK_BROWSER_MARKER: marker };
  const args = [cli, '--port', String(port), ...(autoOpen ? [] : ['--no-open']), ...(live ? [] : ['--codex', join(root, 'missing-codex')])];
  const child = spawn(process.execPath, args, { env, cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 100 && !log.includes('Codex Clock →'); i++) {
      assert.equal(child.exitCode, null, log);
      await delay(50);
    }
    assert.match(log, /Codex Clock →/);
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    const html = await page.text();
    assert.match(html, /_app\/immutable/);
    if (autoOpen) {
      let opened;
      for (let i = 0; i < 100; i++) {
        try { opened = JSON.parse(await readFile(marker, 'utf8')); break; }
        catch { await delay(50); }
      }
      assert.deepEqual(opened, { url: base + '/', status: 200 }, 'Browser must open the listening server automatically');
    } else {
      await assert.rejects(readFile(marker), { code: 'ENOENT' });
    }
    // Fetch every shipped asset, including lazy chunks and fonts.
    for (const file of packed.files.filter(file => file.path.startsWith('dist/web/'))) {
      const response = await fetch(base + '/' + file.path.slice('dist/web/'.length));
      assert.equal(response.status, 200, file.path);
      if (file.path.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
      if (file.path.endsWith('.css')) assert.match(response.headers.get('content-type'), /text\/css/);
      await response.arrayBuffer();
    }
    assert.equal((await fetch(base + '/package.json')).status, 404);
    const hostileHostStatus = await new Promise((resolve, reject) => {
      get(base, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(hostileHostStatus, 403);
    assert.equal((await fetch(base, { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(base, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/api/assistant', { method: 'POST', body: '{' })).status, 400);
    assert.equal((await fetch(base + '/api/assistant', { method: 'POST', body: JSON.stringify({ question: '' }) })).status, 400);
    assert.equal((await fetch(base + '/api/assistant', { method: 'POST', body: 'x'.repeat(70_000) })).status, 413);
    const response = await fetch(base + '/api/dashboard', { signal: AbortSignal.timeout(120_000) });
    assert.equal(response.status, 200);
    const dashboard = await response.json();
    if (live) {
      assert.equal(dashboard.error, null);
      assert(Array.isArray(dashboard.threads));
      assert(dashboard.threads.length <= 50);
      assert.equal(dashboard.hasMore, false);
      const second = await (await fetch(base + '/api/dashboard?view=true&page=2')).json();
      assert.equal(second.summary.daily, dashboard.summary.daily);
      assert.equal(second.pagination.total, dashboard.pagination.total);
      assert(!second.threads.some(t => t.usage?.minuteTokens));
      if (dashboard.pagination.pages > 1) assert.equal(second.pagination.page, 2);
      console.log(`Live Codex: ${dashboard.pagination.total} indexed threads, ${dashboard.threads.length} rows per page; limits ${dashboard.limits ? 'available' : 'unavailable'}.`);
    } else {
      assert.match(dashboard.error, /Cannot start Codex/);
      assert.deepEqual(dashboard.threads, []);
      const refresh = await fetch(base + '/api/dashboard?background=true');
      assert.equal(refresh.status, 200);
      let status;
      for (let i = 0; i < 100; i++) {
        status = await (await fetch(base + '/api/index-status')).json();
        if (status.phase === 'idle') break;
        await delay(20);
      }
      assert.equal(status.phase, 'idle');
    }
  } finally {
    child.kill('SIGTERM');
    const watchdog = setTimeout(() => child.kill('SIGKILL'), 5000);
    const [code, signal] = await exited;
    clearTimeout(watchdog);
    assert.equal(code, 0, `Unclean shutdown (${signal}): ${log}`);
  }
}
// A fake system browser confirms startup behavior without opening tabs during tests.
if (process.platform !== 'win32') {
  const opener = join(shims, process.platform === 'darwin' ? 'open' : 'xdg-open');
  await writeFile(opener, '#!/usr/bin/env node\n' + `
const { writeFileSync } = require('node:fs');
const url = process.argv[2];
fetch(url).then(async response => {
  await response.arrayBuffer();
  writeFileSync(process.env.CODEX_CLOCK_BROWSER_MARKER, JSON.stringify({ url, status: response.status }));
}).catch(() => process.exit(1));
`);
  await chmod(opener, 0o755);
  await check(false, true);
}
await check(false);
if (process.argv.includes('--live')) await check(true);
console.log(`npm smoke test passed. Package: ${(packed.size / 1e6).toFixed(2)} MB compressed, ${(packed.unpackedSize / 1e6).toFixed(2)} MB unpacked. Artifacts: ${resolve(root)}`);
