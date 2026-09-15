<script lang="ts">
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
  import RobotIcon from 'phosphor-svelte/lib/RobotIcon';
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
  import type { Thread } from '$lib/types';
  import { cacheRate, threadApiCost, threadPressure } from '$lib/today';
  import { fmt, exact, money, percent, pressureLabel, pressureTone, project, relativeTime, fullTime } from '$lib/format';
  import { askCoach } from '$lib/coach.svelte';
  import MixBar from './MixBar.svelte';
  import Sparkline from './Sparkline.svelte';

  let { threads, now }: { threads: Thread[]; now: number } = $props();

  type SortKey = 'when' | 'tokens' | 'cache' | 'cost' | 'pressure' | 'project';
  let search = $state('');
  let sortKey = $state<SortKey>('when');
  let sortDesc = $state(true);
  let expandedId = $state<string | null>(null);
  let copiedId = $state('');

  const row = (thread: Thread) => ({
    tokens: thread.usage?.totalTokens ?? null,
    cache: cacheRate(thread.usage),
    cost: threadApiCost(thread),
    pressure: threadPressure(thread),
    models: Object.entries(thread.usage?.byModel || {}).filter(([, usage]) => usage.modelCalls > 0)
  });

  const matches = (thread: Thread, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return thread.title.toLowerCase().includes(q) || thread.cwd.toLowerCase().includes(q) || thread.id.toLowerCase().includes(q) || Object.keys(thread.usage?.byModel || {}).some(model => model.toLowerCase().includes(q));
  };

  const sorted = $derived.by(() => {
    const filtered = threads.filter(thread => matches(thread, search));
    const dir = sortDesc ? -1 : 1;
    return filtered.toSorted((a, b) => {
      const x = row(a), y = row(b);
      switch (sortKey) {
        case 'tokens': return ((x.tokens ?? -1) - (y.tokens ?? -1)) * dir;
        case 'cache': return ((x.cache ?? -1) - (y.cache ?? -1)) * dir;
        case 'cost': return ((x.cost ?? -1) - (y.cost ?? -1)) * dir;
        case 'pressure': return ((x.pressure ?? -1) - (y.pressure ?? -1)) * dir;
        case 'project': return project(a.cwd).localeCompare(project(b.cwd)) * dir;
        default: return (a.updatedAt - b.updatedAt) * dir;
      }
    });
  });

  const isOn = (key: SortKey) => sortKey === key;
  const ariaSort = (key: SortKey) => (sortKey === key ? (sortDesc ? 'descending' : 'ascending') : 'none');

  function sortBy(key: SortKey) {
    if (sortKey === key) sortDesc = !sortDesc;
    else { sortKey = key; sortDesc = key !== 'project'; }
  }

  function toggle(id: string) { expandedId = expandedId === id ? null : id; }

  async function copyRef(id: string) {
    await navigator.clipboard.writeText(`thread:${id.slice(0, 8)}`);
    copiedId = id;
    setTimeout(() => { if (copiedId === id) copiedId = ''; }, 1500);
  }
</script>

