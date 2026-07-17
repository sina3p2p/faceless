# Shot Compilation Recipe — Turning the Locked Bible into Seedance 2.0 Prompts

> Load only in Stage 2, when the Bible is locked, every `@material` has an approved image, and the Generation Grid Registry passes. Loading it during story or shot-list authoring contaminates that work with premature render-prompt thinking.

This document compiles locked decisions into precise Seedance 2.0 prompts. It is not a story tool.

## The one rule that governs everything

**Every value in a shot prompt comes from the Bible or the shot row. Nothing is invented here.** Lighting from the State Schedule; grade from the Look; appearance from the bound reference; camera from the row. A value that isn't in the Bible or the row is a **gap to flag** — emit `status: "gap"` naming it — never a blank to fill from imagination. A gap is a success: it caught an incompleteness at zero cost, and it routes back to the showrunner, which fixes the Bible with full story context and recompiles. Compilation is translation, not authorship.

**Film thinking inverts clip thinking.** The craft tables at the end come from viral single-clip prompting; their knowledge (moves, lighting, color science) is reusable, their instincts are inverted here:

- A shot opens by **continuing the previous shot** — the film's hook is its opening; individual shots serve the scene, not the scroll.
- **Lock-off is legitimate** when the subject carries the motion or holds a written performance; a locked camera over an unperformed subject is a gap.
- **One SHOW LOOK by default**; the only per-shot variation is the State Schedule's lighting state (plus named locked trims).
- **The camera move serves the beat's mood** (it's in the row) — never "make it cinematic."

Craft directives (Bible §3) are production defaults; controlled exceptions only when locked in the Bible / shot row. Process gates — verbatim binds, locks, footing continuity, no invented values, approvals-as-buttons — are absolute.

## Registry precondition (machine-checkable)

Compilation input MUST include the passing Generation Grid Registry from Stage 1 Step 10. A missing/failing registry, or a shot without an `approved_grid` or `skip_recorded` entry, is a gap: `"Shot N: Generation Grid Registry missing/failing — run Stage 1 Step 10 before compiling."` **One `compileShot` = one motion sheet = one shot**, consumed exactly as recorded — sheet sizing and partitioning were Stage 1 decisions; a shot arriving unmarked is a Step 10 gap, never an invitation to re-partition here. Skip entries carry their `skip_reason` in the render package. Honor the registry's chain fields (`previous_generation_id` / `incoming_anchor_*` / `continuity_break_reason`): continuous later shots attach the incoming anchor (upgrade `incoming_anchor_kind` to `prior_render_last_frame` once the prior clip is approved — pixels beat the planned terminal panel); intentional breaks compile `fresh` and still honor the scene's continuity block + scene anchor for geography; first-in-scene compiles from the continuity block + identity refs.

## Consuming the motion sheet

The sheet (4–9 panels: Panel 1 cut-in, middle milestones, Panel n cut-out) is **one continuous take to interpolate**. Its SUBJECT DEFINITIONS line:

`Define the panel sequence in [ImageN] as **the approved motion sheet for shot {id}** — Panel 1 is the cut-in, Panel N is the cut-out, middle panels are milestones only. Interpolate naturally between these states; one continuous take; no cuts; never show the grid or gutters.`

**COMPOSITION LOCK + END STATE LOCK are mandatory.** A bare panel citation ("composition matches panel 4") is a polite suggestion models ignore. Every sheet-consuming shot opens with explicit locks extracted from approved panel pixels + shot row + `panelCaptions`:

```
COMPOSITION LOCK: match panel 1 of the approved motion sheet — [framing/scale, subject
position in frame, background geography, screen direction, footing/surface, key visible state].
END STATE LOCK: match panel N — [end framing, footing, screen direction, key visible
state prepared for the next shot's cut-in].
PRIMARY ACTION: … (middle-panel milestones as continuous beats)
```

The locks are extraction from the approved trajectory, never a second authorship pass that fights the pixels; unextractable locks → gap. The scene anchor and incoming anchor attach as geography / cut-in references, labeled reference-only. Hard-cut language between panels ("render all panels in order", "ignore other panels") never appears.

**Duration and pace:** the row's Dur is planning data — the API `duration` parameter (= the registry estimate, ≤15s) — and never prompt text. Pace lives in RELATIVE words along the trajectory ("lingers on the open, accelerates through the turn") and in event order. **No second-marks anywhere** — Seedance's in-prompt timing is officially unstable. If pacing fails, reroll with stronger pace words or regenerate the sheet with clearer milestones.

