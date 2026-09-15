import type { Snapshot } from './types';

export type CoachMessage = { role: 'user' | 'assistant'; text: string };

export const coach = $state({
  open: true,
  asking: false,
  messages: [{ role: 'assistant', text: 'Ask me where your tokens went, which sessions are burning your limits, or how to make tomorrow cheaper.' }] as CoachMessage[]
});

export async function askCoach(text: string, threadId?: string) {
  text = text.trim();
  if (!text || coach.asking) return;
  coach.messages.push({ role: 'user', text });
  coach.asking = true;
  try {
    const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, threadId }), signal: AbortSignal.timeout(130000) });
    const result = await response.json();
    coach.messages.push({ role: 'assistant', text: response.ok ? result.answer : result.error });
  } catch (e) {
    coach.messages.push({ role: 'assistant', text: e instanceof Error ? e.message : 'The coach could not answer.' });
  } finally { coach.asking = false; }
}

export const coachReady = (snapshot: Snapshot | null) => Boolean(snapshot && !snapshot.error);
