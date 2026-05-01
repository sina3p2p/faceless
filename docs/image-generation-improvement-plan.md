# Image Generation Improvement Plan

This is a planning document. No code changes yet — it captures the proposed direction so we can sequence the work later.

Scope: image generation only. The broader video-quality plan (story, motion, composer, audio) is tracked separately.

Current pipeline reference points:
- `src/server/services/media.ts` — provider implementations (DALL·E 3, GPT-Image 1.5/2, Gemini 3.1 Flash)
- `src/server/services/llm/image-spec.ts` — typed image spec + prompt serializer
- `src/server/services/llm/cinematographer.ts` — visual style guide and per-scene overrides
- `src/server/services/story-asset-tools.ts` — character/asset reference sheets
- `src/worker/pipeline/generateFrameImages.ts` — pipeline stage

---

## 1. Model selection & routing

Current default is DALL·E 3 (`media.ts:53-79`): weak prompt fidelity, no seed, no reference-image conditioning.

- Default to **Flux 1.1 Pro Ultra** (Fal/Replicate) for hero frames, **Flux Schnell** for drafts.
- Use **Gemini 3 Image** or **Flux Kontext** for any scene with named characters (real image-ref conditioning).
- Add a model router keyed by scene type:
  - Photoreal characters → Flux Kontext (with assetRef)
  - Stylized / illustrated → Flux Pro + style LoRA
  - Abstract / typography / inserts → Imagen 4 or GPT-Image 2
- Route in `media.ts` based on `imageSpec.style` + presence of `assetRef`.
- Keep DALL·E 3 / GPT-Image as fallback only.

## 2. Prompt construction

`image-spec.ts:248-307` flattens the spec at equal weight and ignores model-specific syntax.

- **Weighted regions** for SD/Flux-family models: subject `:1.2`, action `:1.1`, environment `:0.9`, style `:1.0`. Skip for DALL·E/Gemini.
- **Lead with the noun phrase.** Reorder to `[subject] [action] [shot] [environment] [lighting] [style] [negatives]` with the most important descriptors front-loaded.
- **Per-model prompt rewriter.** Same `ImageSpec` → different surface prompt per model. Helper: `serializeFor(spec, modelKey)`.
- **Negative prompts as first-class.** Use the model's actual negative-prompt API field where supported (Flux, SDXL on Replicate/Fal) instead of appending text.
- **Banned-token list** per project: artifact phrases ("text in image", "watermark", "extra fingers", "deformed", "blurry") merged in automatically.

## 3. Character & style consistency

- **Single canonical reference sheet per character**, frozen on the project.
- **Multi-view sheet, not single image.** Generate the canonical sheet as a 4-panel: front / 3-quarter / profile / expressive close-up. Pass the panel matching the scene's shot angle as the reference. Most "character drift" is angle drift the model can't recover from.
- **LoRA training for hero series** (opt-in tier): for projects rendering many videos with the same character, fine-tune a Flux LoRA on the canonical sheet (Fal supports LoRA training in ~5 min). One-time cost, total lock.
- **Style LoRA / style image** alongside character ref: many models accept a separate `style_image_url`. Wire `cinematographer.ts` style guide to a small library of style references (cinematic / claymation / illustrated / 35mm) and pass them on every call.
- **Seed locking** — same character seed across all frames in a project (planned in the foundations wave).
- **CLIP-similarity gate** before spending I2V money on a bad image.

## 4. Composition & framing

- **Aspect-aware prompts.** State the aspect explicitly in the prompt text ("vertical 9:16 composition, headroom above subject"), not just as an API param.
- **Rule-of-thirds / headroom hints** when the shot type is close-up or medium — prevents the "forehead crop" problem common in 9:16.
- **Shot-type budget** (planned for storyboard) directly improves image variety: storyboarder forces variety, image generator executes.
- **Lens & DOF actually used.** `image-spec.ts` has fields for focal length and DOF — currently optional and often empty. Make the cinematographer set them per scene mood (35mm + shallow DOF for intimate, 24mm + deep DOF for establishing).

## 5. Multi-sample + selection

Single-shot generation is wasteful given how cheap images are vs. I2V.

- **Generate N=2-4 candidates per frame** for hero scenes (configurable per quality tier).
- **Auto-rank candidates** by:
  - CLIP similarity to canonical character sheet
  - Aesthetic score (LAION aesthetic predictor — free, CPU)
  - Prompt-image alignment (CLIP text↔image score)
- Pick top candidate; surface losers in the UI for manual override.
- Draft tier: N=1, no scoring. Hero tier: N=4 + scoring.

## 6. Post-processing

Deterministic finishing pass before images go to I2V:

- **Upscale** to render resolution with a real upscaler (Real-ESRGAN / Topaz / Clarity Upscaler on Replicate) instead of relying on the I2V model to scale.
- **Face restoration** (CodeFormer / GFPGAN) when the shot is medium or closer — fixes most "uncanny face" issues at near-zero cost.
- **Auto-color-match** images within a scene to a reference frame (ffmpeg `colormatch` or histogram match) so I2V output stays consistent if it drifts.
- **Optional film grain / halation** pre-pass for cinematic tone — better added at image stage than composer because I2V will preserve it across motion.

## 7. Failure handling

`generateFrameImages.ts` currently logs and continues on failure, silently degrading videos.

- **Bounded retry with prompt simplification.** First retry: same prompt, new seed. Second: trimmed prompt (drop secondary subjects, keep core). Third: fallback model.
- **Hard fail** the project rather than ship a missing-frame compose. Better to fail loud than ship broken.
- **Surface per-frame status** in the project UI so users can re-roll individual frames.

## 8. Validation & metrics

- Log per image: model, seed, prompt token count, CLIP score vs character sheet, aesthetic score, generation time, retries.
- Dashboard the trends so we can tell if a model swap actually improved quality vs. vibes.

---

## Sequencing

- **Foundations wave:** seed locking, banned-token list, aspect-aware prompts, bounded retry. Cheap, unblocks everything.
- **Consistency wave:** model router + Flux/Gemini default, multi-view canonical sheet, image-ref on every frame, CLIP-gate, per-model prompt rewriter, multi-sample + ranking for hero tier.
- **Polish wave:** upscale + face restoration, color-match within scenes, optional LoRA training tier, lens/DOF enforcement.

## Top 3 if we only do three

1. **Model router** — switch default off DALL·E to Flux Pro / Gemini 3 Image based on scene needs.
2. **Multi-view canonical character sheet + ref-image on every frame** — kills character drift more than any other single change.
3. **Multi-sample + CLIP/aesthetic ranking for hero tier** — converts "model rolled badly" failures into the cost of a few extra cheap calls instead of a re-render.

Prerequisite: model router + seed locking should land first since they unblock the rest.
