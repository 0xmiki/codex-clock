import { expect, test } from 'bun:test';
import { createAssistant } from '../server/assistant';
import type { Rpc } from '../server/rpc';
import type { Snapshot } from '../src/lib/types';
import { coachModels, defaultCoachModel, isCoachModel, nextCoachModel } from '../src/lib/coach-models';

const snapshot: Snapshot = { threads: [], updatedAt: 0, error: null, hasMore: false };
function fakeRpc() {
  const calls: { method: string; params: any }[] = [];
  const listeners = new Set<(method: string, params: any) => void>();
  const rpc = {
    async connect() {},
    close() { listeners.clear(); },
    onNotification(fn: (method: string, params: any) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async request(method: string, params: any) {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'coach-thread' } };
      if (method === 'turn/start') {
        const id = `turn-${calls.length}`;
        setTimeout(() => {
          for (const fn of listeners) fn('item/agentMessage/delta', { threadId: params.threadId, turnId: id, delta: `Answer from ${params.model}` });
          for (const fn of listeners) fn('turn/completed', { threadId: params.threadId, turnId: id, turn: { id, status: 'completed' } });
        }, 0);
        return { turn: { id } };
      }
      throw new Error(`Unexpected RPC: ${method}`);
    }
  };
  return { rpc: rpc as unknown as Rpc, calls };
}

test('Ask cycles Luna → Terra → Sol → Astra → Luna and rejects unsupported choices', () => {
  let model = defaultCoachModel;
  const cycle: string[] = [model];
  for (let i = 0; i < 4; i++) { model = nextCoachModel(model); cycle.push(model); }
  expect(cycle).toEqual(['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra', 'gpt-5.6-luna']);
  for (const value of [null, undefined, '', 'luna', 'gpt-5.5', {}, 1]) expect(isCoachModel(value)).toBe(false);
});

test('Ask applies the selected model to every turn while retaining the conversation', async () => {
  const { rpc, calls } = fakeRpc();
  const assistant = createAssistant(rpc);
  try {
    // Omitting the selection preserves the existing Luna default.
    expect(await assistant.ask('First question', snapshot)).toBe('Answer from gpt-5.6-luna');
    for (const { id } of [...coachModels.slice(1), coachModels[0]]) {
      expect(await assistant.ask('Follow-up', snapshot, null, null, id)).toBe(`Answer from ${id}`);
    }
    expect(calls.filter(c => c.method === 'thread/start')).toHaveLength(1);
    const turns = calls.filter(c => c.method === 'turn/start');
    expect(turns.map(c => c.params.model)).toEqual([...coachModels.map(m => m.id), defaultCoachModel]);
    expect(turns.every(c => c.params.threadId === 'coach-thread')).toBe(true);
  } finally { assistant.close(); }
});

test('Ask starts with a non-default selection and rejects invalid models before RPC', async () => {
  const { rpc, calls } = fakeRpc();
  const assistant = createAssistant(rpc);
  try {
    await expect(assistant.ask('Question', snapshot, null, null, 'invalid' as any)).rejects.toThrow('Choose Luna, Terra, Sol or Astra.');
    expect(calls).toHaveLength(0);
    await assistant.ask('Question', snapshot, null, null, 'gpt-6-astra');
    expect(calls[0]).toMatchObject({ method: 'thread/start', params: { model: 'gpt-6-astra' } });
    expect(calls[1]).toMatchObject({ method: 'turn/start', params: { model: 'gpt-6-astra' } });
  } finally { assistant.close(); }
});
