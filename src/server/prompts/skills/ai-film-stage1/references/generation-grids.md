# Generation Grids — continuity packs, grids, approval, and consumption (Stage 1 Step 16)

Complete reference for the grid phase. Prerequisites: locked shot list (Scale + Cut-out→Cut-in filled), locked Bible, APPROVED asset images — grids are built from approved references, never before them.

## Two layers (do not collapse them)

| Layer | Unit | Purpose | Rendered by Seedance? |
| --- | --- | --- | --- |
| **Scene continuity pack** | One per scene | Structured notes + **1–3 visual keyframes** locking geography/blocking/axis | **No** — reference only (guides grids; never a shot sequence) |
| **Generation grid** | One per Seedance call | 1–4 consecutive cut-in panels for one dramatic beat (≤15s, prefer 8–12) | **Yes** — every panel, in order |

A **scene** is a dramatic unit (often 30–60s). A Seedance generation is capped near 15s. Therefore one scene may own several generation grids, but **every generation grid maps to exactly one video generation**.

**Never** build a scene-sized 6-panel board and then tell Seedance to ignore most panels. That wastes the grid's shared-latent advantage and resets connectedness each call.

## Scene continuity pack (required, reference-only)

Before the first generation grid of a scene, produce and **approve** a continuity pack via `generateContinuityPack` → Approve button → `recordContinuityPackEntry`.

**Both parts are required** — do not proceed with notes alone or keyframes alone:

1. **Structured notes** (all fields required):
   - **Room geography** — walls, exits, landmark sides, depth planes
   - **Character blocking** — who starts where; who moves; who stays
   - **Camera axis** — which way is "camera left/right"; 180° line
   - **Lighting progression** — ordered lighting states across the scene's generations (each generation still has ONE state)
   - **Screen direction** — exits/entries and eyelines
   - **Fixed props** — what must not teleport

2. **1–3 visual keyframes** (photoreal stills, film aspect). Typical set:
   - establishing / room geography
   - key blocking or camera-axis lock
   - eyeline / fixed-prop geography (when needed)

Keyframes are **sparse continuity stills**, not a multi-shot edit. They share latent geography so later generation grids stay coherent. They must **never** be treated as a Seedance panel sequence ("render these panels in order").

**Consumption:** attach approved keyframe URLs when calling `generateGenerationGrid` (after characters/objects/location).

**Cross-generation anchors (mandatory for later grids):** every generation after the first in a scene MUST bind:
1. The scene continuity pack (always)
2. The **previous generation's terminal panel** via `previousGenerationId` + `incomingAnchorHandle` / `incomingAnchorKind: prior_grid_terminal_panel` + `incomingAnchorPanel` (attach that grid image in `referenceImageUrls`)
3. Once the previous generation's video is approved: upgrade the incoming anchor to **`prior_render_last_frame`** (the actual last frame) for the next grid regen or Stage 2 compile

**Escape hatch only:** set `continuityBreakReason` (hard cut / time jump / new camera axis) and omit previous/anchor fields. Silent omission is a bug.

Cross-generation motion joins still use Stage 2 `extend_video` + footing locks on top of these binds.

Handle form: `@scene{N}_continuity` (e.g. `@scene3_continuity`). `approved_candidate_id` on `recordContinuityPackEntry` = exact `generateContinuityPack` toolCallId.

## What a generation grid is and why it works

ONE photoreal image containing **only the shots of this generation** as panels, in shot-list order. Shared latent → coherent geography, eyelines, lighting, and character appearance across those panels. Purpose: CONNECTEDNESS and cheap approval of the **generation's edit** before video spend.

A panel is the shot's **cut-in moment** (opening state from the previous row's cut column) at the row's Scale — not an illustration of the whole shot. Temporal content (motion arc, cut-out, performance, pace) lives in the row and the render prompt.

**Contract:** if a panel is on the grid, Seedance will render it. There is no "continuity context only / do not render" clause.

## The grid prompt formula

Assembled from locked artifacts only:

1. **References attached**: scene's character ref(s) (earliest slots) + location plate + **approved continuity pack keyframes** + **incoming anchor** (mandatory for continuous later generations: prior terminal panel, later prior last frame). Open with verbatim SUBJECT DEFINITIONS lines from Bible §2. Label continuity keyframes and prior-grid anchors as **continuity geography / cut-in anchors only — not shots to render in this generation**.
2. **Layout spec** (mandatory):
   `"[N] panels, each an individual [film aspect ratio, e.g. 16:9] frame, arranged in a [layout] grid with thin uniform white gutters. NO text, NO captions, NO panel numbers, NO borders drawn inside frames."`
