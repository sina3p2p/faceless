# Generation Grids — motion sheets, continuity anchoring, approval, registry (Stage 1 Step 10)

**This file is the canonical home for all grid sizing, chaining, skip, and registry rules.** Prerequisites: locked shot list with full scene continuity blocks (Delta / Coverage / Space / Axis / Lighting progression / Fixed props), locked Bible, APPROVED asset images.

## The unit

A scene is a dramatic unit (often 30–60s); a Seedance generation caps near 15s. One scene therefore owns **one motion sheet per shot**, and every sheet maps to exactly one video generation. One sheet holds one shot only — scene-spanning boards are not a render input in this pipeline.

**Scene continuity is carried by two things, neither of which is a separate generated artifact:**

1. **The scene header's continuity block (text, locked at Step 7):** geography, blocking, camera axis / 180° line, screen direction, lighting progression across the scene, fixed props. Honor it in every sheet prompt.
2. **Image anchors:** the location plate (identity of the space), **the scene's first APPROVED motion sheet** (scene-specific blocking and geography — its establishing/wide panels lock what the plate can't), and the **prior sheet's terminal panel** (shot-to-shot footing), upgraded to the prior render's last frame once that clip is approved.

## Motion-sheet contract

ONE photoreal image = exactly one uninterrupted shot. Shared latent → coherent identity, geography, lighting, and a **continuous camera trajectory** across panels. Purpose: approve the shot's motion path at image price before video spend.

| Panel              | Role                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Panel 1**        | Exact **cut-in** state. Continuous later sheets inherit footing/geography/screen direction from the prior sheet's Pn (or the prior render's last frame); scene opens inherit from the continuity block + row cut-in. |
| **Panels 2…(n−1)** | Real action/camera **milestones only** — near-duplicates and invented motion are regeneration triggers.                                                                                                              |
| **Panel n**        | Exact **cut-out** state of THIS shot — what the next sheet's Panel 1 must match.                                                                                                                                     |

- **Panel count 4–9**; more (toward 9) for motion-rich / timing-critical arcs, fewer (toward 4) for simple connective beats.
- **Estimated Dur ≤15s, prefer 8–12** — this estimate becomes the API duration parameter.
- Reading order left-to-right, top-to-bottom; same character, environment, lighting state throughout; panels in the film's TRUE aspect ratio.
- The approved STILL has thin white gutters so humans can read panels; the eventual VIDEO is one continuous take — the Seedance prompt says to interpolate between panel states, no cuts, never showing grid or gutters.

**Cross-shot chain (later sheets in a scene):** every sheet after the first binds (1) the scene's first approved sheet as the scene anchor, and (2) the prior sheet's terminal panel via `previousGenerationId` + `incomingAnchorHandle` + `incomingAnchorKind: prior_grid_terminal_panel` + `incomingAnchorPanel` (attach that sheet in `referenceImageUrls`), upgrading to `prior_render_last_frame` once the prior clip is approved. The alternative is an explicit `continuityBreakReason` (hard cut / time jump / new axis) with previous/anchor fields omitted — a deliberate choice, recorded. A different location breaks the chain (usually a scene boundary). Cross-shot motion joins additionally use Stage 2 `extend_video` + footing locks.

## The sheet prompt formula

Assembled from locked artifacts only:

