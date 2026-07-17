# Shot Compilation Recipe — Turning the Locked Bible into Seedance 2.0 Prompts

> **DO NOT LOAD THIS FILE DURING STAGE 1.** It is useless before reference images exist, and reading it while authoring the story or shot list will contaminate that work with premature render-prompt thinking. Load it ONLY after Stage 1 is fully complete — the Bible is locked, every `@material` has an approved reference image, AND every shot is covered by an approved motion sheet (or skip) in the Generation Grid Registry (Stage 1 Step 16) — at the moment you begin writing Seedance prompts in Stage 2. If you are still developing premise, characters, screenplay, shot-list intent, or generating asset images, this file is not yet relevant.

This is the reference the showrunner loads in Stage 2 (Bible locked, all assets approved, all motion sheets approved) when writing Seedance prompts. It is **not** a story tool — every creative decision was already made and frozen in the Bible. This document is purely about _compiling_ those locked decisions into precise, renderable Seedance 2.0 prompts.

---

## The one rule that governs everything

**Every value in a shot prompt comes from the Bible or the shot row. Nothing is invented here.**

The lighting comes from the shot's State Schedule entry. The color grade comes from the Bible's Look. The character's appearance comes from the approved reference image. The camera move comes from the shot row. If a value you need isn't in the Bible or the row, that is a **gap to flag**, not a blank to fill from imagination. A shot prompt is an act of _translation_, not authorship.

This is the opposite discipline from viral single-clip prompting, where each clip invents its own hook, grade, and mood to stop a scroll. A film is the reverse: every shot must _subordinate_ itself to the whole, because 24 shots that each made their own striking choices do not cut together into a film — they fight.

---

## Continuity beats impact (read before using the craft tables)

**Craft rules in this recipe are production defaults for the current tested model profile, not universal cinema laws.** Controlled exceptions are allowed only when explicitly locked in the Bible / shot row and reviewable. Process gates (Bible-verbatim binds, COMPOSITION LOCK, footing continuity, no invented values, approvals-as-buttons) stay absolute.

The craft tables below are excellent and come from a skill built for viral clips. Their _knowledge_ (camera moves, lighting setups, color science) is reusable. Their _instinct_ — open with a hook, move the camera always, grade for maximum punch — is wrong for narrative and must be inverted:

- **No per-shot hooks.** A shot in a film opens by continuing the previous shot, not by re-grabbing attention with a black-to-light burst or a whip. The "2-second hook" thinking that suits TikTok destroys narrative flow. The film's hook is its opening; individual shots serve the scene, not the scroll.
- **A locked camera is legitimate — an unperformed SHOT is not.** Lock-off is often correct (observational, calm, drift-safe) _when the subject carries the motion or holds a written performance_. Stillness must not compound into a photograph with drifting mist: if the camera is locked AND the subject has no written verb (including intentional deadpan hold), the row goes back as a gap.
- **One SHOW LOOK, applied by default.** Do not invent a fresh grade per shot. The Bible's Look is the film's default grade; controlled scene/sequence trims are allowed only when named inside the locked Look. The only freestyle per-shot variation is the State Schedule's lighting state.
- **Match the camera move to the beat's mood, not to "make it cinematic."** A tense beat might want a slow push-in; a calm one a lock-off; a reveal a pull-back. The mood is in the shot row. Let it choose the move.

---

## The dominant-motion rule (check this before anything else in the shot)

**Every prompt must have one DOMINANT motion source: the SUBJECT or the CAMERA.** This is the first thing to identify when compiling a shot, read straight from the shot row's Primary column (or inferred from its motion arc if the row is in an older format). Secondary motion is allowed when slower, smaller, and subordinate to the dominant source.

- **Dominant = SUBJECT:** a character acts or an object moves; the camera calms, locks, or moves only subordinately. The action must be a real verb with a start→end delta (a step taken, a hand raised, a body pushing backward) — not an unperformed pose. Intentional stillness counts when written as breath, gaze, tension, posture, or deadpan hold.
- **Dominant = CAMERA:** the camera move develops the frame (push-in, pull-back, truck, crane); the subject calms or holds micro-performance — never unperformed total stillness.
- **Neither:** invalid. Do not "compile it faithfully" into a static tableau — emit `status: "gap"`: `"Shot N: no dominant motion — subject has no action/hold and camera is locked; the row needs a delta or a written performance hold."` A beautifully lit photograph is the most common quality failure this recipe exists to prevent, and it is caught here, before a generation is spent.
- **Both fast:** also wrong — one calms or stays subordinate (rule 3 of the camera phrasing rules below). Equal competing motions fail.

Ambient environmental life (mist, foliage, water, light) is tier (b) seasoning and **never counts as the dominant motion.**

---

## Generation grids (how shots become generations)

**Compile precondition (machine-checkable):** compilation input MUST include the completed Generation Grid Registry from Stage 1 Step 16 (written via `recordGenerationGridEntry`, validated by the app). If the registry is missing, incomplete, or any shot lacks an entry whose status is `approved_grid` or `skip_recorded` (with required fields), emit `status: "gap"` and do not compile: `"Shot N: Generation Grid Registry missing/failing for shot N — run Stage 1 Step 16 before compiling."` Per shot: `approved_grid` must attach that shot's motion sheet, open with COMPOSITION LOCK on Panel 1 and END STATE LOCK on Panel n, and instruct continuous-take interpolation; `skip_recorded` must carry the registry's `skip_reason` in the render package. A missing `grid_handle` is not a skip. A missing registry is not a skip. Never skip the sheet phase silently because assets are done.

