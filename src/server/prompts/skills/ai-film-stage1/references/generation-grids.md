# Generation Grids — continuity packs, motion sheets, approval, and consumption (Stage 1 Step 16)

Complete reference for the grid phase. Prerequisites: locked shot list (Scale + Cut-out→Cut-in filled), locked Bible, APPROVED asset images — sheets are built from approved references, never before them.

## Two layers (do not collapse them)

| Layer | Unit | Purpose | Rendered by Seedance? |
| --- | --- | --- | --- |
| **Scene continuity pack** | One per scene | Structured notes + **1–3 visual keyframes** locking geography/blocking/axis | **No** — reference only (guides sheets; never a shot sequence) |
| **Motion sheet** (generation grid) | One per shot / Seedance call | **4–9** temporal panels of **one uninterrupted shot** | **Yes** — as continuous-take guidance (interpolate; **no hard cuts**) |

A **scene** is a dramatic unit (often 30–60s). A Seedance generation is capped near 15s. Therefore one scene owns **one motion sheet per shot**, and **every motion sheet maps to exactly one video generation** (that shot).

**Never** pack multiple shots onto one sheet. **Never** build a scene-sized board and tell Seedance to ignore panels.

## Scene continuity pack (required, reference-only)

Before the first motion sheet of a scene, produce and **approve** a continuity pack via `generateContinuityPack` → Approve button → `recordContinuityPackEntry`.

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

Keyframes are **sparse continuity stills**, not a multi-shot edit. They share latent geography so later motion sheets stay coherent. They must **never** be treated as a Seedance panel sequence ("render these panels as hard cuts").

**Consumption:** attach approved keyframe URLs when calling `generateGenerationGrid` (after characters/objects/location).

**Cross-shot anchors (mandatory for later sheets):** every sheet after the first in a scene MUST bind:
1. The scene continuity pack (always)
2. The **previous sheet's terminal panel (Pn)** via `previousGenerationId` + `incomingAnchorHandle` / `incomingAnchorKind: prior_grid_terminal_panel` + `incomingAnchorPanel` (attach that sheet image in `referenceImageUrls`)
3. Once the previous shot's video is approved: upgrade the incoming anchor to **`prior_render_last_frame`** (the actual last frame) for the next sheet regen or Stage 2 compile

**Escape hatch only:** set `continuityBreakReason` (hard cut / time jump / new camera axis) and omit previous/anchor fields. Silent omission is a bug.

Cross-shot motion joins still use Stage 2 `extend_video` + footing locks on top of these binds.

Handle form: `@scene{N}_continuity` (e.g. `@scene3_continuity`). `approved_candidate_id` on `recordContinuityPackEntry` = exact `generateContinuityPack` toolCallId.

## Motion-sheet contract

ONE photoreal image = **exactly one uninterrupted shot**. Shared latent → coherent identity, geography, lighting, and **continuous camera trajectory** across panels. Purpose: cheap approval of the shot's **motion path** before video spend.

| Panel | Role |
| --- | --- |
| **Panel 1** | Exact **cut-in** state. Continuous later sheets: inherit footing/geography/screen direction from the previous sheet's **Pn** (or prior last frame). Scene open / break: from pack + row cut-in. |
| **Panels 2…(n−1)** | Only **meaningful** action or camera milestones — no filler, no redundant near-duplicates. |
| **Panel n** | Exact **cut-out** state of *this* shot — the end state the **next** sheet's Panel 1 must match (not a preview of the next shot's framing). |

- **Panel count ∈ [4, 9].** Prefer fewer when the arc is simple; use more only when milestones are real.
- **Reading order:** left-to-right, top-to-bottom.
- **Same** character, environment, lighting state, and continuous camera trajectory across all panels.
- Temporal content (performance, pace) is carried by panel states + captions + Stage 2 interpolate prompt — **not** by hard cuts between panels.

