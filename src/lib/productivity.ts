import type { WorkProject, WorkDay } from './types';

export function workHistory(projects: WorkProject[], cwd = ''): WorkDay[] {
  const days = new Map<string, WorkDay>();
  const seenLines = new Set<string>();
  for (const project of projects) {
    if (cwd && project.cwd !== cwd) continue;
    if (project.error) continue;
    for (const entry of project.days) {
      const row = days.get(entry.day) ?? { day: entry.day, tokens: 0, lines: 0, work: 0 };
      row.tokens += entry.tokens;
      row.work += entry.work;
      const key = `${project.root}\0${entry.day}`;
      if (!seenLines.has(key)) { row.lines += entry.lines; seenLines.add(key); }
      days.set(entry.day, row);
    }
  }
  return [...days.values()].toSorted((a, b) => a.day.localeCompare(b.day));
}
