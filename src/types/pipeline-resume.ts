export type ResumeJobContext = {
  hasSceneFrames: boolean;
  /** Latest `render_jobs.step` (e.g. compose phase). */
  renderJobStep?: string | null;
};

export type RenderJobSnapshot = { status?: string; error?: string | null };
