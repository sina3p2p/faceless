# Shot Compilation Recipe — Turning the Locked Bible into Seedance 2.0 Prompts

> **DO NOT LOAD THIS FILE DURING STAGE 1.** It is useless before reference images exist, and reading it while authoring the story or shot list will contaminate that work with premature render-prompt thinking. Load it ONLY after Stage 1 is fully complete — the Bible is locked, every `@material` has an approved reference image, AND every scene's grid is approved (or its skip recorded) with generation groups marked (Step 17) — at the moment you begin writing Seedance prompts in Stage 2. If you are still developing premise, characters, screenplay, shot-list intent, or generating asset images, this file is not yet relevant.

This is the reference the showrunner loads when Stage 1 is complete (Bible locked, all assets approved, all scene grids approved, groups marked) and it begins writing the final Seedance prompts. It is **not** a story tool — every creative decision was already made and frozen in the Bible. This document is purely about _compiling_ those locked decisions into precise, renderable Seedance 2.0 prompts.

---

## The one rule that governs everything

**Every value in a shot prompt comes from the Bible or the shot row. Nothing is invented here.**

The lighting comes from the shot's State Schedule entry. The color grade comes from the Bible's Look. The character's appearance comes from the approved reference image. The camera move comes from the shot row. If a value you need isn't in the Bible or the row, that is a **gap to flag**, not a blank to fill from imagination. A shot prompt is an act of _translation_, not authorship.

This is the opposite discipline from viral single-clip prompting, where each clip invents its own hook, grade, and mood to stop a scroll. A film is the reverse: every shot must _subordinate_ itself to the whole, because 24 shots that each made their own striking choices do not cut together into a film — they fight.

---

## Continuity beats impact (read before using the craft tables)

The craft tables below are excellent and come from a skill built for viral clips. Their _knowledge_ (camera moves, lighting setups, color science) is reusable. Their _instinct_ — open with a hook, move the camera always, grade for maximum punch — is wrong for narrative and must be inverted:

- **No per-shot hooks.** A shot in a film opens by continuing the previous shot, not by re-grabbing attention with a black-to-light burst or a whip. The "2-second hook" thinking that suits TikTok destroys narrative flow. The film's hook is its opening; individual shots serve the scene, not the scroll.
- **A locked camera is legitimate — a motionless SHOT is not.** Lock-off is often correct (observational, calm, drift-safe) _when the subject carries the motion_. But stillness must never compound: if the camera is locked AND the subject has no action, the generation is a photograph with drifting mist. Before choosing lock-off, confirm the shot row gives the subject a real verb; if it doesn't, either the camera must carry the motion or the row goes back as a gap.
- **One Look, applied everywhere.** Do not pick a fresh grade per shot. The Bible's Look is the single grade for the entire film; you _apply_ it, you don't choose it. The only per-shot variation is the State Schedule's lighting state.
- **Match the camera move to the beat's mood, not to "make it cinematic."** A tense beat might want a slow push-in; a calm one a lock-off; a reveal a pull-back. The mood is in the shot row. Let it choose the move.

---

## The primary-motion rule (check this before anything else in the shot)

**Every prompt must have exactly ONE primary motion source: the SUBJECT or the CAMERA.** This is the first thing to identify when compiling a shot, read straight from the shot row's Primary column (or inferred from its motion arc if the row is in an older format).

- **Primary = SUBJECT:** a character acts or an object moves; the camera calms or locks. The action must be a real verb with a start→end delta (a step taken, a hand raised, a body pushing backward) — not a pose.
- **Primary = CAMERA:** the camera move develops the frame (push-in, pull-back, truck, crane); the subject calms, but characters still get micro-performance (see below), never total stillness.
- **Neither:** invalid. Do not "compile it faithfully" into a static tableau — emit `status: "gap"`: `"Shot N: no primary motion — subject has no action and camera is locked; the row needs a delta."` A beautifully lit photograph is the most common quality failure this recipe exists to prevent, and it is caught here, before a generation is spent.
- **Both fast:** also wrong — one calms (rule 3 of the camera phrasing rules below).

Ambient environmental life (mist, foliage, water, light) is tier (b) seasoning and **never counts as the primary motion.**

---

## Scene grids and generation groups (how shots become generations)

**Compile precondition (machine-checkable):** compilation input MUST include the completed Scene Grid Registry from Step 17. If the registry is missing, incomplete, or has any scene whose status is not `approved_grid` or `skip_recorded` (with its required fields), emit `status: "gap"` and do not compile: `"Shot N: Scene Grid Registry missing/failing for scene M — run Step 17 before compiling."` Per shot: a scene with `status: approved_grid` must attach the scene grid and cite the relevant panel; a scene with `status: skip_recorded` must carry the registry's `skip_reason` in the render package. A missing `grid_handle` is not a skip. A missing registry is not a skip. Never skip the grid phase silently because assets are done.

The unit of DRAMA is the scene; the unit of GENERATION is the group. They are deliberately separate layers — the render window must never redefine what a scene is, and as clip windows grow, only the partition constant below changes.