The unit of DRAMA is the scene; the unit of GENERATION is the **motion sheet (one shot)**. They are deliberately separate layers — a scene spans several shots/sheets; the render window must never redefine what a scene is.

**Scene continuity pack (reference only).** Locked in Stage 1 per scene via `recordContinuityPackEntry`: structured notes + 1–3 visual keyframes. It is NOT a Seedance sequence input. Attach keyframes as geography references; never instruct Seedance to "render the continuity pack panels" or hard-cut them. Honor notes in CONTEXT / COMPOSITION LOCK wording.

**Incoming anchor chain (from Stage 1 registry).** Honor `previous_generation_id` / `incoming_anchor_*` / `continuity_break_reason` from the Generation Grid Registry:

- Continuous later shot: attach the incoming anchor. Prefer upgrading `incoming_anchor_kind` to **`prior_render_last_frame`** once the previous clip is approved (pixels beat the planned terminal panel). Use `extend_video` + that clip for motion joins. Panel 1 of this sheet must open from that anchor.
- Intentional break (`continuity_break_reason` set): `fresh` mode; do not extend; still honor the continuity pack for geography.
- First-in-scene: pack + character/location only.

**The motion sheet (trajectory, approved at image price).** Built in Stage 1 Step 16 — full reference: Stage 1 `generation-grids.md`. One sheet = **one uninterrupted shot**, **4–9** temporal panels (Panel 1 = cut-in, middle = milestones only, Panel n = cut-out), estimated Dur ≤15s (prefer 8–12). At compile time, consume the approved sheet (or skip record) from the registry; do not regenerate sheets here. **One `compileShot` = one motion sheet = one shot.**

**Do not re-partition.** The sheet was decided during Stage 1 and recorded as a registry entry. Compile it as-is. If a shot arrives unmarked, that is a gap (Step 16 incomplete), not an invitation to invent a new window here.

**Duration semantics (important):** the shot list's Dur column is an ESTIMATE — planning data and the runtime total. It NEVER enters any prompt. The API duration parameter = the entry's `estimated_duration_seconds` (≤15s). The motion sheet is **one continuous take** — Seedance must interpolate between panel states, not hard-cut. Steer pace with RELATIVE pace words along the trajectory ("lingers on the open, accelerates through the turn"). If pacing is wrong, targeted reroll with stronger pace words — or regenerate the sheet with clearer milestones.

**COMPOSITION LOCK + END STATE LOCK (mandatory — soft panel citations are forbidden).** A panel number alone (`composition matches panel a`, `composition follows panel 4`) is a polite suggestion; models ignore it. Every shot MUST open with an explicit cut-in lock from Panel 1 and an end-state lock from Panel n, extracted from approved panel pixels + shot row + `panelCaptions`. Middle panels guide milestones in PRIMARY ACTION / CAMERA — they are not hard cuts. Do not invent geography that contradicts the sheet. Worked form:

```
Shot [n] (motion sheet [ImageN], panels 1…N):
COMPOSITION LOCK: match panel 1 of the approved motion sheet — [brief extraction: framing/scale, subject position in frame, background geography, screen direction, footing/surface if relevant, key visible state].
END STATE LOCK: match panel N of the approved motion sheet — [end framing, footing, screen direction, key visible state prepared for the next shot's cut-in].
PRIMARY ACTION: … (honor middle-panel milestones as continuous beats, not cuts)
```

- A panel citation without filled COMPOSITION LOCK / END STATE LOCK fails compile → emit `status: "gap"`.
- If locks cannot be extracted from panel + row + captions without inventing → gap, not a render.
- The locks are **extraction from the approved trajectory**, not a second authorship pass that can fight the pixels.

**Motion-sheet prompt structure:** one SUBJECT DEFINITIONS block (verbatim Bible lines) which ALSO defines the motion sheet —

`Define the panel sequence in [ImageN] as **the approved motion sheet for shot {id}** — Panel 1 is the cut-in, Panel N is the cut-out, middle panels are milestones only. Interpolate naturally between these states; one continuous take; no cuts; never show the grid or gutters.`

— then the single shot block with COMPOSITION LOCK + END STATE LOCK + PRIMARY ACTION / PERFORMANCE / CAMERA / pace words, NO timestamps; then GLOBAL RENDER NOTES + constraint tail. **Forbidden:** hard-cut language between sheet panels; "render all panels in order as separate shots"; any "ignore other panels" clause.

**App-side contract:** one sheet → one continuous clip for that shot. Rejection rerolls the shot generation (or regenerates the sheet in Stage 1) — there are no sub-shot splits inside a motion sheet.

**Validation caveat:** the sheet's value rests on (1) the image model keeping cross-panel geometry coherent and (2) Seedance interpolating rather than hard-cutting. Treat early films as validation runs; if sheets return contradictory panels or video chops the board into cuts, reduce panel count and strengthen interpolate wording.

