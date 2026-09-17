export type TokenBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number | null;
  outputTokens: number;
  reasoningOutputTokens: number | null;
};
export type UsageMetrics = TokenBreakdown & {
  last: TokenBreakdown | null;
  modelContextWindow: number | null;
  turns: number;
  modelCalls: number;
  recentRequests: number[];
};
export type UsageCall = TokenBreakdown & { model: string; timestamp: number | null; serviceTier?: string | null };
export type Usage = UsageMetrics & {
  dailyTokens?: Record<string, number>;
  dailyUsage?: Record<string, UsageMetrics>;
  minuteTokens?: Record<string, number>;
  byModel: Record<string, UsageMetrics>;
  recentCalls?: UsageCall[];
  activeModel?: string;
  longContextModels?: string[];
  undatedTokens?: number;
};
export type Thread = {
  id: string; title: string; cwd: string;
  model?: string | null; modelProvider: string; updatedAt: number;
  parentThreadId?: string | null; usage: Usage | null; usageError: string | null;
};
export type WorkDay = { day: string; tokens: number; lines: number; work: number };
export type WorkProject = { cwd: string; root: string | null; days: WorkDay[]; error: string | null };
export type LimitWindow = { remaining: number; minutes: number | null; resetsAt: number | null };
export type AccountLimits = { windows: LimitWindow[]; plan: string | null; checkedAt: number };
export type Snapshot = { error: string | null; updatedAt: number | null; threads: Thread[]; hasMore: boolean; productivity?: WorkProject[]; limits?: AccountLimits | null; stale?: boolean; productivityPending?: boolean };