**Still vs video:** the approved still **has** thin white gutters so humans can read panels. The Seedance prompt must say to **interpolate naturally between these states; one continuous take; no cuts; never show the grid or gutters.**

## The sheet prompt formula

Assembled from locked artifacts only:

1. **References attached**: scene's character ref(s) (earliest slots) + location plate + **approved continuity pack keyframes** + **incoming anchor** (mandatory for continuous later sheets: prior terminal panel, later prior last frame). Open with verbatim SUBJECT DEFINITIONS lines from Bible §2. Label continuity keyframes and prior-sheet anchors as **continuity geography / cut-in anchors only — not moments to hard-cut in this generation**.
2. **Layout spec** (mandatory):
   `"[N] panels (N between 4 and 9), each an individual [film aspect ratio, e.g. 16:9] frame, arranged in a [layout] grid reading left-to-right, top-to-bottom, with thin uniform white gutters. NO text, NO captions, NO panel numbers, NO borders drawn inside frames."`
3. **Per panel** (enumerated "Panel 1: …"):
   - Panel 1: cut-in moment + Scale + composition (from prior Pn / pack / row).
   - Middle panels: only real milestones (action or camera).
   - Panel n: cut-out end state prepared for the next shot's cut-in.
4. **Novelty / beat clause**: what this shot's continuous dramatic beat is.
5. **Continuity + motion instruction**:
   `"All panels depict the SAME uninterrupted shot — same characters, environment, lighting, and continuous camera trajectory. Reading order is left-to-right, top-to-bottom. Panel 1 is the cut-in; Panel N is the cut-out; middle panels are milestones only. Interpolate naturally between these states; one continuous take; no cuts."`
   When an incoming anchor is attached, add: `"Panel 1 continues from the incoming anchor (prior terminal panel / last frame) — same footing, screen direction, and geography."`
6. **The Look** as grade/lens character.

## Layout geometry

| Panels | Arrangement |
| ------ | ----------- |
| 4      | 2×2 |
| 5–6    | 3 columns (wrap; L→R, T→B) |
| 7–9    | 3×3 region (wrap; L→R, T→B) |

- **Hard range: 4–9 panels** (one shot).
- **Duration cap: this shot's estimated Dur ≤15s; prefer 8–12s** (API duration = that estimate).
- Panels always in the film's TRUE aspect ratio.
- One sheet per shot; each later sheet **must** bind the continuity pack + prior terminal panel (unless `continuityBreakReason`).

## Partitioning a scene into generations

Unit of DRAMA = scene; unit of GENERATION = **one shot's motion sheet**.

- **One `generateGenerationGrid` = one shot** (`shotIds` length exactly 1).
- **One lighting state** per sheet (unless a deliberate lighting transition *is* the beat — rare).
- Use **more panels** (toward 9) for motion-rich / timing-critical / spectacle arcs; **fewer** (toward 4) for simple connective beats.
- Different location always breaks the chain (usually a scene boundary) → `continuityBreakReason` or new scene.
- **Cross-shot continuity starts in Stage 1** (P1 inherits prior Pn) and continues in Stage 2 (`extend_video` + last-frame upgrade).

## Skips (narrow, only during Step 16)

Four `skip_reason` values. Model may PROPOSE: (1) `insert_only_scene`; (2) `lone_establishing_scene`. ONLY the USER may elect: (3) `environment_no_grid_tooling`; (4) `grid_generation_failed` (after ~3 documented failed regenerations). **A missing sheet is NEVER a skip.** Scenes with two+ non-insert shots, or with blocking/eyelines/screen direction/prop geography/cut handoffs, cannot be model-proposed for skipping. Every skip and every approval is written via `recordGenerationGridEntry` (app validates). A skip entry still lists the `shot_ids` it covers so Stage 1 coverage is complete. Continuity packs are still required for scenes that will have approved sheets.

## Failure catalog (regenerate vs. repair)

