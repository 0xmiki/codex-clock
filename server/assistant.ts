import { basename } from 'node:path';
import type { Snapshot } from '../src/lib/types';
import { estimatedApiCost, threadApiCost, threadPressure, todayThreads } from '../src/lib/today';
import { Rpc } from './rpc';

export function usagePrompt(question: string, snapshot: Snapshot, now = Date.now(), transcript?: string | null) {
  const today = todayThreads(snapshot.threads, now).filter(thread => thread.usage).toSorted((a, b) => b.usage!.totalTokens - a.usage!.totalTokens);
  const rows = today.slice(0, 30).map(thread => ({ title: thread.title, project: basename(thread.cwd), models: Object.entries(thread.usage!.byModel || {}).filter(([, usage]) => usage.modelCalls > 0).map(([model, usage]) => ({ model, tokens: usage.totalTokens, estimatedApiCost: estimatedApiCost(usage, model) })), tokens: thread.usage!.totalTokens, input: thread.usage!.inputTokens, cached: thread.usage!.cachedInputTokens, output: thread.usage!.outputTokens, calls: thread.usage!.modelCalls, turns: thread.usage!.turns, pressure: threadPressure(thread), estimatedApiCost: threadApiCost(thread) }));
  return `Current saved usage snapshot. "Today" means threads updated today; token totals are cumulative for each thread.\n${JSON.stringify(rows)}${transcript ? `\n\nSelected thread transcript (tail):\n${transcript}` : ''}\n\nUser question: ${question}`;
}

export function createAssistant(rpc: Rpc, executable?: string) {
  let threadId: string | undefined;
  let busy = false;
  return {
    async ask(question: string, snapshot: Snapshot, transcript?: string | null) {
      if (busy) throw new Error('The assistant is already answering.');
      busy = true;
      try {
        if (!threadId) {
          await rpc.connect({ executable });
          const started = await rpc.request<{ thread: { id: string } }>('thread/start', {
            cwd: process.cwd(), model: 'gpt-5.6-luna', ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only', personality: 'pragmatic',
            developerInstructions: 'You are MyLimits, a concise Codex usage coach. Use only the supplied usage snapshot; never call tools. Pressure is a 0–100 heuristic combining model price, cache reuse, context use, and request size; 60+ is high. Estimated API cost uses current OpenAI per-token API prices and is not the user’s Codex subscription charge. Identify costly threads and practical ways to reduce token use. State data limitations when relevant. Answer in plain text under 140 words.'
          });
          threadId = started.thread.id;
        }
        let answer = '';
        let expectedTurn = '';
        const completed = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { off(); reject(new Error('The assistant timed out.')); }, 120000);
          const off = rpc.onNotification((method, params) => {
            if (params?.threadId !== threadId || (expectedTurn && params?.turnId && params.turnId !== expectedTurn)) return;
            if (method === 'item/agentMessage/delta') answer += params.delta;
            if (method === 'turn/completed') {
              clearTimeout(timer); off();
              if (params.turn?.status === 'completed') resolve();
              else reject(new Error(params.turn?.error?.message || 'The assistant could not finish.'));
            }
          });
        });
        const turn = await rpc.request<{ turn: { id: string } }>('turn/start', { threadId, input: [{ type: 'text', text: usagePrompt(question, snapshot, Date.now(), transcript) }], effort: 'low' });
        expectedTurn = turn.turn.id;
        await completed;
        return answer.trim() || 'No answer was returned.';
      } catch (error) {
        rpc.close(); threadId = undefined;
        throw error;
      } finally { busy = false; }
    },
    close() { rpc.close(); }
  };
}