## Continuity across shots — native extension and track completion

**The #1 cross-clip failure: geography teleport.** Shot N ends with a character on surface A; shot N+1 opens with them on surface B (stairs → sidewalk, doorway → street, bridge → bank). Text-only cut-ins ("toward the stairs", "approaching", "near the entrance") under-specify footing, so Seedance invents a new floor. Fix in three layers:

1. **Position-locked cut-out / cut-in (always).** Cut-out must name the character's exact footing/surface at the last frame: `the hero stands ON the stone staircase, mid-flight, facing up toward the landing — NOT on the street below`. Cut-in of the next shot must OPEN by restating that same footing verbatim before any new action. Vague handoffs ("toward the stairs", "near the site", "at the entrance") are gaps — regenerate the row or the compile. Motion sheets reinforce this: prior Panel n ↔ next Panel 1.

2. **Use `compileShot` continuity modes (do not invent URLs).** After each approved clip the app returns the clip URL (and a last-frame still for CONTEXT). Choose:
   - `continuityMode: "extend_video"` + `sourceVideoUrl` = previous approved clip — for continuous walks / approaches / same-surface carries / hard joins that must keep pose and footing. Prompt opens with `Extend <Video_1>: [next beat]`. Never say "reference `<Video_1>`" (that flips into reference-transfer mode). Optional stills OK.
   - `continuityMode: "fresh"` — scene opens, clean breaks, and new takes. Requires stills in `referenceImageUrls`. When geography must still match the prior clip, restate footing in CONTEXT from the approval last-frame still (text only — do not attach it as a first-frame API input).
     Do NOT start a fresh stills-only generate when the next beat continues the same character through the same space — use `extend_video`.

3. **Pixel truth beats the planned row.** After approving generation N, if the rendered last frame disagrees with the written cut-out (e.g. row said "approaching the stairs" but pixels show them already ON the stairs), rewrite the next generation's CONTEXT from the PIXELS, not the stale row. Stale cut-ins are how teleports happen.

When two generations must connect seamlessly, prefer **extend_video** over manual tricks and upgrade the registry incoming anchor to the prior clip's **last frame**. Continuity comes free, and the per-generation approval loop stays intact. Also honor the scene continuity pack for geography / screen direction across generations.

- **Quality degrades over repeated extensions** — mottled artifacts accumulate, especially on faces. Keep chains short (2–3 links); never build the whole film as one extension chain.
- **Joins can jump-cut.** Standard post fix: trim ~6 frames from the end of the earlier clip and ~1 frame from the start of the later one at each join.
- **Track completion** stitches existing approved clips: up to 3 video inputs, ≤15s combined, with the model generating the transitions (`<Video_1> + [transition description] + followed by <Video_2>`). Useful for bridging two approved shots with a generated connective beat.
- **Trajectory drift inside a sheet.** If middle milestones invent a new floor/axis, the interpolate path will teleport mid-take. Prefer fewer, real milestones; keep continuous walks on one surface.

Extension is a _continuity_ tool, not a substitute for correct per-shot sizing: do not invent multi-shot boards just to preserve geography; use continuity modes across correctly sized motion sheets instead.

---

## Reference binding — the @material → [Image#] translation

Stage 1 wrote `@material` handles (e.g. `@hero_charsheet`, `@giza_plate`). Seedance 2.0 reference mode takes uploaded images addressed as `[Image1]`, `[Image2]`, etc., **in the order they're attached** (first attached = `[Image1]`). Compilation resolves each handle to its approved image and assigns slots. **Default tested profile:** a character handle is one slot — one turnaround character-sheet image per character. Extra identity refs require a user-approved / documented model profile; do not invent a second character image at compile time.

Four hard rules:

1. **Slot order = precision priority.** The more precisely an asset must be matched, the EARLIER it goes:

   **character → object/prop → location plate → continuity-pack keyframes → incoming anchor → motion sheet**

   Seedance weights earlier assets more heavily for precise reference. Put `referenceImageUrls` in that order when calling `compileShot`.

   | Slot group | Kind | Role |
   | --- | --- | --- |
   | Earliest | character / object / location | Identity + environment (precise match) |
   | Mid | continuity-pack keyframes (1–3) | Scene geography reference only — **not** panels to hard-cut |
   | Mid–late | incoming anchor | Prior terminal panel or prior last frame (continuous later shots; omit on first-in-scene / intentional break) |
   | Last | motion sheet | Continuous-take trajectory THIS shot interpolates |

   Never put the motion sheet before identity refs. Never treat continuity-pack or incoming-anchor images as hard-cut sequences.

2. **Attach only the assets that appear in this shot**, plus required continuity refs. Reference mode accepts up to 9 images, but focused refs beat more. Always include: on-screen character(s)/object(s)/location, the scene continuity-pack keyframes, the incoming anchor when the registry requires it, and this shot's motion sheet. If identity assets alone would blow the budget before continuity/sheet fit, that's a gap — flag it (the beat is probably too crowded), don't silently drop continuity or the sheet.

