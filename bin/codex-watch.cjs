#!/usr/bin/env node
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const child = spawn(join(__dirname, '../dist', process.platform === 'win32' ? 'codex-watch.exe' : 'codex-watch'), process.argv.slice(2), { stdio: 'inherit' });
child.on('error', error => { console.error(`Cannot launch Codex Watch: ${error.message}. Install a package built for your platform.`); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => { process.exit(code ?? (signal === 'SIGINT' ? 130 : 1)); });
