<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
  import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import type { Snapshot } from '$lib/types';
  import { coachModelLabel, nextCoachModel } from '$lib/coach-models';
  import { coach, askCoach, cycleCoachModel } from '$lib/coach.svelte';
  import { tick } from 'svelte';

  let { snapshot }: { snapshot: Snapshot | null } = $props();
  let question = $state('');
  let log = $state<HTMLElement | null>(null);
  const ready = $derived(Boolean(snapshot && !snapshot.error));

  async function submit(event?: SubmitEvent) {
    event?.preventDefault();
    if (!ready || coach.asking || !question.trim()) return;
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

<Card.Root id="ask-panel" class="coach min-h-0 gap-0 overflow-hidden rounded-xl p-0" role="complementary" aria-label="Ask">
  <div class="ask-header">
    <div><h2>Ask</h2><span>Your usage, explained</span></div>
    <button class="close" aria-label="Close Ask" onclick={() => coach.open = false}><XIcon size={18} /></button>
  </div>
  <ScrollArea class="min-h-0 flex-1" bind:viewportRef={log}>
    <div class="messages" role="log" aria-label="Usage conversation" aria-live="polite">
      {#each coach.messages as message, index (index)}
        <div class="message" class:user={message.role === 'user'}>
          <span class="speaker">{message.role === 'user' ? 'You' : message.model ? `Ask · ${coachModelLabel(message.model)}` : 'Ask'}</span>
          <p>{message.text}</p>
        </div>
      {/each}
      {#if coach.asking}<p class="pending" role="status">Reading usage<span class="animate-pulse">…</span></p>{/if}
    </div>
  </ScrollArea>
  <div class="compose-area">
    <form class="composer" onsubmit={submit}>
      <textarea bind:value={question} maxlength={500} rows={2} placeholder="Ask about your usage…" aria-label="Usage question" onkeydown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void submit(); } }}></textarea>
      <div class="composer-tools">
        <button class="model-select" type="button" disabled={coach.asking} onclick={cycleCoachModel} aria-label={`Ask model: ${coachModelLabel(coach.model)}. Switch to ${coachModelLabel(nextCoachModel(coach.model))}`} title="Click to cycle Luna → Terra → Sol → Astra">
          {coachModelLabel(coach.model)} <span aria-hidden="true">↻</span>
        </button>
        <button class="send" type="submit" disabled={coach.asking || !ready || !question.trim()} aria-label="Send question"><ArrowUpIcon size={18} weight="bold" /></button>
      </div>
    </form>
    <p class="disclosure">Uses your Codex allowance.</p>
  </div>
</Card.Root>

<style>
  .ask-header { display:flex; align-items:center; justify-content:space-between; padding:20px; border-bottom:1px solid var(--border); }
  h2 { margin:0; font:600 16px var(--font-sans); }
  .ask-header span { display:block; margin-top:3px; font-size:11px; color:var(--muted-foreground); }
  .close { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; color:var(--muted-foreground); background:transparent; cursor:pointer; }
  .close:hover { background:var(--muted); color:var(--foreground); }
  .messages { display:flex; flex-direction:column; gap:24px; padding:20px; }
  .message { min-width:0; }
  .speaker { display:block; margin-bottom:7px; font-size:10px; font-weight:600; color:var(--muted-foreground); }
  .message p { margin:0; font-size:13px; line-height:1.7; white-space:pre-wrap; overflow-wrap:anywhere; }
  .user { align-self:flex-end; max-width:94%; border-radius:12px 12px 3px 12px; padding:12px 14px; background:var(--muted); }
  .pending { font-size:12px; color:var(--muted-foreground); }
  .compose-area { padding:16px; }
  .composer { border:1px solid var(--border); border-radius:14px; background:var(--muted); padding:12px; transition:border-color .15s; }
  .composer:focus-within { border-color:var(--ring); box-shadow:0 0 0 2px color-mix(in oklch,var(--ring) 15%,transparent); }
  textarea { display:block; width:100%; min-height:60px; max-height:180px; field-sizing:content; resize:none; border:0; outline:none; padding:0; background:transparent; color:var(--foreground); font:400 13px/1.6 var(--font-sans); }
  textarea::placeholder { color:var(--muted-foreground); }
  .composer-tools { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:10px; }
  .model-select { display:flex; align-items:center; gap:7px; border:1px solid var(--border); border-radius:8px; padding:5px 9px; background:var(--muted); color:var(--foreground); font-size:11px; cursor:pointer; }
  .model-select:not(:disabled):hover { border-color:var(--ring); }
  .model-select:disabled { opacity:.5; cursor:default; }
  .send { display:grid; place-items:center; width:32px; height:32px; flex-shrink:0; border-radius:50%; background:var(--primary); color:var(--primary-foreground); cursor:pointer; }
  .send:disabled { opacity:.3; cursor:default; }
  .send:not(:disabled):hover { opacity:.85; }
  button:focus-visible { outline:2px solid var(--ring); outline-offset:3px; }
  .disclosure { margin:9px 0 0; text-align:center; font-size:10px; color:var(--muted-foreground); }
</style>
