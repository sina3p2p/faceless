export type ResumeJobContext = {
  hasSceneFrames: boolean;
  /** Latest `render_jobs.step` (e.g. compose phase). */
  renderJobStep?: string | null;
  /**
   * `video_projects.video_type`. Needed because the early statuses
   * (PENDING/PRODUCING) map to different entry jobs per pipeline — timelapse
   * starts at timelapse-plan, every other type at executive-produce.
   */
  videoType?: string | null;
};

export type RenderJobSnapshot = { status?: string; error?: string | null };
