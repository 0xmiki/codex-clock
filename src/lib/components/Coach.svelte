<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
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

<Card.Root class="coach min-h-0 gap-4 p-5" role="complementary" aria-label="Limit coach">
  <Card.Header class="flex flex-row items-center gap-3 p-0">
    <span class="flex size-10 shrink-0 items-center justify-center border bg-muted text-primary" aria-hidden="true"><ChatCircleIcon size={24} weight="duotone" /></span>
    <div><Card.Title>Limit coach</Card.Title><Card.Description>Where did your limits go?</Card.Description></div>
  </Card.Header>
  <div class="flex flex-wrap gap-2" aria-label="Suggested questions">
    {#each suggestions as suggestion (suggestion)}
      <Button variant="outline" size="sm" class="h-auto whitespace-normal py-2 text-left" onclick={() => void askCoach(suggestion)} disabled={coach.asking || !ready}>{suggestion}</Button>
    {/each}
  </div>
  <Separator />
  <ScrollArea class="min-h-0 flex-1" bind:viewportRef={log}>
    <div class="flex flex-col gap-3 pr-3" aria-live="polite">
      {#each coach.messages as message, index (index)}
        <p class={message.role === 'user' ? 'ml-auto max-w-[92%] whitespace-pre-wrap border border-primary/20 bg-primary/10 p-3 text-sm' : 'max-w-[92%] whitespace-pre-wrap border-l-2 border-primary bg-muted p-3 text-sm'}>{message.text}</p>
      {/each}
      {#if coach.asking}<p class="animate-pulse text-sm text-muted-foreground">Reading your usage…</p>{/if}
    </div>
  </ScrollArea>
  <form class="grid grid-cols-[1fr_auto] items-end gap-2" onsubmit={submit}>
    <Textarea class="min-h-20 resize-none" bind:value={question} maxlength={500} rows={2} placeholder="Ask about today’s usage, expensive threads, or better habits" aria-label="Ask your limit coach" onkeydown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} />
    <Button type="submit" size="icon" disabled={coach.asking || !ready || !question.trim()} aria-label="Send question"><PaperPlaneTiltIcon weight="fill" aria-hidden="true" /></Button>
  </form>
  <p class="text-[11px] text-muted-foreground">Answers come from a read-only Codex thread on this machine. Its turns consume your usage.</p>
</Card.Root>
