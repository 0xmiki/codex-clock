<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
  import { Skeleton } from '$lib/components/ui/skeleton/index.js';
  import { Separator } from '$lib/components/ui/separator/index.js';
  import * as Alert from '$lib/components/ui/alert/index.js';
  import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwiseIcon';
  import ChatCircleIcon from 'phosphor-svelte/lib/ChatCircleIcon';
  import ShieldCheckIcon from 'phosphor-svelte/lib/ShieldCheckIcon';
  import { onMount } from 'svelte';
  import Brand from '$lib/components/Brand.svelte';
  import TodayPanel from '$lib/components/TodayPanel.svelte';
  import { usageComparison } from '$lib/comparison';
  import Limits from '$lib/components/Limits.svelte';
  import Productivity from '$lib/components/Productivity.svelte';
  import TrendChart from '$lib/components/TrendChart.svelte';
  import Standouts from '$lib/components/Standouts.svelte';
  import ThreadTable from '$lib/components/ThreadTable.svelte';
  import Coach from '$lib/components/Coach.svelte';
  import { coach } from '$lib/coach.svelte';
  import { activeProjects, dailyBuckets, tokensOnDay, todayThreads } from '$lib/today';
  import type { Snapshot } from '$lib/types';
  import { project } from '$lib/format';
  import { gradeThreads } from '$lib/efficiency';

  let data = $state<Snapshot | null>(null);
  let error = $state('');
  let refreshing = $state(false);
  let selectedProject = $state('');
  let filterHeight = $state(0);
  let projectOrder = $state<string[]>([]);
  let now = $state(Date.now());
  const efficiencyGrades = $derived(gradeThreads(data?.threads ?? []));

  let today = $derived(todayThreads(data?.threads || [], now));
  let projects = $derived(projectOrder.filter(cwd => (data?.threads || []).some(thread => thread.cwd === cwd)));
  let visibleThreads = $derived((data?.threads || []).filter(thread => !selectedProject || thread.cwd === selectedProject));
  let daily = $derived(tokensOnDay(visibleThreads, now));
  let buckets = $derived(dailyBuckets(visibleThreads, now));
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

<header class="sticky top-0 z-20 flex h-15 items-center gap-4 border-b bg-background/90 px-4 backdrop-blur-md md:px-7">
  <Brand />
  <div class="hidden items-center gap-2 sm:flex">
    <Badge variant={errorMessage ? 'destructive' : 'secondary'}>
      <span class="size-1.5 rounded-full" class:bg-primary={!errorMessage} class:bg-destructive={Boolean(errorMessage)}></span>
      {errorMessage ? 'Data issue' : data ? `Local Codex · read ${data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…'}` : 'Connecting…'}
    </Badge>
    <Badge variant="outline" title="Dashboard runs locally. Codex contacts OpenAI to check allowance and answer coach questions."><ShieldCheckIcon aria-hidden="true" />Local dashboard</Badge>
  </div>
  <div class="ml-auto flex gap-2">
    <Button variant="outline" onclick={refresh} disabled={refreshing}>
      <ArrowClockwiseIcon class={refreshing ? 'animate-spin' : ''} aria-hidden="true" />{refreshing ? 'Reading…' : 'Refresh'}
    </Button>
    <Button variant={coach.open ? 'secondary' : 'outline'} aria-expanded={coach.open} aria-controls="ask-panel" onclick={() => coach.open = !coach.open}><ChatCircleIcon aria-hidden="true" />Ask</Button>
  </div>
</header>

<div class="shell" class:with-coach={coach.open}>
  <main class="min-w-0 space-y-4">
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
              <TodayPanel total={daily} comparison={usageComparison(visibleThreads, now)} partial={data.hasMore} projectName={selectedProject ? project(selectedProject) : 'All projects'} />
              <Productivity projects={data.productivity ?? []} cwd={selectedProject} {now} partial={data.hasMore} />
              <TrendChart {buckets} />
              <Standouts {today} {efficiencyGrades} onSelectProject={selectProject} />
            </div>
          </ScrollArea>
        </aside>
        <div class="activity min-w-0 space-y-4">
          {#if projects.length > 1}
            <nav class="pills sticky top-15 z-10 flex gap-2 overflow-x-auto bg-background py-2 sm:flex-wrap sm:overflow-visible" bind:clientHeight={filterHeight} aria-label="Filter threads by project">
              <Button size="sm" variant={!selectedProject ? 'default' : 'outline'} aria-pressed={!selectedProject} onclick={() => selectedProject = ''}>All projects</Button>
              {#each projects as cwd (cwd)}
                <Button size="sm" variant={selectedProject === cwd ? 'default' : 'outline'} aria-pressed={selectedProject === cwd} title={cwd} onclick={() => selectedProject = selectedProject === cwd ? '' : cwd}>{project(cwd)}</Button>
              {/each}
            </nav>
          {/if}
          <div id="threads" class="min-w-0" style:scroll-margin-top={`${76 + filterHeight}px`}><ThreadTable threads={visibleThreads} {efficiencyGrades} {now} /></div>
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