3. **Per panel, from the shot row**: one sentence — cut-in moment + Scale + composition, honoring the Space line and the scene continuity pack. Listed in order ("Panel 1: ..."). Panel 1 of a continuous later generation MUST open from the incoming anchor's footing/geography.
4. **Novelty / beat clause**: what this generation's continuous dramatic beat is (and what is new vs the previous generation or scene).
5. **Continuity instruction**: `"All panels depict the SAME continuous beat, space, characters, and lighting state; consecutive panels are consecutive moments across cuts — each panel begins where the previous panel's action leads; the geography is identical across all panels. EVERY panel will be rendered in order."` When an incoming anchor is attached, add: `"Panel 1 continues from the incoming anchor (prior terminal panel / last frame) — same footing, screen direction, and geography."`
6. **The Look** as grade/lens character.

## Layout geometry

| Shots in grid | Arrangement |
| ------------- | ----------- |
| 1             | single frame |
| 2             | 1×2 (side by side) |
| 3             | 1×3 or 3×1 |
| 4             | 2×2 |

- **Hard cap: 4 panels** (matches the Seedance generation window of 1–4 shots).
- **Duration cap: estimated Dur sum ≤15s; prefer 8–12s.**
- Panels always in the film's TRUE aspect ratio.
- Longer scenes get **multiple generation grids**, split at natural beat pauses; each later grid **must** bind the continuity pack + prior terminal panel (unless `continuityBreakReason`).

## Partitioning a scene into generations

Unit of DRAMA = scene; unit of GENERATION = generation grid. Partition when authoring Step 16 (after the continuity pack is approved, before generating grids):

- Generation = 1–4 consecutive shots whose **estimated** Dur sum ≤15s (prefer 8–12).
- **One continuous dramatic beat** per generation; **one lighting state** unless a deliberate lighting transition *is* the beat (rare — usually split).
- **1-panel (solo) for spectacle** — crash / impact / liftoff / fulcrum / motion-rich / timing-critical beats stay solo unless the user explicitly accepts sharing a window.
- Prefer short multi-panel grids for low-motion connective tissue where shared latent helps.
- Different location always breaks the generation (usually a scene boundary).
- **Cross-generation continuity starts in Stage 1** (mandatory prior-anchor binds) and continues in Stage 2 (`extend_video` + last-frame upgrade). Do not inflate a grid past 15s to "keep geography."

## Skips (narrow, only during Step 16)

Four `skip_reason` values. Model may PROPOSE: (1) `insert_only_scene`; (2) `lone_establishing_scene`. ONLY the USER may elect: (3) `environment_no_grid_tooling`; (4) `grid_generation_failed` (after ~3 documented failed regenerations). **A missing grid is NEVER a skip.** Scenes with two+ non-insert shots, or with blocking/eyelines/screen direction/prop geography/cut handoffs, cannot be model-proposed for skipping. Every skip and every approval is written via `recordGenerationGridEntry` (app validates). A skip entry still lists the `shot_ids` it covers so Stage 1 coverage is complete. Continuity packs are still required for scenes that will have approved grids.

## Failure catalog (regenerate vs. repair)

| Failure                | Symptom                                                                                                        | Response                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel bleed            | An element crosses a gutter; two panels merge                                                                  | Regenerate — strengthen the layout spec                                                                                                                                       |
| Identity wobble        | Character's face/wardrobe differs in far panels                                                                | Regenerate with fewer panels (split the generation)                                                                                                                           |
| In-frame text          | Numbers, captions, or lettering drawn into panels                                                              | Regenerate; move the NO-text clause later and repeat it                                                                                                                       |
| Order ignored          | Panels depict moments out of sequence                                                                          | Regenerate with more explicit per-panel enumeration; if persistent, split                                                                                                     |
| Geometry contradiction | A landmark/prop switches sides between panels                                                                  | Check Space line + continuity pack — if rows are ambiguous, fix rows (backflow) then regenerate; else regenerate citing geography per panel                                   |
| Wrong panel ratio      | Panels come out square/portrait despite the spec                                                               | Regenerate with the ratio stated per panel                                                                                                                                    |
| Over-budget window     | Estimated Dur sum >15s or >4 shots                                                                             | Split into two generations before generating                                                                                                                                  |
| Row mismatch           | A panel's cast or state contradicts its shot row                                                               | Regenerate from the rows; if the ROW is wrong, backflow first                                                                                                                 |
| Missing prior anchor   | Later generation omits previous_generation_id / incoming_anchor_* without a break reason                       | Reject — set previous + terminal-panel anchor, or document continuity_break_reason                                                                                            |
| Continuity drift       | Generation grid geography fights the approved pack keyframes or prior terminal panel                           | Strengthen pack + incoming-anchor binds in the grid prompt; if pack/prior is wrong, regenerate that first                                                                     |

Never repair by editing pixels or approving "close enough" geometry. If the same failure survives ~3 regenerations, STOP and present: (a) user APPROVES the best partial candidate with flaws named, or (b) user ELECTS grid-less (`skip_reason: "grid_generation_failed"`).

