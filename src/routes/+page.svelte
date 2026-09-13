<script lang="ts">
  import { onMount } from 'svelte';
  import { sumThreadUsage, todayThreads } from '$lib/today';
  import type { Snapshot } from '$lib/types';

  let data = $state<Snapshot | null>(null);
  let error = $state('');
  let selectedProject = $state('');
  let refreshing = $state(false);
  let now = $state(Date.now());
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (n: number | null | undefined) => n == null ? '—' : compact.format(n);
  const exact = (n: number | null | undefined) => n == null ? 'Not recorded' : n.toLocaleString();
  const project = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).at(-1) || cwd;
  const dateTime = (seconds: number) => new Date(seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  let today = $derived(todayThreads(data?.threads || [], now));
  let daily = $derived(sumThreadUsage(today));
  let projects = $derived([...new Set((data?.threads || []).map(thread => thread.cwd))].sort((a, b) => project(a).localeCompare(project(b))));
  let threads = $derived((data?.threads || []).filter(thread => !selectedProject || thread.cwd === selectedProject).toSorted((a, b) => b.updatedAt - a.updatedAt));

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    now = Date.now();
    try {
      const response = await fetch('/api/dashboard', { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`Could not read saved threads (${response.status}).`);
      data = await response.json();
      error = '';
      now = Date.now();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not reach the local server.';
    } finally {
      refreshing = false;
    }
  }

  onMount(() => {
    void refresh();
    const clock = setInterval(() => { now = Date.now(); }, 60000);
    return () => clearInterval(clock);
  });
</script>

<svelte:head>
  <title>Threads · MyLimits</title>
  <meta name="description" content="Compare saved Codex thread usage, context pressure, and token composition." />
</svelte:head>

<main>
  <header class="masthead">
    <a href="/" class="wordmark">my<span>limits</span></a>
    <span class="product-label">CODEX / SAVED USAGE</span>
  </header>

  {#if error || data?.error}
    <div class="error" role="alert">
      <strong>Saved threads could not be refreshed.</strong>
      <p>{error || data?.error}</p>
      <p>Check that Codex is installed and its local data is readable, then refresh. Previous results may be out of date.</p>
    </div>
  {/if}

  <div class="toolbar">
    <nav class="project-filters" aria-label="Filter threads by project">
      <button class="pill" class:active={!selectedProject} aria-pressed={!selectedProject} onclick={() => selectedProject = ''}>All</button>
      {#each projects as cwd}
        <button class="pill" class:active={selectedProject === cwd} aria-pressed={selectedProject === cwd} title={cwd} onclick={() => selectedProject = cwd}>{project(cwd)}</button>
      {/each}
    </nav>
    <span class="thread-count">{data ? threads.length : '—'} threads</span>
    <button class="refresh" onclick={refresh} disabled={refreshing}><span aria-hidden="true">↻</span>{refreshing ? 'Reading…' : 'Refresh'}</button>
  </div>

  {#if data}
    <section class="daily-card" aria-labelledby="daily-title">
      <div class="daily-total">
        <span id="daily-title">Today’s saved usage</span>
        <strong title={exact(daily.total)}>{fmt(daily.total)}</strong>
        <small>tokens across {today.length} threads · {daily.calls} calls</small>
      </div>
      <figure>
        <figcaption>Daily token mix <span>{fmt(daily.total)} total</span></figcaption>
        <div class="mix-track" role="img" aria-label={`${exact(daily.cached)} cached input, ${exact(daily.input)} new input, ${exact(daily.output)} output tokens`}>
          <span class="cached" style:flex={daily.cached}></span>
          <span class="input" style:flex={daily.input}></span>
          <span class="output" style:flex={daily.output}></span>
        </div>
        <div class="mix-key"><span><i class="cached"></i>Cached</span><span><i class="input"></i>New input</span><span><i class="output"></i>Output</span></div>
      </figure>
    </section>
  {/if}

  {#if !data && !error}
    <p class="empty" role="status">Reading saved Codex threads…</p>
  {:else if data && !threads.length}
    <div class="empty" role="status">
      <h2>{selectedProject ? 'No threads in this project' : 'No saved threads'}</h2>
      {#if selectedProject}<button onclick={() => selectedProject = ''}>View all projects</button>{/if}
    </div>
  {:else}
    <ul class="thread-list" aria-label="Saved threads">
      {#each threads as thread (thread.id)}
        {@const usage = thread.usage}
        {@const contextPercent = usage?.last && usage.modelContextWindow ? Math.min(100, Math.round(usage.last.totalTokens / usage.modelContextWindow * 100)) : null}
        <li class="thread-card" class:subagent-card={Boolean(thread.parentThreadId)}>
          <article aria-labelledby={'title-' + thread.id}>
            <h2 id={'title-' + thread.id}>{thread.title}</h2>
            <div class="card-meta">
              <span class="project" title={thread.cwd}>{project(thread.cwd)}</span>
              <span>{thread.model || thread.modelProvider}</span>
              {#if thread.parentThreadId}<span class="subagent-badge">↳ Subagent</span>{/if}
              <time datetime={new Date(thread.updatedAt * 1000).toISOString()} title="Last saved update · UTC">{dateTime(thread.updatedAt)}</time>
            </div>
            {#if usage}
              {@const peak = Math.max(1, ...usage.recentRequests)}
              {@const points = usage.recentRequests.map((value, index) => `${4 + index / Math.max(1, usage.recentRequests.length - 1) * 232},${48 - value / peak * 40}`).join(' ')}
              {@const mixTotal = usage.inputTokens + usage.outputTokens}
              <div class="card-bottom">
              {#if usage.recentRequests.length > 1}
                <figure class="request-chart">
                  <figcaption>Recent requests <span>{fmt(usage.recentRequests.at(-1))} tokens</span></figcaption>
                  <svg viewBox="0 0 240 52" preserveAspectRatio="none" role="img" aria-label={`Tokens per request, oldest to newest: ${usage.recentRequests.map(exact).join(', ')}`}>
                    <path class="chart-guide" d="M4 28H236 M4 48H236" />
                    <polygon class="chart-fill" points={`4,48 ${points} 236,48`} />
                    <polyline class="chart-line" {points} />
                    <circle cx="236" cy={48 - usage.recentRequests[usage.recentRequests.length - 1] / peak * 40} r="3" />
                  </svg>
                </figure>
              {/if}
              {#if mixTotal > 0}
                <figure class="mix-chart">
                  <figcaption>Token mix <span title={exact(usage.totalTokens)}>{fmt(usage.totalTokens)} total</span></figcaption>
                  <div class="mix-track" role="img" aria-label={`${exact(usage.cachedInputTokens)} cached input, ${exact(usage.inputTokens - (usage.cachedInputTokens ?? 0))} other input, ${exact(usage.outputTokens)} output tokens`}>
                    <span class="cached" style:flex={usage.cachedInputTokens ?? 0}></span>
                    <span class="input" style:flex={usage.inputTokens - (usage.cachedInputTokens ?? 0)}></span>
                    <span class="output" style:flex={usage.outputTokens}></span>
                  </div>
                  <div class="mix-key">
                    {#if usage.cachedInputTokens !== null}<span><i class="cached"></i>Cached</span>{/if}
                    <span><i class="input"></i>{usage.cachedInputTokens === null ? 'Input' : 'New input'}</span><span><i class="output"></i>Output</span>
                  </div>
                </figure>
              {/if}
              {#if contextPercent !== null}
                <figure class="context-chart">
                  <figcaption>Latest context <span>{contextPercent}%</span></figcaption>
                  <div class="context-gauge" role="meter" aria-label="Latest context used" aria-valuemin="0" aria-valuemax="100" aria-valuenow={contextPercent}>
                    <span style:width={`${contextPercent}%`}></span>
                  </div>
                  <div class="gauge-scale"><span>{fmt(usage.last?.totalTokens)} used</span><span>{fmt(usage.modelContextWindow)} capacity</span></div>
                </figure>
              {/if}
              </div>
            {:else}
              <p class="unavailable">{thread.usageError || 'No token usage recorded in this thread yet.'}</p>
            {/if}
          </article>
        </li>
      {/each}
    </ul>
  {/if}

  <footer><span>{threads.length} shown{data?.hasMore ? ' · Newest 100 saved threads' : ''}</span><span>{data?.updatedAt ? 'Read at ' + new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Saved history only'}</span></footer>
</main>

<style>
  :global(:root) { --paper: #eef2f8; --surface: #fff; --ink: #202944; --muted: #5b6780; --line: #ccd4e0; --indigo: #514bc2; --cyan: #007f90; }
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: var(--paper); color: var(--ink); font: 14px/1.5 'Segoe UI', system-ui, sans-serif; }
  :global(button) { min-height: 44px; border: 1px solid var(--line); border-radius: 7px; padding: 10px 13px; background: var(--surface); color: inherit; font: inherit; cursor: pointer; }
  :global(:focus-visible) { outline: 3px solid var(--indigo); outline-offset: 3px; }
  :global(button:disabled) { opacity: .65; cursor: wait; }
  main { max-width: 1380px; margin: auto; padding: 0 34px 34px; }
  .masthead { height: 82px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); }
  .wordmark { text-decoration: none; color: var(--ink); font: 700 21px 'Trebuchet MS', 'Avenir Next', sans-serif; letter-spacing: -1px; }
  .wordmark span { font-weight: 400; }
  .product-label, .card-meta, footer { font: 11px/1.5 ui-monospace, 'Cascadia Code', 'SFMono-Regular', Consolas, monospace; }
  .product-label { color: var(--muted); letter-spacing: 1px; }
  .refresh { display: flex; align-items: center; gap: 8px; }
  .refresh span { font-size: 20px; line-height: 1; }
  .toolbar { display: flex; gap: 16px; align-items: center; margin: 22px 0; }
  .project-filters { display: flex; flex: 1; gap: 8px; overflow-x: auto; scrollbar-width: thin; }
  .pill { min-height: 36px; padding: 7px 14px; border-radius: 999px; color: var(--muted); white-space: nowrap; }
  .pill.active { border-color: var(--indigo); background: var(--indigo); color: white; }
  .thread-count { margin-left: auto; align-self: center; color: var(--muted); font: 11px ui-monospace, monospace; white-space: nowrap; }
  .thread-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 0; margin: 0; list-style: none; }
  .daily-card { display: grid; grid-template-columns: minmax(220px, .65fr) minmax(280px, 1.35fr); align-items: center; gap: 40px; margin-bottom: 16px; padding: 22px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .daily-total { display: flex; flex-direction: column; }
  .daily-total > span { color: var(--muted); font-size: 12px; }
  .daily-total strong { margin: 3px 0; font: 650 34px/1.1 ui-monospace, Consolas, monospace; letter-spacing: -1.5px; }
  .daily-total small { color: var(--muted); }
  .thread-card { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); overflow: hidden; }
  .subagent-card { border-color: #aaa3e8; background: #fbfaff; box-shadow: inset 4px 0 var(--indigo); }
  article { padding: 24px; }
  h2 { margin: 0; font-size: 20px; font-weight: 650; line-height: 1.4; letter-spacing: -.3px; overflow-wrap: anywhere; }
  .card-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; margin-top: 8px; color: var(--muted); font: 12px/1.5 'Segoe UI', system-ui, sans-serif; }
  .project { color: var(--indigo); overflow-wrap: anywhere; }
  .subagent-badge { padding: 1px 7px; border-radius: 999px; background: #e9e7ff; color: #443da8; font-weight: 650; }
  .card-bottom { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); align-items: start; gap: 24px 36px; margin-top: 24px; }
  figure { margin: 0; min-width: 0; }
  figcaption { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 11px; }
  figcaption span { font-variant-numeric: tabular-nums; }
  .request-chart svg { display: block; width: 100%; height: 58px; overflow: visible; margin-top: 7px; }
  .chart-guide { fill: none; stroke: var(--line); stroke-opacity: .35; stroke-dasharray: 2 5; }
  .chart-fill { fill: var(--cyan); fill-opacity: .08; }
  .chart-line { fill: none; stroke: var(--cyan); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .request-chart circle { fill: var(--cyan); stroke: var(--surface); stroke-width: 1.5; }
  .mix-track { display: flex; height: 24px; gap: 2px; overflow: hidden; border-radius: 4px; margin: 17px 0 10px; }
  .context-gauge { height: 24px; background: var(--paper); border-radius: 4px; overflow: hidden; margin: 17px 0 10px; }
  .context-gauge span { display: block; height: 100%; background: repeating-linear-gradient(90deg, var(--indigo) 0 5px, transparent 5px 8px); }
  .gauge-scale { display: flex; justify-content: space-between; color: var(--muted); font-size: 10px; }
  .cached { background: var(--cyan); }
  .input { background: var(--indigo); }
  .output { background: var(--ink); }
  .mix-key { display: flex; gap: 12px; color: var(--muted); font-size: 10px; }
  .mix-key span { display: flex; align-items: center; gap: 4px; }
  .mix-key i { width: 5px; height: 5px; border-radius: 50%; }
  .unavailable { margin: 20px 0 0; font-size: 13px; color: var(--muted); }
  .error { padding: 16px 20px; border: 1px solid var(--indigo); border-radius: 8px; margin-bottom: 24px; background: var(--surface); }
  .error p { margin: 6px 0; overflow-wrap: anywhere; }
  .empty { padding: 40px 0; color: var(--muted); }
  .empty h2 { margin-bottom: 16px; }
  footer { display: flex; justify-content: space-between; gap: 16px; color: var(--muted); padding-top: 22px; }
  @media (max-width: 700px) {
    main { padding: 0 20px 24px; }
    article { padding: 20px; }
    .card-bottom { grid-template-columns: 1fr; gap: 20px; }
    .daily-card { grid-template-columns: 1fr; gap: 20px; }
  }
  @media (max-width: 420px) {
    main { padding: 0 14px 20px; }
    .masthead { height: 64px; }
    .product-label { font-size: 9px; letter-spacing: 0; }
    .refresh { font-size: 12px; padding: 9px; }
    .toolbar { gap: 10px; }
    .thread-count { display: none; }
    .project-filters { min-width: 0; }
    article { padding: 18px; }
    footer { font-size: 10px; }
  }
</style>
