<script lang="ts">
  import { Progress } from '$lib/components/ui/progress/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Table from '$lib/components/ui/table/index.js';
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
  import RobotIcon from 'phosphor-svelte/lib/RobotIcon';
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
  import type { Thread } from '$lib/types';
  import { cacheRate, threadApiCost } from '$lib/today';
  import type { ThreadEfficiency } from '$lib/efficiency';
  import { fmt, exact, money, percent, project, relativeTime, fullTime } from '$lib/format';
  import { askCoach } from '$lib/coach.svelte';
  import MixBar from './MixBar.svelte';
  import Sparkline from './Sparkline.svelte';
  import EfficiencyDetails from './EfficiencyDetails.svelte';
  import type { SortKey } from '../../../server/view';

  let { threads, now, efficiencyGrades, sortKey, sortDesc, onSort }: { threads: Thread[]; now: number; efficiencyGrades: ReadonlyMap<string, ThreadEfficiency>; sortKey: SortKey; sortDesc: boolean; onSort: (key: SortKey, desc: boolean) => void } = $props();
  let expandedId = $state<string | null>(null);
  let copiedId = $state('');

  const row = (thread: Thread) => ({
    thread,
    tokens: thread.usage?.totalTokens ?? null,
    cache: cacheRate(thread.usage),
    cost: threadApiCost(thread),
    efficiency: efficiencyGrades.get(thread.id) ?? { available: false as const, reason: 'No usage score available.' },
    models: Object.entries(thread.usage?.byModel || {}).filter(([, usage]) => usage.modelCalls > 0)
  });

  const rows = $derived(threads.map(row));
  const sorted = $derived(rows);

  const isOn = (key: SortKey) => sortKey === key;
  const ariaSort = (key: SortKey) => (sortKey === key ? (sortDesc ? 'descending' : 'ascending') : 'none');

  function sortBy(key: SortKey) {
    onSort(key, sortKey === key ? !sortDesc : key !== 'project');
  }

  function toggle(id: string) { expandedId = expandedId === id ? null : id; }

  async function copyRef(id: string) {
    await navigator.clipboard.writeText(`thread:${id.slice(0, 8)}`);
    copiedId = id;
    setTimeout(() => { if (copiedId === id) copiedId = ''; }, 1500);
  }
</script>

