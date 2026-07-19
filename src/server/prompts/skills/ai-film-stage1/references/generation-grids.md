# Generation Grids — motion sheets, continuity anchoring, approval, registry (Stage 1 Step 10)

**This file is the canonical home for all grid sizing, chaining, skip, and registry rules.** Prerequisites: locked shot list with full scene continuity blocks (Delta / Coverage / Space / Axis / Blocking / Fixed props, plus the scene header's lighting states), locked Bible, APPROVED asset images.

## The unit

A scene is a dramatic unit (often 30–60s); a Seedance generation caps near 15s. One scene therefore owns **one motion sheet per shot**, and every sheet maps to exactly one video generation. One sheet holds one shot only — scene-spanning boards are not a render input in this pipeline.

**Scene continuity is carried by two things, neither of which is a separate generated artifact:**

1. **The scene header's continuity block (text, locked at Step 7):** geography, blocking, camera axis / 180° line, screen direction, lighting progression across the scene, fixed props. Honor it in every sheet prompt.
2. **Image anchors:** the location plate (identity of the space), **the scene's first APPROVED motion sheet** (scene-specific blocking and geography — its establishing/wide panels lock what the plate can't), and the **prior sheet's terminal panel** (shot-to-shot footing), upgraded to the prior render's last frame once that clip is approved.

**Lighting change ≠ scene boundary.** A scene may list multiple lighting states in order; each row still carries exactly ONE. Split scenes on location / discontinuous time / geography — not on a lighting progression that the Bible already schedules inside one scene. Match-cut pairs that only change light or scheduled screen content stay in the same scene.

## Motion-sheet contract

ONE photoreal image = exactly one uninterrupted shot. Shared latent → coherent identity, geography, lighting, and a **continuous camera trajectory** across panels. Purpose: approve the shot's motion path at image price before video spend.

| Panel              | Role                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Panel 1**        | Exact **cut-in** state. Continuous later sheets inherit footing/geography/screen direction from the prior sheet's Pn (or the prior render's last frame); scene opens inherit from the continuity block + row cut-in. |
| **Panels 2…(n−1)** | Real action/camera **milestones only** — each adjacent pair must show a **visible pose/position delta** (including background figures). Near-duplicates and invented motion are regeneration triggers. |
| **Panel n**        | Exact **cut-out** state of THIS shot — what the next sheet's Panel 1 must match.                                                                                                                         |

- **Panel count 4–9**, tied to duration: ~1 milestone per 1.5–2s of estimated Dur (e.g. 8s ≈ 5–6 panels; 12s ≈ 7–8). More (toward 9) for motion-rich / timing-critical arcs, fewer (toward 4) for short connective beats — never pad with near-identical panels.
- **Estimated Dur ≤15s; prefer 8–12 for multi-beat arcs, 4–6 for single-beat connective shots** — this estimate becomes the API duration parameter. Match Dur to beat density (~1 real beat / 2–3s); a single verb over 10s reads as slo-mo downstream.
- **Visible pose deltas required** between adjacent panels for every human figure in frame (heroes and extras). Near-identical adjacent panels interpolate into near-static video.
- Reading order left-to-right, top-to-bottom; same character, environment, lighting state throughout; panels in 16:9 — the show's fixed aspect ratio (the tool's `aspectRatio` default; never pass another value).
- The approved STILL has thin white gutters so humans can read panels; the eventual VIDEO is one continuous take — the Seedance prompt says to interpolate between panel states, no cuts, never showing grid or gutters.

**Cross-shot chain (later sheets in a scene) — pick exactly one mode:**

1. **Continuous:** `previousGenerationId` + `incomingAnchorHandle` + `incomingAnchorKind: prior_grid_terminal_panel` + `incomingAnchorPanel` (attach that sheet in `referenceImageUrls`), upgrading to `prior_render_last_frame` once the prior clip is approved.
2. **Break:** `continuityBreakReason` (hard cut / time jump / new axis) with previous/anchor fields omitted — deliberate, recorded. Scene anchor still attaches.
3. **Match-cut (break with declared source):** `matchCutSourceGenerationId` + `matchCutSourceHandle` — compositional twin (identical framing; only a scheduled element or lighting state differs). Omit previous/incoming anchors. Attach the source sheet in `referenceImageUrls`. Allowed on first-in-scene for a cross-scene twin. Use this when a lighting-state change (or other scheduled delta) severs footing continuity but Bible §4 still names a match-cut pair.

A different location breaks the chain (usually a scene boundary). Cross-shot motion joins additionally use Stage 2 `extend_video` + footing locks.

## The sheet prompt formula

Assembled from locked artifacts only:

