# Video Model Prompt Research

Per-model prompt tuning for the i2v models we ship. The Motion Director LLM
emits a structured `FrameMotionSpec`; `compileMotionPrompt(spec, modelId)` then
serializes it into the single text prompt the provider receives. This doc
captures **why** each model gets a different compiler.

Three models have first-class custom compilers (Seedance 2, Kling v2.5 Turbo
Pro, Pixverse V6). Every other model uses `compileDefault` — the legacy generic
template that has worked acceptably across Veo, Kling 3, Runway/Luma, and Grok.

---

## ByteDance Seedance 2.0 (`seedance-2-pro`, `seedance-2-fast`)

### What it's good at
- Best-in-class prompt adherence on the Artificial Analysis I2V leaderboard —
  beats Veo 3 and Kling 2 by a wide margin.
- Multi-shot timeline reasoning. Uniquely respects sequential beats inside a
  single prompt (`Start: … Then: … End: …`); other models collapse beats.
- Strong cinematography vocabulary (dolly, tracking, orbit, crane, rack focus,
  handheld) and pacing modifiers (slow / gentle / smooth).
- Lighting words have outsized impact on quality. "If you can only add one
  element, add lighting."
- Stable identity for ≤8s clips when the prompt focuses on motion (not on
  re-describing the subject the image already supplies).

### Failure modes
- Identity / exposure drift past ~8 seconds. 10–15s clips are noticeably worse
  than 5–6s.
- Warps when motion reveals unseen surfaces (back of head, hidden hand,
  underside of product).
- Compound camera moves break it ("dolly in while panning while tilting").
- Negatives are interpreted positively unless rephrased. `no warping` can
  *trigger* warping; convert to positive form.
- End-frame morphs when the two frames differ in framing or subject.

### Compiler strategy
- Period-separated short declarative sentences (the model parses them as beats).
- Drop the `Smooth continuous motion throughout —` prefix; replace it with a
  positive-form anchor at the end (`Stable identity, natural proportions,
  clean edges throughout.`) instead of a negative list.
- Convert `negativeMotion` into a fixed positive constraint clause; do not echo
  the LLM's negative wording verbatim.
- Sweet spot length: 35–80 words. The compiler avoids padding.

### Sources
- arXiv 2506.09113 (Seedance 1.0 technical report)
- promeai.pro/blog/seedance-2-0-image-to-video-best-practices
- promeai.pro/blog/seedance-2-0-prompt-constraints-flicker-warp
- mindstudio.ai/blog/timeline-prompting-seedance-2-cinematic-ai-video
- seedance-2ai.org/blog/ai-video-first-last-frame-guide
- wavespeed.ai/blog/posts/blog-seedance-2-0-prompt-template
- redreamality.com/blog/seedance-2-guide
- blog.segmind.com/seedance-vs-kling-vs-veo-comparison

---

## Kling v2.5 Turbo Pro (`kling-v2.5-turbo-pro`)

### What it's good at
- Highly dynamic motions and physics realism — the headline 2.5 release
  (2025-09-19) targeted gymnastics, dance, balance.
- Faithful camera-language interpretation: `dolly in`, `Dutch angle`,
  `medium shot`, `tracking shot`, `crash zoom` map to learned behaviors.
- Better adherence on multi-step / causal instructions vs 2.1 (`first … then
  … finally`).
- Strong start-frame fidelity — color, lighting, texture, atmosphere are
  preserved more reliably than 2.1.
- 2× faster, ~30% cheaper than 2.1, with no quality cut vs 2.1.

### Failure modes
- Hands and fingers degrade with fast motion — merging fingers, extra digits.
  Mitigated by *slowing* the described motion, not by long negatives.
- Identity / face drift past ~60° head turn in I2V.
- Multi-subject crowding — >1 subject doing distinct actions blends them.
- More aggressive content rejection than 2.1.
- Element overload: best with **3–4 scene elements max**. Cramming more
  produces inconsistent results.

### Compiler strategy
- Kuaishou's official formula:
  `Subject + Subject Movement + Scene + (Camera Language + Lighting + Atmosphere)`.
  We don't carry Lighting/Atmosphere fields, so we structure what we have using
  Kling's preferred labelled-clause format.
- Inject a pacing word (`slowly`, `gradually`) into `primaryAction` if the LLM
  didn't already emit one — pacing is the documented finger/face mitigation.
- Use labelled clauses: `Camera: …  Ending: …  Avoid: …` — matches Kuaishou's
  own example format and parses cleanly.
- Keep negatives short (5–8 terms). Long negative lists over-constrain.
- Sweet spot length for I2V: 20–40 words. We trim ruthlessly.

