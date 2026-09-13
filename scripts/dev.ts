if (!(await Bun.file('server/assets.generated.ts').exists())) {
  await Bun.write('server/assets.generated.ts', 'export default {} as Record<string, string>;\n');
}
const backend = Bun.spawn(['bun', '--watch', 'server/main.ts'], { stdout: 'inherit', stderr: 'inherit' });
const frontend = Bun.spawn(['bun', 'x', '--no-install', 'vite'], { stdout: 'inherit', stderr: 'inherit' });
function stop() { backend.kill(); frontend.kill(); }
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
await Promise.race([backend.exited, frontend.exited]);
stop();
export {};
