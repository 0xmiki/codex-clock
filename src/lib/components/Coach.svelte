<script lang="ts">
  import ChatCircleIcon from 'phosphor-svelte/lib/ChatCircleIcon';
  import PaperPlaneTiltIcon from 'phosphor-svelte/lib/PaperPlaneTiltIcon';
  import type { Snapshot } from '$lib/types';
  import { coach, askCoach } from '$lib/coach.svelte';
  import { tick } from 'svelte';

  let { snapshot }: { snapshot: Snapshot | null } = $props();
  let question = $state('');
  let log = $state<HTMLElement | null>(null);
  const ready = $derived(Boolean(snapshot));

  const suggestions = [
    'What consumed the most tokens today?',
    'Which usage patterns should I change?',
    'How can I save tokens tomorrow?'
  ];

  async function submit(event?: SubmitEvent) {
    event?.preventDefault();
    const text = question;
    question = '';
    await askCoach(text);
  }

  $effect(() => {
    coach.messages.length;
    coach.asking;
    void tick().then(() => { if (log) log.scrollTop = log.scrollHeight; });
  });
</script>

<aside class="coach" aria-label="Limit coach">
  <header>
    <span class="orb" aria-hidden="true"><ChatCircleIcon size={24} weight="duotone" /></span>
    <div>
      <h1>Limit coach</h1>
      <p>Where did your limits go?</p>
    </div>
  </header>

  <div class="suggestions" aria-label="Suggested questions">
    {#each suggestions as suggestion (suggestion)}
      <button onclick={() => void askCoach(suggestion)} disabled={coach.asking || !ready}>{suggestion}</button>
    {/each}
  </div>

  <div class="log" bind:this={log} aria-live="polite">
    {#each coach.messages as message, index (index)}
      <p class={message.role}>{message.text}</p>
    {/each}
    {#if coach.asking}
      <p class="assistant thinking">Reading your usage<span class="ellipsis" aria-hidden="true">…</span></p>
    {/if}
  </div>

  <form class="ask" onsubmit={submit}>
    <textarea bind:value={question} maxlength="500" rows="2" placeholder="Ask about today’s usage, expensive threads, or better habits" aria-label="Ask your limit coach" onkeydown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }}></textarea>
    <button disabled={coach.asking || !ready || !question.trim()} aria-label="Send question">
      <PaperPlaneTiltIcon size={18} weight="fill" aria-hidden="true" />
    </button>
  </form>
  <p class="fineprint">Answers come from a read-only Codex thread on this machine. Its turns consume your usage.</p>
</aside>

<style>
  .coach {
    display: flex; flex-direction: column; gap: 14px;
    padding: 22px;
    border: 1px solid var(--line); border-radius: var(--radius-card);
    background: linear-gradient(170deg, var(--bg2), var(--bg1) 65%);
    box-shadow: var(--lift);
  }
  header { display: flex; align-items: center; gap: 12px; }
  .orb {
    display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0;
    border-radius: 12px; background: var(--bg0); border: 1px solid var(--line);
  }
  .orb { color: var(--brand); }
  h1 { margin: 0; font: 600 16px/1.2 var(--font-display); letter-spacing: -0.2px; }
  header p { margin: 2px 0 0; color: var(--ink-faint); font-size: 12px; }

  .suggestions { display: flex; flex-wrap: wrap; gap: 7px; }
  .suggestions button {
    min-height: 30px; padding: 5px 12px; border: 1px solid var(--line); border-radius: 99px;
    background: transparent; color: var(--ink-dim); font-size: 11.5px; transition: border-color 0.15s, color 0.15s;
  }
  .suggestions button:hover:not(:disabled) { border-color: rgba(180, 245, 60, 0.5); color: var(--ink); }

  .log { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; min-height: 140px; padding: 2px; }
  .log p { max-width: 92%; margin: 0; padding: 10px 13px; border-radius: 12px; font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .log .assistant { align-self: flex-start; background: var(--bg2); border: 1px solid var(--line-soft); border-left: 2px solid var(--brand); border-top-left-radius: 4px; }
  .log .user { align-self: flex-end; background: rgba(180, 245, 60, 0.12); border: 1px solid rgba(180, 245, 60, 0.22); border-bottom-right-radius: 4px; }
  .thinking { color: var(--ink-faint); font-style: italic; }

  .ask { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; }
  .ask textarea {
    resize: none; padding: 11px 13px; border: 1px solid var(--line); border-radius: var(--radius-control);
    background: var(--bg0); color: var(--ink); font: 400 13px/1.5 var(--font-ui);
  }
  .ask textarea::placeholder { color: var(--ink-faint); }
  .ask textarea:focus { border-color: rgba(180, 245, 60, 0.5); outline: none; }
  .ask button {
    display: grid; place-items: center; width: 40px; height: 40px;
    border: 0; border-radius: var(--radius-control); background: var(--brand); color: var(--brand-ink);
  }
  .ask button:hover:not(:disabled) { filter: brightness(1.08); }
  .fineprint { margin: 0; color: var(--ink-faint); font-size: 10.5px; line-height: 1.5; }
</style>