**The scene grid (the edit, approved at image price).** After assets are approved, each scene gets a **grid storyboard**: ONE photoreal image containing the scene's shots as panels in shot-list order (full reference: `grid-storyboards.md` — prompt formula, layout geometry, failure catalog, approval protocol). Because all panels come from a single image generation, they share one latent — geography stays coherent (the doorway on the same side, eyelines pointing at what the next panel shows, screen direction flowing one way) and character appearance holds across panels for free. The user approves the grid BEFORE any video is generated: reading it left-to-right is watching the scene's cuts, so a broken handoff or teleporting prop is caught at image price. Panels are the shots' **cut-in moments**, compiled from the rows' cut columns. INSERT shots and lone establishing shots may skip the grid (no geography to protect).

**Generation groups (marked at Step 17, honored here).** The partition — which rows form a group, which are mandatory solos — was decided during Stage 1 and recorded in the Scene Grid Registry's `generation_groups` (partition rules live in `grid-storyboards.md`, the Step 17 reference). At compile time the marked partition is DATA, not a decision: compile each marked group or solo as-is. If a shot arrives unmarked, that is a gap (Step 17 incomplete), not an invitation to partition here.

**Duration semantics (important):** the shot list's Dur column is an ESTIMATE — planning data for partition math and the runtime total. It NEVER enters any prompt. For a solo, the API duration parameter = the shot's duration. For a group, the API duration = the sum of the group's estimates (≤15s), and **Seedance distributes time across the cuts itself** — in-prompt timing is officially unstable, and the model, seeing the actual motion, places cuts better than pre-render guesses. Steer proportions only with RELATIVE pace words derived from the rows ("the first shot lingers; the last two cut quickly"). If a returned group paced a beat wrong, that is a targeted reroll with a stronger pace word — or a promotion to solo, where the API duration is exact.

