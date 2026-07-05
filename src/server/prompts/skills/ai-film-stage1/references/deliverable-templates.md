# Deliverable Templates

The two TEXT documents of Stage 1's five-artifact handoff (Bible + shot list; the other three parts — approved reference images, scene grids, and the Scene Grid Registry — are produced at Steps 16–17), plus the prompt-assembly mechanism. Fill these from locked decisions only.

---

## A. The Visual & Tone Bible (one page, reused by every prompt)

```
[FILM TITLE] — Visual & Tone Bible

### 1. The Look (inherited identically by every prompt)
- Aspect ratio: [a value the render API actually supports (check before locking, e.g. 16:9 / 21:9 / 9:16); applied as an API PARAMETER at render time — the ratio NEVER appears as prompt text (§3H); anamorphic LENS character, if wanted, is a Lens/stock entry, not a ratio]
- Lens/stock: [grain, halation, flares, DoF behavior; warm/clinical]
- Color grade (ONE, whole film): [name + temp + highlight/shadow bias + saturation;
  name the ONE accent color allowed to pop]
- Lighting — canonical states ONLY: [STATE: Kelvin, shadow behavior, intended use] × 3–4
- Sound: [one recurring score idea + arrangements; ambient bed; foley; dialogue approach]
- Tone north-star: [one sentence]

### 2. Master @material list (assets Stage 2 builds)
- Characters: [hero_charsheet (= the turnaround character sheet: exactly ONE image containing front/profile/three-quarter views of the SAME character, one slot), ...] — never multiple images per character
- **Canonical definition lines** (one per asset, written here ONCE, pasted VERBATIM into every prompt's SUBJECT DEFINITIONS — never re-worded per shot):
  - hero_charsheet: "Define the [2–3 stable features + anchor details] in [slot] (facial features, styling, wardrobe, build) as **[label]**."
  - [location]_plate: "Define the [environment] in [slot] as **[label]**; it governs environment, architecture, and composition[, with the [structure] at its [state] version].
- Locations: [site_plate (versions: ...), ...]
- Voices: [hero_vo, ...]  (if using an external voice tool fed back as reference)
- Background-tier (no reference image): [crowds, one-off figures]

§2 lists IMAGE-BOUND assets only — each entry must resolve to an approved image and a
reference slot. The Look is TEXT (Bible §1, pasted into every prompt's global notes);
it is not an @material, never occupies a slot, and never appears in this list. A
"style_board" entry here is a category error: the compiler would try to bind an image
that doesn't exist.

### 3. Standing directives (apply to ALL prompts automatically)
- A — Primary motion: every shot has exactly ONE primary motion source — SUBJECT
  (character/object acts) or CAMERA (a developing move). Never both fast; NEVER neither.
  A shot with only ambient motion is invalid — fix the row, don't render it.
- B — Character performance: characters are never static-locked and never receive
  "subject unchanged"; identity comes from the bound reference image. Every character
  in frame gets explicit performance direction (at minimum a written micro-performance:
  breath, gaze, a small gesture).
- C — Static-lock (targeted): name the specific rigid thing that must not morph
  ("the [structure] is FIXED at [state]; only the camera moves, the [structure]
  unchanged"). Never a blanket "subject unchanged." Time passes BETWEEN shots,
  never within one.
- D — Deliberate-motion list: [the shots where something SHOULD change on camera —
  a beam firing, a ship lifting, an object dropping]; give these explicit
  state-change + timing instead of locking.
- E — Reference-first: every recurring element pulls its @material; never text-only.
- F — One shot = one continuous take; no internal cuts.
- G — Hooks only on structural peaks: [list shot #s].
- H — Output specs are API PARAMETERS, not prompt text: resolution, quality tier, and
  aspect ratio are passed by the app on the generateShot call and carried in the render
  package's structured fields — the model ignores them as prompt words, so they never
  appear in `render_prompt`. Tier policy: previews may use the cheap tier (e.g. 480p)
  for approval; APPROVED/final shots always render at the top tier (e.g. 1080p);
  upscale in post if going beyond. Never assemble the film from preview-tier renders.

### 4. State schedule (what changes BETWEEN shots — the visible clock; fixed within each shot)
- [Changing element 1, e.g. structure height]: [value @ shots …] → [value @ shots …]
- [Changing element 2, e.g. a dimming detail]: [steps]
- Lighting progression: [state @ shot ranges]
- Match-cut pairs: [shot A & shot B — identical framing/lens/position; ONLY X differs]
```

