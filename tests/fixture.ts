import { mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export function tokenLine(input: number, output: number, cached: number, reasoning = 0, lastInput = input, lastOutput = output) {
  return JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: input + output, input_tokens: input, output_tokens: output, cached_input_tokens: cached, reasoning_output_tokens: reasoning }, last_token_usage: { total_tokens: lastInput + lastOutput, input_tokens: lastInput, output_tokens: lastOutput, cached_input_tokens: Math.min(cached, lastInput), reasoning_output_tokens: Math.min(reasoning, lastOutput) }, model_context_window: 258400 } } });
}
export async function makeFixture(root: string) {
  await mkdir(root, { recursive: true });
  await Bun.write(join(root, 'build.jsonl'), JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }) + '\n' + tokenLine(18380, 180, 4864, 113) + '\n' + tokenLine(245600, 18400, 184200, 7200, 48200, 3200) + '\n');
  await Bun.write(join(root, 'review.jsonl'), tokenLine(88200, 6200, 26460, 2400) + '\n');
  await Bun.write(join(root, 'empty.jsonl'), '{}\n');
  await Bun.write(join(root, 'session_index.jsonl'), '{"id":"review","thread_name":"Generated release review"}\n');
  const executable = join(root, 'codex-fixture');
  await Bun.write(executable, `#!${process.execPath}\nimport { runFixture } from ${JSON.stringify(import.meta.path)};\nrunFixture(${JSON.stringify(root)});\n`);
  await chmod(executable, 0o755);
  return executable;
}
export function runFixture(root: string) {
  createInterface({ input: process.stdin }).on('line', line => {
    const message = JSON.parse(line);
    if (message.id === undefined) return;
    const now = Math.floor(Date.now() / 1000);
    const thread = (id: string, name: string | null, model: string, path: string, age = 0, preview = '') => ({ id, name, preview, cwd: '/projects/mylimits', model, modelProvider: 'openai', updatedAt: now - age, path: join(root, path) });
    const result = message.method === 'initialize' ? { userAgent: 'fixture' } : message.method === 'thread/list' ? {
      data: [thread('build', 'Build the Codex integration', 'gpt-5.4', 'build.jsonl'), thread('review', null, 'gpt-5.4-mini', 'review.jsonl'), thread('empty', null, 'gpt-5.4', 'empty.jsonl', 0, '  Investigate slow\nworkspace indexing  '), thread('yesterday', 'Design the dashboard', 'gpt-5.4', 'review.jsonl', 86400)], nextCursor: 'older' as string | null
    } : null;
    if (message.method === 'thread/list' && message.params?.cursor) { result!.data = []; result!.nextCursor = null; }
    process.stdout.write(JSON.stringify(result ? { id: message.id, result } : { id: message.id, error: { code: -32601, message: 'Unexpected method: ' + message.method } }) + '\n');
  });
}
