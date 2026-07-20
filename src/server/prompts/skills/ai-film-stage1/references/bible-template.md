# Bible Template

The Visual & Tone Bible (one page, reused by every prompt) — one of the two TEXT documents of the five-artifact handoff (the other is the shot list, `shot-list-template.md`). Fill from locked decisions only. Prompt assembly for Seedance lives in `shot-compilation-recipe.md` (Stage 2), not here. **§3 is the canonical statement of the standing craft directives** — other files point here.

The Bible is ASSEMBLED at Step 8, not authored: §1–§3 concatenate from locked artifacts (the locked Look, the character/location/prop specs, this template's directives); §4 is the one authored part and the step's user fork.

```
[FILM TITLE] — Visual & Tone Bible

### 1. The Look (SHOW LOOK — applied by every prompt)
[Paste the locked Step 5 Look block VERBATIM — template: `look-template.md`.]

### 2. Master @material list (assets Stage 2 binds)
- Characters: [hero_charsheet, ...] — one turnaround sheet per character (ONE image with
  front/profile/three-quarter of the SAME character, one slot); the default tested
  profile — extra identity refs only with a user-approved documented model profile
- Canonical definition lines (one per asset, written here ONCE, pasted VERBATIM into
  every prompt's SUBJECT DEFINITIONS):
  - hero_charsheet: "Define the [2–3 stable features + anchor details] in [slot]
    (facial features, styling, wardrobe, build) as **[label]**."
  - [location]_plate: "Define the [environment] in [slot] as **[label]**; it governs
    environment, architecture, and composition[, with the [structure] at its [state]
    version]."
- Locations: [site_plate (versions: ...), ...]
- Objects / vehicles / hero props: [ship_object_ref, ...] — any recurring vehicle, tool,
  or prop appearing across shots gets its OWN object reference (clean three-quarter
  view, neutral background). An object named in a motion arc but absent here will be
  invented fresh at render time. When an object has a ref, location plates stay
  environment-only.
- Voices: [hero_vo, ...] — AUDIO-BOUND (not image slots). Each speaking hero / recurring
  VO gets one approved sample from `generateVoiceAnchors` (`@*_vo`). Stage 2 attaches
  these as reference_audio on dialogue shots. Background one-offs: omit.
- Background-tier (no reference image): [crowds, one-off figures]

§2 image list = IMAGE-BOUND assets only — each image entry resolves to an approved image and a
reference slot. Voices are AUDIO-BOUND handles listed above; they never occupy an image slot.
The Look is TEXT (§1, pasted into every prompt's global notes); it never
occupies a slot or appears here. A "style_board" entry is a category error.

### 3. Standing directives (canonical craft rules — production defaults for the tested
model profile; controlled exceptions only when locked here or in a shot row, and
reviewable. Process gates — approvals-as-buttons, Bible-verbatim binds,
values-from-locked-artifacts-only, COMPOSITION LOCK, footing continuity — are absolute.)
- A — Dominant motion: every shot has exactly one DOMINANT motion source — SUBJECT
  (character/object acts) or CAMERA (a developing move). The subject arc is **2–4 beats
  in event order** (start → development(s) → end), not a single verb stretched across
  the clip — roughly one real beat per 2–3s of Dur; a single-beat row either shortens
  to 4–6s or is invalid. Secondary motion rides along when smaller and subordinate.
  Both-fast fails; neither fails; a shot carried by ambient life alone is invalid —
  fix the row. Default pace is natural real-time; "slow" is a deliberate row-level
  choice, never the silent default (and never stack slow-words).
- B — Character performance: every human figure on screen gets written performance
  direction — scripted action, micro-performance (breath, gaze, small gesture), an
  intentional written hold (tension, posture, deadpan), or (for unbound / background-
  tier figures) concrete group motion. Identity comes from the bound reference image
  (identity/wardrobe/proportions only — pose follows PERFORMANCE); static-lock applies
  to rigid things, characters get verbs. Frozen extras are a reject.
- C — Static-lock (targeted): name the specific rigid thing that must not morph ("the
  [structure] is FIXED at [state]; only the camera moves, the [structure] unchanged").
  The lock always names its target. Time passes BETWEEN shots, never within one —
  default ONE lighting state per shot. In-shot lighting transitions are rare controlled
  exceptions only when locked on the row AND recorded with lighting_transition_exception
  on the motion-sheet registry entry (Bible §3D deliberate-motion list).
- D — Deliberate-motion list: [the shots where something SHOULD change on camera — a
  beam firing, a ship lifting, a lighting transition that IS the beat]; give these
  explicit state-change in event order.
- E — Reference-first: every recurring element pulls its @material image; recurring
  identity by text alone is drift.
- F — One generation = one shot = one continuous take; motion-sheet panels are
  milestones to interpolate, never internal cuts.
- G — Hooks only on structural peaks: [list shot #s].
- H — Output specs are API PARAMETERS: resolution and aspect ratio (16:9, the only
  supported ratio) are passed by the app on the compileShot call and carried as
  structured render-package fields — they never appear as prompt text (the model ignores
  them there). The quality tier IS the resolution: previews may use the cheap tier
  (480p); APPROVED/final shots always render at the top tier (1080p); upscale in post
  beyond that. Assemble the film from final-tier renders only.

### 4. State schedule (what changes BETWEEN shots — the visible clock; fixed within
each shot)
- [Changing element 1, e.g. structure height]: [value @ shots …] → [value @ shots …]
- [Changing element 2, e.g. a dimming detail]: [steps]
- Lighting progression: [state @ shot ranges]
- Match-cut pairs: [shot A & shot B — identical framing/lens/position; ONLY X differs]
```
