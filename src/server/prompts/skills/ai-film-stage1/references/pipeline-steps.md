# Pipeline Steps — Detailed Guidance

Read this before running the steps. For each step: its Purpose, what to Lock, how it Feeds the renderer, and **the kinds of options to offer the user.** The whole method is _diverge → user converges → lock → advance._ Always number options and give a reasoned recommendation, then stop and let the user choose.

Worked fragments below come from a real run (a comedy: _"aliens present during the building of the pyramids; the moment ends up carved in hieroglyphs"_). Use them as a model for tone and specificity, not as content to reuse.

---

## Step 1 — Seed

**Purpose:** the raw spark. **Lock:** the sentence, stated plainly. **Do:** name what it already fixes — genre, setting, and any built-in "button" (a recurring payoff). Don't fall in love with it; it's a coordinate, not a destination. **Feeds:** everything.

## Step 2 — Premise exploration

**Purpose:** find the _interesting_ version before committing. **Offer:** ~6 distinct directions, each with a different protagonist AND a different engine (the mechanism that generates scenes/jokes/tension). Note for each what the recurring payoff would be. **Recommend:** flag which options give a single clear protagonist (easiest consistency) and which are most purely visual (best for AI). **Lock:** one direction (or a splice of two). **Feeds:** the logline.

## Step 3 — Logline

**Purpose:** prove the story has a spine. **Offer:** several loglines, each emphasizing a different axis — comedy-forward, irony-forward, lean one-liner, character-stakes-forward (smuggles in a ticking clock). **Judge** each on one question: would a stranger want to watch this? **Recommend** blending the version with real stakes/clock and the version that states the core irony cleanly. **Lock:** protagonist + goal + obstacle + stakes + irony in 1–2 sentences. If you can't make it compelling, STOP and rework. **Feeds:** synopsis, genre sense → the Look.

## Step 4 — Conflict

**Purpose:** define the engine. **Separate two things the user tends to blur:** the external _want_ (conscious goal, drives plot) vs. the deeper _need_ (internal lack the story resolves). The gap between them is where drama/comedy and heart live. **Define** the opposing force concretely and _why_ it's genuinely hard to beat — the best obstacles don't even know what they're obstructing. **Build in any "why can't they just…" trap** that keeps a powerful character stuck in a human-scale predicament (this is often essential to make the premise work). **Offer** 2–3 options for the deeper need; each colors the ending differently. **Recommend** the need the plot _already_ dramatizes (so comedy/theme are one engine). **Lock.** **Feeds:** beat-sheet turning points.

## Step 5 — Theme

**Purpose:** the unifying argument. **Offer** ~5 one-sentence _claims_ about life (not topics) from broad to sharp, and note that the theme's _flavor_ sets the "mood vocabulary" that later picks lighting/color (a wry theme → one palette/edit, a wistful theme → another). **Recommend** the claim the ending will literally prove. **Lock.** **Feeds:** character arcs; mood vocabulary.

## Step 6 — Character design [+]

**Purpose:** build the people who carry it, the AI-film way.
**First, audit the cast** for the minimum viable set; name which faces are "hero" (need dedicated sheets) and which are disposable background (no sheet).
**For each main character offer the consequential design forks**, e.g.:

