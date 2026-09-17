// Fail before launching children if another dev session owns either port.
const listeners: Bun.TCPSocketListener<undefined>[] = [];
try {
  for (const port of [4260, 5173]) {
    try {
      listeners.push(Bun.listen({ hostname: '127.0.0.1', port, socket: { data() {} } }));
    } catch {
      throw new Error(`Port ${port} is already in use. Stop the existing Codex Watch dev session before running bun dev again.`);
    }
  }
} finally {
  for (const listener of listeners) listener.stop(true);
}

const backend = Bun.spawn(['bun', '--watch', 'server/main.ts'], {
  env: { ...process.env, CODEX_WATCH_DEV: '1' }, stdout: 'inherit', stderr: 'inherit'
});
let frontend: ReturnType<typeof Bun.spawn> | undefined;
let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  backend.kill();
  frontend?.kill();
  await Promise.all([backend.exited, frontend?.exited]);
  process.exit(code);
}
process.on('SIGINT', () => { void stop(0); });
process.on('SIGTERM', () => { void stop(0); });

// Watch mode can remain alive after a startup error, so wait for the actual server.
let ready = false;
for (let attempt = 0; attempt < 100 && backend.exitCode === null; attempt++) {
  try {
    await fetch('http://127.0.0.1:4260/', { signal: AbortSignal.timeout(200) });
    ready = true;
    break;
  } catch { await Bun.sleep(100); }
}
if (!ready) {
  console.error('Codex Watch backend failed to start on port 4260. See the error above.');
  await stop(1);
} else {
  frontend = Bun.spawn(['bun', '--bun', 'node_modules/vite/bin/vite.js', '--port', '5173', '--strictPort'], {
    stdout: 'inherit', stderr: 'inherit'
  });
  await stop(await Promise.race([backend.exited, frontend.exited]));
}
export {};