| Failure                | Symptom                                                                                                        | Response                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel bleed            | An element crosses a gutter; two panels merge                                                                  | Regenerate — strengthen the layout spec                                                                                                                                       |
| Identity wobble        | Character's face/wardrobe differs in far panels                                                                | Regenerate with fewer panels (drop filler milestones)                                                                                                                           |
| In-frame text          | Numbers, captions, or lettering drawn into panels                                                              | Regenerate; move the NO-text clause later and repeat it                                                                                                                       |
| Order ignored          | Panels depict moments out of sequence                                                                          | Regenerate with more explicit per-panel enumeration                                                                                                     |
| Geometry contradiction | A landmark/prop switches sides between panels                                                                  | Check Space line + continuity pack — if rows are ambiguous, fix rows (backflow) then regenerate; else regenerate citing geography per panel                                   |
| Wrong panel ratio      | Panels come out square/portrait despite the spec                                                               | Regenerate with the ratio stated per panel                                                                                                                                    |
| Filler milestones      | Middle panels are near-duplicates or invent motion the row does not have                                       | Regenerate with fewer panels; keep only real deltas                                                                                                                           |
| Over-budget duration   | Estimated Dur >15s                                                                                             | Shorten the shot row or split the beat into two shots before generating                                                                                                                                  |
| Row mismatch           | A panel's cast or state contradicts its shot row                                                               | Regenerate from the row; if the ROW is wrong, backflow first                                                                                                                 |
| Missing prior anchor   | Later sheet omits previous_generation_id / incoming_anchor_* without a break reason                       | Reject — set previous + terminal-panel anchor, or document continuity_break_reason                                                                                            |
| Continuity drift       | Sheet geography fights the approved pack keyframes or prior terminal panel                           | Strengthen pack + incoming-anchor binds in the sheet prompt; if pack/prior is wrong, regenerate that first                                                                     |
| Hard-cut look          | Panels read as separate shots / jump cuts rather than one trajectory                                          | Strengthen continuous-trajectory + interpolate wording; reduce panel count if needed |

Never repair by editing pixels or approving "close enough" geometry. If the same failure survives ~3 regenerations, STOP and present: (a) user APPROVES the best partial candidate with flaws named, or (b) user ELECTS grid-less (`skip_reason: "grid_generation_failed"`).

**Validation status:** the sheet technique rests on the empirical assumption that the image model keeps cross-panel geometry coherent and that Seedance will interpolate rather than hard-cut. Treat early films as validation runs; log failures.

## Approval protocol

**Continuity pack first:** present notes + 1–3 keyframes; approval = Approve-continuity-pack button only. Then `recordContinuityPackEntry`.

**Then motion sheets:** Present candidates per shot differing in STAGING (blocking, camera path, milestone choice), not just rendering luck. **Always pass `panelCount` (4–9), `panelCaptions` (same length), and `shotIds` (exactly one shot)** on `generateGenerationGrid`. The app rejects mismatches before image generation. The UI shows a **caption strip** under the image; the user approves the **motion path**, not final pixels. Free-text "continue" is NOT approval — wait for the Approve-grid button / `grid_approval` tool result.