<section class="threads" aria-label="Saved threads">
  <header class="section-head">
    <div>
      <h2>Thread activity</h2>
      <p>{threads.length} saved {threads.length === 1 ? 'thread' : 'threads'}{search && sorted.length !== threads.length ? ` · ${sorted.length} matching` : ''}</p>
    </div>
    <label class="search">
      <MagnifyingGlassIcon size={14} aria-hidden="true" />
      <input type="search" placeholder="Search titles, projects, models, ids…" bind:value={search} aria-label="Search threads" />
    </label>
  </header>

  <div class="wrap">
    <table>
      <thead>
        <tr>
          <th class="session-col" scope="col">Session</th>
          <th scope="col" aria-sort={ariaSort('project')}>
            <button class="sort" onclick={() => sortBy('project')} title="Sort by project">Project<span class="arrow" class:on={isOn('project')} aria-hidden="true">{#if isOn('project') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></button>
          </th>
          <th scope="col" class="numeric" aria-sort={ariaSort('tokens')}>
            <button class="sort" onclick={() => sortBy('tokens')} title="Cumulative tokens for the whole session">Tokens<span class="arrow" class:on={isOn('tokens')} aria-hidden="true">{#if isOn('tokens') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></button>
          </th>
          <th scope="col" class="numeric" aria-sort={ariaSort('cache')}>
            <button class="sort" onclick={() => sortBy('cache')} title="Share of input served from cache — higher is cheaper">Cache<span class="arrow" class:on={isOn('cache')} aria-hidden="true">{#if isOn('cache') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></button>
          </th>
          <th scope="col" class="numeric" aria-sort={ariaSort('cost')}>
            <button class="sort" onclick={() => sortBy('cost')} title="API-equivalent estimate from OpenAI token prices; not your Codex subscription charge">≈ API<span class="arrow" class:on={isOn('cost')} aria-hidden="true">{#if isOn('cost') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></button>
          </th>
          <th scope="col" class="numeric" aria-sort={ariaSort('pressure')}>
            <button class="sort" onclick={() => sortBy('pressure')} title="0–100 efficiency score combining model price, cache reuse, context use, and request size. 60+ is high.">Pressure<span class="arrow" class:on={isOn('pressure')} aria-hidden="true">{#if isOn('pressure') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></button>
          </th>
          <th scope="col" class="numeric" title="Latest request as a share of the model context window">Context</th>
          <th scope="col" class="numeric" aria-sort={ariaSort('when')}>
            <button class="sort" onclick={() => sortBy('when')} title="Sort by last saved update">Updated<span class="arrow" class:on={isOn('when')} aria-hidden="true">{#if isOn('when') && !sortDesc}<CaretUpIcon size={10} weight="fill" />{:else}<CaretDownIcon size={10} weight="fill" />{/if}</span></button>
          </th>
          <th scope="col" class="spark-col" title="Tokens per request, oldest to newest">Requests</th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as thread (thread.id)}
          {@const values = row(thread)}
          {@const contextPercent = thread.usage?.last && thread.usage.modelContextWindow ? Math.min(100, Math.round(thread.usage.last.totalTokens / thread.usage.modelContextWindow * 100)) : null}
          {@const tone = values.pressure !== null ? pressureTone(values.pressure) : null}
          {@const requests = thread.usage?.recentRequests ?? []}
          <tr class="main-row" class:open={expandedId === thread.id} onclick={() => toggle(thread.id)}>
            <td class="session-col">
              <button class="disclose" aria-expanded={expandedId === thread.id} onclick={event => { event.stopPropagation(); toggle(thread.id); }}>
                <span class="chevron" aria-hidden="true"><CaretRightIcon size={12} weight="fill" /></span>
                <span class="title" title={thread.title}>{thread.title}</span>
                {#if thread.parentThreadId}
                  <span class="subagent-icon" title="Subagent"><RobotIcon size={16} aria-label="Subagent" /></span>
                {/if}
              </button>
              {#if values.models.length > 1}<span class="badge">{values.models.length} models</span>{/if}
            </td>
            <td class="proj" title={thread.cwd}>{project(thread.cwd)}</td>
            <td class="numeric">
              {#if thread.usage}
                <span class="num" title={exact(values.tokens)}>{fmt(values.tokens)}</span>
                <MixBar cached={thread.usage.cachedInputTokens ?? 0} fresh={thread.usage.inputTokens - (thread.usage.cachedInputTokens ?? 0)} output={thread.usage.outputTokens} height={4} />
              {:else}
                <span class="num dim">—</span>
              {/if}
            </td>
            <td class="numeric"><span class="num" class:dim={values.cache === null}>{percent(values.cache)}</span></td>
            <td class="numeric"><span class="num" class:dim={values.cost === null}>{money(values.cost)}</span></td>
            <td class="numeric">
              {#if values.pressure !== null}
                <span class="pressure">
                  <span class="num tone-{tone}">{values.pressure}</span>
                  <span class="meter" aria-hidden="true"><span class="meter-fill tone-bg-{tone}" style:width="{values.pressure}%"></span></span>
                </span>
              {:else}
                <span class="num dim">—</span>
              {/if}
            </td>
            <td class="numeric">
              {#if contextPercent !== null}
                <span class="pressure">
                  <span class="num" class:hot={contextPercent >= 80}>{contextPercent}%</span>
                  <span class="meter" aria-hidden="true"><span class="meter-fill context" class:hot={contextPercent >= 80} style:width="{contextPercent}%"></span></span>
                </span>
              {:else}
                <span class="num dim">—</span>
              {/if}
            </td>
            <td class="numeric"><time datetime={new Date(thread.updatedAt * 1000).toISOString()} title={fullTime(thread.updatedAt) + ' · UTC'}>{relativeTime(thread.updatedAt, now)}</time></td>
            <td class="spark-col">
              {#if requests.length > 1}
                <div class="spark"><Sparkline values={requests} width={92} height={26} color={tone ? `var(--${tone})` : 'var(--ink-faint)'} /></div>
              {:else}
                <span class="dim">—</span>
              {/if}
            </td>
          </tr>
          {#if expandedId === thread.id}
            <tr class="detail-row">
              <td colspan="9">
                {#if thread.usage}
                  <div class="detail">
                    <div class="pane">
                      <h3>Session shape</h3>
                      {#if requests.length > 1}
                        <div class="big-spark"><Sparkline values={requests} width={260} height={54} color={tone ? `var(--${tone})` : 'var(--brand)'} /></div>
                        <p class="meta">Last request <b>{fmt(thread.usage.last?.totalTokens)}</b> tokens · {thread.usage.modelCalls} model {thread.usage.modelCalls === 1 ? 'call' : 'calls'} · {thread.usage.turns} {thread.usage.turns === 1 ? 'turn' : 'turns'}</p>
                      {:else}
                        <p class="meta">Only one recorded request in this session.</p>
                      {/if}
                      {#if contextPercent !== null}
                        <p class="meta">Latest context <b>{contextPercent}%</b> · {fmt(thread.usage.last?.totalTokens)} of {fmt(thread.usage.modelContextWindow)} window</p>
                        <div class="ctx"><span style:width="{contextPercent}%"></span></div>
                      {/if}
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
                        <button class="ghost" onclick={() => void copyRef(thread.id)} title="Copy a reference the coach understands">{#if copiedId === thread.id}<CheckIcon size={14} aria-hidden="true" />Copied{:else}<CopyIcon size={14} aria-hidden="true" />thread:{thread.id.slice(0, 8)}{/if}</button>
                        {#if (values.pressure ?? 0) >= 60}
                          <button class="danger" onclick={() => void askCoach(`Why is “${thread.title}” above 60 pressure? Inspect its transcript and give me specific changes.`, thread.id)}>Ask the coach why</button>
                        {/if}
                      </div>
                    </div>
                  </div>
                {:else}
                  <p class="no-usage">{thread.usageError || 'No token usage recorded in this thread yet.'}</p>
                {/if}
              </td>
            </tr>
          {/if}
        {:else}
          <tr><td colspan="9" class="none">{search ? `No threads match “${search}”.` : 'No saved threads in this view.'}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .threads {
    border: 1px solid var(--line); border-radius: var(--radius-card);
    background: var(--bg1); box-shadow: var(--lift); overflow: hidden;
  }
  .section-head { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding: 20px 22px 16px; flex-wrap: wrap; }
  h2 { margin: 0; font: 600 17px/1.3 var(--font-display); letter-spacing: -0.2px; }
  .section-head p { margin: 2px 0 0; color: var(--ink-faint); font-size: 12px; }
  .search { position: relative; display: block; }
  .search :global(svg) { position: absolute; left: 11px; top: 50%; width: 14px; height: 14px; transform: translateY(-50%); color: var(--ink-faint); pointer-events: none; }
  .search input {
    width: 300px; max-width: 68vw; padding: 9px 12px 9px 32px;
    border: 1px solid var(--line); border-radius: var(--radius-control);
    background: var(--bg0); color: var(--ink); font-size: 13px;
  }
  .search input::placeholder { color: var(--ink-faint); }
  .search input:focus { border-color: rgba(180, 245, 60, 0.5); outline: none; }

  .wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; min-width: 900px; }
  thead th {
    padding: 9px 12px; border-block: 1px solid var(--line); background: var(--bg2);
    color: var(--ink-faint); font: 600 10.5px/1 var(--font-ui); letter-spacing: 0.7px; text-transform: uppercase; text-align: left; white-space: nowrap;
  }
  th.numeric, td.numeric { text-align: right; }
  th.numeric .sort { justify-content: flex-end; width: 100%; }
  .sort { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; border: 0; background: none; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; }
  .sort:hover { color: var(--ink); }
  .arrow { display: inline-flex; opacity: 0; transition: opacity 0.15s; }
  .sort:hover .arrow, .arrow.on { opacity: 1; color: var(--brand); }

  tbody tr.main-row { cursor: pointer; }
  tbody tr.main-row:hover { background: var(--bg2); }
  tbody tr.main-row.open { background: var(--bg2); }
  tbody td { padding: 11px 12px; border-bottom: 1px solid var(--line-soft); vertical-align: middle; min-width: 0; }

  .disclose { display: flex; align-items: center; gap: 7px; max-width: 360px; padding: 0; border: 0; background: none; text-align: left; }
  .chevron { display: inline-flex; color: var(--ink-faint); font-size: 11px; transition: transform 0.15s; flex-shrink: 0; }
  .disclose[aria-expanded='true'] .chevron { transform: rotate(90deg); color: var(--brand); }
  .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 13.5px; font-weight: 500; }
  .badge {
    display: inline-block; margin: 4px 0 0 18px; padding: 1px 8px; border-radius: 99px;
    background: var(--bg3); color: var(--ink-dim); font: 600 10px var(--font-data);
  }
  .subagent-icon { display: inline-flex; flex-shrink: 0; color: #b6b3fa; }
  .proj { color: var(--ink-dim); font: 400 12.5px var(--font-ui); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .num { font: 500 12.5px var(--font-data); font-variant-numeric: tabular-nums; color: var(--ink); }
  .num.dim, .dim, td time { color: var(--ink-faint); }
  td time { font: 400 12px var(--font-data); font-variant-numeric: tabular-nums; white-space: nowrap; }

  td.numeric :global(.mix) { margin-top: 6px; width: 88px; margin-left: auto; background: var(--bg3); }

  .pressure { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .meter { width: 56px; height: 3px; border-radius: 99px; background: var(--bg3); overflow: hidden; }
  .meter-fill { display: block; height: 100%; border-radius: 99px; }
  .tone-good { color: var(--good); }
  .tone-warn { color: var(--warn); }
  .tone-bad { color: var(--bad); }
  .tone-bg-good { background: var(--good); }
  .tone-bg-warn { background: var(--warn); }
  .tone-bg-bad { background: var(--bad); }
  .num.hot { color: var(--warn); }
  .meter-fill.context { background: var(--fresh); }
  .meter-fill.context.hot { background: var(--warn); }

  .spark-col { width: 110px; }
  .spark { display: flex; justify-content: flex-end; }
  .spark :global(svg) { display: block; width: 92px; height: 26px; }

  .detail-row td { background: var(--bg0); padding: 0; }
  .detail { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 26px; padding: 20px 24px 24px; border-bottom: 1px solid var(--line); }
  .pane { min-width: 0; }
  .pane h3 { margin: 0 0 12px; color: var(--ink-faint); font: 600 10.5px var(--font-ui); letter-spacing: 0.7px; text-transform: uppercase; }
  .big-spark :global(svg) { display: block; width: 100%; max-width: 300px; height: 54px; }
  .meta { margin: 8px 0 0; color: var(--ink-dim); font-size: 12px; }
  .meta b { color: var(--ink); font: 600 12px var(--font-data); }
  .ctx { margin-top: 8px; height: 6px; max-width: 300px; border-radius: 99px; background: var(--bg3); overflow: hidden; }
  .ctx span { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--fresh), #b6b3fa); }
  .models { display: flex; flex-direction: column; gap: 7px; margin: 12px 0 0; padding: 0; list-style: none; }
  .models li { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 7px 10px; border: 1px solid var(--line-soft); border-radius: 8px; }
  .model { color: var(--ink); font: 500 12px var(--font-data); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-num { color: var(--ink); font: 600 12px var(--font-data); font-variant-numeric: tabular-nums; }
  .model-sub { grid-column: 1 / -1; color: var(--ink-faint); font-size: 11px; }
  .path { margin: 0; color: var(--ink-dim); font: 400 11.5px var(--font-data); overflow-wrap: anywhere; }
  .detail-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .ghost { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 1px dashed var(--line); border-radius: var(--radius-control); background: none; color: var(--ink-dim); font: 500 11.5px var(--font-data); }
  .ghost:hover { color: var(--ink); border-color: var(--ink-faint); }
  .danger { padding: 7px 12px; border: 1px solid rgba(244, 118, 94, 0.4); border-radius: var(--radius-control); background: var(--danger-bg); color: var(--bad); font-size: 12px; }
  .danger:hover { background: rgba(244, 118, 94, 0.16); }
  .no-usage { margin: 0; padding: 18px 24px 22px; color: var(--ink-faint); font-size: 13px; }
  .none { padding: 28px 22px; color: var(--ink-faint); text-align: center; }

  @media (max-width: 1440px) { th.spark-col, td.spark-col { display: none; } }
  @media (max-width: 1140px) { th:nth-child(7), td:nth-child(7) { display: none; } }
  @media (max-width: 920px) { th:nth-child(8), td:nth-child(8) { display: none; } }
  @media (max-width: 720px) { .detail { grid-template-columns: 1fr; gap: 18px; } }
</style>