1. **References attached**: character ref(s) earliest, then object refs (hero props/vehicles named in this shot's motion arc), then location plate, then the scene anchor (the scene's first approved sheet — omit on the first sheet itself), then the incoming anchor (continuous later sheets) or match-cut source (match-cut mode). Open with verbatim Bible §2 SUBJECT DEFINITIONS. Label the scene anchor and prior-sheet / match-cut anchors as **continuity geography / cut-in / compositional anchors only**.
2. **Layout spec** (mandatory): `"[N] panels (N between 4 and 9), each an individual 16:9 frame, arranged in a [layout] grid reading left-to-right, top-to-bottom, with thin uniform white gutters. NO text, NO captions, NO panel numbers, NO borders drawn inside frames."`
3. **Per panel** (enumerated "Panel 1: …"): Panel 1 = cut-in moment + Scale + composition (from prior Pn / continuity block / row / match-cut source); middle = real milestones with **readable pose/position deltas** from the previous panel (heroes and any background figures); Panel n = cut-out prepared for the next shot.
4. **Novelty / beat clause**: this shot's continuous dramatic beat as a **2–4 beat arc** (from the scene's Delta line + row) — not a single verb; match beat count to Dur.
5. **Continuity + motion instruction**: `"All panels depict the SAME uninterrupted shot — same characters, environment, lighting, and continuous camera trajectory. Reading order is left-to-right, top-to-bottom. Panel 1 is the cut-in; Panel N is the cut-out; middle panels are milestones only. Interpolate naturally between these states; one continuous take; no cuts."` With an incoming anchor: `"Panel 1 continues from the incoming anchor — same footing, screen direction, and geography."` With a match-cut source: `"Panel 1 matches the match-cut source framing/lens/position — only the scheduled delta differs."`
6. **The Look** as grade/lens character. ONE lighting state per sheet (`lightingState` on the tool call). A lighting transition as the beat itself is rare: set `lightingTransitionException=true` + reason citing the locked row / Bible §3D — never a silent contradiction with §3C. Geography, axis, and screen direction wording comes from the scene's continuity block.

**Layout geometry:** 4 → 2×2; 5–6 → 3 columns (wrap L→R, T→B); 7–9 → 3×3 region (wrap).

## Skips (narrow, only during Step 10)

Four `skip_reason` values. The model may PROPOSE: (1) `insert_only_scene`; (2) `lone_establishing_scene`. Only the USER may elect: (3) `environment_no_grid_tooling`; (4) `grid_generation_failed` (after ~3 documented failed regenerations). A missing sheet is never a skip. Scenes with two+ non-insert shots, or with blocking/eyelines/screen direction/prop geography/cut handoffs, are outside model-proposed skipping. Skip entries still list the `shot_ids` they cover.

## Failure catalog (regenerate vs. repair)

