<script lang="ts">
  import { onMount } from 'svelte';
  import { activeProjects, efficiencyPressure, estimatedApiCost, sumThreadUsage, threadApiCost, threadPressure, todayThreads, workflowPressure } from '$lib/today';
  import type { Snapshot } from '$lib/types';

  let data = $state<Snapshot | null>(null);
  let error = $state('');
  let selectedProject = $state('');
  let projectOrder = $state<string[]>([]);
  let refreshing = $state(false);
  let asking = $state(false);
  let question = $state('');
  let copiedId = $state('');
  let modelFilters = $state<Record<string, string>>({});
  let messages = $state([{ role: 'assistant', text: 'Ask me where your tokens went or how to make your Codex sessions lighter.' }]);
  let now = $state(Date.now());
  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (n: number | null | undefined) => n == null ? '—' : compact.format(n);
  const exact = (n: number | null | undefined) => n == null ? 'Not recorded' : n.toLocaleString();
  const project = (cwd: string) => cwd.split(/[\\/]/).filter(Boolean).at(-1) || cwd;
  const dateTime = (seconds: number) => new Date(seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  let today = $derived(todayThreads(data?.threads || [], now));
  let daily = $derived(sumThreadUsage(today));
  let dailyPressure = $derived(workflowPressure(today));
  let projects = $derived(projectOrder.filter(cwd => data?.threads.some(thread => thread.cwd === cwd)));
  let threads = $derived((data?.threads || []).filter(thread => !selectedProject || thread.cwd === selectedProject).toSorted((a, b) => b.updatedAt - a.updatedAt));

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    now = Date.now();
    try {
      const response = await fetch('/api/dashboard', { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`Could not read saved threads (${response.status}).`);
      const snapshot: Snapshot = await response.json();
      const latestProjects = activeProjects(snapshot.threads);
      projectOrder = [...projectOrder, ...latestProjects.filter(cwd => !projectOrder.includes(cwd))];
      data = snapshot;
      error = '';
      now = Date.now();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not reach the local server.';
    } finally {
      refreshing = false;
    }
  }

  async function ask(text = question, threadId?: string) {
    text = text.trim();
    if (!text || asking) return;
    messages = [...messages, { role: 'user', text }];
    question = '';
    asking = true;
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, threadId }), signal: AbortSignal.timeout(130000) });
      const result = await response.json();
      messages = [...messages, { role: 'assistant', text: response.ok ? result.answer : result.error }];
    } catch (e) {
      messages = [...messages, { role: 'assistant', text: e instanceof Error ? e.message : 'The assistant could not answer.' }];
    } finally { asking = false; }
  }

  function submit(event: SubmitEvent) { event.preventDefault(); void ask(); }
  async function copyThreadId(id: string) {
    await navigator.clipboard.writeText(`thread:${id.slice(0, 8)}`);
    copiedId = id;
    setTimeout(() => { if (copiedId === id) copiedId = ''; }, 1500);
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
  <div class="workspace">
  <aside class="coach" aria-labelledby="coach-title">
    <div class="coach-heading">
      <div><span>LIMIT COACH</span><h1 id="coach-title">Where did your limits go?</h1></div>
      <div class="suggestions" aria-label="Suggested questions">
        <button onclick={() => void ask('What consumed the most tokens today?')} disabled={asking || !data}>Biggest spend</button>
        <button onclick={() => void ask('What usage patterns should I change?')} disabled={asking || !data}>Find patterns</button>
        <button onclick={() => void ask('How can I save tokens tomorrow?')} disabled={asking || !data}>Save tomorrow</button>
      </div>
    </div>
    <div class="conversation" aria-live="polite">
      {#each messages as message}<p class={message.role}>{message.text}</p>{/each}
      {#if asking}<p class="assistant thinking">Reading your usage…</p>{/if}
    </div>
    <form class="ask" onsubmit={submit}>
      <textarea bind:value={question} maxlength="500" rows="2" placeholder="Ask about today’s usage, expensive threads, or better habits" aria-label="Ask your limit coach"></textarea>
      <button disabled={asking || !data || !question.trim()}>{asking ? 'Thinking…' : 'Ask'}</button>
    </form>
  </aside>

  <section class="dashboard" aria-label="Usage dashboard">

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
    <section class="daily-card" aria-label="Today’s saved usage">
      <div class="mix-track" role="img" aria-label={`${exact(daily.cached)} cached input, ${exact(daily.input)} new input, ${exact(daily.output)} output tokens`}>
        <span class="cached" style:flex={daily.cached}></span>
        <span class="input" style:flex={daily.input}></span>
        <span class="output" style:flex={daily.output}></span>
      </div>
      <div class="daily-footer">
        <div class="mix-key"><span><i class="cached"></i>Cached</span><span><i class="input"></i>New input</span><span><i class="output"></i>Output</span></div>
        {#if dailyPressure !== null}<span class:pressure-high={dailyPressure >= 60} class="pressure" title="Cost-weighted average. 60+ suggests expensive-model usage, low cache reuse, or high context pressure.">Workflow pressure <b>{dailyPressure}</b>/100</span>{/if}
        <span>{today.length} threads · {daily.calls} calls</span>
        <strong title={exact(daily.total)}>{fmt(daily.total)} <small>tokens</small></strong>
      </div>
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
        {@const models = Object.entries(thread.usage?.byModel || {}).filter(([, usage]) => usage.modelCalls > 0).map(([model]) => model)}
        {@const selectedModel = modelFilters[thread.id] || ''}
        {@const usage = selectedModel ? thread.usage?.byModel[selectedModel] || null : thread.usage}
        {@const pressure = selectedModel && usage ? efficiencyPressure(usage, selectedModel) : threadPressure(thread)}
        {@const apiCost = selectedModel && usage ? estimatedApiCost(usage, selectedModel) : threadApiCost(thread)}
        {@const contextPercent = usage?.last && usage.modelContextWindow ? Math.min(100, Math.round(usage.last.totalTokens / usage.modelContextWindow * 100)) : null}
        <li class="thread-card" class:subagent-card={Boolean(thread.parentThreadId)}>
          <article aria-labelledby={'title-' + thread.id}>
            <h2 id={'title-' + thread.id}>{thread.title}</h2>
            <div class="card-meta">
              <span class="project" title={thread.cwd}>{project(thread.cwd)}</span>
              <span>{models.length} {models.length === 1 ? 'model' : 'models'}</span>
              <button type="button" class="thread-id" title="Copy reference for the coach" onclick={() => void copyThreadId(thread.id)}>{copiedId === thread.id ? 'Copied' : `thread:${thread.id.slice(0, 8)}`}</button>
              {#if thread.parentThreadId}<span class="subagent-badge">↳ Subagent</span>{/if}
              {#if pressure !== null}<span class:pressure-high={pressure >= 60} class="pressure" title="60+ is inefficient. Combines model price, cache reuse, latest context, and recent request size.">Pressure {pressure}/100{pressure >= 60 ? ' · High' : ''}</span>{/if}
              {#if pressure !== null && pressure >= 60}<button type="button" class="why" disabled={asking} onclick={() => void ask(`Why is “${thread.title}” above 60 pressure? Inspect its transcript and give me specific changes.`, thread.id)}>Ask why</button>{/if}
              {#if apiCost !== null}<span title="API-equivalent estimate from OpenAI token prices; this is not your Codex subscription charge">≈ ${apiCost.toFixed(apiCost < 1 ? 3 : 2)} API</span>{/if}
              <time datetime={new Date(thread.updatedAt * 1000).toISOString()} title="Last saved update · UTC">{dateTime(thread.updatedAt)}</time>
            </div>
            {#if models.length}
              <nav class="model-filters" aria-label={`Filter ${thread.title} by model`}>
                <button class:active={!selectedModel} aria-pressed={!selectedModel} onclick={() => modelFilters[thread.id] = ''}>All models</button>
                {#each models as model}
                  <button class:active={selectedModel === model} aria-pressed={selectedModel === model} onclick={() => modelFilters[thread.id] = model}>{model}</button>
                {/each}
              </nav>
            {/if}
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
  </section>
  </div>
</main>

<style>
  :global(:root) { --paper: #eef2f8; --surface: #fff; --ink: #202944; --muted: #5b6780; --line: #ccd4e0; --indigo: #514bc2; --cyan: #007f90; }
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: var(--paper); color: var(--ink); font: 14px/1.5 'Segoe UI', system-ui, sans-serif; }
  :global(button) { min-height: 44px; border: 1px solid var(--line); border-radius: 7px; padding: 10px 13px; background: var(--surface); color: inherit; font: inherit; cursor: pointer; }
  :global(:focus-visible) { outline: 3px solid var(--indigo); outline-offset: 3px; }
  :global(button:disabled) { opacity: .65; cursor: wait; }
  :global(textarea) { resize: none; border: 1px solid var(--line); border-radius: 9px; padding: 12px 14px; background: var(--surface); color: var(--ink); font: inherit; }
  main { max-width: 1540px; margin: auto; padding: 1px 34px 34px; }
  .card-meta, footer { font: 11px/1.5 ui-monospace, 'Cascadia Code', 'SFMono-Regular', Consolas, monospace; }
  .workspace { display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); gap: 22px; align-items: start; margin-top: 22px; }
  .dashboard { min-width: 0; }
  .coach { position: sticky; top: 22px; height: calc(100vh - 44px); min-height: 560px; display: flex; flex-direction: column; gap: 16px; padding: 24px; border: 1px solid #aaa3e8; border-radius: 14px; background: linear-gradient(135deg, #fff 55%, #f7f6ff); box-shadow: inset 4px 0 var(--indigo); }
  .coach-heading { display: flex; flex-direction: column; align-items: start; gap: 18px; }
  .coach-heading span { color: var(--indigo); font: 700 10px ui-monospace, monospace; letter-spacing: 1px; }
  h1 { margin: 2px 0 0; font: 650 27px/1.25 'Trebuchet MS', 'Avenir Next', sans-serif; letter-spacing: -.8px; }
  .suggestions { display: flex; flex-wrap: wrap; gap: 7px; }
  .suggestions button { min-height: 34px; padding: 6px 11px; border-radius: 999px; color: var(--indigo); font-size: 11px; }
  .conversation { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 9px; padding: 4px 0; }
  .conversation p { max-width: 90%; margin: 0; padding: 10px 13px; border-radius: 10px; white-space: pre-wrap; }
  .conversation .assistant { align-self: flex-start; background: #eeecff; }
  .conversation .user { align-self: flex-end; background: var(--ink); color: white; }
  .thinking { color: var(--muted); }
  .ask { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
  .ask button { min-width: 78px; background: var(--indigo); color: white; }
  .refresh { display: flex; align-items: center; gap: 8px; }
  .refresh span { font-size: 20px; line-height: 1; }
  .toolbar { display: flex; gap: 16px; align-items: center; margin: 0 0 22px; }
  .project-filters { display: flex; flex: 1; gap: 8px; padding: 6px 2px; overflow-x: auto; scrollbar-width: none; }
  .project-filters::-webkit-scrollbar { display: none; }
  .pill { min-height: 36px; padding: 7px 14px; border-radius: 999px; color: var(--muted); white-space: nowrap; }
  .pill.active { border-color: var(--indigo); background: var(--indigo); color: white; }
  .thread-count { margin-left: auto; align-self: center; color: var(--muted); font: 11px ui-monospace, monospace; white-space: nowrap; }
  .thread-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 0; margin: 0; list-style: none; }
  .daily-card { margin-bottom: 16px; padding: 20px 22px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .daily-card > .mix-track { margin: 0 0 12px; }
  .daily-footer { display: flex; align-items: end; gap: 24px; color: var(--muted); font-size: 11px; }
  .daily-footer > span { margin-left: auto; }
  .daily-footer strong { color: var(--ink); font: 650 24px/1 ui-monospace, Consolas, monospace; letter-spacing: -1px; white-space: nowrap; }
  .daily-footer strong small { color: var(--muted); font: 11px/1 sans-serif; letter-spacing: 0; }
  .thread-card { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); overflow: hidden; }
  .subagent-card { border-color: #aaa3e8; background: #fbfaff; box-shadow: inset 4px 0 var(--indigo); }
  article { padding: 24px; }
  h2 { margin: 0; font-size: 20px; font-weight: 650; line-height: 1.4; letter-spacing: -.3px; overflow-wrap: anywhere; }
  .card-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; margin-top: 8px; color: var(--muted); font: 12px/1.5 'Segoe UI', system-ui, sans-serif; }
  .project { color: var(--indigo); overflow-wrap: anywhere; }
  .subagent-badge { padding: 1px 7px; border-radius: 999px; background: #e9e7ff; color: #443da8; font-weight: 650; }
  .thread-id { min-height: 24px; padding: 2px 7px; border-style: dashed; color: var(--muted); font: 11px ui-monospace, monospace; }
  .model-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
  .model-filters button { min-height: 28px; padding: 3px 9px; border-radius: 999px; color: var(--muted); font: 11px ui-monospace, monospace; }
  .model-filters button.active { border-color: var(--cyan); background: #e6f5f7; color: #006775; }
  .pressure { color: var(--cyan); font-weight: 650; }
  .pressure b { font-size: 15px; }
  .pressure-high { color: #a43b2b; }
  .why { min-height: 24px; padding: 2px 8px; border-radius: 999px; color: #a43b2b; font-size: 11px; }
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
  @media (max-width: 900px) {
    .workspace { grid-template-columns: 1fr; }
    .coach { position: static; height: auto; min-height: 330px; }
  }
  @media (max-width: 700px) {
    main { padding: 0 20px 24px; }
    article { padding: 20px; }
    .card-bottom { grid-template-columns: 1fr; gap: 20px; }
    .daily-footer { flex-wrap: wrap; gap: 10px 18px; }
  }
  @media (max-width: 420px) {
    main { padding: 0 14px 20px; }
    .refresh { font-size: 12px; padding: 9px; }
    .toolbar { gap: 10px; }
    .thread-count { display: none; }
    .project-filters { min-width: 0; }
    article { padding: 18px; }
    footer { font-size: 10px; }
  }
</style>
