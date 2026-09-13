export type TokenBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number | null;
  outputTokens: number;
  reasoningOutputTokens: number | null;
};
export type Usage = TokenBreakdown & {
  last: TokenBreakdown | null;
  modelContextWindow: number | null;
  turns: number;
  modelCalls: number;
  recentRequests: number[];
};
export type Thread = {
  id: string; title: string; cwd: string;
  model?: string | null; modelProvider: string; updatedAt: number;
  parentThreadId?: string | null; usage: Usage | null; usageError: string | null;
};
export type Snapshot = { error: string | null; updatedAt: number | null; threads: Thread[]; hasMore: boolean };
