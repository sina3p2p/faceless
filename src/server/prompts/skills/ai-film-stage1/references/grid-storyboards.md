# Scene Grid Storyboards — generation, approval, and consumption (Stage 1 Step 16)

Complete reference for the grid phase. Prerequisites: locked shot list (Scale + Cut-out→Cut-in filled), locked Bible, APPROVED asset images — grids are built from approved references, never before them.

## What a grid is and why it works

ONE photoreal image containing a scene's shots as panels, in shot-list order. Shared latent → coherent geography, eyelines, lighting, and character appearance across panels. Purpose: CONNECTEDNESS and cheap approval of the EDIT before video spend.

A panel is the shot's **cut-in moment** (opening state from the previous row's cut column) at the row's Scale — not an illustration of the whole shot. Temporal content (motion arc, cut-out, performance, pace) lives in the row and the render prompt.

## The grid prompt formula

Assembled from locked artifacts only:

1. **References attached**: scene's character ref(s) (earliest slots) + location plate at the scene's state version. Open with verbatim SUBJECT DEFINITIONS lines from Bible §2.
2. **Layout spec** (mandatory):
   `"[N] panels, each an individual [film aspect ratio, e.g. 16:9] frame, arranged in a [layout] grid with thin uniform white gutters. NO text, NO captions, NO panel numbers, NO borders drawn inside frames."`
3. **Per panel, from the shot row**: one sentence — cut-in moment + Scale + composition, honoring the Space line. Listed in order ("Panel 1: ...").
4. **Novelty clause** (from the scene header's Delta line): what is visibly NEW vs the previous scene's grid. Without it the model drifts back to the last postcard.
5. **Continuity instruction**: `"All panels depict the SAME scene, space, characters, and lighting state; consecutive panels are consecutive moments across cuts — each panel begins where the previous panel's action leads; the geography is identical across all panels."`
6. **The Look** as grade/lens character.

## Layout geometry

| Shots in grid | Arrangement        |
| ------------- | ------------------ |
| 2             | 1×2 (side by side) |
| 3             | 1×3 or 3×1         |
| 4             | 2×2                |
| 5–6           | 2×3                |

- **Hard cap: 6 panels.** Longer scenes get TWO grids, split at a natural pause; the second re-states shared geography.
- Panels always in the film's TRUE aspect ratio.
- **Skips (narrow, only during Step 16):** four `skip_reason` values. Model may PROPOSE: (1) `insert_only_scene`; (2) `lone_establishing_scene`. ONLY the USER may elect: (3) `environment_no_grid_tooling`; (4) `grid_generation_failed` (after ~3 documented failed regenerations). **A missing grid is NEVER a skip.** Scenes with two+ non-insert shots, or with blocking/eyelines/screen direction/prop geography/cut handoffs, cannot be model-proposed for skipping. Every skip and every approval is written via `recordSceneGridEntry` (app validates). Skipped scenes still get generation groups.

## Failure catalog (regenerate vs. repair)

| Failure                | Symptom                                                                                                        | Response                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel bleed            | An element crosses a gutter; two panels merge                                                                  | Regenerate — strengthen the layout spec                                                                                                                                       |
| Identity wobble        | Character's face/wardrobe differs in far panels                                                                | Regenerate with fewer panels (split the grid)                                                                                                                                 |
| In-frame text          | Numbers, captions, or lettering drawn into panels                                                              | Regenerate; move the NO-text clause later and repeat it                                                                                                                       |
| Order ignored          | Panels depict moments out of sequence                                                                          | Regenerate with more explicit per-panel enumeration; if persistent, split                                                                                                     |
| Geometry contradiction | A landmark/prop switches sides between panels                                                                  | Check Space line — if rows are ambiguous, fix rows (backflow) then regenerate; else regenerate citing geography per panel                                                     |
| Wrong panel ratio      | Panels come out square/portrait despite the spec                                                               | Regenerate with the ratio stated per panel                                                                                                                                    |
| Row mismatch           | A panel's cast or state contradicts its shot row                                                               | Regenerate from the rows; if the ROW is wrong, backflow first                                                                                                                 |

Never repair by editing pixels or approving "close enough" geometry. If the same failure survives ~3 regenerations, STOP and present: (a) user APPROVES the best partial candidate with flaws named, or (b) user ELECTS grid-less (`skip_reason: "grid_generation_failed"`).

**Validation status:** the grid technique rests on the empirical assumption that the image model keeps cross-panel geometry coherent. Treat the first film through this flow as the validation run and log which failures occur; this catalog is expected to grow.

## Approval protocol

Present 2–3 candidates per scene differing in STAGING (blocking, angles, scale rhythm), not just rendering luck. Present as a **caption strip**: image + under each panel the motion arc and handoff. User approves the EDIT, not final pixels.

**Before presenting:** answer which panel carries the scene's Delta and what proves this isn't the previous scene again. Self-check every panel against its row; REJECT (don't present) cast/state/ratio mismatches.

**Backflow:** spoken edits flow INTO THE ROW first, then the panel regenerates. Never patch a panel while leaving its row stale.

Approved grids bind to `@sceneN_grid` handles.

## Scene Grid Registry (app-validated)

Do **not** author freeform registry JSON in chat. After each scene's approval or skip, call **`recordSceneGridEntry`** with one entry. The app validates and stores it. Step 16 is incomplete until every scene has a passing entry.

Fields the tool accepts (one entry per call):

| Field | Required | Notes |
| --- | --- | --- |
| `scene_id` | yes | Scene number |
| `scene_rows` | yes | Shot #s in this scene |
| `grid_required` | yes | Usually true |
| `status` | yes | `approved_grid` \| `skip_recorded` |
| `grid_handle` | if approved | e.g. `@scene3_grid` |
| `approved_candidate_id` | if approved | Tool-call / candidate id |
| `skip_reason` | if skipped | One of the four reasons above |
| `panel_map` | yes | Every shot row → exactly one panel number, or `null` for legitimate grid skips (e.g. INSERT). Explicit — never infer order. |
| `generation_groups` | yes | `{ shot_ids, panel_ids }[]` for this scene |

Validation (enforced by the tool): `approved_grid` requires handle + candidate id; `skip_recorded` requires a valid `skip_reason`; every `scene_rows` id appears in `panel_map`; each group's `panel_ids` match the map. Stage 2 preflight reads the stored registry — not prose memory.

## Generation groups — the partition (marked at Step 16)

Unit of DRAMA = scene; unit of GENERATION = group. Partition when the grid is approved:

- Group = 1–4 consecutive shots whose **estimated** Dur sum ≤15s.
- **GROUP BY DEFAULT** — largest legal group. Solo ONLY for: (1) motion-rich, (2) fulcrum, (3) deliberate-motion spectacle, (4) timing-critical. "Didn't fit after lazy 6s estimates" is NOT sanctioned — revisit estimates first.
- **Partition-aware durations:** draft connected low-motion beats at 3–5s when they can share a window; don't inflate/deflate real dramatic length.
- Different location or lighting state always breaks the group (scene boundary).

Record groups in the same `recordSceneGridEntry` call. Stage 2 compiles them as-is.

**Optional app-side technique — derived crop:** crop the group's active panels from the APPROVED grid and attach the crop. Approved pixels, zero regeneration drift. Prompt's panel-scope clause remains mandatory.

## Consumption (pointer — full rules in Stage 2 `shot-compilation-recipe.md`)

- **Groups:** grid as sequence reference; each shot block cites its panel.
- **Solos in a gridded scene:** attach grid, cite panel by number.
- Grid never replaces character/plate references — they attach alongside it.
