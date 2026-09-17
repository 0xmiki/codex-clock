import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export class Rpc {
  private nextId = 0;
  private generation = 0;
  private pending = new Map<number, Pending>();
  private child?: ChildProcessWithoutNullStreams;
  private send?: (text: string) => void;
  private listeners = new Set<(method: string, params: any) => void>();

  async connect(options: { executable?: string }) {
    this.close();
    const generation = this.generation;
    const fail = (message: string) => { if (generation === this.generation) this.fail(message); };
    {
      const args = ['app-server', '--stdio'];
      const child = this.child = spawn(options.executable || 'codex', args, { stdio: 'pipe' });
      let diagnostic = '';
      child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-2000); });
      child.on('error', error => fail(`Cannot start Codex: ${error.message}. Install Codex and sign in first.`));
      child.on('exit', () => fail(`Codex app server exited. ${diagnostic.slice(-500)}`));
      child.stdin.on('error', error => fail(error.message));
      createInterface({ input: child.stdout }).on('line', line => this.receive(line));
      this.send = text => { child.stdin.write(text + '\n'); };
    }
    await this.request('initialize', { clientInfo: { name: 'codex-watch', title: 'Codex Watch', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    this.send(JSON.stringify({ method: 'initialized' }));
  }

  request<T = any>(method: string, params?: unknown): Promise<T> {
    if (!this.send) return Promise.reject(new Error('Codex is not connected'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send!(JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) })); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  onNotification(listener: (method: string, params: any) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private receive(line: string) {
    let message: any;
    try { message = JSON.parse(line); } catch { return; }
    if (!message || typeof message !== 'object') return;
    // A monitor never handles approval requests or changes a running turn.
    if (message.method && message.id !== undefined) {
      this.send?.(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Read-only monitoring client' } }));
    } else if (message.method) {
      for (const listener of this.listeners) listener(message.method, message.params);
    } else {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'Codex request failed'));
      else pending.resolve(message.result);
    }
  }

  private fail(message: string) {
    this.send = undefined;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
    this.pending.clear();
  }

  close() { this.generation++; this.fail('Connection closed'); this.child?.kill(); this.child = undefined; this.listeners.clear(); }
}