---

## B. The Annotated Shot List (the production document)

Rows are grouped into **SCENES** (the unit between beat and shot: one location + one continuous span of time). Each scene opens with a one-line header:

```
SCENE [n] — [location] — [lighting state]
  Coverage: [the scale plan, e.g. "establish W → alternating M → CU for the turn"]
  Space: [where key subjects/objects are relative to each other; which way movement
          flows across frame; which side the eyeline crosses]
```

The Space line is what keeps geography consistent across the scene's rows (a hero prop cannot sit in the kitchen in one shot and in the car in the next; a distant landmark stays on the same side of frame) and keeps screen direction coherent (a movement that exits right enters the next frame moving right). When a beat spans two locations cutting against each other, that is TWO scenes — the intercut is expressed by alternating rows, not by blurring one scene across both spaces.

One row per shot. Columns:

```
# | Scene | Mood | Scale | Motion arc (start → change → end) | Primary (SUBJ/CAM) | Camera move | Cut-out → Cut-in | Light | Dur | Materials
```

- **#** sequential. **Scene** ties to the scene header (which carries the beat).
- **Mood** carried from the beat sheet (drives the camera + lighting choice).
- **Scale** the framing distance: W / M / CU / INSERT / POV. Never leave it to the
  compiler — an unspecified scale is decided per-render and drifts. A scene that is
  all one scale is a flag (flatness), not a hard error.
- **Motion arc** the shot as an EVENT, not an image: the start state, what changes
  (with a real verb belonging to a character, object, or the camera), and the end
  state. "Nadia lies among the roots as the figure stands over her" is a still frame;
  "The figure takes one slow step closer, head tilting; Nadia pushes herself back
  into the roots, heels dragging through soil" is a shot. **No delta → no row.**
- **Primary (SUBJ/CAM)** which single source carries the shot's motion — the subject
  or the camera. Exactly one. If neither, the row is invalid.
- **Camera move** from the renderer's encyclopedia, chosen to match the mood. If
  Primary = SUBJ, the camera calms or locks; if Primary = CAM, the subject calms.
- **Cut-out → Cut-in** how this shot hands off to the next — the edit written into
  the rows so it survives independent generation. Cut-out: the state the shot ends
  in ("her eyes lift to the doorway, off-frame left"; "he starts to turn"; "the car
  exits frame right"). Cut-in: how the NEXT shot answers it ("open on the doorway:
  it is empty"; "the turn completes — he now faces her"; "—" if a clean scene
  break). Named handoffs:
  eyeline, cut-on-action, exit/enter (with direction), match, POV-answer, or "rest"
  (a deliberate held cut — allowed, but consecutive "rest" cuts are the slideshow
  failure, so a scene of them is a flag). The final shot's cut-out is "end".
- **Light** exactly ONE canonical state per row — never a transition ("Golden Hour →
  dusk" inside a shot is a State Schedule violation and a morph trigger; if time must
  visibly pass, it passes BETWEEN two rows at two states).
- **Dur** seconds — an ESTIMATE used for group-partition math and the runtime total; it never appears in a prompt (solos get exact duration via the API parameter; groups get the summed estimate and Seedance paces the internal cuts).
- **Materials** every asset that APPEARS IN THE MOTION ARC must be listed — characters,
  plates (at which version), AND hero props/objects. If the arc says the ship streaks,
  lifts, or is exited, `ship_object_ref` is in this cell; an entity named in the arc
  but absent from materials will be invented fresh at render time.

