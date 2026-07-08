# Scene Grid Storyboards — generation, approval, and consumption (Step 17)

This file is the complete reference for the grid phase. Read it when generating grids, presenting them for approval, or compiling shots that consume them. Prerequisites: locked shot list (with Scale and Cut-out→Cut-in columns filled), locked Bible, and APPROVED asset images — grids are built from the approved references, never before them (a pre-asset grid invents faces the charsheets won't match, collecting approval for images that will be thrown away).

## What a grid is and why it works

ONE photoreal image containing a scene's shots as panels, in shot-list order. Because all panels come from a single image generation, they share one latent: geography stays coherent (the doorway on the same side, eyelines pointing at what the next panel shows, screen direction flowing one way), lighting matches, and character appearance holds across panels — for free. Its purpose is CONNECTEDNESS and cheap approval of the EDIT: reading the grid left-to-right is watching the scene's cuts, so a broken handoff, a teleporting prop, or flat staging is caught at image price before video money is spent.

A panel is the shot's **cut-in moment** — its opening state as specified by the previous row's cut column — at the row's Scale. A panel is NOT an illustration of the whole shot: shots are events in time; panels are their entry frames. Everything temporal (motion arc, cut-out, performance, pace) lives in the row and the render prompt, never in the panel.

## The grid prompt formula

Assembled from locked artifacts only — no invented values:

1. **References attached**: the scene's character reference(s) (earliest slots) + the location plate at the scene's state version. The grid is born from the same anchors as the shots, so its compositions are real, not sketchy. Open with the same verbatim SUBJECT DEFINITIONS lines from Bible §2.
2. **Layout spec** (mandatory, or the panels lie about the frame):
   `"[N] panels, each an individual [film aspect ratio, e.g. 16:9] frame, arranged in a [layout] grid with thin uniform white gutters. NO text, NO captions, NO panel numbers, NO borders drawn inside frames."`
3. **Per panel, from the shot row**: one sentence — the cut-in moment + the row's Scale + composition, honoring the scene's Space line. Panels are listed in order ("Panel 1: ... Panel 2: ...").
4. **The novelty clause** (from the scene header's Delta line — the anti-rerun mechanism): state what is visibly NEW in this scene versus the previous scene's grid — the changed State Schedule value, the new lighting state, the new action ("harsh noon replaces dawn; the pyramid is visibly higher; workers now act, cutting and dragging stone; the ship sits in the structure's shadow"). Without this clause the image model, handed the same references, drifts back to the same postcard it made last scene.
5. **The continuity instruction** (the grid's core clause): `"All panels depict the SAME scene, space, characters, and lighting state; consecutive panels are consecutive moments across cuts — each panel begins where the previous panel's action leads; the geography is identical across all panels."`
6. **The Look** folded in as grade/lens character — the grid IS the film's look at storyboard scale.

## Layout geometry

| Shots in grid | Arrangement        |
| ------------- | ------------------ |
| 2             | 1×2 (side by side) |
| 3             | 1×3 or 3×1         |
| 4             | 2×2                |
| 5–6           | 2×3                |

- **Hard cap: 6 panels.** Beyond that, panels shrink and cross-panel identity wobbles. A longer scene gets TWO grids, split at a natural pause in the action; the second grid's prompt re-states the shared geography so the two grids agree.
- Panels always in the film's TRUE aspect ratio — a portrait-panel comic layout approves compositions that cannot exist in the frame.
- **Skips (narrow, and only during Step 17)**: four valid `skip_reason` values, in two tiers. The model may PROPOSE: (1) `insert_only_scene` — every row is INSERT, no geography or edit continuity is being approved; (2) `lone_establishing_scene` — exactly one shot, no cut handoff depending on scene geometry. ONLY the USER may elect, never the model: (3) `environment_no_grid_tooling` — the environment cannot generate grids; report the gap and let the user choose halt vs. grid-less; (4) `grid_generation_failed` — the fallback ladder's user election after ~3 documented failed regenerations. **A missing grid is NEVER a skip.** A scene with two or more non-insert shots cannot be model-proposed for skipping; a scene with character blocking, eyelines, screen direction, prop geography, or cut handoffs cannot be model-proposed for skipping. Every skip is written into the Scene Grid Registry with its `skip_reason`; skipped scenes still get generation groups marked.

## Failure catalog (regenerate vs. repair)

| Failure                | Symptom                                                                                                        | Response                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel bleed            | An element crosses a gutter; two panels merge                                                                  | Regenerate — strengthen the layout spec ("thin uniform white gutters fully separating N discrete frames")                                                                     |
| Identity wobble        | Character's face/wardrobe differs in far panels                                                                | Regenerate with fewer panels (split the grid) — this is the panel-count ceiling talking                                                                                       |
| In-frame text          | Numbers, captions, or lettering drawn into panels                                                              | Regenerate; move the NO-text clause later in the prompt and repeat it                                                                                                         |
| Order ignored          | Panels depict moments out of sequence                                                                          | Regenerate with the per-panel list more explicitly enumerated; if persistent, split into two smaller grids                                                                    |
| Geometry contradiction | A landmark/prop switches sides between panels                                                                  | First check the Space line — if the ROWS are ambiguous, fix the rows (backflow), then regenerate; if the rows are clear, regenerate citing the geography explicitly per panel |
| Wrong panel ratio      | Panels come out square/portrait despite the spec                                                               | Regenerate with the ratio stated per panel, not just globally                                                                                                                 |
| Row mismatch           | A panel's cast or state contradicts its shot row (a character where the row has none; wrong structure version) | Regenerate from the rows, restating per panel who is IN and NOT in frame; if the ROW is what's wrong, backflow first, then regenerate                                         |

Never repair a grid by editing pixels or approving "close enough" geometry — an approved grid is a promise the renders must honor. If the same failure survives ~3 regenerations, STOP generating and present the user an explicit choice (never decide alone — the registry has no state for a silently abandoned grid): (a) the user APPROVES the best partial candidate with its flaws named (ordinary `approved_grid` in the registry; solos cite its usable panels), or (b) the user ELECTS to proceed grid-less for that scene — registry `skip_reason: "grid_generation_failed"`, with the attempts documented and the stated consequence that cut continuity rests on the shot list's cut columns alone.

**Validation status:** the grid technique rests on the empirical assumption that the image model keeps cross-panel geometry coherent. Treat the first film through this flow as the validation run and log which failures occur; this catalog is expected to grow.

## Approval protocol (what the user is judging)

Present 2–3 grid candidates per scene, standard diverge-converge — candidates should differ in STAGING (blocking, angles, scale rhythm), not just rendering luck.

Present each grid as a **caption strip**: the image, and under each panel two short lines — the row's motion arc in plain words, and the handoff ("→ eyeline, answered by panel 4"). The user is approving the scene's EDIT: do the cuts connect, does the geography hold, does the staging serve the beat? They are NOT approving final pixels — render-quality nits at grid stage are noise.

**Before presenting candidates, answer the delta question — which panel carries this scene's Delta, and what visible element proves this is not the previous scene again? A vague answer means the candidate is dramatically redundant: reject it even if coherent. Then self-check every panel against its row and REJECT (regenerate, don't present) any candidate where:** a panel's CAST differs from its row (a character present who isn't in the row — the classic failure: a lead standing in what the row says is an empty establishing wide — or absent who is); a panel contradicts its row's stated state values (structure completion, a glow level); or panels are non-uniform or not in the film's aspect ratio. A grid that contradicts its rows hands the video model two masters, and the render must betray one of them — approving such a grid converts a free image-stage catch into a paid video-stage failure.

**The backflow rule:** edits are spoken naturally ("panel 3 should be closer, and he should already be turning") and flow INTO THE ROW first — the shot list is the source of truth — then the panel regenerates from the corrected row. Never patch a panel while leaving its row stale; a grid that disagrees with its rows will be contradicted at render time.

Approved grids bind to handles (`@sceneN_grid`) and join the render-ready handoff.

## The Scene Grid Registry (Step 17's mandatory output)

Grid approval, skip records, and generation groups are all recorded in ONE machine-checkable artifact — the Scene Grid Registry (schema in SKILL.md Step 17): one entry per scene with `scene_id`, `scene_rows`, `grid_required`, `status` (`approved_grid` | `skip_recorded`), `grid_handle`, `approved_candidate_id`, `skip_reason`, and `generation_groups`. Step 17 is incomplete until every scene's entry validates: an `approved_grid` status requires a handle and candidate id; a `skip_recorded` status requires a valid `skip_reason`; and the entry carries a **`panel_map`** (each shot row → exactly one panel; null for rows that skip the grid, such as INSERTs) with each generation group listing its `panel_ids`. The mapping is explicit DATA, never implicit ordering — one grid-skipped row silently shifts every panel after it if the mapping is inferred. A scene grid may legitimately contain panels not rendered in the current generation (grids are per scene; groups are per generation); the compiler states which panels are active, and unused panels are continuity context only. The registry — not prose, not memory — is what the Stage 2 preflight gate and the compile precondition check. Do not read the shot-compilation recipe and do not compile any shot until the registry is complete and passing.

## Generation groups — the partition (marked at Step 17, alongside grid approval)

The unit of DRAMA is the scene; the unit of GENERATION is the group. Partition each scene's consecutive rows into groups when its grid is approved — this is Stage 1 planning, done here so Stage 2 never re-partitions:

- A group is 1–4 consecutive shots whose **estimated** durations (the Dur column) sum to ≤15s (the current render window — a constant, not a law; as windows grow, only this number changes).
- **GROUP BY DEFAULT: prefer the largest legal group.** Connectedness is the point of this architecture — shots that render together share geography, light, and identity for free. Partition each scene greedily into the largest groups the duration budget and the solo rules allow; a solo is the EXCEPTION that must justify itself by one of the named mandatory cases below, never the lazy default. (Cap of 4 shots per group stands; a chain of 4 needs to be genuinely simple — reaction ping-pong, quiet connective beats.) A one-shot scene is legitimately a one-shot group.
- **Partition-aware durations.** Dur estimates are planning inputs, so estimate them WITH the partition in mind: when a chain of connected low-motion shots could share a window, draft those rows at 3–5s rather than a reflexive 6s — a reaction beat rarely needs 6 seconds, and tightening three connected beats from 6s to 4s is the difference between three lonely solos and one coherent group. Never inflate or deflate a shot that has a real dramatic length (a held beat stays held — that's the timing-critical solo case); this rule is about not letting LAZY defaults break groupings that the drama would happily allow.
- **Mandatory solo** (its own generation — the ONLY sanctioned reasons): (1) a motion-rich shot (dividing a generation's motion attention across shots starves them all — a shot whose whole point is movement must not share); (2) the fulcrum shot; (3) deliberate-motion spectacles; (4) a shot whose TIMING is dramatically critical (a held final image, a gag that must land at an exact length) — solos get exact duration through the API parameter; groups trade timing control for connectedness. "It didn't fit the window" after reflexive 6s estimates is NOT a sanctioned solo reason — revisit the estimates first.
- Different location or different lighting state always breaks the group (that's a scene boundary anyway).

Record the partition in each scene's `generation_groups` field of the Scene Grid Registry (mirrored as a `group` marking per shot-list row if convenient). Stage 2 compiles the registry's groups as-is.

**Optional app-side technique — the derived crop:** instead of attaching the full grid to a group, the app MAY crop the group's active panels from the APPROVED grid image and attach the crop. Approved pixels, zero regeneration drift, and out-of-scope panels are removed physically rather than textually. The crop never replaces the approved grid as source of truth, is never re-generated (only cropped), and the prompt's panel-scope clause remains mandatory either way.

## Consumption (pointer — full rules in shot-compilation-recipe.md)

- **Generation groups**: the grid attaches as a sequence reference; the group prompt defines it (`Define the panel sequence in [ImageN] as **the scene grid**; the shots follow its panels in strict order`) and each shot block cites its panel (`Shot 1 (panel 3): ...`).
- **Solo shots in a gridded scene**: attach the grid, cite the panel by number (`composition follows panel 4 of the scene grid`) — image-guided, not text-guided.
- The grid never replaces the character/plate references — they attach alongside it, in precision-priority slot order.
