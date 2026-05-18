import { db, schema, eq } from "../shared";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { LIPSYNC } from "@/lib/constants";
import { generateLipSyncedClip } from "@/server/services/lipsync";

/**
 * SPIKE: best-effort audio-driven lip sync, run as a pre-step of final
 * composition so every path that reaches compose-final (auto, review
 * approval, rerender, recompose) gets it without rewiring queue topology.
 *
 * For each movie scene whose speaker is an on-camera character, the FIRST
 * clip of the scene is re-synced to that scene's TTS audio and the frame is
 * repointed at the new media. Idempotent (skips clips already synced) and
 * never throws — a failure leaves the original clip in place.
 *
 * KNOWN LIMITATIONS (documented for productionization, not bugs):
 *  - No shot-type metadata exists, so we cannot tell whether the speaker's
 *    face is actually on camera. Non-face shots fed to the model may warp.
 *    A real version needs shot-type from the screenwriter or face detection.
 *  - Multi-frame scenes: only the first frame is synced (the scene audio
 *    spans the whole scene; per-frame audio splitting is out of scope here).
 */
export async function applyLipSyncIfEnabled(videoProjectId: string): Promise<void> {
  if (!LIPSYNC.enabled) return;

  const project = await db.query.videoProjects.findFirst({
    where: eq(schema.videoProjects.id, videoProjectId),
    columns: { id: true, userId: true, videoType: true },
  });
  if (!project || project.videoType !== "movie") return;

  const scenes = await db.query.videoScenes.findMany({
    where: eq(schema.videoScenes.videoProjectId, videoProjectId),
    orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
  });

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const scene of scenes) {
    const speaker = scene.speaker?.trim();
    if (!speaker || speaker.toLowerCase() === "narrator" || !scene.audioUrl) {
      skipped++;
      continue;
    }

    const frame = await db.query.sceneFrames.findFirst({
      where: eq(schema.sceneFrames.sceneId, scene.id),
      orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
      with: { videoMedia: true },
    });

    if (!frame?.videoMedia?.url) {
      skipped++;
      continue;
    }
    // Idempotent: a re-run (rerender/recompose) must not re-sync.
    if (frame.videoMedia.modelUsed === LIPSYNC.modelLabel) {
      skipped++;
      continue;
    }

    try {
      const syncedUrl = await generateLipSyncedClip(
        mediaUrl(frame.videoMedia.url),
        mediaUrl(scene.audioUrl)
      );

      const resp = await fetch(syncedUrl);
      if (!resp.ok) throw new Error(`download failed: ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());

      const key = `frames/${videoProjectId}/lipsync_${frame.id}_${Date.now()}.mp4`;
      await uploadFile(key, buf, "video/mp4");

      const [newMedia] = await db
        .insert(schema.media)
        .values({
          userId: project.userId,
          frameId: frame.id,
          type: "video",
          url: key,
          prompt: `lip-sync (${speaker})`,
          modelUsed: LIPSYNC.modelLabel,
        })
        .returning();

      await db
        .update(schema.sceneFrames)
        .set({ videoMediaId: newMedia.id })
        .where(eq(schema.sceneFrames.id, frame.id));

      applied++;
      console.log(`[lip-sync] Scene ${scene.sceneOrder} (${speaker}): frame ${frame.id} synced`);
    } catch (err) {
      failed++;
      console.warn(
        `[lip-sync] Scene ${scene.sceneOrder} (${speaker}) failed, keeping original clip: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log(
    `[lip-sync] Done: ${applied} synced, ${skipped} skipped, ${failed} failed (of ${scenes.length} scenes)`
  );
}
