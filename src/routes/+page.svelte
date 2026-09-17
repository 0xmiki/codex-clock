<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
  import { Skeleton } from '$lib/components/ui/skeleton/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwiseIcon';
  import ChatCircleIcon from 'phosphor-svelte/lib/ChatCircleIcon';
  import { onMount } from 'svelte';
  import Brand from '$lib/components/Brand.svelte';
  import TodayPanel from '$lib/components/TodayPanel.svelte';
  import Limits from '$lib/components/Limits.svelte';
  import Productivity from '$lib/components/Productivity.svelte';
  import TrendChart from '$lib/components/TrendChart.svelte';
  import Standouts from '$lib/components/Standouts.svelte';
  import ThreadTable from '$lib/components/ThreadTable.svelte';
  import Coach from '$lib/components/Coach.svelte';
  import { coach } from '$lib/coach.svelte';
  import type { DashboardView, SortKey } from '../../server/view';
  import { project } from '$lib/format';

  let data = $state<DashboardView | null>(null);
  let error = $state('');
  let refreshing = $state(false);
  let selectedProject = $state('');
  let filterHeight = $state(0);
  let progress = $state({ phase: 'idle', completed: 0, total: 0 });
  let page = $state(1);
  let sortKey = $state<SortKey>('when');
  let sortDesc = $state(true);
  let requestId = 0;
  let disposed = false;
  let now = $state(Date.now());
  const efficiencyGrades = $derived(new Map(data?.grades ?? []));
  let projects = $derived(data?.projects ?? []);
  const errorMessage = $derived(error || data?.error || '');

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    now = Date.now();
    try {
      await loadView();
      progress = await readJson('/api/dashboard?background=true');
      while (!disposed && progress.phase !== 'idle') {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!disposed) { progress = await readJson('/api/index-status'); await loadView(); }
      }
      if (disposed) return;
      await loadView();
      now = Date.now();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not reach the local server.';
    } finally { refreshing = false; }
  }

  async function readJson(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Could not read saved threads (${response.status}).`);
    return response.json();
  }

  async function loadView() {
    const id = ++requestId;
    try {
      const params = new URLSearchParams({ view: 'true', project: selectedProject, page: String(page), sort: sortKey, desc: String(sortDesc) });
      const snapshot: DashboardView = await readJson(`/api/dashboard?${params}`);
      if (id !== requestId || disposed) return;
      data = snapshot; page = snapshot.pagination.page; error = ''; now = Date.now();
    } catch (e) { if (id === requestId && !disposed) error = e instanceof Error ? e.message : 'Could not reach the local server.'; }
  }

  function sortThreads(key: SortKey, desc: boolean) { sortKey = key; sortDesc = desc; page = 1; void loadView(); }
  function changePage(next: number) { page = next; void loadView(); }

  function selectProject(cwd: string) {
    selectedProject = selectedProject === cwd ? '' : cwd;
    page = 1;
    void loadView();
    document.getElementById('threads')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onMount(() => {
    void refresh();
    const clock = setInterval(() => { now = Date.now(); if (data && !refreshing) void loadView(); }, 60000);
    return () => { disposed = true; clearInterval(clock); };
  });
</script>

<svelte:head>
  <title>Codex Clock · Usage and allowance</title>
  <meta name="description" content="A local dashboard for Codex token usage: daily totals, trends, expensive sessions, and a usage coach." />
</svelte:head>

<header class="sticky top-0 z-20 flex h-15 items-center gap-4 border-b bg-background/90 px-4 backdrop-blur-md md:px-7">
  <Brand />
  <div class="ml-auto flex gap-2">
    <Button variant="outline" onclick={refresh} disabled={refreshing}>
      <ArrowClockwiseIcon class={refreshing ? 'animate-spin' : ''} aria-hidden="true" />{refreshing ? 'Reading…' : 'Refresh'}
    </Button>
    <Button variant={coach.open ? 'secondary' : 'outline'} aria-expanded={coach.open} aria-controls="ask-panel" onclick={() => coach.open = !coach.open}><ChatCircleIcon aria-hidden="true" />Ask</Button>
  </div>
</header>

<div class="shell" class:with-coach={coach.open}>
  <main class="min-w-0 space-y-4">
    {#if refreshing}<p role="status" class="text-xs text-muted-foreground">{data?.stale ? 'Showing saved results · ' : data?.hasMore ? 'Partial history · ' : ''}{progress.phase === 'listing' ? `Finding saved threads… ${progress.total} found` : progress.phase === 'indexing' ? `Indexing ${progress.completed} of ${progress.total} threads…` : progress.phase === 'productivity' ? 'Updating productivity…' : progress.phase === 'allowance' ? 'Checking allowance…' : 'Refreshing…'}</p>{/if}
    {#if !refreshing && data?.stale}<p class="text-xs text-muted-foreground">Showing saved results. Refresh to check for changes.</p>{/if}
    {#if errorMessage}
      <Alert.Root variant="destructive">
        <Alert.Title>Saved threads could not be refreshed.</Alert.Title>
        <Alert.Description>
          <p>{errorMessage}</p>
          <p>Check that Codex is installed and its local data is readable, then refresh. Previous results may be out of date.</p>
          <Button variant="outline" onclick={refresh} disabled={refreshing}>Try again</Button>
        </Alert.Description>
      </Alert.Root>
    {/if}
    {#if !data && !errorMessage}
      <div class="dashboard" role="status">
        <div class="space-y-4"><Skeleton class="h-64" /><Skeleton class="h-64" /><Skeleton class="h-48" /></div>
        <div class="space-y-4"><Skeleton class="h-8 w-2/3" /><Skeleton class="h-[65vh]" /><p class="text-sm text-muted-foreground">Reading local Codex threads…</p></div>
      </div>
    {:else if data}
      <div class="dashboard">
        <aside class="summary-sidebar" aria-label="Usage overview">
          <ScrollArea class="h-full">
            <div class="flex min-w-0 flex-col gap-4 p-1 pr-4">
              <Limits limits={data.limits} {now} />
              <TodayPanel total={data.summary.daily} comparison={data.summary.comparison} partial={data.hasMore} projectName={selectedProject ? project(selectedProject) : 'All projects'} />
              {#if data.productivityPending}<p class="text-xs text-muted-foreground" role="status">Productivity is updating; previous results may be out of date.</p>{/if}
              <Productivity projects={data.productivity ?? []} cwd={selectedProject} {now} partial={data.hasMore} />
              <TrendChart buckets={data.summary.buckets} />
              <Standouts summary={data.summary.standouts} {efficiencyGrades} onSelectProject={selectProject} />
            </div>
          </ScrollArea>
        </aside>
        <div class="activity min-w-0 space-y-4">
          {#if projects.length > 1}
            <nav class="pills sticky top-15 z-10 flex gap-2 overflow-x-auto bg-background py-2 [&>button]:shrink-0" bind:clientHeight={filterHeight} aria-label="Filter threads by project">
              <Button size="sm" variant={!selectedProject ? 'default' : 'outline'} aria-pressed={!selectedProject} onclick={() => selectProject('')}>All projects</Button>
              {#each projects as cwd (cwd)}
                <Button size="sm" variant={selectedProject === cwd ? 'default' : 'outline'} aria-pressed={selectedProject === cwd} title={cwd} onclick={() => selectProject(cwd)}>{project(cwd)}</Button>
              {/each}
            </nav>
          {/if}
          <div id="threads" class="min-w-0" style:scroll-margin-top={`${76 + filterHeight}px`}><ThreadTable threads={data.threads} {efficiencyGrades} {now} {sortKey} {sortDesc} onSort={sortThreads} /></div>
          {#if data.pagination.pages > 1}
            <nav class="flex items-center justify-end gap-3 text-xs text-muted-foreground" aria-label="Thread pages">
              <span>{data.pagination.total} threads · Page {data.pagination.page} of {data.pagination.pages}</span>
              <Button size="sm" variant="outline" disabled={page <= 1} onclick={() => changePage(page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= data.pagination.pages} onclick={() => changePage(page + 1)}>Next</Button>
            </nav>
          {/if}
          <Separator />
          <footer class="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
            <span>Read from local Codex data{data.updatedAt ? ` at ${new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}{data.hasMore ? ` · newest ${data.threads.length} saved threads` : ''}</span>
            <span>Allowance checked through your signed-in Codex account</span>
          </footer>
        </div>
      </div>
    {/if}
  </main>
  {#if coach.open}<div class="coach-dock"><Coach snapshot={data} /></div>{/if}
</div>

<style>
  .shell { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; padding: 22px 28px 30px; max-width: 2200px; margin: 0 auto; }
  .shell.with-coach { grid-template-columns: minmax(0, 1fr) 360px; }
  .dashboard { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 20px; align-items: start; }
  .summary-sidebar { position: sticky; top: 82px; height: calc(100dvh - 104px); min-width: 0; }
  .summary-sidebar :global([data-slot='scroll-area-viewport']) { overscroll-behavior-y: contain; }
  .coach-dock { position: sticky; top: 82px; height: calc(100dvh - 104px); }
  .coach-dock :global(.coach) { height: 100%; }
  @media (max-width: 1280px) { .shell.with-coach { grid-template-columns: minmax(0, 1fr); } .coach-dock { position: static; height: 560px; } }
  @media (max-width: 980px) { .dashboard { grid-template-columns: minmax(0, 1fr); } .summary-sidebar { position: static; height: min(60dvh, 560px); } }
  @media (max-width: 700px) { .shell { padding: 16px; } }
</style>