<section class="thread-view" aria-label="Saved threads">
<Card.Root class="gap-0 py-0">

    <Table.Root class="min-w-[900px]">
      <Table.Header>
        <Table.Row>
          <Table.Head class="session-col" scope="col">Session</Table.Head>
          <Table.Head scope="col" aria-sort={ariaSort('project')}>
            <Button variant="ghost" size="sm" class="sort h-auto px-0 py-1 text-[11px]" onclick={() => sortBy('project')} title="Sort by project">Project<span class="arrow" class:on={isOn('project')} aria-hidden="true">{#if isOn('project') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></Button>
          </Table.Head>
          <Table.Head scope="col" class="numeric" aria-sort={ariaSort('tokens')}>
            <Button variant="ghost" size="sm" class="sort h-auto px-0 py-1 text-[11px]" onclick={() => sortBy('tokens')} title="Cumulative tokens for the whole session">Tokens<span class="arrow" class:on={isOn('tokens')} aria-hidden="true">{#if isOn('tokens') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></Button>
          </Table.Head>
          <Table.Head scope="col" class="numeric" aria-sort={ariaSort('cache')}>
            <Button variant="ghost" size="sm" class="sort h-auto px-0 py-1 text-[11px]" onclick={() => sortBy('cache')} title="Share of input served from cache — higher is cheaper">Cache<span class="arrow" class:on={isOn('cache')} aria-hidden="true">{#if isOn('cache') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></Button>
          </Table.Head>
          <Table.Head scope="col" class="numeric" aria-sort={ariaSort('cost')}>
            <Button variant="ghost" size="sm" class="sort h-auto px-0 py-1 text-[11px]" onclick={() => sortBy('cost')} title="API-equivalent estimate from OpenAI token prices; not your Codex subscription charge">≈ API<span class="arrow" class:on={isOn('cost')} aria-hidden="true">{#if isOn('cost') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></Button>
          </Table.Head>
          <Table.Head scope="col" class="efficiency-col" aria-sort={ariaSort('efficiency')}>
            <Button variant="ghost" size="sm" class="sort h-auto px-0 py-1 text-[11px]" onclick={() => sortBy('efficiency')} title="Sort by usage score">Usage Score<span class="arrow" class:on={isOn('efficiency')} aria-hidden="true">{#if isOn('efficiency') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></Button>
          </Table.Head>
          <Table.Head scope="col" class="numeric" title="Latest request as a share of the model context window">Context</Table.Head>
          <Table.Head scope="col" class="numeric" aria-sort={ariaSort('when')}>
            <Button variant="ghost" size="sm" class="sort h-auto px-0 py-1 text-[11px]" onclick={() => sortBy('when')} title="Sort by last saved update">Updated<span class="arrow" class:on={isOn('when')} aria-hidden="true">{#if isOn('when') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></Button>
          </Table.Head>
          <Table.Head scope="col" class="spark-col" title="Tokens per request, oldest to newest">Requests</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each sorted as values (values.thread.id)}
          {@const thread = values.thread}
          {@const contextPercent = thread.usage?.last && thread.usage.modelContextWindow ? Math.min(100, Math.round(thread.usage.last.totalTokens / thread.usage.modelContextWindow * 100)) : null}
          {@const requests = thread.usage?.recentRequests ?? []}
          <Table.Row class={["main-row", expandedId === thread.id && "bg-muted"]} onclick={() => toggle(thread.id)}>
            <Table.Cell class="session-col">
              <Button variant="ghost" class="disclose h-auto min-w-0 max-w-[360px] justify-start whitespace-normal p-0 text-left" aria-expanded={expandedId === thread.id} onclick={event => { event.stopPropagation(); toggle(thread.id); }}>
                <span class="chevron" aria-hidden="true"><CaretRightIcon size={12} weight="fill" /></span>
                <span class="title" title={thread.title}>{thread.title}</span>
                {#if thread.parentThreadId}
                  <span class="subagent-icon" title="Subagent"><RobotIcon size={16} aria-label="Subagent" /></span>
                {/if}
              </Button>
              {#if values.models.length > 1}<Badge variant="secondary" class="ml-5 mt-1 text-[10px]">{values.models.length} models</Badge>{/if}
            </Table.Cell>
            <Table.Cell class="proj" title={thread.cwd}>{project(thread.cwd)}</Table.Cell>
            <Table.Cell class="numeric">
              {#if thread.usage}
                <span class="num" title={exact(values.tokens)}>{fmt(values.tokens)}</span>
                <MixBar cached={thread.usage.cachedInputTokens ?? 0} fresh={thread.usage.inputTokens - (thread.usage.cachedInputTokens ?? 0)} output={thread.usage.outputTokens} height={4} />
              {:else}
                <span class="num dim">—</span>
              {/if}
            </Table.Cell>
            <Table.Cell class="numeric"><span class="num" class:dim={values.cache === null}>{percent(values.cache)}</span></Table.Cell>
            <Table.Cell class="numeric"><span class="num" class:dim={values.cost === null}>{money(values.cost)}</span></Table.Cell>
            <Table.Cell class="efficiency-col">
              {#if values.efficiency.available}
                <span class="usage-grade" title={`Usage Score: ${values.efficiency.grade}`}>
                  <span class="grade grade-{values.efficiency.grade.toLowerCase()}">{values.efficiency.grade}</span>
                  <span class="burn-multiplier">{values.efficiency.burnRatio.toFixed(2)}× usage</span>
                </span>
              {:else}
                <span class="num dim" title={values.efficiency.reason}>—</span>
              {/if}
            </Table.Cell>
            <Table.Cell class="numeric">
              {#if contextPercent !== null}
                <span class="metric-stack">
                  <span class="num" class:hot={contextPercent >= 80}>{contextPercent}%</span>
                  <Progress value={contextPercent} class="h-1 w-14" style={`--primary: var(--${contextPercent >= 80 ? 'chart-3' : 'chart-4'})`} aria-label="Context used" />
                </span>
              {:else}
                <span class="num dim">—</span>
              {/if}
            </Table.Cell>
            <Table.Cell class="numeric"><time datetime={new Date(thread.updatedAt * 1000).toISOString()} title={fullTime(thread.updatedAt) + ' · UTC'}>{relativeTime(thread.updatedAt, now)}</time></Table.Cell>
            <Table.Cell class="spark-col">
              {#if requests.length > 1}
                <div class="spark"><Sparkline values={requests} width={92} height={26} /></div>
              {:else}
                <span class="dim">—</span>
              {/if}
            </Table.Cell>
          </Table.Row>
          {#if expandedId === thread.id}
            <Table.Row class="detail-row">
              <Table.Cell colspan={9}>
                {#if thread.usage}
                  <div class="detail">
                    <div class="pane">
                      <h3>Session shape</h3>
                      {#if requests.length > 1}
                        <div class="big-spark"><Sparkline values={requests} width={260} height={54} /></div>
                        <p class="meta">Last request <b>{fmt(thread.usage.last?.totalTokens)}</b> tokens · {thread.usage.modelCalls} model {thread.usage.modelCalls === 1 ? 'call' : 'calls'} · {thread.usage.turns} {thread.usage.turns === 1 ? 'turn' : 'turns'}</p>
                      {:else}
                        <p class="meta">Only one recorded request in this session.</p>
                      {/if}
                      {#if contextPercent !== null}
                        <p class="meta">Latest context <b>{contextPercent}%</b> · {fmt(thread.usage.last?.totalTokens)} of {fmt(thread.usage.modelContextWindow)} window</p>
                        <Progress value={contextPercent} class="mt-2 h-1.5 max-w-[300px]" style="--primary: var(--chart-4)" aria-label="Context used" />
                      {/if}
                      <EfficiencyDetails efficiency={values.efficiency} />
                    </div>
                    <div class="pane">
                      <h3>Token mix</h3>
                      <MixBar cached={thread.usage.cachedInputTokens ?? 0} fresh={thread.usage.inputTokens - (thread.usage.cachedInputTokens ?? 0)} output={thread.usage.outputTokens} height={10} />
                      <p class="meta">{exact(thread.usage.totalTokens)} tokens total</p>
                      {#if values.models.length}
                        <ul class="models">
                          {#each values.models as [model, modelUsage] (model)}
                            <li>
                              <span class="model">{model}</span>
                              <span class="model-num" title={exact(modelUsage.totalTokens)}>{fmt(modelUsage.totalTokens)}</span>
                              <span class="model-sub">{modelUsage.modelCalls} calls · {percent(cacheRate(modelUsage))} cached</span>
                            </li>
                          {/each}
                        </ul>
                      {/if}
                    </div>
                    <div class="pane">
                      <h3>Session</h3>
                      <p class="path" title={thread.cwd}>{thread.cwd}</p>
                      <p class="meta">{thread.modelProvider}{thread.model ? ` · ${thread.model}` : ''}</p>
                      <div class="detail-actions">
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            {#snippet child({ props })}
                            <Button {...props} variant="outline" size="sm" onclick={() => void copyRef(thread.id)}>{#if copiedId === thread.id}<CheckIcon size={14} aria-hidden="true" />Copied{:else}<CopyIcon size={14} aria-hidden="true" />thread:{thread.id.slice(0, 8)}{/if}</Button>
                            {/snippet}
                          </Tooltip.Trigger>
                          <Tooltip.Content>Copy a reference the coach understands</Tooltip.Content>
                        </Tooltip.Root>
                        {#if values.efficiency.available && ['D', 'F'].includes(values.efficiency.grade)}
                          <Button variant="outline" size="sm" onclick={() => void askCoach('Explain this thread’s cost-per-token Usage Score relative to the same model, and separately its usage per call across models. Use recent input, caching and output. Suggest ways to reduce consumption.', thread.id)}>Review usage</Button>
                        {/if}
                      </div>
                    </div>
                  </div>
                {:else}
                  <p class="no-usage">{thread.usageError || 'No token usage recorded in this thread yet.'}</p>
                {/if}
              </Table.Cell>
            </Table.Row>
          {/if}
        {:else}
          <Table.Row><Table.Cell colspan={9} class="none">No saved threads in this view.</Table.Cell></Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
</Card.Root>
</section>

<style>
.thread-view {
  :global {


  th.numeric, td.numeric { text-align: right; }
  th.numeric .sort { justify-content: flex-end; width: 100%; }
  .arrow { display: inline-flex; opacity: 0; transition: opacity 0.15s; }
  .sort:hover .arrow, .arrow.on { opacity: 1; color: var(--primary); }

  tbody tr.main-row { cursor: pointer; }

  .chevron { display: inline-flex; color: var(--muted-foreground); font-size: 11px; transition: transform 0.15s; flex-shrink: 0; }
  .disclose[aria-expanded='true'] .chevron { transform: rotate(90deg); color: var(--primary); }
  .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--foreground); font-size: 13.5px; font-weight: 500; }
  .subagent-icon { display: inline-flex; flex-shrink: 0; color: var(--chart-4); }
  .proj { color: var(--muted-foreground); font: 400 12.5px var(--font-sans); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .num { font: 500 12.5px var(--font-mono); font-variant-numeric: tabular-nums; color: var(--foreground); }
  .num.dim, .dim, td time { color: var(--muted-foreground); }
  td time { font: 400 12px var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }

  td.numeric .mix { margin-top: 6px; width: 88px; margin-left: auto; background: var(--secondary); }

  .metric-stack { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  th.efficiency-col, td.efficiency-col { text-align: center; }
  th.efficiency-col .sort { width: 100%; justify-content: center; }
  .usage-grade { display: inline-flex; flex-direction: column; align-items: center; }
  .burn-multiplier { color: var(--muted-foreground); font: 400 10px var(--font-mono); }
  .grade { display: inline-grid; min-width: 28px; min-height: 28px; place-items: center; font: 700 16px var(--font-sans); line-height: 1; }
  .grade-a, .grade-b { color: var(--success); }
  .grade-c { color: var(--chart-3); }
  .grade-d, .grade-f { color: var(--destructive); }
  .num.hot { color: var(--chart-3); }

  .spark-col { width: 110px; }
  .spark { display: flex; justify-content: flex-end; }

  .detail-row td { background: var(--background); padding: 0; white-space: normal; }
  .detail { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 26px; padding: 20px 24px 24px; border-bottom: 1px solid var(--border); }
  .pane { min-width: 0; }
  .pane h3 { margin: 0 0 12px; color: var(--muted-foreground); font: 600 10.5px var(--font-sans); letter-spacing: 0.7px; text-transform: uppercase; }
  .meta { margin: 8px 0 0; color: var(--muted-foreground); font-size: 12px; }
  .meta b { color: var(--foreground); font: 600 12px var(--font-mono); }
  .models { display: flex; flex-direction: column; gap: 7px; margin: 12px 0 0; padding: 0; list-style: none; }
  .models li { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 8px; }
  .model { color: var(--foreground); font: 500 12px var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-num { color: var(--foreground); font: 600 12px var(--font-mono); font-variant-numeric: tabular-nums; }
  .model-sub { grid-column: 1 / -1; color: var(--muted-foreground); font-size: 11px; }
  .path { margin: 0; color: var(--muted-foreground); font: 400 11.5px var(--font-mono); overflow-wrap: anywhere; }
  .detail-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .no-usage { margin: 0; padding: 18px 24px 22px; color: var(--muted-foreground); font-size: 13px; }
  .none { padding: 28px 22px; color: var(--muted-foreground); text-align: center; }

  @media (max-width: 1440px) { th.spark-col, td.spark-col { display: none; } }
  @media (max-width: 1140px) { th:nth-child(7), td:nth-child(7) { display: none; } }
  @media (max-width: 920px) { th:nth-child(8), td:nth-child(8) { display: none; } }
  @media (max-width: 720px) { .detail { grid-template-columns: 1fr; gap: 18px; } }


  }
}
</style>