3. **DEFINE each subject up front, then use the label everywhere — and the definition text is LOCKED (Bible-verbatim).** Each asset's definition line (label, its 2–3 stable features, its anchor details) is written ONCE in the Bible §2 and pasted VERBATIM into every prompt that uses the asset. Never re-derive, expand, or re-essay the image per shot — bind + govern + label only. A character defined by "dust smudge, amulet, chisel at belt" in one shot and "bare feet, linen kilt" in the next is two different definitions competing for one identity — definition drift is identity drift by the back door. (Per-shot additions are allowed only as appended clauses after the locked line, e.g. adding a hand-relevant anchor for an insert — never as substitutions.) The official binding grammar: open the prompt with definitions —
   - `Define the [2–3 stable features, e.g. woman in the grey wool coat with the silver pendant] in [Image1] (facial features, styling, wardrobe, build) as **the detective**.`
   - `Define the environment in [Image2] as **the alley**; it governs environment, architecture, and composition.`
     Then **every subsequent mention of that subject uses the exact same label** ("the detective", never "the woman" / "she" at first mention of a new sentence block where ambiguity could arise). An unbound mention is how identity drift starts. For a quick one-off binding without a definition, the inline form `detective@Image1` also works — but for film work, prefer explicit definitions.

4. **State what each reference governs.** Never attach an image silently — the definition must say what attribute it controls (facial features / styling / environment / object form), or the model merges attributes unpredictably.

Keep labels identical for the whole prompt — definition drift is identity drift.

---

## Static-lock — positive phrasing only, and NEVER on characters

When a shot is flagged static-lock (a rigid subject must not change/morph during the shot), state it in **positive** terms and **name the specific thing being locked**. Seedance interprets "no X" as a cue for X — negatives backfire. Use the worked phrasings:

- For the structure/object: `CRITICAL: the [named structure/object] is FIXED — it remains exactly as shown in [Image#] throughout this shot; only the camera moves, the [named thing] unchanged.`
- The identity anchor: `Stable identity, natural proportions, clean edges throughout.`

Never write "the pyramid does not grow" or "no morphing" — write the fixed state as a present fact. And **never write the blanket clause "only the camera moves, subject unchanged"** — in a frame containing characters, that clause freezes the _characters_, producing mannequins in a diorama. The lock always names its target: "the pyramid unchanged," "the ship's hull unchanged," never "subject unchanged."

**Characters are never static-locked or left unperformed.** Character identity consistency comes from the reference-image binding (the character's verbatim Define-as-label line in SUBJECT DEFINITIONS) plus the identity anchor line — not from freezing motion. Every character in frame gets explicit **performance direction**:

- If the character carries the shot's dominant motion: the scripted action, phrased as start→end (`she pushes herself back into the roots, heels dragging through the soil, one arm wrapping her belly`).
- If the character is secondary in a camera-driven shot: written **micro-performance** at minimum — breath, gaze, small gestures (`his chest rises with quickened breath; his eyes track the figure; his fingers tighten in the dirt`).
- **Intentional stillness** is allowed when written as breath, gaze, tension, posture, or deadpan hold — not as absent performance. The model does not invent blocking; a character with no written verb stands like a wax figure.

**CRITICAL — lock RIGID things, NEVER lock ORGANIC/atmospheric things.** Static-lock exists to stop _rigid_ subjects from morphing (a structure's shape/height, a vehicle's form, a hero prop). It must NOT be applied to organic or atmospheric elements, which in a living environment are _supposed_ to be in constant gentle motion. If you lock a whole environment, you get a beautiful frozen photograph that a character walks through — the #1 cause of "the background feels static / looks AI." **Always request ambient environmental motion explicitly** for anything organic in frame:

- Foliage, vines, leaves, grass: "leaves and vines sway gently in a soft breeze."
- Water (streams, sea, drips): "the stream flows steadily, surface catching light."
- Mist, smoke, dust, haze: "mist drifts slowly across the ground."
- Light through moving canopy/clouds: "dappled light shafts shimmer faintly as the canopy stirs."
- Fire, embers, fabric, hair, banners: "flames flicker, embers drift; fabric stirs in the air."

So a shot's motion instruction has THREE tiers: **(a) the dominant motion** (the shot row's designated source — subject action OR camera move; always present; secondary motion only when slower/smaller/subordinate); **(b) ambient life** (organic elements always breathing — foliage, water, mist, light — plus character micro-performance or written hold); **(c) the targeted rigid lock** (a named structure or object that must not morph). Only (c) gets the FIXED clause, and it always names its target. A prompt missing tier (a) is a gap, not a render.

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

Duration is an API PARAMETER on the render package, never prompt text, and the shot row's Dur is an ESTIMATE. The API duration = that shot's estimate (≤15s, prefer 8–12). The motion sheet is one continuous take — steer pace along the trajectory with relative pace words. Long takes are where motion drift creeps in; if pacing fails, reroll with stronger pace words or regenerate the sheet with clearer milestones.

---

## Prompt section order (single shot)

Assemble in this order, global notes last:

