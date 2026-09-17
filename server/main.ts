import { parseArgs } from 'node:util';
import { createServer, type IncomingMessage } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rpc } from './rpc';
import { createDashboard } from './dashboard';
import { createAssistant } from './assistant';
const { values } = parseArgs({ args: process.argv.slice(2), options: { port: { type: 'string', default: '4260' }, codex: { type: 'string' }, help: { type: 'boolean' } } });
if (values.help) {
  console.log('Codex Watch — Codex allowance and saved thread usage\n\n  codex-clock [--port 4260] [--codex executable]\n\nReads account allowance, saved thread metadata, and local token counters on refresh. Requires Codex installed.');
  process.exit(0);
}
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be between 1 and 65535');
// Resolve assets beside the installed server, never against the user's working directory.
const webRoot = fileURLToPath(new URL('./web/', import.meta.url));
const assets = new Map<string, string>();
if (process.env.CODEX_WATCH_DEV !== '1') {
  for (const entry of await readdir(webRoot, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      assets.set('/' + path.slice(webRoot.length).replaceAll('\\', '/'), path);
    }
  }
}
const mimeTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };
const rpc = new Rpc();
const dashboard = createDashboard(rpc, values.codex);
const assistant = createAssistant(new Rpc(), values.codex);
async function handle(request: Request) {
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
    const asset = assets.get(url.pathname === '/' ? '/index.html' : url.pathname);
    if (asset) return new Response(await readFile(asset), { headers: { ...headers, 'Content-Type': mimeTypes[extname(asset)] || 'application/octet-stream' } });
    return new Response('Not found.', { status: 404, headers });
}

function requestBody(incoming: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    incoming.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024) { incoming.pause(); reject(new Error('Request body too large')); }
      else chunks.push(chunk);
    });
    incoming.on('end', () => resolve(Buffer.concat(chunks)));
    incoming.on('error', reject);
  });
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    // Validate before reading the body or invoking any local-data endpoints.
    const host = incoming.headers.host;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}` && host !== `[::1]:${port}`) {
      outgoing.writeHead(403).end('Forbidden host');
      return;
    }
    const base = `http://${host}`;
    if ((headers.has('origin') && headers.get('origin') !== base) || headers.get('sec-fetch-site') === 'cross-site') {
      outgoing.writeHead(403).end('Forbidden origin');
      return;
    }
    const method = incoming.method || 'GET';
    const body = method === 'GET' || method === 'HEAD' ? undefined : new Uint8Array(await requestBody(incoming));
    const response = await handle(new Request(base + (incoming.url || '/'), { method, headers, body }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'Request body too large';
    outgoing.writeHead(tooLarge ? 413 : 500, { Connection: 'close' }).end(tooLarge ? 'Request body too large' : 'Internal server error');
  }
});
server.timeout = 120_000;
server.on('error', error => { console.error(`Cannot start Codex Watch: ${error.message}`); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`Codex Watch → http://127.0.0.1:${port}/`));
function stop() { rpc.close(); assistant.close(); server.close(); server.closeAllConnections(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
