import { parseArgs } from 'node:util';
import { Rpc } from './rpc';
import { createDashboard } from './dashboard';
import { createAssistant } from './assistant';
// Vite serves development assets; only standalone runs load the generated bundle.
const assets: Record<string, string> = process.env.CODEX_WATCH_DEV === '1'
  ? {}
  : (await import('./assets.generated')).default;

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { port: { type: 'string', default: '4260' }, codex: { type: 'string' }, help: { type: 'boolean' } } });
if (values.help) {
  console.log('Codex Watch — Codex allowance and saved thread usage\n\n  codex-watch [--port 4260] [--codex executable]\n\nReads account allowance, saved thread metadata, and local token counters on refresh. Requires Codex installed.');
  process.exit(0);
}
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be between 1 and 65535');
const rpc = new Rpc();
const dashboard = createDashboard(rpc, values.codex);
const assistant = createAssistant(new Rpc(), values.codex);
const server = Bun.serve({
  hostname: '127.0.0.1', port, idleTimeout: 120,
  async fetch(request) {
    const url = new URL(request.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return new Response('Forbidden host', { status: 403 });
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden origin', { status: 403 });
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' };
    if (url.pathname === '/api/assistant' && request.method === 'POST') {
      let body;
      try { body = await request.json(); }
      catch { return Response.json({ error: 'Send a JSON question.' }, { status: 400, headers }); }
      const question = typeof body?.question === 'string' ? body.question.trim() : '';
      const threadId = typeof body?.threadId === 'string' ? body.threadId : question.match(/\bthread:([a-z0-9-]{6,})/i)?.[1] || null;
      if (!question || question.length > 500) return Response.json({ error: 'Ask a question between 1 and 500 characters.' }, { status: 400, headers });
      try {
        const transcript = threadId ? await dashboard.inspectThread(threadId) : null;
        if (threadId && transcript === null) return Response.json({ error: 'That saved thread is no longer available.' }, { status: 404, headers });
        return Response.json({ answer: await assistant.ask(question, dashboard.state, transcript, threadId) }, { headers });
      } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'The assistant failed.' }, { status: 500, headers }); }
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
    if (url.pathname === '/api/dashboard') {
      await dashboard.refresh();
      return Response.json(dashboard.state, { headers });
    }
    const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname];
    if (asset) return new Response(Bun.file(asset), { headers });
    return new Response('Not found. For development run bun dev; for a standalone UI run bun run build.', { status: 404, headers });
  }
});
console.log(`Codex Watch → ${server.url}`);
function stop() { rpc.close(); assistant.close(); server.stop(true); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