1. **SUBJECT DEFINITIONS (first):** the Define-as-label bindings for every attached reference (see binding grammar above). These go FIRST — precise references are weighted by early placement, and every later mention depends on the labels existing. When a motion sheet is attached, its definition states continuous-take interpolation (Panel 1 cut-in → milestones → Panel n cut-out; no hard cuts; never show grid/gutters).
2. **CONTEXT** — one line: what this shot is, where it sits in the scene — and if the previous shot's row specifies a cut-in for this shot, CONTEXT opens by ANSWERING it ("From her point of view: the empty doorway..."; "The turn completes: he now faces the window..."). **When continuing a character across generations, CONTEXT must restate exact footing/surface from the previous cut-out (or from the approved last-frame pixels if they diverge):** `Continuing: the hero is still standing ON the stone staircase, mid-flight, facing up — same footing as the previous shot's last frame; they are NOT on the street below.` Honor the scene's Space line and continuity pack: geography and screen direction here must match every other shot in the scene. (Not a hook. A continuation.)
3. **COMPOSITION LOCK + END STATE LOCK (required when a motion sheet is attached):** immediately after CONTEXT (or as the opening of the shot block), write `COMPOSITION LOCK: match panel 1 of the approved motion sheet — [brief extraction…]` and `END STATE LOCK: match panel N — […]`. Soft phrases (`composition matches panel…`, `composition follows panel…`) fail. Source the extraction from approved panels + row + captions; if unextractable → gap.
4. **PRIMARY ACTION** — the shot's dominant motion, phrased as a start→end arc with a real verb: what moves, how, and where it ends up. If Dominant = SUBJECT, this is the character/object action (or a written intentional hold); if Dominant = CAMERA, this states what the developing frame reveals while characters hold micro-performance. This section may never describe an unperformed motionless tableau — if the row gives you no delta and no written hold, that's a gap, not a compile. Secondary motion may appear only when slower, smaller, and subordinate. The action ENDS at the row's cut-out state, written explicitly as the final sentence — and that cut-out must lock **footing/surface/position**, not just intent ("toward the stairs" fails; "stands ON the stone staircase, mid-flight, facing up" passes). This is the half of the edit this generation owns; the next shot's CONTEXT answers it. **State scale relationships explicitly when scale matters** — the model defaults to wrong proportions if you don't. "Limestone blocks" alone renders person-height boulders and a toy-looking monument; instead write the relationship: "blocks roughly waist-to-chest height, the structure rising hundreds of feet, human figures tiny against it." Whenever a shot depends on bigness, smallness, or proportion, name the relationship between the elements — don't assume the model infers it.
5. **PERFORMANCE** — explicit direction for every character in frame (by label): the scripted action if a character is the dominant motion, written micro-performance (breath, gaze, small gesture) or intentional hold (tension, posture, deadpan) otherwise. Never omitted when a character is on screen; never replaced by a static-lock. Three phrasing traps: **(a) partial figures need explicit ownership** — a hand, foot, or shadow entering frame must say whose it is, and if it belongs to an anonymous party, say so in a way that excludes the defined subjects ("another bystander's shoe, visible only from the shin down") — an unowned limb next to a defined character reads as _that character's_, which can invert a scene's meaning; and give the limb internally consistent attributes (never contradictory features that average into something wrong). **(b) Reactions to sound or off-screen events are reactions, not forces** — write "at the offscreen shout, her hand flinches back," never "her hand is yanked back by the shout"; physical-causation phrasing makes the model render physical contact. **(c) Eyeline / gaze target is mandatory on any reaction or discovery beat** — "shocked," "stares," "freezes," "sees," "looks up" without a named target is how you get a face of terror looking past the subject. Always write: **who looks → at what (by label) → where in frame / height**. Worked form: `the detective's eyes lock DOWN and RIGHT onto the child at waist height in the mid-ground — looking AT the child, not past them, not at the skyline, not off-camera`. If the target is shorter/smaller/taller, say the height relationship ("down onto", "up at"). If two characters share frame and one reacts to the other, the eyeline clause is non-negotiable — emotion without a gaze target is a failed reaction.
6. **CAMERA** — the move from the shot row, matched to the beat's mood (see encyclopedia). State stillness explicitly if locked — allowed when the subject carries the dominant motion or holds a written performance.
7. **STATE** — the State Schedule values as present facts.
8. **STATIC-LOCK** — if flagged, the positive fixed-state clause naming its specific rigid target (never "subject unchanged").
9. **GLOBAL RENDER NOTES:** the Look (grade, lens/film-stock character) and the lighting state. These go at the end because Seedance weights closing notes most for look and camera. (Reference definitions are NOT here — they moved to the top.)
10. **CONSTRAINT TAIL (very last line):** `Keep it subtitle-free; avoid generating any text or subtitles. Do not generate watermarks or logos.` Mandatory on every prompt — Seedance generates text natively and will occasionally burn unrequested subtitles or a platform watermark into the frame; this is the vendor's own suppression phrasing. This is the ONE sanctioned use of negative phrasing (see the positive-phrasing rule's scope note).

**No second-marks anywhere in the prompt.** Seedance's support for precise in-prompt timing ("0–3 seconds", "over 9s") is officially unstable and can produce abnormal generations. Total duration is an API parameter; pace _within_ the shot is controlled with words (slow, gradual, unhurried, brisk) and with the order of described events. Sequence beats by order ("begins as a slow dolly-in, then eases into a gentle pan right"), never by timestamps.

Follow the motion-sheet prompt structure above: SUBJECT DEFINITIONS (including continuous-take interpolate clause), then one shot block with COMPOSITION LOCK + END STATE LOCK + PRIMARY ACTION / PERFORMANCE / CAMERA, relative pace words only, then GLOBAL RENDER NOTES + constraint tail.

