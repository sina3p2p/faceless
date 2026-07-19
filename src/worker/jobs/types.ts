export type PayloadBase = {
  toolCallId: string;
  assistantMessageRowId: string;
};

export type JobRunContext = {
  jobId: string;
  sessionId: string;
  toolCallId: string;
  assistantMessageRowId: string;
  payload: Record<string, unknown>;
};

export type WorkerJob = {
  run: (ctx: JobRunContext) => Promise<void>;
  failPatch: (errorMsg: string) => Record<string, unknown>;
};
