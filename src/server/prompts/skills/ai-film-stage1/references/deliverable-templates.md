# Deliverable Templates

The two TEXT documents of Stage 1's five-artifact handoff (Bible + shot list; the other three parts — approved reference images, generation grids, and the Generation Grid Registry — are produced at Steps 15–16). Fill these from locked decisions only. Prompt assembly for Seedance lives in the Stage 2 skill / `shot-compilation-recipe.md` — not here.

---

## A. The Visual & Tone Bible (one page, reused by every prompt)

```
[FILM TITLE] — Visual & Tone Bible

### 1. The Look (SHOW LOOK — applied by every prompt)
- Aspect ratio: [a value the render API actually supports (check before locking, e.g. 16:9 / 9:16); applied as an API PARAMETER at render time — the ratio NEVER appears as prompt text (§3H); anamorphic LENS character, if wanted, is a Lens/stock entry, not a ratio]
- Lens/stock: [grain, halation, flares, DoF behavior; warm/clinical]
- Color grade (SHOW LOOK default): [name + temp + highlight/shadow bias + saturation;
  name the accent color allowed to pop]
- Optional locked trims: [named scene/sequence Look variants only — e.g. "night-interior cooler trim"; never freestyle per shot]
- Lighting — canonical states ONLY: [STATE: Kelvin, shadow behavior, intended use] × 3–4
- Sound: [one recurring score idea + arrangements; ambient bed; foley; dialogue approach]
- Tone north-star: [one sentence]

### 2. Master @material list (assets Stage 2 builds)
- Characters: [hero_charsheet (= default: one turnaround sheet — ONE image with front/profile/three-quarter of the SAME character, one slot), ...] — default tested profile; extra identity refs only with a user-approved / documented model profile
- **Canonical definition lines** (one per asset, written here ONCE, pasted VERBATIM into every prompt's SUBJECT DEFINITIONS — never re-worded per shot):
  - hero_charsheet: "Define the [2–3 stable features + anchor details] in [slot] (facial features, styling, wardrobe, build) as **[label]**."
  - [location]_plate: "Define the [environment] in [slot] as **[label]**; it governs environment, architecture, and composition[, with the [structure] at its [state] version].
- Locations: [site_plate (versions: ...), ...]
- Objects / vehicles / hero props: [ship_object_ref, amulet_object_ref, ...] — any recurring vehicle, tool, or prop that appears across shots gets its OWN object reference (one clean three-quarter view, neutral background), never a life sentence inside a location plate or a character sheet; an object named in a motion arc but absent from this list will be invented fresh at render time. **If the object has a ref, location plates stay environment-only.**
- Voices: [hero_vo, ...]  (if using an external voice tool fed back as reference)
- Background-tier (no reference image): [crowds, one-off figures]

§2 lists IMAGE-BOUND assets only — each entry must resolve to an approved image and a
reference slot. The Look is TEXT (Bible §1, pasted into every prompt's global notes);
it is not an @material, never occupies a slot, and never appears in this list. A
"style_board" entry here is a category error: the compiler would try to bind an image
that doesn't exist.

### 3. Standing directives (craft defaults — not universal cinema laws; exceptions must be locked + reviewable)
- A — Dominant motion: every shot has one DOMINANT motion source — SUBJECT
  (character/object acts) or CAMERA (a developing move). Secondary motion is allowed
  when slower, smaller, and subordinate. Both-fast fails; neither fails.
  A shot with only ambient motion is invalid — fix the row, don't render it.
- B — Character performance: characters are never static-locked and never receive
  "subject unchanged"; identity comes from the bound reference image. Never leave a
  character unperformed. Intentional stillness is allowed when written as breath,
  gaze, tension, posture, or deadpan hold.
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
  Delta: [what changes irreversibly in this scene] — visually: [what must look
          different from the previous scene: a State Schedule value, the light,
          new action in the frame]
  Coverage: [the scale plan, e.g. "establish W → alternating M → CU for the turn"]
  Space: [where key subjects/objects are relative to each other; which way movement
          flows across frame; which side the eyeline crosses]
```