| Failure                | Symptom                                                   | Response                                                                                                                   |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Panel bleed            | An element crosses a gutter; two panels merge             | Regenerate — strengthen the layout spec                                                                                    |
| Identity wobble        | Face/wardrobe differs in far panels                       | Regenerate with fewer panels                                                                                               |
| In-frame text          | Numbers/captions/lettering inside panels                  | Regenerate; move the NO-text clause later and repeat it                                                                    |
| Order ignored          | Panels out of sequence                                    | Regenerate with more explicit per-panel enumeration                                                                        |
| Geometry contradiction | A landmark/prop switches sides                            | Check the continuity block — ambiguous headers/rows get fixed first (backflow), else regenerate citing geography per panel |
| Wrong panel ratio      | Square/portrait panels despite the spec                   | Regenerate with the ratio stated per panel                                                                                 |
| Filler milestones      | Near-duplicate middles, invented motion, or no readable pose delta between adjacent panels | Regenerate with fewer panels or stronger per-panel deltas; real pose/position changes only |
| Frozen extras          | Background / unbound figures identical across panels (heroes move, extras don't) | Regenerate naming group motion per panel for every human in frame |
| Over-budget duration   | Estimated Dur >15s                                        | Shorten the row or split the beat into two shots first                                                                     |
| Thin beat density      | Single-verb arc over a long Dur (e.g. one action across 10–12s) | Enrich to 2–4 beats or shorten Dur to 4–6s                                                                                |
| Row mismatch           | A panel contradicts its shot row                          | Regenerate from the row; a wrong ROW backflows first                                                                       |
| Missing prior anchor   | Later sheet lacks chain, break, or match-cut fields       | Reject — set continuous fields, break reason, or match_cut_source_*                                                        |
| Continuity drift       | Sheet geography fights the scene anchor or prior Pn       | Strengthen the anchor binds in the sheet prompt; a wrong first sheet regenerates first (it anchors the whole scene)        |
| Hard-cut look          | Panels read as separate shots                             | Strengthen continuous-trajectory + interpolate wording; reduce panel count                                                 |
| Multi lighting         | Sheet / captions imply two lighting states without flag   | Reject unless `lightingTransitionException` is set and the row's point is the transition                                   |

Repair happens in prompts and rows, never in pixels, and "close enough" geometry is a reject. **The scene's FIRST sheet deserves extra scrutiny** — it becomes the geography anchor for every later sheet in the scene, so approve it only when its wide/establishing panels genuinely lock the blocking. If the same failure survives ~3 regenerations, STOP and present: (a) user APPROVES the best partial candidate with flaws named, or (b) user ELECTS `skip_reason: "grid_generation_failed"`.

## Approval protocol

One candidate per shot (staging is locked in the prompt — not a choose-among gallery). Always pass `panelCount`, `panelCaptions` (same length), `shotIds` (exactly one shot), and `lightingState` on `generateGenerationGrid` — the app rejects mismatches before image generation.

**Vision at generation time:** when the tool result carries `vision_status:attached`, pre-screen the pixels in that turn (ONE lighting state, panel roles, continuity). Never claim a vision check on `vision_status:unverifiable`. The UI Approve-grid button (`grid_approval`) is the only approval — **never** spawn `askQuestions` for sheet approval.

**Before presenting a sheet, confirm:** chain / break / match-cut fields set (later sheets); the scene anchor attached (later sheets); Dur estimate in range and matched to beat density (~1 real beat / 2–3s); Panel 1 / Pn handoff roles correct; middles are real milestones with readable pose/position deltas for every figure (extras included — no frozen extras); every panel matches its row (cast/state/ratio) and the scene's continuity block; ONE lighting state (or explicit transition exception).

**Backflow:** spoken edits flow INTO THE ROW (or the scene's continuity block) first, then the image regenerates — headers and rows stay current with pixels.

Approved sheets bind to `@scene{N}_gen{generationId}_grid`.

## Generation Grid Registry (app-validated)

After each approval or skip, call `recordGenerationGridEntry` with one entry — the app validates and stores it (registry JSON is never authored freeform in chat). Field casing: `generateGenerationGrid` inputs are camelCase; stored registry entries (and this table) are snake_case — `recordGenerationGridEntry` accepts either. Step 10 is complete when every shot appears in exactly one passing entry. Stage 2 preflight reads the stored registry.

| Field                            | Required                | Notes                                                                                          |
| -------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `scene_id`                       | yes                     | Scene number                                                                                   |
| `generation_id`                  | yes                     | e.g. `3A`                                                                                      |
| `shot_ids`                       | yes                     | Exactly one shot for `approved_grid`; skip entries may cover several                           |
| `estimated_duration_seconds`     | if approved             | 4–15 for `approved_grid`; skips: total seconds covered (any positive) or null                  |
| `status`                         | yes                     | `approved_grid` \| `skip_recorded`                                                             |
| `grid_handle`                    | if approved             | `@scene3_gen3A_grid`                                                                           |
| `approved_candidate_id`          | if approved             | Storage key or media URL of the approved sheet image (from `grid_approval`) — **not** a toolCallId |
| `skip_reason`                    | if skipped              | One of the four reasons above                                                                  |
| `panel_count`                    | if approved             | 4–9                                                                                            |
| `lighting_state`                 | optional on record      | Canonical Bible lighting state; auto-filled from generate when omitted. Required on `generateGenerationGrid` |
| `lighting_transition_exception`  | if in-shot transition   | `true` only when the locked row's point IS the transition; needs `lighting_transition_reason`  |
| `lighting_transition_reason`     | with exception          | Cite locked row / Bible §3D                                                                    |
| `scene_anchor_handle`            | later gens in scene     | The scene's FIRST approved sheet handle (omit on first-in-scene)                               |
| `is_first_in_scene`              | yes                     | `true` only for the scene's first generation (forbids chain/break fields; match-cut OK)        |
| `previous_generation_id`         | if continuous later gen | Prior `generation_id` in this scene                                                            |
| `incoming_anchor_handle`         | with previous           | Prior sheet handle or prior last-frame handle/URL                                              |
| `incoming_anchor_kind`           | with previous           | `prior_grid_terminal_panel` \| `prior_render_last_frame`                                       |
| `incoming_anchor_panel`          | if terminal panel       | Prior sheet's LAST panel number                                                                |
| `continuity_break_reason`        | if break                | Set instead of previous + incoming anchors (scene anchor still attaches)                       |
| `match_cut_source_generation_id` | if match-cut            | Declared twin `generation_id` (with `match_cut_source_handle`; no previous/incoming)           |
| `match_cut_source_handle`        | if match-cut            | Source sheet handle or approved image URL                                                      |

## Consumption (Stage 2 — pointer)

How compiled prompts consume sheets — COMPOSITION LOCK / END STATE LOCK, interpolate language, slot order, `extend_video` upgrades — lives in `shot-compilation-recipe.md`. During Stage 1, record entries; consumption comes later.