---

## Structured output — emit a JSON render package, not loose prose

Every compile produces ONE structured object, not free text. This makes the result machine-checkable (the app can show the user the prompt, run assertions, route gaps) instead of something a human has to eyeball. Emit exactly this shape:

```json
{
  "status": "ok" | "gap",
  "shot_id": "14",
  "generation_shot_ids": ["14"],
  "grid_reference": "@scene3_gen3A_grid" | null,
  "continuity_mode": "fresh" | "extend_video",
  "source_video_url": null,
  "render_prompt": "SUBJECT DEFINITIONS: Define ... in [Image1] (facial features, styling, wardrobe) as **hero**. Define ... in [Image2] as **the site**. Define ... in [Image3] as **continuity geography** (reference only — not shots to hard-cut). Define ... in [Image4] as **the incoming cut-in anchor** (prior terminal panel / last frame — reference only). Define the panel sequence in [Image5] as **the approved motion sheet for this shot** — Panel 1 is the cut-in, Panel N is the cut-out, middle panels are milestones only; Interpolate naturally between these states; one continuous take; no cuts; never show the grid or gutters. CONTEXT: ... COMPOSITION LOCK: match panel 1 of the approved motion sheet — [framing, subject position, geography, screen direction, footing]. END STATE LOCK: match panel N — [end framing, footing, screen direction]. PRIMARY ACTION: ... PERFORMANCE: ... CAMERA: ... STATE: ... [STATIC-LOCK: ...] GLOBAL RENDER NOTES: ... CONSTRAINT TAIL: Keep it subtitle-free; avoid generating any text or subtitles. Do not generate watermarks or logos.",
  "duration_seconds": 8,
  "resolution": "1080p",
  "references": [
    {"slot": "Image1", "handle": "@hero_charsheet", "kind": "character", "controls": "identity and wardrobe"},
    {"slot": "Image2", "handle": "@site_plate", "kind": "location", "controls": "environment, architecture, composition"},
    {"slot": "Image3", "handle": "@scene3_continuity", "kind": "continuity_pack", "controls": "scene geography / blocking (reference only)"},
    {"slot": "Image4", "handle": "@scene3_gen3A_grid", "kind": "incoming_anchor", "controls": "prior terminal panel cut-in (reference only)"},
    {"slot": "Image5", "handle": "@scene3_gen3B_grid", "kind": "grid", "controls": "motion-sheet trajectory to interpolate (no hard cuts)"}
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
    "motion_sheet_interpolated": true,
    "composition_lock_present": true,
    "end_state_lock_present": true,
    "cut_handoff_compiled": true,
    "footing_continuity": true,
    "continuity_mode_valid": true,
    "eyeline_target_named": true,
    "single_lighting_state": true,
    "arc_entities_bound": true,
    "ambient_motion_present_if_organic": true,
    "no_invented_values": true
  },
  "gaps": []
}
```