The Delta line is the distilled result of Step 11's scene-delta rule (the full purpose/start/end analysis lives in the outline — never duplicate it here); it feeds the grid prompt's what-is-new clause. The Space line is what keeps geography consistent across the scene's rows (a hero prop cannot sit in the kitchen in one shot and in the car in the next; a distant landmark stays on the same side of frame) and keeps screen direction coherent (a movement that exits right enters the next frame moving right). When a beat spans two locations cutting against each other, that is TWO scenes — the intercut is expressed by alternating rows, not by blurring one scene across both spaces.

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
  **Reaction / discovery rows must name the gaze target in the arc** ("detective freezes,
  eyes lock down-right onto the child at waist height") — "shocked" alone is not a
  shot; Seedance will render the emotion and invent a wrong eyeline.
- **Primary (SUBJ/CAM)** which single source carries the shot's motion — the subject
  or the camera. Exactly one. If neither, the row is invalid.
- **Camera move** from the renderer's encyclopedia, chosen to match the mood. If
  Primary = SUBJ, the camera calms or locks; if Primary = CAM, the subject calms.
- **Cut-out → Cut-in** how this shot hands off to the next — the edit written into
  the rows so it survives independent generation. Cut-out: the state the shot ends
  in — must lock **footing/surface/position**, not just intent ("she stands ON the
  stone staircase, mid-flight, facing up" — not "she walks toward the stairs"). Cut-in:
  how the NEXT shot answers it by restating that same footing before new action
  ("still ON the stone staircase, mid-flight — continues climbing"). Named handoffs:
  eyeline, cut-on-action, exit/enter (with direction), match, POV-answer, or "rest"
  (a deliberate held cut — allowed, but consecutive "rest" cuts are the slideshow
  failure, so a scene of them is a flag). The final shot's cut-out is "end".
  **Continuous walks across generations should prefer video extension** (Stage 2)
  over hoping text cut-ins preserve geography.
- **Light** exactly ONE canonical state per row — never a transition ("Golden Hour → dusk", "transitioning toward…"). Time passes BETWEEN shots; pick one state or split the row. In-shot light morphs are a State Schedule violation.
- **Dur** seconds — an ESTIMATE used for generation-partition math and the runtime total; it never appears in a prompt (API duration = the generation's summed estimate ≤15s; Seedance paces internal cuts).
- **Materials** every asset that APPEARS IN THE MOTION ARC must be listed — characters,
  plates (at which version), AND hero props/objects. If the arc says the ship streaks,
  lifts, or is exited, `ship_object_ref` is in this cell; an entity named in the arc
  but absent from materials will be invented fresh at render time.

Keep a running total of shots and seconds against the target runtime.

## B2. Camera language for authoring rows (choose here; Stage 2 phrases it)

This is the CHOOSING vocabulary for the Camera move and Scale cells — available during Stage 1 by design. (How to WORD the chosen move for Seedance lives in the compilation recipe and is not needed while authoring.)

**The governing principle — motivated movement:** the camera moves when MEANING moves. Every non-static move must answer "what is this move revealing, following, or making us feel?" A move with no answer is decoration; cut it to lock-off and let the subject carry the shot. Corollary: a film where every shot moves is drone-soup — stillness spends contrast that makes the moving shots land.

**Mood → move idioms (expanded):**
| The beat wants | Reach for |
|---|---|
| Rising tension, dawning realization | slow push-in (the closer we get, the worse it feels) |
| Reveal, irony, context recontextualizing a figure | pull-back or crane-up (the frame learns something) |
| Intimacy, private moment | slow push to CU, or static CU with shallow focus |
| Observation, deadpan, letting a beat play without comment | lock-off (the frame refuses to react — that IS the point) |
| Unease, wrongness | Dutch tilt held, or slow drift with no motivation |
| Vertigo, floor-dropping realization | dolly-zoom (push-in while zooming out, background stretches) — rare, once per film at most |
| Energy, pursuit | tracking/side-follow at matched speed (earn it by contrast with stiller shots around it) |
| Scale, awe | low angle looking up + slow crane/tilt, subject towering |
| Vulnerability, smallness | high angle or overhead, subject diminished in negative space |
| Transition inside a space | foreground wipe-by (a pillar/figure crosses close to lens, briefly occluding — a cut you don't cut) |
| Walking dialogue-of-glances | reverse-track ahead of the subject walking toward camera |
| Study, hypnosis, a held object of fascination | slow orbit at constant distance |

**Camera height and angle belong in the Camera move cell** whenever they carry meaning: eye-level is the invisible default; name low/high/overhead/ground-level ONLY when the beat wants power, vulnerability, layout, or texture — an unmotivated fancy angle reads as showing off.

**Depth staging (the strongest realism cue AI shot lists neglect):** compose in THREE planes, not one — something soft in the extreme foreground (a shoulder, a tool, a doorframe edge), the subject in the mid, life in the deep background — and prefer movement TOWARD or AWAY from camera over lateral crosses: depth movement generates parallax, and correct parallax is what subconsciously reads as "filmed" rather than "generated." Per scene, aim for at least one row staged in three planes and one whose movement travels through depth. Write the planes into the motion arc ("past the foreground doorway, the hero walks toward camera from the deep corridor") — the grid panels will then inherit the depth composition.

---

## C. Prompt assembly (Stage 2 only)

Do not assemble Seedance prompts during Stage 1. When the Generation Grid Registry passes, load the Stage 2 skill and `shot-compilation-recipe.md` — that file owns section order, binding grammar, assertion checks, and worked examples.