## Continuity across shots — footing, modes, extension

**The #1 cross-clip failure is the geography teleport:** shot N ends on surface A, shot N+1 opens on surface B, because text like "toward the stairs" under-specifies footing and Seedance invents a floor. Three layers:

1. **Position-locked cut-out / cut-in (always).** Cut-out names exact footing at the last frame: `the hero stands ON the stone staircase, mid-flight, facing up toward the landing`. The next shot's CONTEXT opens by restating that footing before any new action. Vague handoffs ("toward the stairs", "near the entrance") are gaps.
2. **Continuity modes on `compileShot` (URLs come from the app, never invented).** After each approved clip the app returns the clip URL + a last-frame still.
   - `continuityMode: "extend_video"` + `sourceVideoUrl` = prior approved clip — for continuous walks, approaches, same-surface carries, and hard joins that must keep pose. The prompt opens `Extend <Video_1>: [next beat]` — saying "reference `<Video_1>`" instead flips the model into reference-transfer mode. Optional stills OK.
   - `continuityMode: "fresh"` — scene opens, intentional breaks, new takes; stills in `referenceImageUrls`. When geography must still match, restate footing in CONTEXT from the last-frame still (text only — it is not a first-frame API input; no first-frame mode exists).
3. **Pixel truth beats the planned row.** If the approved last frame disagrees with the written cut-out (row said "approaching the stairs", pixels show them ON the stairs), the next CONTEXT is written from the PIXELS. Stale cut-ins are how teleports happen.

Extension caveats: **quality degrades over repeated extensions** (artifacts accumulate, especially faces) — keep chains to 2–3 links, never the whole film; **joins can jump-cut** — standard post fix trims ~6 frames from the earlier clip's end and ~1 from the later clip's start; **track completion** stitches approved clips (up to 3 video inputs, ≤15s combined, `<Video_1> + [transition] + followed by <Video_2>`) to bridge two shots with a generated connective beat; **trajectory drift inside a sheet** (milestones inventing a new floor/axis) teleports mid-take — fewer, real milestones, continuous walks on one surface. Extension is a continuity tool, not a sizing tool — correctly sized sheets joined by modes, never multi-shot boards.

## Reference binding — @material → [Image#]

Seedance reference mode addresses uploaded images as `[Image1]`, `[Image2]`… **in attachment order**. Compilation resolves each handle to its approved image. A character handle is one slot — the turnaround sheet (extra identity refs only under a user-approved documented profile; never invent a second character image at compile time).