Keep a running total of shots and seconds against the target runtime.

---

## C. Assembling one prompt (the mechanism)

A finished video prompt = the renderer's template, with every section filled from an
already-locked source. Nothing is improvised at prompt-time:

- SUBJECT DEFINITIONS (first) ← the shot's @material list (Bible §2) resolved to
  Define-as-label bindings: character references in the earliest slots,
  each definition stating what it governs; every later mention uses the label
- OPENING/HOOK ← beat sheet (hook only if this is a marked peak shot)
- CONTEXT ← the shot's visual + the fixed state from the schedule (Bible §4)
- PRIMARY ACTION ← the shot's motion arc + primary source (SUBJ/CAM) (§3A) — no
  second-marks; duration is an API parameter, pace is words + event order
- PERFORMANCE ← direction for every character in frame (§3B): scripted action or micro-performance
- CAMERA & TECHNICAL ← the shot's camera move + the Look's lens (Bible §1) + targeted static-lock if flagged (§3C)
- LIGHTING ← the canonical state for this shot (Bible §1)
- COLOR GRADE ← the single film grade (Bible §1)
- AUDIO ← the sound palette (Bible §1) + any voice @material
- CONSTRAINT TAIL (very last) ← fixed vendor phrasing: subtitle/text, watermark, and
  logo suppression
- OUTPUT SPECS ← NOT prompt text. Resolution/quality/aspect go into the render
  package's structured fields and the app passes them as API parameters (§3H).
  The only output-adjacent line that belongs in the prompt is content: "one
  continuous take, no internal cuts."

### Worked example (a mid-film pull-back reveal, with static-lock applied)

```
[FILM] / SHOT 14 (IRONY REVEAL)

[SUBJECT DEFINITIONS]
Define the [2–3 anchor features of hero] in [Image1] (facial features, styling,
wardrobe, build) as **hero**.
Define the terrain and architecture in [Image2] as **the site**; it governs
environment, composition, and the [structure] at its FIXED [state] version.

[CONTEXT]
The site at [lighting state]. The [structure] at a FIXED [state, e.g. ~90% built,
stepped, not finished] — this state is constant throughout. Foreground: hero,
oblivious.

[PRIMARY ACTION]
Begin tight on hero in foreground: [written micro-performance — e.g. wipes dust
from his hands, exhales slowly, eyes down on his work]. Camera slowly and steadily
pulls back, revealing the [structure] behind. Hero never turns. The pull ties the
small oblivious figure to the thing behind them. (Primary motion: CAMERA; hero's
performance is small and slow so it doesn't fight the pull.)

[CAMERA & TECHNICAL]
Slow, gradual dolly pull-back at constant speed, one continuous move. CRITICAL: the
[structure] is FIXED — it remains at [state] throughout; only the camera moves, the
[structure] unchanged. (The lock names the structure specifically — never "subject
unchanged," which would freeze the hero too.) Deep focus. [Lens character].

[LIGHTING] [canonical state, Kelvin, shadows]
[COLOR GRADE] [the one film grade; accent color pops]
[AUDIO] [ambient bed]; [score behavior]; [voice @material if any]
[CONTINUITY] One continuous pull-back, no internal cuts. Shot 14 of N.
[CONSTRAINT TAIL] Keep it subtitle-free; avoid generating any text or subtitles.
Do not generate watermarks or logos.

(No timestamps or second-counts anywhere — duration is an API parameter; pace lives
in the words "slow, gradual, constant." Resolution, quality tier, and aspect ratio
are also API parameters set by the app from the render package's structured fields:
preview tier
for drafts, top tier for the approved final, upscale in post.)
```

The lesson baked into this template: the static-lock line in CAMERA + the FIXED-version
plate bound in SUBJECT DEFINITIONS together prevent the structure from morphing mid-shot.
Both belt and suspenders.