**Validation status:** the grid technique rests on the empirical assumption that the image model keeps cross-panel geometry coherent. Treat the first film through this flow as the validation run and log which failures occur; this catalog is expected to grow.

## Approval protocol

**Continuity pack first:** present notes + 1–3 keyframes; approval = Approve-continuity-pack button only. Then `recordContinuityPackEntry`.

**Then generation grids:** Present candidates per generation differing in STAGING (blocking, angles, scale rhythm), not just rendering luck. **Always pass `panelCount`, `panelCaptions`, and `shotIds`** on `generateGenerationGrid` — lengths must match; each caption has `motionArc` + `handoff` from the shot row. The app rejects mismatches before image generation. The UI shows a **caption strip** under the image; the user approves the EDIT, not final pixels. Free-text "continue" is NOT approval — wait for the Approve-grid button / `grid_approval` tool result.

**Before presenting a grid:** confirm the continuity pack is recorded; for later generations confirm previousGenerationId + incoming anchor (or continuityBreakReason); confirm estimated Dur ≤15 (prefer 8–12); confirm every panel will be rendered. Self-check every panel against its row; REJECT (don't present) cast/state/ratio mismatches. Grid prompts use **ONE lighting state**.

**Backflow:** spoken edits flow INTO THE ROW (or continuity pack) first, then the image regenerates. Never patch pixels while leaving notes/rows stale.

Approved grids bind to `@scene{N}_gen{generationId}_grid` handles (e.g. `@scene3_gen3A_grid`). When recording via `recordGenerationGridEntry`, set `approved_candidate_id` to the **exact `generateGenerationGrid` toolCallId** from the approval result — never placeholders like `candidate_1`. Set `continuity_pack_handle` to the approved `@sceneN_continuity` handle. Record the same continuity-chain fields used on generate (`previous_generation_id`, `incoming_anchor_*`, or `continuity_break_reason`).

## Generation Grid Registry (app-validated)

Do **not** author freeform registry JSON in chat. After each generation's approval or skip, call **`recordGenerationGridEntry`** with one entry. The app validates and stores it. Step 16 is incomplete until **every shot** appears in exactly one passing entry.

Fields the tool accepts (one entry per call):

| Field | Required | Notes |
| --- | --- | --- |
| `scene_id` | yes | Scene number |
| `generation_id` | yes | e.g. `3A` |
| `shot_ids` | yes | 1–4 consecutive shot #s this generation covers |
| `estimated_duration_seconds` | yes | Sum of Dur estimates; 4–15 |
| `status` | yes | `approved_grid` \| `skip_recorded` |
| `grid_handle` | if approved | e.g. `@scene3_gen3A_grid` |
| `approved_candidate_id` | if approved | Exact `generateGenerationGrid` toolCallId from `grid_approval` |
| `skip_reason` | if skipped | One of the four reasons above |
| `panel_map` | yes | Every `shot_id` → exactly one panel number (or `null` only for legitimate insert skips inside a skip entry) |
| `continuity_pack_handle` | if approved | e.g. `@scene3_continuity` from `recordContinuityPackEntry` |
| `is_first_in_scene` | yes | `true` only for the first generation in the scene |
| `previous_generation_id` | if continuous later gen | Prior `generation_id` in this scene; null for first-in-scene or intentional break |
| `incoming_anchor_handle` | with previous | Prior grid handle or prior last-frame handle/URL |
| `incoming_anchor_kind` | with previous | `prior_grid_terminal_panel` \| `prior_render_last_frame` |
| `incoming_anchor_panel` | if terminal panel | Panel # of prior grid's last panel |
| `continuity_break_reason` | if break | Intentional hard cut / time jump / new axis; omit previous + anchors when set |

Validation (enforced by the tool): `approved_grid` requires handle + candidate id + continuity pack handle + non-null panels; `is_first_in_scene=true` forbids previous/anchors/break; later gens require previous + incoming anchor (kind/panel rules) **or** `continuity_break_reason`; `skip_recorded` requires a valid `skip_reason`; `panel_map` covers `shot_ids`. Stage 2 preflight reads the stored registry — not prose memory.

## Consumption (pointer — full rules in Stage 2 `shot-compilation-recipe.md`)

- **One `compileShot` = one generation grid.** Attach that grid; render **all** of its panels in order with hard cuts. No ignore / scope-out clause.
- Continuity pack keyframes and incoming anchors may attach as geography / cut-in references; they are **not** panels to render.
- Once the previous generation's clip is approved, prefer `incoming_anchor_kind: prior_render_last_frame` and `extend_video` for the next continuous compile.
- Every shot block opens with a mandatory **COMPOSITION LOCK** (not a soft "composition matches panel" citation).
- Soft panel citations alone are insufficient — Stage 2 gaps if the lock is missing or unextractable.
- Grid never replaces character/plate references — they attach alongside it.
- Cross-generation joins: registry chain fields + `extend_video` + footing locks + continuity pack.