1. **Slot order = precision priority** (earlier = weighted more precisely). `referenceImageUrls` order:

   **character → object/prop → location plate → scene anchor (scene's first approved sheet) → incoming anchor → motion sheet (last)**

   The motion sheet rides last because it is trajectory, not identity; the scene anchor and incoming anchor are geography references, never hard-cut sequences.

2. **Attach only assets appearing in this shot** plus required continuity refs (≤9 images; focused beats many). Always include on-screen identity refs, the registry's scene anchor, the registry-required incoming anchor, and this shot's sheet. If identity refs alone would blow the budget before continuity/sheet fit, the beat is too crowded — gap it, never silently drop continuity or the sheet.

3. **Define up front, verbatim, then label everywhere.** Each asset's definition line is Bible §2 canonical text pasted VERBATIM — bind + govern + label:
   - `Define the [2–3 stable features, e.g. woman in the grey wool coat with the silver pendant] in [Image1] (facial features, styling, wardrobe, build) as **the detective**.`
   - `Define the environment in [Image2] as **the alley**; it governs environment, architecture, and composition.`
     Every later mention uses the exact label — an unbound "the woman"/"she" where ambiguity could arise is how identity drift starts, and a re-worded definition is two identities competing for one face (per-shot ADDITIONS are appended clauses only, e.g. a hand-relevant anchor for an insert). Inline `detective@Image1` exists for one-offs; film work uses explicit definitions.

4. **State what each reference governs** (facial features / styling / environment / object form) — a silently attached image merges attributes unpredictably.

## Static-lock and performance — the three motion tiers

Every prompt's motion has three tiers:

- **(a) The dominant motion** — the row's Primary: SUBJECT action with a real start→end verb, or a CAMERA move developing the frame while characters hold micro-performance. Always present; secondary motion only when slower, smaller, subordinate. Ambient life never counts as (a). Neither-source and both-fast are gaps.
- **(b) Ambient life** — organic/atmospheric elements always breathing, requested explicitly: "leaves and vines sway gently in a soft breeze" / "the stream flows steadily, surface catching light" / "mist drifts slowly across the ground" / "dappled light shafts shimmer as the canopy stirs" / "flames flicker, embers drift; fabric stirs." A locked environment is the #1 cause of "the background looks AI."
- **(c) The targeted rigid lock** — only when flagged, in **positive phrasing naming its target**: `CRITICAL: the [named structure/object] is FIXED — it remains exactly as shown in [Image#] throughout this shot; only the camera moves, the [named thing] unchanged.` Plus the identity anchor: `Stable identity, natural proportions, clean edges throughout.` Negatives backfire ("no morphing" cues morphing); write the fixed state as a present fact. The blanket "only the camera moves, subject unchanged" freezes characters into mannequins — the lock always names its rigid target.

**Characters live in tiers (a)/(b), never (c).** Identity comes from the verbatim definition + reference binding; motion comes from written performance: the scripted action when dominant (`she pushes herself back into the roots, heels dragging through the soil`), micro-performance when secondary (`his chest rises with quickened breath; his eyes track the figure; his fingers tighten in the dirt`), or an intentional written hold (breath, gaze, tension, posture, deadpan). The model does not invent blocking — a character with no written verb stands like a wax figure.

**The lock-vs-motion tension:** a shot with BOTH a thing that must move AND a large locked structure tempts the model to barely move anything. Two fixes: **frame tighter** (if the motion is a block and a hand, frame on the block-and-hand so the monument isn't fighting the motion) and **lock only what's in frame and at drift risk** (reserve the full structure-lock for wides where the structure is the subject).

## State Schedule injection

Read the shot's scheduled values and state them as present facts: `Structure at 70% completion, frozen at this state for the shot.` / `Lighting state: [GOLDEN-HOUR] — warm low-angle sun, long shadows.` / `The disc glows at LOW state — faint aquamarine.` A missing scheduled value for something visibly stateful is a gap.

## Prompt section order (single shot; global notes last)

1. **SUBJECT DEFINITIONS (first)** — Define-as-label bindings for every attached reference, in slot order (early placement = precision weighting); the motion-sheet definition includes the interpolate clause; scene-anchor/incoming-anchor definitions state reference-only.
2. **CONTEXT** — one line: what this shot is, where it sits — opening by ANSWERING the previous row's cut-in when one exists ("From her point of view: the empty doorway…"), and restating exact footing verbatim when a character continues across generations: `Continuing: the hero is still standing ON the stone staircase, mid-flight, facing up — same footing as the previous shot's last frame.` Honor the scene header's continuity block (Space / Axis / Blocking / Fixed props). A continuation, never a hook.
3. **COMPOSITION LOCK + END STATE LOCK** — per the worked form above, when a sheet is attached.
4. **PRIMARY ACTION** — the dominant motion as a start→end arc with a real verb, ending at the row's cut-out state written explicitly as the final sentence with footing locked. **State scale relationships whenever proportion matters** — "limestone blocks" alone renders person-height boulders and a toy monument; write the relationship: "blocks roughly waist-to-chest height, the structure rising hundreds of feet, human figures tiny against it."
5. **PERFORMANCE** — explicit direction for every character in frame, by label. Three phrasing traps: **(a) partial figures need explicit ownership** — a hand/foot/shadow entering frame says whose it is; anonymous limbs are phrased to exclude the defined subjects ("another bystander's shoe, visible only from the shin down") with internally consistent attributes — an unowned limb next to a defined character reads as that character's and can invert a scene's meaning. **(b) Reactions to sound/off-screen events are reactions, not forces** — "at the offscreen shout, her hand flinches back," never "her hand is yanked back by the shout" (physical-causation phrasing renders physical contact). **(c) Eyeline is mandatory on any reaction/discovery beat** — who looks → at what (by label) → where in frame / height relationship: `the detective's eyes lock DOWN and RIGHT onto the child at waist height in the mid-ground — looking AT the child, not past them.` Emotion without a gaze target is a face of terror looking past the subject.
6. **CAMERA** — the row's move phrased per the craft reference; stillness stated explicitly when locked.
7. **STATE** — the State Schedule values as present facts.
8. **STATIC-LOCK** — if flagged, the targeted positive clause.
9. **GLOBAL RENDER NOTES** — the Look (grade + lens/stock character) and the shot's lighting state, at the END (Seedance weights closing notes most for look).
10. **CONSTRAINT TAIL (very last line, every prompt):** `Keep it subtitle-free; avoid generating any text or subtitles. Do not generate watermarks or logos.` The one sanctioned negative phrasing — the vendor's own suppression wording for Seedance's habit of burning subtitles/watermarks in.

## Structured output — the render package

Every compile emits ONE structured object (never loose prose), machine-checkable by the app:

```json
{
  "status": "ok" | "gap",
  "shot_id": "14",
  "generation_shot_ids": ["14"],
  "grid_reference": "@scene3_gen3A_grid" | null,
  "continuity_mode": "fresh" | "extend_video",
  "source_video_url": null,
  "render_prompt": "SUBJECT DEFINITIONS: … CONTEXT: … COMPOSITION LOCK: … END STATE LOCK: … PRIMARY ACTION: … PERFORMANCE: … CAMERA: … STATE: … [STATIC-LOCK: …] GLOBAL RENDER NOTES: … CONSTRAINT TAIL: …",
  "duration_seconds": 8,
  "resolution": "1080p",
  "references": [
    {"slot": "Image1", "handle": "@hero_charsheet", "kind": "character", "controls": "identity and wardrobe"},
    {"slot": "Image2", "handle": "@site_plate", "kind": "location", "controls": "environment, architecture, composition"},
    {"slot": "Image3", "handle": "@scene3_gen3A_grid", "kind": "scene_anchor", "controls": "scene geography / blocking from the scene's first approved sheet (reference only)"},
    {"slot": "Image4", "handle": "@scene3_gen3A_grid", "kind": "incoming_anchor", "controls": "prior terminal panel cut-in (reference only)"},
    {"slot": "Image5", "handle": "@scene3_gen3B_grid", "kind": "grid", "controls": "motion-sheet trajectory to interpolate"}
  ],
  "checks": { "…": "every assertion below, self-verified before emitting" },
  "gaps": []
}
```

- `continuity_mode` maps to `compileShot.continuityMode`; `extend_video` requires `source_video_url` (prior approved clip) and an `Extend <Video_1>:` opening; `fresh` requires stills.
- `generation_shot_ids` lists exactly one shot. `duration_seconds` = the registry estimate.
- `resolution` (with quality and aspect ratio) is a STRUCTURED FIELD the app passes as API parameters — never words inside `render_prompt`. Preview tier only for explicitly-labeled preview passes; approved/final = top tier.
- On any missing/ambiguous/over-budget input: `status: "gap"`, `render_prompt: null`, each problem named in `gaps`. Never a prompt and a gap together.

**The assertion checks (the recipe's rules in canonical form — verify each before emitting; re-run on user-edited prompts):**

- `duration_in_range`: 4–15s.
- `reference_count_ok`: ≤9 images.
- `all_assets_onscreen`: every attached asset appears in the shot.
- `every_reference_has_controls`: each definition states what it governs.
- `reference_images_distinct`: every slot resolves to a DIFFERENT image (a duplicated URL wastes a slot → gap).
- `definitions_verbatim`: every definition line matches Bible §2 exactly (appended clauses allowed; substitutions fail).
- `subjects_defined_first`: prompt opens with the definitions in slot order (character earliest → motion sheet last, matching `referenceImageUrls`); scene anchor + incoming anchor marked reference-only; sheet definition carries the interpolate clause.
- `labels_consistent`: every mention of a defined subject uses its exact label.
- `global_notes_last`: Look/grade/lighting at the end.
- `constraint_tail_present`: the suppression tail is the last line.
- `no_second_marks`: no timestamps/second-counts; pace by words and event order.
- `positive_lock_only`: any lock names its rigid target as a fixed present fact; no "no X" phrasing; no blanket "subject unchanged".
- `primary_motion_present`: one dominant motion source (real verb or written hold / developing move); ambient-only, both-fast, and locked-camera-plus-unperformed-subject fail.
- `character_performance_present`: every on-screen character has performance direction; no character is static-locked.
- `eyeline_target_named`: any reaction/"sees"/"shocked"/"stares"/"looks" beat names the gaze target by label + screen direction/height.
- `motion_sheet_interpolated`: the sheet definition instructs continuous-take interpolation; hard-cut / render-panels-as-shots / ignore-panels language fails.
- `composition_lock_present` / `end_state_lock_present`: non-empty locks on Panel 1 / Panel n when a sheet is attached; soft citations fail; unextractable → gap.
- `cut_handoff_compiled`: the action ends at the row's cut-out; CONTEXT answers the previous cut-in including exact footing; vague cut-outs fail; a "rest" passes with a note.
- `footing_continuity`: when the previous approved generation left a character on a named surface, CONTEXT restates that surface; A↔B teleports fail.
- `continuity_mode_valid`: mode matches the join type; required URLs present; extend prompts open with `Extend <Video_1>:`.
- `single_lighting_state`: exactly one canonical state; in-shot transitions fail ("time passes between shots").
- `arc_entities_bound`: every character, hero prop, and location named in the action is bound in SUBJECT DEFINITIONS or explicitly background-tier.
- `ambient_motion_present_if_organic`: organic/atmospheric elements in frame have ambient life named.
- `no_invented_values`: every stateful claim traces to the Bible or the row.

**Gap message examples:**

- `"Shot 14: no State Schedule lighting value for this beat — needs a lighting state."`
- `"Shot 9: references @ship but no approved image is bound to that handle."`
- `"Shot 7: no dominant motion — the row is an unperformed static tableau; it needs a delta or a written performance hold."`
- `"Shot 14: lighting written as a transition (Golden Hour → dusk) — pick ONE state; time passes between shots."`
- `"Shot 22: the arc lifts the ship but @ship_object_ref is not in materials — bind it or the ship renders invented."`
- `"Shot 5: COMPOSITION LOCK or END STATE LOCK missing — extract from Panel 1 / Panel N + row; soft citations are insufficient."`
- `"Shot 12: 6 distinct assets named, exceeds the focused-reference budget — scene likely too crowded; confirm which are essential."`

---

# CRAFT REFERENCE (phrasing tables — the choices were made at Stage 1; here you word them)

## Camera phrasing — the five rules that prevent the most common failures

1. **One primary camera move per shot.** Compound moves are sequenced as beats in event order ("Begins as a slow dolly-in, then eases into a gentle pan right for the closing moment"), never stacked and never timestamped.
2. **Rhythmic plain words, not technical specs.** "slow, smooth, steady, gradual, gentle, drifting" work; "24fps, f/2.8, ISO 800, 85mm" is ignored decoration — as are output specs in prompt text ("1080p", "4K", "2.39:1 anamorphic widescreen framing intent" — the last risks baked-in letterbox bars; anamorphic LENS character is legitimate Look language, the RATIO is not). Describe the feel you'd give an operator, not a camera-body setup.
3. **One thing moves fast at a time.** "The dancer spins; the camera holds a fixed frame" works; "camera spins around a spinning dancer" is chaos. Dominant subject → calm/locked camera; dominant camera → calm subject; secondary motion slower, smaller, subordinate.
4. **"Fast" is the single most quality-degrading word.** Default slow/medium; reserve speed for one deliberate isolated moment.
5. **A reference video beats text for an exact camera move.** Text carries spatial decisions; a short stabilized clip (`@Video1 for camera movement`) carries a precise trajectory (a shaky reference copies the shake).

**Shot size** — state it explicitly (extreme wide / wide / full / medium-wide / medium / medium close-up / close-up / extreme close-up): wide for scale and place, medium for behavior, close for emotion.
**Angle** — state only when it carries meaning: low (power/scale), high (vulnerability), overhead (layout), over-the-shoulder (two-person space), Dutch (unease); eye-level is the silent default.
**Lens character** comes from the Look, identical every shot; depth of field varies by intent, phrased as feel ("shallow focus, soft background"), never f-numbers.
**A camera line reads:** [size] + [angle if non-neutral] + [one movement, rhythmic] + [focus feel] — "Medium close-up, slight low angle, slow dolly-in over the shot, shallow focus with a soft background."

## Camera Movement Encyclopedia (phrasing for the move chosen at Step 7)

| Movement                      | When it fits                                    | Seedance phrasing                                                                                                       |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Dolly Forward / Push-In**   | rising tension, intimacy, focus                 | "Camera dollies forward at constant slow speed, subject centered, sharp focus maintained, no focus breathing."          |
| **Dolly Back / Pull-Out**     | reveal, release, isolation, context             | "Camera pulls back steadily, subject anchored in frame, background gradually revealed."                                 |
| **Truck Left/Right**          | lateral reveal, following without reframing     | "Camera trucks [left/right] smoothly, subject holds frame position, parallax: background moves slower than foreground." |
| **Pan / Tilt**                | survey a space, reveal scale                    | "Camera [pans/tilts] smoothly with eased start and stop, no jerk, ending on [subject]."                                 |
| **Handheld**                  | urgency, documentary unease                     | "Handheld micro-vibration, subtle breathing motion, not locked-off; human imperfection."                                |
| **Steadicam / Gimbal Follow** | flowing controlled motion with a moving subject | "Gimbal-smooth follow at constant distance, liquid stabilization, subtle breathing only."                               |
| **Tracking / Side Follow**    | subject moving through environment              | "Camera tracks subject from the side at matched speed, environment reveals progressively via parallax."                 |
| **Crane Up / Down**           | establish scale; descend to intimacy            | "Camera [rises/descends] smoothly, [tilt to keep subject in frame], landscape revealed on rise."                        |
| **Orbit / 360**               | study a subject, hypnotic emphasis              | "Camera orbits the subject at constant distance, subject frame-centered, background revealed through rotation."         |
| **Rack Focus**                | shift attention between planes                  | "Focus racks from [foreground] to [background] smoothly; the other plane softens during the shift."                     |
| **Dutch Angle**               | unease, psychological imbalance                 | "Frame tilted [15–25]° and held throughout; diagonal horizon; tension without explicit threat."                         |
| **Lock-Off / Static**         | calm, observation, drift-avoidance              | "Camera locked, zero movement; subject moves within a still frame; observational stillness."                            |

Combine at most 1–2 moves per shot; more reads as chaos and increases drift.

## Lighting Library (the State Schedule names which; this is how to phrase it)

| State                      | Mood                           | Phrasing                                                                                 |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| **Three-Point (neutral)**  | controlled, clean              | "Warm key at 45°, soft fill at ~1/3 key, gentle rim; soft-edged shadows."                |
| **Chiaroscuro / Low-Key**  | mystery, tension               | "Single hard key, minimal fill, most of frame in shadow, crushed blacks; noir contrast." |
| **Silhouette / Backlit**   | mystery, separation            | "Subject backlit against a bright source, rendered as a shape, rim defines the outline." |
| **Golden Hour**            | warmth, nostalgia              | "Warm ~3000–3200K low-angle light, atmospheric haze, warm-spill soft shadows."           |
| **Moonlight / Cool Night** | isolation, eerie calm          | "Cool ~6500K directional light, blue-tinted shadows, low intensity."                     |
| **Harsh Midday**           | exposure, heat, relentlessness | "Hard ~5500K overhead sun, short hard-edged shadows, high contrast, heat shimmer."       |
| **Practical / Firelight**  | intimacy, primal, danger       | "Warm ~1800–2000K flickering source, large dancing soft shadows."                        |
| **Soft Overcast**          | calm, clarity, vulnerability   | "Diffuse omnidirectional ~5500K light, soft-edged shadows, even illumination."           |
| **Volumetric / God Rays**  | grandeur, otherworldly         | "Directional light through particle-filled air, visible beams, dust motes in shafts."    |

## Color Grade (apply the Bible's SHOW LOOK; common grades for phrasing reference only)

| Grade                       | Character                        | Phrasing                                                                                          |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Golden / Warm Nostalgia** | warm amber, warm shadows         | "Color temperature ~3200K amber-gold; warm orange-brown shadows (not blue); nostalgic warm glow." |
| **Teal & Orange**           | cyan shadows, orange highlights  | "Shadows cyan-teal, highlights orange-gold, midtones neutral; modern cinema palette."             |
| **Cool / Cold Isolation**   | blue, desaturated                | "~6500K, blue-cyan shadows, slight warmth in highlights, mild desaturation."                      |
| **Desaturated + Accent**    | muted world, one saturated color | "Overall saturation reduced; one accent color [name] held at full saturation."                    |
| **Bleach Bypass**           | gritty, lifted blacks, grain     | "Blacks lifted to dark grey, compressed contrast, visible grain, analog feel."                    |

State the Bible's film-stock/lens character in the same global block every shot.

## Sound

Reference mode generates synchronized ambient audio by default — acceptable for film. Shots wanting a specific anchored sound name it concretely ("the crack of stone settling," "wind over sand"). Dialogue/voice consistency is deferred to the later audio phase (voice fed as reference there) — per-clip fresh-synthesized dialogue drifts.