**Group prompt structure:** one shared SUBJECT DEFINITIONS block (verbatim Bible lines) which ALSO defines the scene grid **with the generation's panel range scoped explicitly** — `Define the panel sequence in [ImageN] as **the approved scene grid for Scene X**; THIS generation renders ONLY panels [a]–[b] (the group's panel_ids from the registry), in order — other panels in the scene grid are continuity context only and must NOT be rendered in this generation` — then labeled shot blocks each opening with the panel citation (`Shot 1 (panel a): composition matches panel a of the scene grid. [action, camera, pace word]`, `Shot 2 (panel a+1): composition matches panel a+1. ...`) in event order with NO timestamps, each block's action ending at its cut-out; then the global render notes and constraint tail at the END. The scope clause is mandatory whenever the grid has more panels than the group has shots (the normal case — grids are per SCENE, groups are per GENERATION): an unscoped 'follow the panels in strict order' invites the model to continue into out-of-scope panels inside the clip. The grid is a sequence reference (a documented Seedance pattern): the model renders the shots with hard cuts, following the approved compositions.

**Solo prompt in a gridded scene:** attach the grid and cite the shot's panel by number — `composition follows panel 4 of the scene grid` — so even solos stay pinned to the approved geography. Image-guided, not text-guided.

**App-side contract:** the returned group clip is pre-split at the cuts for per-shot review. Rejection of one sub-shot offers "reroll group" or "demote to solos" — the good sub-shots will not return identical on a group reroll; that is the known cost of grouping.

**Validation caveat:** the grid's value rests on Seedream keeping cross-panel geometry coherent. Treat the first film through this flow as the validation run; if grids return spatially contradictory panels, fall back to solos with per-panel citation.

## Continuity across generations — native extension and track completion

When two shots must connect seamlessly (a continuous action broken across a cut, a character carrying position/light/state into the next shot), prefer Seedance's **native video extension** over manual tricks: pass the approved clip as `<Video_1>` and prompt `Extend <Video_1> backward: [what happens next, same prompt discipline as any shot]`. The model auto-extracts the transition frames and does NOT regenerate the original segment — continuity comes free, each shot keeps its full motion budget, and the per-shot approval loop stays intact. (Phrasing note: for extend/edit tasks say `<Video_1>` directly, never "reference `<Video_1>`" — the word "reference" flips the model into reference-transfer mode.)

- **Quality degrades over repeated extensions** — mottled artifacts accumulate, especially on faces. Keep chains short (2–3 links); never build the whole film as one extension chain.
- **Joins can jump-cut.** Standard post fix: trim ~6 frames from the end of the earlier clip and ~1 frame from the start of the later one at each join.
- **Track completion** stitches existing approved clips: up to 3 video inputs, ≤15s combined, with the model generating the transitions (`<Video_1> + [transition description] + followed by <Video_2>`). Useful for bridging two approved shots with a generated connective beat.

Extension is a _continuity_ tool, not a substitute for the grouping rules above: shot selection, primary motion, and approval still work per-shot.

---

## Reference binding — the @material → [Image#] translation

Stage 1 wrote `@material` handles (e.g. `@hero_charsheet`, `@giza_plate`). Seedance 2.0 reference mode takes uploaded images addressed as `[Image1]`, `[Image2]`, etc., **in the order they're attached** (first attached = `[Image1]`). Compilation resolves each handle to its approved image and assigns slots. A character handle is exactly ONE slot — one turnaround character-sheet image per character, always.

Four hard rules:

1. **Slot order = precision priority.** The more precisely an asset must be matched, the EARLIER it goes: character references first, then hero-prop/object refs, then location plates. Seedance weights earlier assets more heavily for precise reference.

2. **Attach only the assets that appear in this shot (or group).** Reference mode accepts up to 9 images, but 3–5 focused references beat more. Pull only the character(s) and location(s) actually on screen. If a shot/group names more distinct assets than the budget allows, that's a gap — flag it (the shot is probably too crowded), don't silently drop refs.

3. **DEFINE each subject up front, then use the label everywhere — and the definition text is LOCKED.** Each asset's definition line (label, its 2–3 stable features, its anchor details) is written ONCE in the Bible §2 and pasted VERBATIM into every prompt that uses the asset. Never re-derive or re-word it per shot: a character defined by "dust smudge, amulet, chisel at belt" in one shot and "bare feet, linen kilt" in the next is two different definitions competing for one identity — definition drift is identity drift by the back door. (Per-shot additions are allowed only as appended clauses after the locked line, e.g. adding a hand-relevant anchor for an insert — never as substitutions.) The official binding grammar: open the prompt with definitions —
   - `Define the [2–3 stable features, e.g. woman in the grey wool coat with the silver pendant] in [Image1] (facial features, styling, wardrobe, build) as **the detective**.`
   - `Define the environment in [Image2] as **the alley**; it governs environment, architecture, and composition.`
     Then **every subsequent mention of that subject uses the exact same label** ("the detective", never "the woman" / "she" at first mention of a new sentence block where ambiguity could arise). An unbound mention is how identity drift starts. For a quick one-off binding without a definition, the inline form `detective@Image1` also works — but for film work, prefer explicit definitions.

4. **State what each reference governs.** Never attach an image silently — the definition must say what attribute it controls (facial features / styling / environment / object form), or the model merges attributes unpredictably.

For a multi-shot group, the same definitions carry across all shots in the generation, which is exactly how Seedance keeps the character consistent across the internal cuts — keep the labels identical in every shot block.

---

## Static-lock — positive phrasing only, and NEVER on characters

When a shot is flagged static-lock (a rigid subject must not change/morph during the shot), state it in **positive** terms and **name the specific thing being locked**. Seedance interprets "no X" as a cue for X — negatives backfire. Use the worked phrasings:

- For the structure/object: `CRITICAL: the [named structure/object] is FIXED — it remains exactly as shown in [Image#] throughout this shot; only the camera moves, the [named thing] unchanged.`
- The identity anchor: `Stable identity, natural proportions, clean edges throughout.`

Never write "the pyramid does not grow" or "no morphing" — write the fixed state as a present fact. And **never write the blanket clause "only the camera moves, subject unchanged"** — in a frame containing characters, that clause freezes the _characters_, producing mannequins in a diorama. The lock always names its target: "the pyramid unchanged," "the ship's hull unchanged," never "subject unchanged."

**Characters are NEVER static-locked.** Character identity consistency comes from the reference-image binding (the character's verbatim Define-as-label line in SUBJECT DEFINITIONS) plus the identity anchor line — not from freezing motion. Every character in frame gets explicit **performance direction**, always:

- If the character carries the shot's primary motion: the scripted action, phrased as start→end (`she pushes herself back into the roots, heels dragging through the soil, one arm wrapping her belly`).
- If the character is secondary in a camera-driven shot: written **micro-performance** at minimum — breath, gaze, small gestures (`his chest rises with quickened breath; his eyes track the figure; his fingers tighten in the dirt`). The model does not invent blocking; a character with no written verb stands like a wax figure.

**CRITICAL — lock RIGID things, NEVER lock ORGANIC/atmospheric things.** Static-lock exists to stop _rigid_ subjects from morphing (a structure's shape/height, a vehicle's form, a hero prop). It must NOT be applied to organic or atmospheric elements, which in a living environment are _supposed_ to be in constant gentle motion. If you lock a whole environment, you get a beautiful frozen photograph that a character walks through — the #1 cause of "the background feels static / looks AI." **Always request ambient environmental motion explicitly** for anything organic in frame:

- Foliage, vines, leaves, grass: "leaves and vines sway gently in a soft breeze."
- Water (streams, sea, drips): "the stream flows steadily, surface catching light."
- Mist, smoke, dust, haze: "mist drifts slowly across the ground."
- Light through moving canopy/clouds: "dappled light shafts shimmer faintly as the canopy stirs."
- Fire, embers, fabric, hair, banners: "flames flicker, embers drift; fabric stirs in the air."

So a shot's motion instruction has THREE tiers: **(a) the primary motion** (the shot row's designated source — subject action OR camera move; exactly one, always present); **(b) ambient life** (organic elements always breathing — foliage, water, mist, light — plus character micro-performance); **(c) the targeted rigid lock** (a named structure or object that must not morph). Only (c) gets the FIXED clause, and it always names its target. A prompt missing tier (a) is a gap, not a render.

**The lock-vs-motion tension (important):** when a shot has BOTH a thing that must move (a sliding block, a raised hand) AND a large fixed structure (the pyramid), asking the model to freeze most of the frame while animating one small piece is hard — its safe resolution is to barely move anything, producing the "static image with a few moves" look. Two fixes: (1) **frame tighter** — if the motion is a block and a hand, frame on the block-and-hand, not the whole monument, so the locked structure isn't dominating the frame and fighting the motion; (2) **only lock what's actually in frame and at risk of drifting** — don't burn the model's attention locking a pyramid that's barely in a tight shot. Reserve the full structure-lock for wide shots where the structure is the subject. A motion-rich shot wants a framing that lets the motion be the main event.

---

## State Schedule injection

The Bible's State Schedule records what changes _between_ shots but is _fixed within_ a shot (structure completion %, lighting state, a visible-clock value like a draining glow). For each shot, read its scheduled values and state them as explicit present facts in the prompt:

- `Structure at 70% completion, frozen at this state for the shot.`
- `Lighting state: [GOLDEN-HOUR] — warm low-angle sun, long shadows.`
- `The disc glows at LOW state — faint aquamarine, barely lit.`

If a shot's State Schedule value is missing for something visibly stateful (a structure that's mid-build, a clock that's draining), that's a gap — flag it.

---

## Duration

Duration is an API PARAMETER on the render package, never prompt text, and the shot row's Dur is an ESTIMATE. For a solo: the API duration = the row's estimate (within Seedance 2.0's window, 4–15s). For a group: the API duration = the sum of the group's estimates (≤15s); Seedance places the internal cuts itself — steer proportions only with relative pace words ("the first shot lingers; the last two cut quickly"). Keep individual narrative shots short (estimates commonly 5–10s) — long single takes are where motion drift creeps in. A mistimed beat in a returned group = targeted reroll with a stronger pace word, or promotion to solo (where the API duration is exact).

---

## Prompt section order (single shot)

Assemble in this order, global notes last:

1. **SUBJECT DEFINITIONS (first):** the Define-as-label bindings for every attached reference (see binding grammar above). These go FIRST — precise references are weighted by early placement, and every later mention depends on the labels existing.
2. **CONTEXT** — one line: what this shot is, where it sits in the scene — and if the previous shot's row specifies a cut-in for this shot, CONTEXT opens by ANSWERING it ("From her point of view: the empty doorway..."; "The turn completes: he now faces the window..."). Honor the scene's Space line: geography and screen direction here must match every other shot in the scene. (Not a hook. A continuation.)
3. **PRIMARY ACTION** — the shot's primary motion, phrased as a start→end arc with a real verb: what moves, how, and where it ends up. If Primary = SUBJECT, this is the character/object action; if Primary = CAMERA, this states what the developing frame reveals while characters hold micro-performance. This section may never describe a motionless tableau — if the row gives you no delta, that's a gap, not a compile. The action ENDS at the row's cut-out state, written explicitly as the final sentence ("her gaze locks off-frame, down and left, toward the unseen street"; "he begins to turn"; "the car exits frame right") — this is the half of the edit this generation owns; the next shot's CONTEXT answers it. **State scale relationships explicitly when scale matters** — the model defaults to wrong proportions if you don't. "Limestone blocks" alone renders person-height boulders and a toy-looking pyramid; instead write the relationship: "limestone blocks roughly waist-to-chest height, the pyramid a monumental structure rising hundreds of feet, human workers tiny against it." Whenever a shot depends on bigness, smallness, or proportion, name the relationship between the elements — don't assume the model infers it.
4. **PERFORMANCE** — explicit direction for every character in frame (by label): the scripted action if a character is the primary motion, written micro-performance (breath, gaze, small gesture) otherwise. Never omitted when a character is on screen; never replaced by a lock. Two phrasing traps: **(a) partial figures need explicit ownership** — a hand, foot, or shadow entering frame must say whose it is, and if it belongs to an anonymous party, say so in a way that excludes the defined subjects ("another worker's sandaled foot, visible only from the shin down") — an unowned limb next to a defined character reads as _that character's_, which can invert a scene's meaning; and give the limb internally consistent attributes (never "bare sandaled foot" — contradictory features average into something wrong). **(b) Reactions to sound or off-screen events are reactions, not forces** — write "at the offscreen shout, her hand flinches back," never "her hand is yanked back by the shout"; physical-causation phrasing makes the model render physical contact.
5. **CAMERA** — the move from the shot row, matched to the beat's mood (see encyclopedia). State stillness explicitly if locked — allowed only when the subject carries the primary motion.
6. **STATE** — the State Schedule values as present facts.
7. **STATIC-LOCK** — if flagged, the positive fixed-state clause naming its specific rigid target (never "subject unchanged").
8. **GLOBAL RENDER NOTES:** the Look (grade, lens/film-stock character) and the lighting state. These go at the end because Seedance weights closing notes most for look and camera. (Reference definitions are NOT here — they moved to the top.)
9. **CONSTRAINT TAIL (very last line):** `Keep it subtitle-free; avoid generating any text or subtitles. Do not generate watermarks or logos.` Mandatory on every prompt — Seedance generates text natively and will occasionally burn unrequested subtitles or a platform watermark into the frame; this is the vendor's own suppression phrasing. This is the ONE sanctioned use of negative phrasing (see the positive-phrasing rule's scope note).

**No second-marks anywhere in the prompt.** Seedance's support for precise in-prompt timing ("0–3 seconds", "over 9s") is officially unstable and can produce abnormal generations. Total duration is an API parameter; pace _within_ the shot is controlled with words (slow, gradual, unhurried, brisk) and with the order of described events. Sequence beats by order ("begins as a slow dolly-in, then eases into a gentle pan right"), never by timestamps.

For a multi-shot group, follow the group prompt structure in the "Scene grids and generation groups" section (the authoritative spec): one shared SUBJECT DEFINITIONS block that also defines the scene grid, then `Shot 1 (panel N): …  Shot 2 (panel N+1): …` in event order with no timestamps, relative pace words only, then ONE shared GLOBAL RENDER NOTES block + constraint tail at the end covering all shots.

---

## Structured output — emit a JSON render package, not loose prose

Every compile produces ONE structured object, not free text. This makes the result machine-checkable (the app can show the user the prompt, run assertions, route gaps) instead of something a human has to eyeball. Emit exactly this shape:

```json
{
  "status": "ok" | "gap",
  "shot_id": "14",
  "group_shot_ids": ["14"],
  "grid_reference": "@scene3_grid" | null,
  "render_prompt": "SUBJECT DEFINITIONS: Define ... in [Image1] (facial features, styling, wardrobe) as **hero**. Define ... in [Image2] as **the site**. CONTEXT: ... PRIMARY ACTION: ... PERFORMANCE: ... CAMERA: ... STATE: ... [STATIC-LOCK: ...] GLOBAL RENDER NOTES: ... CONSTRAINT TAIL: Keep it subtitle-free; avoid generating any text or subtitles. Do not generate watermarks or logos.",
  "duration_seconds": 8,
  "resolution": "1080p",
  "references": [
    {"slot": "Image1", "handle": "@hero_charsheet", "controls": "identity and wardrobe"},
    {"slot": "Image2", "handle": "@site_plate", "controls": "environment, architecture, composition"}
  ],
  "checks": {
    "duration_in_range": true,
    "reference_count_ok": true,
    "all_assets_onscreen": true,
    "every_reference_has_controls": true,
    "reference_images_distinct": true,
    "definitions_verbatim": true,
    "subjects_defined_first": true,
    "labels_consistent": true,
    "global_notes_last": true,
    "constraint_tail_present": true,
    "no_second_marks": true,
    "positive_lock_only": true,
    "primary_motion_present": true,
    "character_performance_present": true,
    "panel_range_scoped": true,
    "cut_handoff_compiled": true,
    "single_lighting_state": true,
    "arc_entities_bound": true,
    "ambient_motion_present_if_organic": true,
    "no_invented_values": true
  },
  "gaps": []
}
```

- `render_prompt` is the assembled prompt in the section order below — this is the text shown to the user for approval/edit before any render.
- `group_shot_ids` lists every shot in this generation (a solo is a one-element list). For groups: `duration_seconds` = the sum of the shots' ESTIMATED durations (≤15s); the app pre-splits the returned clip at the cuts for per-shot review. Shot-list Dur values never appear in the prompt.
- `grid_reference` is the scene grid's handle if the scene has one; groups consume it as a sequence reference, solos cite their panel by number.
- `resolution` is the render tier as a STRUCTURED FIELD ONLY — the app passes it (with quality and aspect ratio) as parameters on the generateShot API call. It must never appear as words inside `render_prompt`: the model ignores "1080p" in prompt text the same way it ignores f-stops and ISO. Tier policy: the cheap tier (e.g. 480p) is allowed for preview passes; the shot's APPROVED/final render is always the top tier (e.g. 1080p). Never mark a preview-tier render as final — a 480p clip in the edit is a quality bug.
- `references` maps each `[Image#]` slot to its `@material` handle and the attribute it controls (the binding grammar, made explicit).
- `checks` is the assertion result — each is a hard rule from this recipe, self-verified before emitting. If any check is false, fix the prompt before emitting (or emit a gap if it can't be fixed from the Bible).
- On a missing/ambiguous/over-budget input, emit `status: "gap"` with `render_prompt: null` and the `gaps` array naming each problem, e.g.:
  - `"Shot 14: no State Schedule lighting value for this beat — needs a lighting state."`
  - `"Shot 9: references @ship but no approved image is bound to that handle."`
  - `"Shot 3: two slots resolve to the same image URL — a duplicated attachment wastes a slot; bind distinct images."`
  - `"Shot 12: 6 distinct assets named, exceeds the focused-reference budget — scene likely too crowded; confirm which are essential."`
  - `"Shot 7: no primary motion — the row is a static tableau (subject has no action, camera locked); it needs a delta before it can render."`
  - `"Shot 14: lighting written as a transition (Golden Hour → dusk) — pick ONE state for this row; time passes between shots."`
  - `"Shot 22: the arc lifts the ship but @ship_object_ref is not in materials — bind it or the ship renders invented."`

A gap is a success — it caught an incompleteness cheaply, before a video generation. The gap goes back to the showrunner, which fixes the Bible (with full story context) and recompiles.

**The `checks` are the recipe's rules as assertions** — verify each before emitting, and they are re-run on any user-edited prompt:

- `duration_in_range`: 4–15s (and group total ≤15s if bundled).
- `reference_count_ok`: ≤9 images attached.
- `all_assets_onscreen`: every attached asset actually appears in the shot.
- `every_reference_has_controls`: each reference's definition states what it governs (facial features / styling / environment / object form).
- `reference_images_distinct`: every attached slot resolves to a DIFFERENT image — a duplicated URL is a resolution bug wasting a slot. Fails as a gap, not a render.
- `definitions_verbatim`: every definition line matches the Bible §2 canonical text for that handle exactly (appended per-shot clauses allowed; substitutions fail).
- `subjects_defined_first`: the prompt opens with Define-as-label bindings for every attached reference; character references occupy the earliest slots.
- `labels_consistent`: every mention of a defined subject uses its exact label; no unbound "the man"/"she" where a label exists.
- `global_notes_last`: the Look/grade/lighting block is at the end (definitions are at the top, not here).
- `constraint_tail_present`: the prompt ends with the subtitle/watermark/logo suppression tail.
- `no_second_marks`: no timestamps or second-counts anywhere in the prompt ("over 9s", "0–3s" fail); pace is expressed in words and event order only.
- `positive_lock_only`: any static-lock uses positive fixed-state phrasing (no "no/not/don't/never") AND names its specific rigid target — the words "subject unchanged" fail this check. SCOPE: this rule governs content/state/lock phrasing only; the constraint tail is the single sanctioned negative block (vendor's own artifact-suppression phrasing) and is exempt.
- `primary_motion_present`: the prompt has exactly one primary motion source (subject action with a start→end verb, or a camera move). Ambient motion alone fails; locked camera + actionless subject fails and becomes a gap.
- `character_performance_present`: every character on screen has explicit performance direction (scripted action or written micro-performance); a character with no verb fails.
- `panel_range_scoped`: for a group in a gridded scene, the grid definition names the exact active panels (matching the registry group's `panel_ids`), declares unused panels continuity-context-only, and every shot block cites its panel; an unscoped "strict order" over a grid larger than the group fails, and prompt panels that disagree with the registry's `panel_map` fail.
- `cut_handoff_compiled`: the prompt's action ends at the row's cut-out state, and (if the previous row specified a cut-in for this shot) CONTEXT opens by answering it. A "rest" cut-out passes but is noted; a missing cut-out fails.
- `single_lighting_state`: the prompt carries exactly one canonical lighting state — any in-shot lighting transition fails and becomes a gap ("time passes between shots").
- `arc_entities_bound`: every character, hero prop, and location named in the action has a reference bound in SUBJECT DEFINITIONS (or is explicitly background-tier per the Bible). An arc that moves the ship with no ship reference attached fails.
- `ambient_motion_present_if_organic`: if the environment has organic/atmospheric elements (and the subject isn't a deliberately-frozen tableau), ambient-life motion is named.
- `no_invented_values`: every stateful claim traces to the Bible or shot row.

---

## Gap report format

(Folded into the structured output above — a gap is `status: "gap"` with `render_prompt: null` and the named problems in `gaps`. Never emit a prompt and a gap together; it's one or the other.)

---

# CRAFT REFERENCE (knowledge tables — apply, don't let them dictate impact-thinking)

The following are reusable craft tables. Use them to phrase a camera move, a lighting state, or a grade precisely. Ignore any instinct in them toward hooks, per-shot grading freedom, or movement-for-its-own-sake — those are governed by the narrative rules above.

## Camera language — how to phrase camera so Seedance obeys it

A camera instruction has four parts: **shot size, angle, lens character, and movement.** The shot row gives you the move and usually the size; phrase all four the way the model actually parses them. The rules below are Seedance-specific and matter more than the vocabulary:

**The five phrasing rules (these prevent the most common failures):**

1. **One primary camera move per shot.** Stacking moves ("push in, then pan, then orbit") produces jitter and drift. If you need a compound move, sequence it as beats in event order, never with timestamps: "Begins as a slow dolly-in, then eases into a gentle pan right for the closing moment." Sequence, don't jam.
2. **Use rhythmic, plain words — NOT technical specs.** "slow, smooth, steady, gradual, gentle, drifting" all work. "24fps, f/2.8, ISO 800, 85mm" is **ignored** by the model — it's prompt decoration that does nothing. The same goes for output specs: "1080p," "4K," quality tiers, and aspect ratios in prompt text are dead words — including dressed-up forms like "2.39:1 anamorphic widescreen framing intent," which contradicts the API's actual aspect parameter and risks baked-in letterbox bars. (Anamorphic LENS character — oval bokeh, horizontal flares — is legitimate Look language; the RATIO is not.) These — those are **API parameters** the app passes on the generateShot call (from the render package's structured fields), never prompt content. Describe the camera the way you'd tell an operator the feel, not the way you'd set a camera body.
3. **Separate camera motion from subject motion — only one thing moves fast at a time.** "The dancer spins; the camera holds a fixed frame" works. "Camera spins around a spinning dancer" produces chaos. If the subject is the action, lock or slow the camera; if the camera is the action, calm the subject.
4. **"Fast" is the single most quality-degrading word.** Fast camera + fast cuts + busy scene almost guarantees artifacts. Default to slow/medium; reserve speed for a deliberate, isolated moment.
5. **A reference video beats text for an exact camera move.** Text is best for _spatial_ decisions (framing, subject, look); if you need a precise camera trajectory or pacing, a short stabilized reference clip (`@Video1 for camera movement`) carries it better than any words. (If the reference is shaky, the model copies the shake.)

**Shot size** (state it — the model defaults vaguely otherwise): extreme wide / wide / full / medium-wide / medium / medium close-up / close-up / extreme close-up. Match size to intent: wide for scale and place, medium for behavior and interaction, close for emotion. Name it explicitly ("medium close-up on his face") rather than implying it.

**Camera angle** (state when it carries meaning): eye-level (neutral), low angle (subject looms, power/scale), high angle (subject diminished, vulnerability), overhead/top-down (god's-eye, layout), over-the-shoulder (spatial relationship in a two-person beat), Dutch/tilted (unease). A flat eye-level default is fine for most shots; use a non-neutral angle only when the beat's meaning wants it.

**Lens character** comes from the Bible's Look (e.g. "35mm fine grain, subtle anamorphic oval bokeh") and is stated identically every shot — it is NOT a per-shot choice. Depth-of-field, however, _can_ vary by shot intent: "shallow focus, background soft" to isolate a subject in an emotional beat; "deep focus, everything sharp" for an establishing wide. Phrase it as the feel ("shallow focus, soft background"), not as an f-number.

**Putting it together — a camera line reads:** [shot size] + [angle if non-neutral] + [one movement, phrased rhythmically] + [focus feel]. E.g. _"Medium close-up, slight low angle, slow dolly-in over the shot, shallow focus with a soft background."_ One size, one angle, one move, one focus note — clean and obeyed.

## Camera Movement Encyclopedia (match to the beat's mood)

| Movement                      | When it fits a beat                              | Seedance phrasing                                                                                                       |
| ----------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Dolly Forward / Push-In**   | rising tension, growing intimacy, focus          | "Camera dollies forward at constant slow speed, subject centered, sharp focus maintained, no focus breathing."          |
| **Dolly Back / Pull-Out**     | reveal, release, isolation, context              | "Camera pulls back steadily, subject anchored in frame, background gradually revealed."                                 |
| **Truck Left/Right**          | lateral reveal, following without reframing      | "Camera trucks [left/right] smoothly, subject holds frame position, parallax: background moves slower than foreground." |
| **Pan / Tilt**                | survey a space, reveal scale up/down             | "Camera [pans/tilts] smoothly with eased start and stop, no jerk, ending on [subject]."                                 |
| **Handheld**                  | urgency, documentary realism, unease             | "Handheld micro-vibration, subtle breathing motion, not locked-off; human imperfection."                                |
| **Steadicam / Gimbal Follow** | flowing, controlled motion with a moving subject | "Gimbal-smooth follow at constant distance, liquid stabilization, subtle breathing only."                               |
| **Tracking / Side Follow**    | subject moving through environment               | "Camera tracks subject from the side at matched speed, environment reveals progressively via parallax."                 |
| **Crane Up / Down**           | establish scale; descend to intimacy             | "Camera [rises/descends] smoothly, [tilt to keep subject in frame], landscape revealed on rise."                        |
| **Orbit / 360**               | study a subject, hypnotic emphasis               | "Camera orbits the subject at constant distance, subject frame-centered, background revealed through rotation."         |
| **Rack Focus**                | shift attention between planes                   | "Focus racks from [foreground] to [background] smoothly; the other plane softens during the shift."                     |
| **Dutch Angle**               | unease, psychological imbalance                  | "Frame tilted [15–25]° and held throughout; diagonal horizon; tension without explicit threat."                         |
| **Lock-Off / Static**         | calm, observation, safety — and drift-avoidance  | "Camera locked, zero movement; subject moves within a still frame; observational stillness."                            |

**Combine at most 1–2 moves per shot.** More than that reads as chaos and increases drift.

## Lighting Library (the State Schedule names which; this is how to phrase it)

| State                      | Mood                           | Phrasing (color temp + character)                                                        |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| **Three-Point (neutral)**  | controlled, clean              | "Warm key at 45°, soft fill at ~1/3 key, gentle rim; soft-edged shadows."                |
| **Chiaroscuro / Low-Key**  | mystery, tension               | "Single hard key, minimal fill, most of frame in shadow, crushed blacks; noir contrast." |
| **Silhouette / Backlit**   | mystery, separation            | "Subject backlit against a bright source, rendered as a shape, rim defines the outline." |
| **Golden Hour**            | warmth, nostalgia, beauty      | "Warm ~3000–3200K low-angle light, atmospheric haze, warm-spill soft shadows."           |
| **Moonlight / Cool Night** | isolation, eerie calm          | "Cool ~6500K directional light, blue-tinted shadows, low intensity."                     |
| **Harsh Midday**           | exposure, heat, relentlessness | "Hard ~5500K overhead sun, short hard-edged shadows, high contrast, heat shimmer."       |
| **Practical / Firelight**  | intimacy, primal, danger       | "Warm ~1800–2000K flickering source, large dancing soft shadows."                        |
| **Soft Overcast**          | calm, clarity, vulnerability   | "Diffuse omnidirectional ~5500K light, soft-edged shadows, even illumination."           |
| **Volumetric / God Rays**  | grandeur, otherworldly         | "Directional light through particle-filled air, visible beams, dust motes in shafts."    |

## Color Grade (the Bible's Look picks ONE — apply it, don't choose per shot)

The Bible already specifies the film's grade. Phrase it consistently every shot. Common grades, for reference only:

| Grade                       | Character                        | Phrasing                                                                                          |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Golden / Warm Nostalgia** | warm amber, warm shadows         | "Color temperature ~3200K amber-gold; warm orange-brown shadows (not blue); nostalgic warm glow." |
| **Teal & Orange**           | cyan shadows, orange highlights  | "Shadows cyan-teal, highlights orange-gold, midtones neutral; modern cinema palette."             |
| **Cool / Cold Isolation**   | blue, desaturated                | "~6500K, blue-cyan shadows, slight warmth in highlights, mild desaturation."                      |
| **Desaturated + Accent**    | muted world, one saturated color | "Overall saturation reduced; one accent color [name] held at full saturation."                    |
| **Bleach Bypass**           | gritty, lifted blacks, grain     | "Blacks lifted to dark grey, compressed contrast, visible grain, analog feel."                    |

State the film-stock/lens character the Bible specifies (e.g. "35mm fine grain, subtle anamorphic oval bokeh, warm halation") in the same global block, every shot, so the whole film coheres.

## Sound (Seedance reference mode generates ambient audio automatically)

In reference mode, synchronized ambient audio is on by default — acceptable for film. If a shot wants a specific anchored sound, name it ("the crack of stone settling," "wind over sand") so the audio has something concrete to lock to. **Dialogue/voice consistency is deferred to the later audio phase** (voice fed as reference there); do not rely on fresh-synthesized dialogue per clip for consistency.

---

## Quick checklist before emitting a prompt (or a gap)

- Did every value come from the Bible or the shot row? (If not → gap.)
- **Is there exactly ONE primary motion source — subject action with a real verb, or a camera move?** (Ambient-only or locked-camera-plus-static-subject → gap.)
- **Does every character on screen have performance direction** (scripted action or micro-performance)? Is no character static-locked?
- Are only the on-screen assets attached, each opened with a Define-as-label binding stating what it governs — character references in the earliest slots — and is every later mention using the exact label?
- Is the prompt free of timestamps/second-counts (pace in words and event order only)?
- Does the prompt end with the subtitle/watermark/logo constraint tail?
- Are all definition lines verbatim from the Bible §2, and does every slot resolve to a distinct image (no duplicated URLs)?
- Any partial figures owned and internally consistent; any sound/off-screen reactions phrased as reactions, not physical forces?
- Is the grade the Bible's single Look, not a per-shot choice?
- Is the lighting the shot's State Schedule state?
- If anything rigid is fixed-within-shot, does the static-lock clause name that specific thing in positive phrasing (never "subject unchanged")?
- Is this compile honoring the generation group marked at Step 17 (solo or 1–4-shot group, summed estimates ≤15s) — not a re-partition invented at compile time? Motion-rich / fulcrum / timing-critical shots solo?
- Is a motion-rich shot given its own full generation (not starved by sharing)?
- Are scale relationships stated where proportion matters?
- Does the action end at the row's cut-out state, and does CONTEXT answer the previous row's cut-in? Does the framing honor the row's Scale and the scene's Space line?
- Exactly one lighting state in the prompt (no in-shot transitions)?
- Is every entity named in the action bound in SUBJECT DEFINITIONS (hero props included) or explicitly background-tier?
- Is the `resolution` field the final tier for an approved shot (preview tier only for explicitly-labeled preview passes) — and is the prompt text free of resolution/quality/aspect words (those are API parameters, not prompt content)?
- No per-shot "hook"; camera move matched to the beat's mood (or locked only when the subject carries the motion)?
