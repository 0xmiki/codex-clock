import { parseArgs } from 'node:util';
import { Rpc } from './rpc';
import { createDashboard } from './dashboard';
import assets from './assets.generated';

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { port: { type: 'string', default: '4260' }, codex: { type: 'string' }, help: { type: 'boolean' } } });
if (values.help) {
  console.log('MyLimits — saved Codex thread usage\n\n  mylimits [--port 4260] [--codex executable]\n\nReads saved thread metadata and local token counters on refresh. Requires Codex installed.');
  process.exit(0);
}
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be between 1 and 65535');
const rpc = new Rpc();
const dashboard = createDashboard(rpc, values.codex);
const server = Bun.serve({
  hostname: '127.0.0.1', port, idleTimeout: 120,
  async fetch(request) {
    const url = new URL(request.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return new Response('Forbidden host', { status: 403 });
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden origin', { status: 403 });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' };
    if (url.pathname === '/api/dashboard') {
      await dashboard.refresh();
      return Response.json(dashboard.state, { headers });
    }
    const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname];
    if (asset) return new Response(Bun.file(asset), { headers });
    return new Response('Not found. For development run bun dev; for a standalone UI run bun run build.', { status: 404, headers });
  }
});
console.log(`MyLimits → ${server.url}`);
function stop() { rpc.close(); server.stop(true); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