### Sources
- ir.kuaishou.com — Kling 2.5 Turbo press release
- app.klingai.com/global/release-notes/2025-09-19
- kling.ai/blog/kling-ai-prompt-guide (official formula)
- kling.ai/blog/fix-ai-video-drift-consistency-guide
- kling.ai/blog/ai-image-to-video-quality-optimization-guide
- atlabs.ai/blog/kling-2-5-turbo-prompting-guide
- veed.io/learn/kling-2-5-turbo-prompts
- glbgpt.com/resources/kling-ai-camera-movements-explained
- videoai.me/blog/kling-ai-troubleshooting

---

## Pixverse V6 (`pixverse-v6`)

### What it's good at
- Strongest-in-class explicit camera control via natural language. V6 ships
  20+ cinematic lens controls (focal length, aperture, DoF, lens distortion).
- Holds 15s @ 1080p as a single coherent generation without the inter-clip
  drift that plagued V4/V5 stitched workflows.
- Excellent first-frame fidelity for I2V — analyzes subject/environment/
  lighting before generating motion.
- Stylized output (anime, 3d_animation, clay, comic, cyberpunk) is a
  documented strength.
- Rewards literal-descriptive prompts; no need for metaphor.

### Failure modes
- Photoreal re-roll rate ~3.2 per usable clip vs 1.4 (Kling 3.0) / 1.3
  (Runway Gen-4.5).
- Hands and small anatomy break — extra fingers, distorted hands.
- Camera direction obedience is asymmetric: pull-back / rise / dolly-in /
  push-in work; **rightward pans are frequently ignored**; whip pans and
  exotic moves degrade.
- Multi-subject "clone army" + face-morphing on long durations.
- Text/signage rendering unreliable.
- Burying negatives in the positive prompt actually *hurts* — V6 has a real
  `negative_prompt` field that should be used separately.

### Compiler strategy
- Drop `Smooth continuous motion throughout —` prefix entirely. V6's default
  `motion_mode: normal` already does this; the phrase wastes prompt budget and
  can flatten intentional action.
- Drop `Ending: …` entirely. V6 has no end_image and no terminal-frame
  conditioning; explicit ending instructions confuse the sequential parser.
  Trajectory should be encoded into the action verb itself.
- Drop the inline `Avoid: …` clause. We do not currently thread
  `negative_prompt` through the Replicate provider; once we do, the negatives
  belong in that separate field. Until then, dropping is better than burying.
- Echo the subject from the image in the opening clause (the V6 5-part
  structure: `Subject + Action + Atmospheric motion + Camera + Style/Mood`).
  We don't carry an explicit subject field, so we lead with `primaryAction`
  and trust that the LLM names the subject in it.
- Sweet spot length: 40–90 words.

### Follow-ups
- **Done:** static `negative_prompt` baselines for Pixverse and Kling v2.5 are
  threaded through the Replicate provider (`NEGATIVE_PROMPTS` constant in
  `replicate.ts`). The dynamic `spec.negativeMotion` is intentionally not
  persisted — adding a frames-table column wasn't justified vs the static
  baseline, and the motion-director system prompt already steers the spec
  away from each model's documented failure modes.
- *Skipped:* Kling `cfg_scale` override (default 0.5 is correct; we have no
  reliable signal for when to raise to 0.7 for stricter start-frame fidelity).
- *Skipped:* Pixverse `cameraMove` regex whitelist. The profile's `avoid`
  block already tells the motion-director LLM to skip `pan right` / `whip
  pan` / `dolly zoom`; post-hoc regex mangling adds risk for marginal gain.

### Sources
- pixverse.ai/en/blog/pixverse-launches-v6-advancing-ai-video-generation
- pixverse.ai/en/blog/pixverse-v6-ai-video-generator-review
- docs.platform.pixverse.ai/v6-released-2056814m0
- docs.platform.pixverse.ai/how-to-use-image-to-video-882971m0
- wavespeed.ai/blog/posts/pixverse-v6-ai-video-camera-control-vfx-2026
- runware.ai/docs/models/pixverse-v6
- pixeldojo.ai/guides/pixverse-v6
- veed.io/learn/pixverse-prompting-guide
- shareuhack.com/en/posts/ai-video-generation-tools-comparison-2026

---

## Default compiler (Veo 3.1, Kling 3.0 Std/Pro, Runway Gen-4 / Gen-4.5, Grok)

The legacy `Smooth continuous motion throughout — {primaryAction}
{subjectDynamics} Camera: {cameraMove} Ending: {endState} Avoid:
{negativeMotion}` format. Works acceptably across these models; tuning can be
added per-model later if data warrants it.

Per-model strengths/weaknesses still flow through the Motion Director system
prompt via `motion-model-profiles.ts` — the agent shapes the spec around each
model's quirks even when the compiled prompt uses the default format.