**Before presenting a sheet:** confirm the continuity pack is recorded; for later sheets confirm previousGenerationId + incoming anchor (or continuityBreakReason); confirm estimated Dur ≤15 (prefer 8–12); confirm Panel 1 / Pn handoff roles; confirm middle panels are real milestones only. Self-check every panel against its row; REJECT (don't present) cast/state/ratio mismatches. Sheet prompts use **ONE lighting state**.

**Backflow:** spoken edits flow INTO THE ROW (or continuity pack) first, then the image regenerates. Never patch pixels while leaving notes/rows stale.

Approved sheets bind to `@scene{N}_gen{generationId}_grid` handles (e.g. `@scene3_gen3A_grid`). When recording via `recordGenerationGridEntry`, set `approved_candidate_id` to the **exact `generateGenerationGrid` toolCallId** from the approval result — never placeholders like `candidate_1`. Set `continuity_pack_handle` to the approved `@sceneN_continuity` handle. Record `panel_count` and the same continuity-chain fields used on generate (`previous_generation_id`, `incoming_anchor_*`, or `continuity_break_reason`). For continuous later sheets, `incoming_anchor_panel` = prior sheet's **last** panel number.

## Generation Grid Registry (app-validated)

Do **not** author freeform registry JSON in chat. After each sheet's approval or skip, call **`recordGenerationGridEntry`** with one entry. The app validates and stores it. Step 16 is incomplete until **every shot** appears in exactly one passing entry.

Fields the tool accepts (one entry per call):

| Field | Required | Notes |
| --- | --- | --- |
| `scene_id` | yes | Scene number |
| `generation_id` | yes | e.g. `3A` (typically one per shot) |
| `shot_ids` | yes | **Exactly one** shot # for `approved_grid`; skip entries may list multiple covered shots |
| `estimated_duration_seconds` | yes | That shot's Dur estimate; 4–15 |
| `status` | yes | `approved_grid` \| `skip_recorded` |
| `grid_handle` | if approved | e.g. `@scene3_gen3A_grid` |
| `approved_candidate_id` | if approved | Exact `generateGenerationGrid` toolCallId from `grid_approval` |
| `skip_reason` | if skipped | One of the four reasons above |
| `panel_map` | yes | Every `shot_id` → cut-in panel index (**1** for approved sheets) or `null` only for legitimate insert skips inside a skip entry |
| `panel_count` | if approved | **4–9** — number of temporal panels on the motion sheet |
| `continuity_pack_handle` | if approved | e.g. `@scene3_continuity` from `recordContinuityPackEntry` |
| `is_first_in_scene` | yes | `true` only for the first generation in the scene |
| `previous_generation_id` | if continuous later gen | Prior `generation_id` in this scene; null for first-in-scene or intentional break |
| `incoming_anchor_handle` | with previous | Prior sheet handle or prior last-frame handle/URL |
| `incoming_anchor_kind` | with previous | `prior_grid_terminal_panel` \| `prior_render_last_frame` |
| `incoming_anchor_panel` | if terminal panel | Panel # of prior sheet's **last** panel (Pn) |
| `continuity_break_reason` | if break | Intentional hard cut / time jump / new axis; omit previous + anchors when set |

Validation (enforced by the tool): `approved_grid` requires handle + candidate id + continuity pack handle + `panel_count` 4–9 + exactly one shot + non-null panel_map entry; `is_first_in_scene=true` forbids previous/anchors/break; later gens require previous + incoming anchor (kind/panel rules) **or** `continuity_break_reason`; `skip_recorded` requires a valid `skip_reason`; `panel_map` covers `shot_ids`. Stage 2 preflight reads the stored registry — not prose memory.

## Consumption (pointer — full rules in Stage 2 `shot-compilation-recipe.md`)

- **One `compileShot` = one motion sheet = one shot.** Attach that sheet as continuous-take guidance.
- Instruct Seedance to **interpolate naturally between panel states; one continuous take; no cuts; never show the grid or gutters.**
- Continuity pack keyframes and incoming anchors may attach as geography / cut-in references; they are **not** hard-cut panels.
- Once the previous shot's clip is approved, prefer `incoming_anchor_kind: prior_render_last_frame` and `extend_video` for the next continuous compile.
- Every shot opens with a mandatory **COMPOSITION LOCK** on Panel 1 (cut-in) and an **END STATE LOCK** on Panel n (cut-out), plus brief milestone guidance from middle panels — not soft "composition matches panel" citations.
- Soft panel citations alone are insufficient — Stage 2 gaps if the lock is missing or unextractable.
- Sheet never replaces character/plate references — they attach alongside it.
- Cross-shot joins: registry chain fields + `extend_video` + footing locks + continuity pack (P1 inherits prior Pn / last frame).