1. **References attached**: character ref(s) earliest, then location plate, then the scene anchor (the scene's first approved sheet — omit on the first sheet itself), then the incoming anchor (continuous later sheets). Open with verbatim Bible §2 SUBJECT DEFINITIONS. Label the scene anchor and prior-sheet anchor as **continuity geography / cut-in anchors only**.
2. **Layout spec** (mandatory): `"[N] panels (N between 4 and 9), each an individual [film aspect] frame, arranged in a [layout] grid reading left-to-right, top-to-bottom, with thin uniform white gutters. NO text, NO captions, NO panel numbers, NO borders drawn inside frames."`
3. **Per panel** (enumerated "Panel 1: …"): Panel 1 = cut-in moment + Scale + composition (from prior Pn / continuity block / row); middle = real milestones; Panel n = cut-out prepared for the next shot.
4. **Novelty / beat clause**: this shot's continuous dramatic beat (from the scene's Delta line).
5. **Continuity + motion instruction**: `"All panels depict the SAME uninterrupted shot — same characters, environment, lighting, and continuous camera trajectory. Reading order is left-to-right, top-to-bottom. Panel 1 is the cut-in; Panel N is the cut-out; middle panels are milestones only. Interpolate naturally between these states; one continuous take; no cuts."` With an incoming anchor: `"Panel 1 continues from the incoming anchor — same footing, screen direction, and geography."`
6. **The Look** as grade/lens character. ONE lighting state per sheet (a lighting transition as the beat itself is rare and must be the locked row's point). Geography, axis, and screen direction wording comes from the scene's continuity block.

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
| Filler milestones      | Near-duplicate middles or invented motion                 | Regenerate with fewer panels; real deltas only                                                                             |
| Over-budget duration   | Estimated Dur >15s                                        | Shorten the row or split the beat into two shots first                                                                     |
| Row mismatch           | A panel contradicts its shot row                          | Regenerate from the row; a wrong ROW backflows first                                                                       |
| Missing prior anchor   | Later sheet lacks previous/anchor fields and break reason | Reject — set the chain fields or document the break                                                                        |
| Continuity drift       | Sheet geography fights the scene anchor or prior Pn       | Strengthen the anchor binds in the sheet prompt; a wrong first sheet regenerates first (it anchors the whole scene)        |
| Hard-cut look          | Panels read as separate shots                             | Strengthen continuous-trajectory + interpolate wording; reduce panel count                                                 |

Repair happens in prompts and rows, never in pixels, and "close enough" geometry is a reject. **The scene's FIRST sheet deserves extra scrutiny** — it becomes the geography anchor for every later sheet in the scene, so approve it only when its wide/establishing panels genuinely lock the blocking. If the same failure survives ~3 regenerations, STOP and present: (a) user APPROVES the best partial candidate with flaws named, or (b) user ELECTS `skip_reason: "grid_generation_failed"`.

## Approval protocol

Present candidates per shot differing in STAGING (blocking, camera path, milestone choice), not rendering luck. Always pass `panelCount`, `panelCaptions` (same length), and `shotIds` (exactly one shot) on `generateGenerationGrid` — the app rejects mismatches before image generation. The UI shows a caption strip; the user approves the **motion path**, not final pixels, via the Approve-grid button (`grid_approval` tool result).

**Before presenting a sheet, confirm:** chain fields or break reason set (later sheets); the scene anchor attached (later sheets); Dur estimate in range; Panel 1 / Pn handoff roles correct; middles are real milestones; every panel matches its row (cast/state/ratio) and the scene's continuity block — mismatches are rejected before the user sees them; ONE lighting state.

**Backflow:** spoken edits flow INTO THE ROW (or the scene's continuity block) first, then the image regenerates — headers and rows stay current with pixels.

Approved sheets bind to `@scene{N}_gen{generationId}_grid`.

## Generation Grid Registry (app-validated)

After each approval or skip, call `recordGenerationGridEntry` with one entry — the app validates and stores it (registry JSON is never authored freeform in chat). Step 10 is complete when every shot appears in exactly one passing entry. Stage 2 preflight reads the stored registry.

| Field                        | Required                | Notes                                                                            |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `scene_id`                   | yes                     | Scene number                                                                     |
| `generation_id`              | yes                     | e.g. `3A`                                                                        |
| `shot_ids`                   | yes                     | Exactly one shot for `approved_grid`; skip entries may cover several             |
| `estimated_duration_seconds` | yes                     | 4–15                                                                             |
| `status`                     | yes                     | `approved_grid` \| `skip_recorded`                                               |
| `grid_handle`                | if approved             | `@scene3_gen3A_grid`                                                             |
| `approved_candidate_id`      | if approved             | Exact `generateGenerationGrid` toolCallId from `grid_approval`                   |
| `skip_reason`                | if skipped              | One of the four reasons above                                                    |
| `panel_count`                | if approved             | 4–9                                                                              |
| `scene_anchor_handle`        | later gens in scene     | The scene's FIRST approved sheet handle (omit on first-in-scene)                 |
| `is_first_in_scene`          | yes                     | `true` only for the scene's first generation (forbids chain/break/anchor fields) |
| `previous_generation_id`     | if continuous later gen | Prior `generation_id` in this scene                                              |
| `incoming_anchor_handle`     | with previous           | Prior sheet handle or prior last-frame handle/URL                                |
| `incoming_anchor_kind`       | with previous           | `prior_grid_terminal_panel` \| `prior_render_last_frame`                         |
| `incoming_anchor_panel`      | if terminal panel       | Prior sheet's LAST panel number                                                  |
| `continuity_break_reason`    | if break                | Set instead of previous + incoming anchors (scene anchor still attaches)         |

## Consumption (Stage 2 — pointer)

How compiled prompts consume sheets — COMPOSITION LOCK / END STATE LOCK, interpolate language, slot order, `extend_video` upgrades — lives in `shot-compilation-recipe.md`. During Stage 1, record entries; consumption comes later.