- _Look/design_ — present 2–4 options and **explicitly trade comedy/expressiveness against consistency** (simple, distinctive silhouettes drift least; irregular/complex shapes drift most).
- Any _constraint_ the premise needs (e.g. why powers can't be used) — offer options and pick the one that ties to the clock/stakes.
- _Supporting characters'_ comedic/dramatic flavor.
  **Then write the locked result as renderable `@material` specs.** Each spec is built for image consistency and IS the Stage 2 reference-sheet prompt:
- species/build, fixed proportions, distinctive **silhouette anchor**
- **fixed wardrobe** that never changes, plus one instantly-readable detail
- signature expression
- explicit **consistency notes** (the 2–3 anchor features the model must never drift)
- a **name** (`hero_charsheet`, etc.)
  **Tip:** turn invisible stakes into a _visible_ on-character detail when possible (e.g. a glowing element that dims as a clock runs down) — writing-to-the-medium. **Feeds:** `@material` refs on every prompt with that character.

## Step 7 — World & locations [+]

**Purpose:** settings as plates. **Write** each location as a renderable plate spec (geometry, light direction, atmosphere), named. **Then consolidate ruthlessly:** propose treating the film as _one master location with zones_ rather than many places; cut locations the story doesn't strictly need (a cheaper antagonist often removes a whole set); keep things you can leave offscreen offscreen (cheaper AND often better). **Offer** a time-of-day structure: a single day (clock visible in the sky, most consistent) vs. multiple days (more scale/escalation, but more lighting variation). If multiple days, **tame it** by defining a small set of canonical lighting states reused across days, and make the visible clock a _thing that changes between shots_ (a structure rising, a detail dimming) rather than a single day's shadows. **Lock** the plate list + time structure. **Feeds:** location refs; constrains the shot list.

## Step 8 — The Look [+, critical]

**Purpose:** the #1 consistency tool; no equivalent in normal screenwriting. The renderer re-specifies lighting/grade/lens on _every_ prompt — if they drift, the film disintegrates. **Draft ONE reusable block** and offer the one or two genuine forks inside it (e.g. dialogue register; aspect ratio):

- **aspect ratio** (e.g. 2.39:1 for epic feel)
- **lens/film-stock character** (grain, halation, flares, DoF behavior)
- **the single color grade** for the whole film (pull from the renderer's presets; allow one accent color to "pop")
- **canonical lighting states** (typically 3–4: e.g. Dawn / Harsh Noon / Golden Hour / Night), each with Kelvin + shadow behavior + intended use
- **sound palette** (one recurring score idea with comic/wistful arrangements; ambient bed; foley; dialogue approach + named voices if using an external voice tool)
- a one-line **tone north-star**
  **Recommend** deriving it from theme + genre + the premise's natural setting. **Lock verbatim.** **Feeds:** the LIGHTING and COLOR GRADE sections of every prompt, identically.

## Step 9 — Synopsis

**Purpose:** first full commit. **Write** the whole story in prose (a paragraph to a page). **Interrogate** for a saggy middle or unearned ending; fix here. **Flag** any beat that leans toward a theme you set aside, and offer to recut. **Lock.** **Feeds:** beat sheet.

## Step 10 — Beat sheet [+]

**Purpose:** the structural skeleton. **List** the key turns in order (opening image, inciting event, midpoint shift, low point, climax, resolution — compressed for shorts). **Tag every beat** with: a **MOOD word** (the bridge to the renderer's mood-indexed libraries), a **LIGHT** state, whether it earns a **HOOK** (almost none do), and the **MATERIALS** it needs. **Check** the mood tags trace a deliberate emotional curve (rise-and-settle), not a flat string of same-energy beats. **Give the dramatic irony its own beat** if the film runs on the audience knowing what the hero doesn't. **Size to runtime** (see sizing note below). **Lock.** **Feeds:** per-shot lighting/camera and the hook decision.

## Step 11 — Outline [+]

**Purpose:** beats → scenes. **Break** each beat into numbered scene-beats (what happens, where, who's present). **Keep running accounting:** total the locations and characters; consolidate while it's still text (e.g. make a camp a night-lit _zone_ of the main site, not a new plate; make a single-shot location a crop of an existing plate). **Surface** any now-unused asset (cut it) and confirm the `@material` list is small. **Lock** the scene sequence + final inventory. **Feeds:** the shot list.

## Step 12 — Treatment (optional)

For collaborators/investors, write the polished present-tense prose. For solo/lean work, **skip the separate document** and instead write a **one-paragraph continuous-read** of the whole film as a sanity check (does it flow, does the click land, is the tone arc intact?). **Feeds:** confidence before fragmenting into a table.

## Step 13 — Screenplay [+]

**Purpose:** the blueprint. **Write** proper format, but with two disciplines: **lean visual action lines**, each describing ≈ one shot's image (concrete and image-forward translates to a generatable shot; interior/abstract does not); and **short scenes/dialogue beats** (clips are seconds long; long unbroken speeches and continuous choreographed action fight the medium). **Lock.** **Feeds:** the shot list directly.

## Step 14 — Shot list [+]

**Purpose:** the deliverable; the actual unit of generation. **First group into SCENES** (one location + one continuous time span; an intercut beat = two scenes with alternating rows), each with a one-line header: coverage plan (the scale rhythm, e.g. "establish W → alternating M → CU for the turn") and a Space line (subject/object geography, screen direction, eyeline side) — the Space line is what stops a hero prop from silently teleporting between locations across rows. **Then produce the table**, one row per shot:
`# | scene | mood | scale (W/M/CU/INSERT/POV) | motion arc (start → change → end) | primary (SUBJ/CAM) | camera move | cut-out → cut-in | light (ONE state) | duration | materials`

- **motion arc** — the shot as an EVENT: what is different at the last second versus the first, with a real verb. A tableau ("she lies among the roots as it stands over her") is a still frame and renders as one; an arc ("it takes one slow step closer, head tilting; she pushes back into the roots, heels dragging soil") is a shot. **The no-delta-no-shot rule:** if the honest answer to "what changes?" is "nothing," give the row a delta or cut it — do not let it reach compilation.
- **primary (SUBJ/CAM)** — which single source carries the motion. SUBJ: a character/object acts and the camera calms or locks. CAM: the camera move develops the frame (reveal, push, pull) and the subject calms — but characters still get micro-performance, never total stillness. Exactly one primary per shot; a row with neither is invalid.
- **scale** — explicit framing distance per row; unspecified scale gets decided per-render and drifts. Vary scale within a scene; use INSERT rows (2–4s close shots of a stateful object, e.g. the ticking chest panel) to build rhythm and give the film's clock its own frames.
- **cut-out → cut-in** — the edit, written into the rows: how this shot ends (eyeline off-frame, a turn begun, an exit with direction, a held rest) and how the next shot answers it (POV that resolves the eyeline, the turn completing, an entry matching direction). This is what makes independently generated clips flow instead of sitting next to each other; consecutive unmotivated "rest" cuts are the slideshow failure mode.
- **camera move** chosen from the renderer's encyclopedia _to match the mood_: comedy → lock-off (let the gag play in frame — the gag IS the subject motion); reveal/irony → pull-back or crane (ties foreground to background); tension → slow push-in or Dutch; climax energy → fast tracking (earn it by contrast). Lock-off is only valid when the row's primary is SUBJ.
- **light** — exactly ONE canonical state per row; in-shot lighting transitions ("Golden Hour → dusk") violate the State Schedule and trigger morphing. Time passes between rows.
- **duration** in the model's clip window (commonly 4–15s); slower at bookends, snappier through the middle, a held beat at the wistful landing. A "held beat" still has a primary motion — a slow push-in, or a written performance beat — it is held, not frozen.
- **materials** = every asset appearing in the motion arc: character pairs + location plate (at which state/version) + hero props/objects. An entity named in the arc but missing from materials renders as an invented one.
  **Use deliberate craft:** match-cut pairs (identical framing, only a scheduled element differs) to show time passing without a montage; name the single most important "fulcrum" shot. **Total** the shots/seconds against the target runtime. **Then demonstrate:** expand ONE row into a full renderer prompt so the user sees the mechanism (every bracket filled from an already-made decision). **Feeds:** the prompts.

## Step 15 — The Bible [+]

See `references/deliverable-templates.md`. Four parts: the locked Look; the master `@material` list (with version notes); the standing craft directives (primary-motion, character-performance, targeted static-lock + deliberate-motion list, and render-resolution tiers); and the **state schedule** (what changes between shots — the visible clock — fixed within each shot).

## Step 16 — Asset reference generation (the closing phase)

The locked artifacts are text; the renderer needs images. **First audit the manifest:** a reference image is an identity anchor — characters, location plates, recurring hero props, each in ONE neutral state. Lighting/time-of-day variants are NOT separate assets (the State Schedule handles those; only state-schedule-driven physical versions qualify, e.g. pyramid heights). A description containing a story moment or scene lighting is a disguised SHOT — strike it. Check for FUSED identities: a vehicle/hero prop/creature that recurs across shots gets its OWN object reference, not a life sentence inside a location plate. Plates: one neutral lighting state, working reference not money shot. Typical manifest: 4–8 images. Present the audited list as a fork for approval before generating. Then go through the approved manifest one asset at a time (characters first, then locations). For each: **expand** the locked spec into a full reference-image prompt (fold in the global Look — see the expansion recipe in `medium-constraints.md`), **generate several candidates**, **present** them for the user to pick/refine (same diverge-converge loop as story steps), and on approval **bind** the chosen image to the asset's handle. Repeat until every character and location has an approved image. **Only then** is the handoff render-ready and Stage 1 complete — "story written" is not "done." **Feeds:** Stage 2 (the approved images are the @-anchors the video renderer binds to).

_(There is deliberately no "package" step. The render-ready handoff is the locked Bible + locked shot list + approved images; the upstream artifacts are scaffolding whose value those two documents already carry. If the user asks for a full-project document, produce it as an export — concatenate the locked artifacts verbatim, never regenerate or paraphrase them, no placeholders.)_

---

## Runtime sizing (apply at Step 10, re-check at 14)

Compute the shot budget: total seconds ÷ average clip length ≈ shot count.

- ~2–3 min short ≈ 20–26 shots ≈ a 7-beat spine (compress multi-day grinds into ONE "time-passing" beat using a match-cut + a scheduled changing element).
- ~8–12 min short ≈ ~13 beats, room for a real escalation montage.
  Same spine scales: to lengthen, give the middle and climax beats more shots rather than adding beats.

## The interrogation prompts (use after each artifact)

- What's the most clichéd choice here, and what's the surprising alternative?
- What's the weakest link — the thing that would make a viewer disengage?
- Is each beat doing a _different_ job, or are two beats the same energy?
- Does the ending _prove_ the theme, or just stop?
- Is anything in here impossible/expensive for AI video, and can we rewrite toward the medium's strengths without losing the point?
