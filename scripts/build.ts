import { cp, mkdir, rm } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
const result = await Bun.build({ entrypoints: ['server/main.ts'], target: 'node', format: 'esm', outdir: 'dist', naming: 'server.mjs', minify: true });
if (!result.success) throw new AggregateError(result.logs, 'Server build failed');
// Replace only generated assets so old hashed files cannot accumulate.
await rm('dist/web', { recursive: true, force: true });
await cp('build', 'dist/web', { recursive: true });
console.log('Built Node server and web assets in dist.');
