<script lang="ts">
  import '$lib/fonts.css';
  import '$lib/theme.css';
  import { onMount } from 'svelte';
  import Brand from '$lib/components/Brand.svelte';
  import TodayPanel from '$lib/components/TodayPanel.svelte';
  import TrendChart from '$lib/components/TrendChart.svelte';
  import Standouts from '$lib/components/Standouts.svelte';
  import ThreadTable from '$lib/components/ThreadTable.svelte';
  import Coach from '$lib/components/Coach.svelte';
  import { coach } from '$lib/coach.svelte';
  import { activeProjects, dailyBuckets, sumThreadUsage, threadApiCost, todayThreads, workflowPressure } from '$lib/today';
  import type { Snapshot } from '$lib/types';
  import { project } from '$lib/format';

  let data = $state<Snapshot | null>(null);
  let error = $state('');
  let refreshing = $state(false);
  let selectedProject = $state('');
  let projectOrder = $state<string[]>([]);
  let now = $state(Date.now());

  let today = $derived(todayThreads(data?.threads || [], now));
  let selectedToday = $derived(today.filter(thread => !selectedProject || thread.cwd === selectedProject));
  let daily = $derived(sumThreadUsage(selectedToday));
  let turns = $derived(selectedToday.reduce((sum, thread) => sum + (thread.usage?.turns ?? 0), 0));
  let dailyCost = $derived.by(() => {
    let total = 0, any = false;
    for (const thread of selectedToday) {
      const cost = threadApiCost(thread);
      if (cost !== null) { total += cost; any = true; }
    }
    return any ? total : null;
  });
  let pressure = $derived(workflowPressure(today));
  let buckets = $derived(dailyBuckets(data?.threads || [], now));
  let projects = $derived(projectOrder.filter(cwd => (data?.threads || []).some(thread => thread.cwd === cwd)));
  let visibleThreads = $derived((data?.threads || []).filter(thread => !selectedProject || thread.cwd === selectedProject));
  const errorMessage = $derived(error || data?.error || '');

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    now = Date.now();
    try {
      const response = await fetch('/api/dashboard', { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`Could not read saved threads (${response.status}).`);
      const snapshot: Snapshot = await response.json();
      const latest = activeProjects(snapshot.threads);
      projectOrder = [...projectOrder, ...latest.filter(cwd => !projectOrder.includes(cwd))];
      data = snapshot;
      error = '';
      now = Date.now();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not reach the local server.';
    } finally { refreshing = false; }
  }

  function selectProject(cwd: string) {
    selectedProject = selectedProject === cwd ? '' : cwd;
    document.getElementById('threads')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onMount(() => {
    void refresh();
    const clock = setInterval(() => { now = Date.now(); }, 60000);
    return () => clearInterval(clock);
  });
</script>

<svelte:head>
  <title>MyLimits · Codex usage mission control</title>
  <meta name="description" content="A local dashboard for Codex token usage: daily totals, trends, expensive sessions, and a usage coach." />
</svelte:head>

<header class="topbar">
  <Brand />
  <div class="status">
    {#if errorMessage}
      <span class="chip warn"><i aria-hidden="true"></i>Data issue</span>
    {:else if data}
      <span class="chip live"><i aria-hidden="true"></i>Local Codex · read {data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…'}</span>
    {:else}
      <span class="chip"><i aria-hidden="true" class="pulse"></i>Connecting…</span>
    {/if}
    <span class="chip privacy" title="MyLimits reads saved Codex files on this machine and talks only to localhost">100% local</span>
  </div>
  <div class="actions">
    <button class="tool" onclick={refresh} disabled={refreshing}>
      <svg viewBox="0 0 16 16" aria-hidden="true" class:spin={refreshing}><path d="M13.6 8a5.6 5.6 0 1 1-1.7-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /><path d="M12.3 1v3.2H9.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
      {refreshing ? 'Reading…' : 'Refresh'}
    </button>
    <button class="tool" class:on={coach.open} aria-pressed={coach.open} onclick={() => coach.open = !coach.open}>Coach</button>
  </div>
</header>

<div class="shell" class:narrow={!coach.open}>
  <main>
    {#if errorMessage}
      <div class="error" role="alert">
        <strong>Saved threads could not be refreshed.</strong>
        <p>{errorMessage}</p>
        <p>Check that Codex is installed and its local data is readable, then refresh. Previous results may be out of date.</p>
        <button class="tool" onclick={refresh} disabled={refreshing}>Try again</button>
      </div>
    {/if}

    {#if !data && !errorMessage}
      <div class="loading" role="status">
        <div class="skeleton hero"></div>
        <div class="skeleton-row">
          <div class="skeleton"></div>
          <div class="skeleton"></div>
          <div class="skeleton"></div>
        </div>
        <div class="skeleton tall"></div>
        <p>Reading local Codex threads…</p>
      </div>
    {:else if data}
      <div class="dashboard">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable sidebar must support keyboard scrolling.) -->
      <aside class="summary-sidebar" aria-label="Usage overview" tabindex="0">
        <TodayPanel total={daily.total} cached={daily.cached} fresh={daily.input} output={daily.output} calls={daily.calls} {turns} sessions={selectedToday.length} cost={dailyCost} projectName={selectedProject ? project(selectedProject) : 'All projects'} />
        <TrendChart {buckets} />
        <Standouts {today} onSelectProject={selectProject} />
      </aside>

      <div class="activity">

      {#if projects.length > 1}
        <nav class="pills" aria-label="Filter threads by project">
          <button class:picked={!selectedProject} aria-pressed={!selectedProject} onclick={() => selectedProject = ''}>All projects</button>
          {#each projects as cwd (cwd)}
            <button class:picked={selectedProject === cwd} aria-pressed={selectedProject === cwd} title={cwd} onclick={() => selectedProject = selectedProject === cwd ? '' : cwd}>{project(cwd)}</button>
          {/each}
        </nav>
      {/if}

      <div id="threads">
        <ThreadTable threads={visibleThreads} {now} />
      </div>

      <footer>
        <span>Read from local Codex data{data.updatedAt ? ` at ${new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}{data.hasMore ? ` · newest ${data.threads.length} saved threads` : ''}</span>
        <span>Nothing leaves this machine</span>
      </footer>
      </div>
      </div>
    {/if}
  </main>

  {#if coach.open}
    <div class="coach-dock"><Coach snapshot={data} /></div>
  {/if}
</div>

<style>
  .topbar {
    position: sticky; top: 0; z-index: 20;
    display: flex; align-items: center; gap: 18px;
    height: 60px; padding: 0 28px;
    border-bottom: 1px solid var(--line);
    background: rgba(10, 13, 19, 0.82);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .status { display: flex; align-items: center; gap: 8px; margin-left: 6px; }
  .chip {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 5px 11px; border: 1px solid var(--line); border-radius: 99px;
    background: var(--bg1); color: var(--ink-dim); font: 500 11px var(--font-data); white-space: nowrap;
  }
  .chip i { width: 6px; height: 6px; border-radius: 50%; background: var(--ink-faint); }
  .chip.live i { background: var(--brand); box-shadow: 0 0 7px var(--brand); }
  .chip.warn i { background: var(--bad); }
  .chip.privacy { color: var(--ink-faint); }
  .chip.privacy::before { content: '●'; font-size: 6px; color: var(--cached); }
  .pulse { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  .actions { margin-left: auto; display: flex; gap: 8px; }
  .tool {
    display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 7px 14px;
    border: 1px solid var(--line); border-radius: var(--radius-control);
    background: var(--bg1); color: var(--ink-dim); font: 500 12.5px var(--font-ui);
    transition: border-color 0.15s, color 0.15s;
  }
  .tool:hover:not(:disabled) { border-color: var(--ink-faint); color: var(--ink); }
  .tool.on { border-color: rgba(180, 245, 60, 0.55); color: var(--brand); background: var(--brand-glow); }
  .tool svg { width: 13px; height: 13px; }
  .tool svg.spin { animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .shell { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; align-items: start; padding: 22px 28px 30px; max-width: 2200px; margin: 0 auto; }
  .shell.narrow { grid-template-columns: minmax(0, 1fr); }
  main { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .coach-dock { position: sticky; top: 82px; height: calc(100vh - 104px); min-height: 560px; }
  .coach-dock :global(.coach) { height: 100%; }

  .dashboard { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 20px; align-items: start; }
  .summary-sidebar, .activity { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .summary-sidebar { position: sticky; top: 82px; max-height: calc(100dvh - 104px); overflow-y: auto; overscroll-behavior-y: contain; scrollbar-gutter: stable; padding-right: 6px; }
  .summary-sidebar > :global(*) { flex-shrink: 0; }
  #threads { min-width: 0; scroll-margin-top: 82px; }

  .pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .pills button {
    min-height: 32px; padding: 6px 14px; border: 1px solid var(--line); border-radius: 99px;
    background: transparent; color: var(--ink-dim); font: 500 12px var(--font-ui); white-space: nowrap;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .pills button:hover { color: var(--ink); border-color: var(--ink-faint); }
  .pills button.picked { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); font-weight: 600; }

  .error {
    padding: 18px 22px; border: 1px solid rgba(244, 118, 94, 0.45); border-radius: var(--radius-card);
    background: var(--danger-bg);
  }
  .error strong { color: var(--bad); }
  .error p { margin: 8px 0; color: var(--ink-dim); overflow-wrap: anywhere; }
  .error .tool { margin-top: 6px; }

  .loading { display: flex; flex-direction: column; gap: 16px; }
  .loading p { margin: 0; color: var(--ink-faint); font-size: 13px; }
  .skeleton { height: 180px; border-radius: var(--radius-card); background: linear-gradient(100deg, var(--bg1) 40%, var(--bg2) 50%, var(--bg1) 60%) 0 0 / 220% 100%; animation: shimmer 1.4s infinite linear; }
  .skeleton.hero { height: 230px; }
  .skeleton.tall { height: 320px; }
  .skeleton-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @keyframes shimmer { to { background-position: -120% 0; } }

  footer { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-top: 4px; color: var(--ink-faint); font: 400 11.5px var(--font-data); }

  @media (max-width: 1280px) {
    .shell { grid-template-columns: minmax(0, 1fr); }
    .coach-dock { position: static; height: auto; min-height: 0; }
    .coach-dock :global(.coach) { height: auto; }
    .coach-dock :global(.log) { min-height: 180px; max-height: 320px; }
  }
  @media (max-width: 980px) {
    .dashboard { grid-template-columns: minmax(0, 1fr); }
    .summary-sidebar { position: static; max-height: min(60dvh, 560px); }
  }
  @media (max-width: 700px) {
    .topbar { padding: 0 16px; }
    .shell { padding: 16px 16px 24px; }
    .status { display: none; }
    .skeleton-row { grid-template-columns: 1fr; }
  }
</style>