- `continuity_mode` maps to `compileShot.continuityMode`. `extend_video` requires `source_video_url` (prior approved clip); optional stills OK. `fresh` requires stills only. There is no first-frame / start-frame mode — use `extend_video` for pixel continuity, or `fresh` + CONTEXT footing for a new take.
- `continuity_mode_valid`: mode matches the join type; required URLs present; extend prompts open with `Extend <Video_1>:`.
- `render_prompt` is the assembled prompt in the section order below — this is the text shown to the user for approval/edit before any render.
- `generation_shot_ids` lists exactly one shot (one motion sheet = one shot). `duration_seconds` = that shot's ESTIMATED duration (≤15s). Shot-list Dur values never appear in the prompt.
- `grid_reference` is this shot's motion-sheet handle; the shot consumes it with COMPOSITION LOCK (Panel 1) + END STATE LOCK (Panel n) and interpolate / no-cuts language.
- `resolution` is the render tier as a STRUCTURED FIELD ONLY — the app passes it (with quality and aspect ratio) as parameters on the generateShot API call. It must never appear as words inside `render_prompt`: the model ignores "1080p" in prompt text the same way it ignores f-stops and ISO. Tier policy: the cheap tier (e.g. 480p) is allowed for preview passes; the shot's APPROVED/final render is always the top tier (e.g. 1080p). Never mark a preview-tier render as final — a 480p clip in the edit is a quality bug.
- `references` maps each `[Image#]` slot to its `@material` handle and the attribute it controls (the binding grammar, made explicit).
- `checks` is the assertion result — each is a hard rule from this recipe, self-verified before emitting. If any check is false, fix the prompt before emitting (or emit a gap if it can't be fixed from the Bible).
- On a missing/ambiguous/over-budget input, emit `status: "gap"` with `render_prompt: null` and the `gaps` array naming each problem, e.g.:
  - `"Shot 14: no State Schedule lighting value for this beat — needs a lighting state."`
  - `"Shot 9: references @ship but no approved image is bound to that handle."`
  - `"Shot 3: two slots resolve to the same image URL — a duplicated attachment wastes a slot; bind distinct images."`
  - `"Shot 12: 6 distinct assets named, exceeds the focused-reference budget — scene likely too crowded; confirm which are essential."`
  - `"Shot 7: no dominant motion — the row is an unperformed static tableau (subject has no action/hold, camera locked); it needs a delta or a written performance hold before it can render."`
  - `"Shot 14: lighting written as a transition (Golden Hour → dusk) — pick ONE state for this row; time passes between shots."`
  - `"Shot 22: the arc lifts the ship but @ship_object_ref is not in materials — bind it or the ship renders invented."`
  - `"Shot 5: COMPOSITION LOCK or END STATE LOCK missing — extract framing/subject position/geography/screen direction/footing from Panel 1 and Panel N + row; soft panel citations are insufficient."`
  - `"Shot 8: motion-sheet locks unextractable — Space/captions/panels do not yield concrete cut-in/cut-out locks; fix the row or regenerate the sheet before compiling."`

A gap is a success — it caught an incompleteness cheaply, before a video generation. The gap goes back to the showrunner, which fixes the Bible (with full story context) and recompiles.

**The `checks` are the recipe's rules as assertions** — verify each before emitting, and they are re-run on any user-edited prompt:

- `duration_in_range`: 4–15s (generation total ≤15s).
- `reference_count_ok`: ≤9 images attached.
- `all_assets_onscreen`: every attached asset actually appears in the shot.
- `every_reference_has_controls`: each reference's definition states what it governs (facial features / styling / environment / object form).
- `reference_images_distinct`: every attached slot resolves to a DIFFERENT image — a duplicated URL is a resolution bug wasting a slot. Fails as a gap, not a render.
- `definitions_verbatim`: every definition line matches the Bible §2 canonical text for that handle exactly (appended per-shot clauses allowed; substitutions fail).
- `subjects_defined_first`: the prompt opens with Define-as-label bindings for every attached reference; **character references occupy the earliest slots**, then objects, then plates, then continuity-pack keyframes, then incoming anchor (when present), then motion sheet last — matching `referenceImageUrls` order. Continuity-pack and incoming-anchor definitions must state **reference only — not hard-cut panels**. Motion-sheet definition must state interpolate / continuous take / no cuts / never show grid or gutters.
- `labels_consistent`: every mention of a defined subject uses its exact label; no unbound "the man"/"she" where a label exists.
- `global_notes_last`: the Look/grade/lighting block is at the end (definitions are at the top, not here).
- `constraint_tail_present`: the prompt ends with the subtitle/watermark/logo suppression tail.
- `no_second_marks`: no timestamps or second-counts anywhere in the prompt ("over 9s", "0–3s" fail); pace is expressed in words and event order only.
- `positive_lock_only`: any static-lock uses positive fixed-state phrasing (no "no/not/don't/never") AND names its specific rigid target — the words "subject unchanged" fail this check. SCOPE: this rule governs content/state/lock phrasing only; the constraint tail is the single sanctioned negative block (vendor's own artifact-suppression phrasing) and is exempt.
- `primary_motion_present`: the prompt has one DOMINANT motion source (subject action with a start→end verb / written intentional hold, or a camera move). Secondary motion may appear only when slower, smaller, and subordinate. Ambient motion alone fails; both-fast fails; locked camera + unperformed subject fails and becomes a gap.
- `character_performance_present`: every character on screen has explicit performance direction (scripted action, micro-performance, or written intentional hold: breath/gaze/tension/posture/deadpan); a character with no verb fails. Static-locking characters fails.
- `eyeline_target_named`: any reaction / discovery / "sees" / "shocked" / "stares" / "looks" beat names the gaze target by label AND screen direction/height ("down-right onto the child at waist height"). Emotion words alone without a target fail — that is the "shocked face looking past the subject" bug.
- `motion_sheet_interpolated`: when a motion sheet is attached, its definition instructs continuous-take interpolation (Panel 1 → milestones → Panel n); hard-cut / "render all panels in order as separate shots" language fails; "ignore other panels" fails.
- `composition_lock_present`: when a motion sheet is attached, the shot contains a non-empty `COMPOSITION LOCK:` on Panel 1 extracting framing, subject position, background geography, screen direction, and footing/surface/key visible state when relevant. Soft citations only fail. If unextractable → gap.
- `end_state_lock_present`: when a motion sheet is attached, the shot contains a non-empty `END STATE LOCK:` on Panel n (cut-out). Soft citations only fail. If unextractable → gap.
- `cut_handoff_compiled`: the prompt's action ends at the row's cut-out state, and (if the previous row specified a cut-in for this shot) CONTEXT opens by answering it — including **exact footing/surface/position** when a character continues across the cut. Vague cut-outs ("toward the stairs", "near the entrance") fail; position-locked ones ("ON the stone staircase, mid-flight") pass. A "rest" cut-out passes but is noted; a missing cut-out fails.
- `footing_continuity`: when the previous approved generation left a character on a named surface, this prompt's CONTEXT restates that same surface before new action. Surface-A↔surface-B teleports (stairs↔street, interior↔exterior, bridge↔bank) fail.
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
3. **Separate camera motion from subject motion — only one thing moves fast at a time.** "The dancer spins; the camera holds a fixed frame" works. "Camera spins around a spinning dancer" produces chaos. If the subject is the dominant action, lock or slow the camera; if the camera is the dominant action, calm the subject. Secondary motion must stay slower, smaller, and subordinate.
4. **"Fast" is the single most quality-degrading word.** Fast camera + fast cuts + busy scene almost guarantees artifacts. Default to slow/medium; reserve speed for a deliberate, isolated moment.
5. **A reference video beats text for an exact camera move.** Text is best for _spatial_ decisions (framing, subject, look); if you need a precise camera trajectory or pacing, a short stabilized reference clip (`@Video1 for camera movement`) carries it better than any words. (If the reference is shaky, the model copies the shake.)

**Shot size** (state it — the model defaults vaguely otherwise): extreme wide / wide / full / medium-wide / medium / medium close-up / close-up / extreme close-up. Match size to intent: wide for scale and place, medium for behavior and interaction, close for emotion. Name it explicitly ("medium close-up on his face") rather than implying it.

**Camera angle** (state when it carries meaning): eye-level (neutral), low angle (subject looms, power/scale), high angle (subject diminished, vulnerability), overhead/top-down (god's-eye, layout), over-the-shoulder (spatial relationship in a two-person beat), Dutch/tilted (unease). A flat eye-level default is fine for most shots; use a non-neutral angle only when the beat's meaning wants it.

**Lens character** comes from the Bible's Look (e.g. "35mm fine grain, subtle anamorphic oval bokeh") and is stated identically every shot — it is NOT a per-shot choice. Depth-of-field, however, _can_ vary by shot intent: "shallow focus, background soft" to isolate a subject in an emotional beat; "deep focus, everything sharp" for an establishing wide. Phrase it as the feel ("shallow focus, soft background"), not as an f-number.

**Putting it together — a camera line reads:** [shot size] + [angle if non-neutral] + [one movement, phrased rhythmically] + [focus feel]. E.g. _"Medium close-up, slight low angle, slow dolly-in over the shot, shallow focus with a soft background."_ One size, one angle, one move, one focus note — clean and obeyed.

## Camera Movement Encyclopedia (phrasing reference — the move was already CHOSEN at Stage 1 Step 13 from deliverable-templates §B2; here you phrase that choice for Seedance, you don't re-choose it)

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

## Color Grade (the Bible's SHOW LOOK — apply it; locked trims only)

The Bible already specifies the film's SHOW LOOK. Phrase it consistently every shot unless a named Look trim is locked for this scene/sequence. Common grades, for reference only:

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
- **Is there one DOMINANT motion source — subject action with a real verb / written hold, or a camera move?** Secondary only if slower/smaller/subordinate. (Ambient-only, both-fast, or locked-camera-plus-unperformed-subject → gap.)
- **Does every character on screen have performance direction** (scripted action, micro-performance, or intentional hold)? Is no character static-locked?
- **If anyone reacts / sees / is shocked — is the gaze target named by label with screen direction and height?** (Emotion without eyeline = looking past the subject.)
- Are references attached in order **character → object → location → continuity-pack keyframes → incoming anchor → motion sheet**, each opened with a Define-as-label binding stating what it governs — continuity/anchor defs marked reference-only — motion sheet marked interpolate / continuous take / no cuts — and is every later mention using the exact label?
- Is the prompt free of timestamps/second-counts (pace in words and event order only)?
- Does the prompt end with the subtitle/watermark/logo constraint tail?
- Are all definition lines verbatim from the Bible §2, and does every slot resolve to a distinct image (no duplicated URLs)?
- Any partial figures owned and internally consistent; any sound/off-screen reactions phrased as reactions, not physical forces?
- Is the grade the SHOW LOOK (or a locked Look trim), not a freestyle per-shot invent?
- Is the lighting the shot's State Schedule state?
- If anything rigid is fixed-within-shot, does the static-lock clause name that specific thing in positive phrasing (never "subject unchanged")?
- Is this compile honoring the motion sheet marked at Stage 1 Step 16 (one shot, 4–9 panels, ≤15s prefer 8–12) — not a re-partition invented at compile time?
- Is a motion-rich shot given its own full generation (not starved by sharing)?
- Are scale relationships stated where proportion matters?
- Does the action end at the row's cut-out state, and does CONTEXT answer the previous row's cut-in — **including exact footing/surface**? If the approved last frame put them ON surface A, does this prompt open ON surface A (not a different floor)?
- **If a motion sheet is attached: does the shot open with non-empty COMPOSITION LOCK (Panel 1) and END STATE LOCK (Panel n)** — not soft citations? Does the sheet definition say interpolate / one continuous take / no cuts / never show grid or gutters? If unextractable → gap.
- For continuous walks / same-surface carries / hard joins that must keep pose: is this `continuityMode: "extend_video"` with the prior approved clip as `sourceVideoUrl` (not a fresh stills-only invent)?
- Exactly one lighting state in the prompt (no in-shot transitions)?
- Is every entity named in the action bound in SUBJECT DEFINITIONS (hero props included) or explicitly background-tier?
- Is the `resolution` field the final tier for an approved shot (preview tier only for explicitly-labeled preview passes) — and is the prompt text free of resolution/quality/aspect words (those are API parameters, not prompt content)?
- No per-shot "hook"; camera move matched to the beat's mood (or locked when the subject carries the motion / holds a written performance)?
