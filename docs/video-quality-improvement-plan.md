# Video Quality Improvement Plan

This is a planning document. No code changes yet — it captures the proposed direction so we can sequence the work later.

Scope: end-to-end video quality (story, visual consistency, motion, composition, audio, pipeline). Image-generation deep-dive is out of scope here and tracked separately.

Current pipeline reference points:
- `src/server/services/llm/story.ts` — script/story generation
- `src/server/services/llm/cinematographer.ts` — visual style guide
- `src/server/services/llm/storyboard.ts` — scene/frame breakdown
- `src/server/services/llm/motion.ts` — motion direction / I2V prompts
- `src/server/services/media.ts` — image providers
- `src/server/services/composer.ts` — final ffmpeg compose
- `src/worker/pipeline/*` — pipeline stages

The plan is split into three waves so we can ship and validate quality lift incrementally.

---

## Wave 1 — Foundations & cheap wins (1–2 days)

Goal: lock determinism, fix the most obvious "amateur tells" in the final mix, and stop silent quality regressions.

### 1.1 Seed locking everywhere
- Add `seed: number` to `videoProjects` schema (drizzle migration).
- Generate once at project creation (`executiveProduce.ts`); derive per-stage subseeds (`storySeed = seed`, `imageSeed = seed+1`, `motionSeed = seed+2`, `musicSeed = seed+3`).
- Thread through:
  - `src/server/services/llm/story.ts` (LLM `seed` param where supported).
  - `src/server/services/media.ts` — Gemini, GPT-Image, Replicate/Fal Flux all accept `seed`. Pass per provider.
  - `src/server/services/ai/video/providers/{fal,replicate}.ts` — pass to Seedance/Kling where supported.
- Surface seed in the project UI so users can re-roll deterministically.

### 1.2 Audio ducking + LUT grade in composer
- `src/server/services/composer.ts:334-351`: replace flat 10% music mix with `sidechaincompress` against the VO track. Music ~25% nominal, ducks to ~8% under speech.
- Add a `colorGrade` step before final encode: ffmpeg `lut3d` driven by `CreativeBrief.tone` (warm / cool / teal-orange / mono). Ship 3–4 LUTs in `public/luts/`.
- Make CRF and preset configurable per quality tier (`draft` / `standard` / `hero`).

### 1.3 Stop `setpts` stretching
- `src/server/services/composer.ts:229`: when I2V clip < required duration, don't stretch — extend by holding the last frame (`tpad=stop_mode=clone:stop_duration=...`). Avoids ghosting/jitter.
- In `generateFrameVideos.ts`, request a clip duration ≥ VO duration up front rather than reactively patching in the composer.

### 1.4 Caption grouping by VO pauses
- `src/server/services/composer.ts:109-120`: replace fixed 3-word groups with a grouper that breaks on ElevenLabs word-timestamp gaps > 180ms or punctuation. Cap at ~6 words.
- Expose `captionPreset` per project (default / bold / neon / typewriter) instead of hardcoding `default`.

**Wave 1 exit criteria:** same project + same seed → same video. Mixes sound professional. Captions track speech rhythm.

---

## Wave 2 — Story & visual consistency (3–5 days)

Goal: fix the two things viewers complain about most — weak middles and shifting character identity.

### 2.1 Beat sheet + critic loop in story generation
Rewrite `src/server/services/llm/story.ts` as a 3-call chain:

1. **Outline call** — output a typed `BeatSheet` (Zod): `hook` (with labeled hook type from a fixed enum), `inciting`, `escalation[]`, `turn`, `payoff`. Token-budgeted per beat.
2. **Prose call** — generate paragraphs *bound to* each beat ID; refuses to drift.
3. **Critic call** — score draft on hook strength / specificity / payoff / "next-paragraph pull"; if any score < threshold, run a fourth **rewrite** call patching only the failing beats.

Persist `BeatSheet` on the project so:
- `splitScenes.ts` aligns scene boundaries to beats (not paragraphs).
- `storyboard.ts` knows which scene is the hook vs. climax for shot/motion grammar (Wave 3).

### 2.2 Hard word budget enforcement
- Token-count the prose call output; if > budget, automatic compress pass. Removes the silent VO-too-long → composer-stretches problem at the source.

