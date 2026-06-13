# Deliverable Templates

The two handoff artifacts Stage 1 produces, plus the prompt-assembly mechanism. Fill these from locked decisions only.

---

## A. The Visual & Tone Bible (one page, reused by every prompt)

```
[FILM TITLE] — Visual & Tone Bible

### 1. The Look (inherited identically by every prompt)
- Aspect ratio: [e.g. 2.39:1 anamorphic widescreen]
- Lens/stock: [grain, halation, flares, DoF behavior; warm/clinical]
- Color grade (ONE, whole film): [name + temp + highlight/shadow bias + saturation;
  name the ONE accent color allowed to pop]
- Lighting — canonical states ONLY: [STATE: Kelvin, shadow behavior, intended use] × 3–4
- Sound: [one recurring score idea + arrangements; ambient bed; foley; dialogue approach]
- Tone north-star: [one sentence]

### 2. Master @material list (assets Stage 2 builds)
- Characters: [hero_charsheet, ...]
- Locations: [site_plate (versions: ...), ...]
- Voices: [hero_vo, ...]  (if using an external voice tool fed back as reference)
- Style: [style_board]  (pasted into every prompt)
- Background-tier (no sheet): [crowds, one-off figures]

### 3. Standing directives (apply to ALL prompts automatically)
- A — Static-lock: structures/objects that should be stable are explicitly locked;
  only the camera moves; time passes BETWEEN shots, never within one. State the fixed
  state in CONTEXT and "only the camera moves, subject unchanged" in CAMERA.
- B — Deliberate-motion exceptions: [list the shots where something SHOULD change on
  camera — a beam firing, a ship lifting, an object dropping]; give these explicit
  state-change + timing instead of locking.
- C — Reference-first: every recurring element pulls its @material; never text-only.
- D — One shot = one continuous take; no internal cuts.
- E — Hooks only on structural peaks: [list shot #s].
- F — Output: [model resolution], [aspect ratio], upscale in post.

### 4. State schedule (what changes BETWEEN shots — the visible clock; fixed within each shot)
- [Changing element 1, e.g. structure height]: [value @ shots …] → [value @ shots …]
- [Changing element 2, e.g. a dimming detail]: [steps]
- Lighting progression: [state @ shot ranges]
- Match-cut pairs: [shot A & shot B — identical framing/lens/position; ONLY X differs]
```

---

## B. The Annotated Shot List (the production document)

One row per shot. Columns:

```
# | Beat | Mood | Shot (the visual) | Camera move | Light | Dur | Materials
```

- **#** sequential. **Beat** ties back to the beat sheet.
- **Mood** carried from the beat sheet (drives the camera + lighting choice).
- **Shot** one line: the single image/action this take captures.
- **Camera move** from the renderer's encyclopedia, chosen to match the mood.
- **Light** one of the canonical states.
- **Dur** seconds, within the model's clip window.
- **Materials** the character sheets + location plate (at which version) + style board (+ voice).

Keep a running total of shots and seconds against the target runtime.

---

## C. Assembling one prompt (the mechanism)

A finished video prompt = the renderer's template, with every section filled from an
already-locked source. Nothing is improvised at prompt-time:

- OPENING/HOOK ← beat sheet (hook only if this is a marked peak shot)
- CONTEXT ← the shot's visual + the fixed state from the schedule (Bible §4)
- PRIMARY ACTION ← the shot's visual + duration
- CAMERA & TECHNICAL ← the shot's camera move + the Look's lens (Bible §1) + static-lock (§3A)
- LIGHTING ← the canonical state for this shot (Bible §1)
- COLOR GRADE ← the single film grade (Bible §1)
- AUDIO ← the sound palette (Bible §1) + any voice @material
- MATERIAL REFERENCES ← the shot's @material list (Bible §2)
- OUTPUT SPECS ← Bible §1 (resolution, aspect, "shot N of M, no internal cuts")

### Worked example (a mid-film pull-back reveal, with static-lock applied)
```
[FILM] / SHOT 14 (IRONY REVEAL)

[CONTEXT]
[Location] at [lighting state]. [Structure] at a FIXED [state, e.g. ~90% built,
stepped, not finished] — this state is constant throughout. Foreground: [hero],
oblivious.

[PRIMARY ACTION — 0 to 9s]
Begin tight on [hero] in foreground. Camera slowly pulls back over 9s, revealing
[structure] behind. [Hero] never turns. The pull ties the small oblivious figure
to the thing behind them.

[CAMERA & TECHNICAL]
Slow dolly pull-back over 9s, constant speed. CRITICAL: [structure] is FIXED — it
does NOT change size/height/completion during the shot; only the camera moves.
[Aspect ratio]. Deep focus. [Lens character].

[LIGHTING] [canonical state, Kelvin, shadows]
[COLOR GRADE] [the one film grade; accent color pops]
[AUDIO] [ambient bed]; [score behavior]; [voice @material if any]
[MATERIAL REFERENCES]
@material[hero_charsheet]: foreground figure must match.
@material[site_plate]: match this location, [structure] at the FIXED version.
@material[style_board]: match palette/grain/lens.
[OUTPUT SPECS] 9s, [resolution], [aspect ratio]. One continuous pull-back, no internal
cuts. Shot 14 of N. Upscale in post.
```

The lesson baked into this template: the static-lock line in CAMERA + the FIXED-version
plate in MATERIAL REFERENCES together prevent the structure from morphing mid-shot.
Both belt and suspenders.