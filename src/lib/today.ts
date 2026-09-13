import type { Thread } from './types';
export const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10);
export const todayThreads = (threads: Thread[], now: number) => threads.filter(thread => dayKey(thread.updatedAt * 1000) === dayKey(now));