### 2.3 Canonical character sheet, generated once, frozen
- New table `projectAssets` keyed by project: stores `assetRef` URLs + descriptions for each named entity.
- `story-asset-tools.ts`: generate sheets once per project, reuse across all renders/re-rolls.
- Add a small UI to view/edit/regenerate individual assets so users can iterate without re-rolling the story.

### 2.4 Real image-reference conditioning on every frame
- Make Gemini 3 Image (or Flux Kontext on Fal) the default in `src/server/services/media.ts` for any scene with named characters — these accept image refs natively.
- Pass the canonical `assetRef` URL(s) to *every* frame call where named characters appear, not just the first.
- Guard rail in `image-spec.ts:216-220`: if appearance descriptors were stripped *and* the API call doesn't actually receive image refs, fall back to descriptors instead of generating a generic face.

### 2.5 Negative-anchor list per project
- Extend `cinematographer.ts` `VisualStyleGuide` with `negativeAnchors: string[]` ("no shifting hair color, no extra fingers, no logo drift, no text artifacts").
- Merge into every `imageSpec.negatives` in `image-spec.ts:248-307`.

### 2.6 CLIP-similarity quality gate
- After image generation, compute CLIP similarity between each generated frame's character region and the canonical asset sheet. Below threshold → auto re-roll up to 2× before continuing. Cheap insurance against bad rolls before we spend money on I2V.

**Wave 2 exit criteria:** named characters look like the same person across every scene. Stories have intentional structure and tighter middles.

---

## Wave 3 — Motion, composition & polish (3–5 days)

Goal: cinematic feel — intentional camera grammar, real transitions, varied shot composition.

### 3.1 Motion Director sees `endImageUrl`
- `src/worker/pipeline/generateFrameVideos.ts:60` already resolves the next frame as `endImageUrl` for supporting models. Plumb that signal *upstream* into `generateMotion.ts` / `motion.ts:70-165` so the Motion Director writes a trajectory ending at the next frame's pose, not free-form motion the model has to bend.

### 3.2 Camera grammar by section
- In `motion.ts`, derive default camera move from beat type: hook → push-in / handheld; escalation → lock-off; turn → dolly; payoff → pull-out.
- Override allowed but logged.

### 3.3 VO-tempo coupling
- `motion.ts:79`: incorporate VO words/sec (already available from ElevenLabs timestamps) into motion-policy resolution. Inverse-correlate: dense VO → calmer motion; sparse VO → more dynamic motion.

### 3.4 Two-beat motion for hook/climax frames
- Extend `frameMotionSpec` in `motion.ts:13-39` to optionally accept `beats: [primary, secondary]`. Only allowed when frame's beat type ∈ {hook, turn, payoff} and clip duration ≥ 8s.

### 3.5 Real transitions in composer
- `src/server/services/composer.ts:223`: ship a small set: cross-dissolve (default on emotional turns), hard cut (default on action), match-cut/whip-pan when `frame.endState` aligns with next frame's opening pose (the data is already there, just unused at composition time).

### 3.6 Shot-type budget in storyboard
- `src/server/services/llm/storyboard.ts`: enforce a per-N-scenes shot-type quota (1 establishing, 2 close-ups, 1 OTS, 1 detail insert). Prevents the "all medium shots" drift.
- Cinematographer sets DOF + focal length deliberately per scene mood instead of defaulting.

### 3.7 SFX layer
- Add a small library (whooshes, impacts, room tone) under `public/sfx/`.
- `composer.ts`: insert whoosh on whip-pan transitions, soft impact on hard cuts, room-tone bed under VO. Storyboard already marks transition points.

**Wave 3 exit criteria:** cuts feel intentional, motion is varied but coherent across the timeline, the soundscape has depth.

---

## Cross-cutting

- **Migrations:** `videoProjects.seed`, `projectAssets` table, `videoProjects.beatSheet` (jsonb), `videoProjects.qualityTier`.
- **Tests:** snapshot tests for the BeatSheet schema, prompt-merge logic in `image-spec.ts`, and the new caption grouper. Keep `vitest.config.ts` clean.
- **Telemetry:** log seed, model versions, CLIP scores, critic scores per project so we can compare runs objectively rather than vibes-only.
- **Backward compat:** new fields default to old behavior so in-flight projects don't break.

---

## Recommended starting point

Wave 1 in one PR — mostly mechanical, low-risk, gives us a deterministic baseline to A/B Wave 2 and 3 changes against.
