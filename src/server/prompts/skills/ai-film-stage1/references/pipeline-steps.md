# Pipeline Steps — Detailed Guidance

Read this before running the steps. For each step: Purpose, Lock, Feeds, and **the kinds of options to offer.** Method: _diverge → user converges → lock → advance._ Number options, give a reasoned recommendation, stop and let the user choose.

Worked fragments below come from past runs (including a desert comedy). Use them as a model for **specificity and form**, not as content or genre to reuse. Option menus below are genre-neutral — adapt labels to the locked tone (comedy, horror, romance, thriller, drama, etc.).

**Turn budget:** Steps 1–8 stay short (options + one ask). Do not preview later machinery.

---

## Step 1 — Seed

**Purpose:** the raw spark. **Lock:** the sentence, stated plainly. **Do:** name what it already fixes — genre, setting, and any built-in "button" (a recurring payoff). Don't fall in love with it; it's a coordinate, not a destination. **If the seed includes a URL:** call `webExtract` first, then lock the seed with what the source actually says (do not invent article contents). **Feeds:** everything.

## Step 2 — Premise exploration

**Purpose:** find the _interesting_ version before committing. **Offer:** ~6 distinct directions, each with a different protagonist AND a different engine (the mechanism that generates scenes / tension / humor / dread). Note for each what the recurring payoff would be. **Recommend:** flag which options give a single clear protagonist (easiest consistency) and which are most purely visual (best for AI). **Lock:** one direction (or a splice of two). **Feeds:** the logline.

## Step 3 — Logline

**Purpose:** prove the story has a spine. **Offer:** several loglines, each emphasizing a different axis — tone-forward, irony-forward, lean one-liner, character-stakes-forward (smuggles in a ticking clock). **Judge** each: would a stranger want to watch this? **Recommend** blending real stakes/clock with the version that states the core irony cleanly. **Lock:** protagonist + goal + obstacle + stakes + irony in 1–2 sentences. If you can't make it compelling, STOP and rework. **Feeds:** synopsis, genre sense → the Look.

## Step 4 — Conflict

**Purpose:** define the engine. **Separate:** external _want_ (conscious goal, drives plot) vs deeper _need_ (internal lack the story resolves). The gap is where drama and heart live. **Define** the opposing force concretely and _why_ it's hard to beat — the best obstacles don't know what they're obstructing. **Build in any "why can't they just…" trap** that keeps a powerful character stuck at human scale when the premise needs it. **Offer** 2–3 options for the deeper need; each colors the ending differently. **Recommend** the need the plot _already_ dramatizes (so genre engine and theme are one engine). **Lock.** **Feeds:** beat-sheet turning points.

## Step 5 — Theme

**Purpose:** the unifying argument. **Offer** ~5 one-sentence _claims_ about life (not topics) from broad to sharp. Note that the theme's _flavor_ sets the "mood vocabulary" that later picks lighting/color (wry → one palette; wistful → another; dread → another). **Recommend** the claim the ending will literally prove. **Lock.** **Feeds:** character arcs; mood vocabulary.

## Step 6 — Character design [+]

**Purpose:** build the people who carry it, the AI-film way.
**First, audit the cast** for the minimum viable set; name which faces are "hero" (each earns a dedicated reference image at Step 15) and which are disposable background (no reference).
**For each main character offer the consequential design forks**, e.g.:

- _Look/design_ — 2–4 options; **explicitly trade expressiveness against consistency** (simple, distinctive silhouettes drift least; irregular/complex shapes drift most).
- Any _constraint_ the premise needs (e.g. why powers can't be used) — pick the one that ties to the clock/stakes.
- _Supporting characters'_ dramatic/tonal flavor.
  **Then write the locked result as renderable `@material` specs** (source for Step 15 expansion — never the image prompt itself; see `medium-constraints.md`):
- species/build, fixed proportions, distinctive **silhouette anchor**
- **fixed wardrobe** that never changes, plus one instantly-readable detail
- signature expression
- explicit **consistency notes** (2–3 anchor features that must never drift)
- a **name** (`hero_charsheet`, etc.)
  **Tip:** turn invisible stakes into a _visible_ on-character detail when possible (writing-to-the-medium). **Feeds:** `@material` refs on every prompt with that character.

## Step 7 — World & locations [+]

**Purpose:** settings as plates. **Write** each location as a renderable plate spec (geometry, light direction, atmosphere), named. **Then consolidate ruthlessly:** one master location with zones > many places; cut locations the story doesn't need; keep offscreen what can stay offscreen. **Offer** a time-of-day structure: a single day (clock visible in the sky, most consistent) vs multiple days (more scale/escalation, more lighting variation). If multiple days, **tame it** with a small set of canonical lighting states and a visible clock that changes _between_ shots. **Lock** the plate list + time structure. **Feeds:** location refs; constrains the shot list.

## Step 8 — The Look [+, critical]

**Purpose:** the #1 consistency tool. The renderer re-specifies lighting/grade/lens on _every_ prompt — if they drift, the film disintegrates. **Draft ONE reusable block** and offer the one or two genuine forks inside it (e.g. dialogue register; aspect ratio):

- **aspect ratio** (must be a value the render API supports — check before locking; API parameter, never prompt text; anamorphic/scope FEEL = lens character, not a ratio)
- **lens/film-stock character** (grain, halation, flares, DoF behavior)
- **the single color grade** for the whole film (allow one accent color to "pop")
- **canonical lighting states** (typically 3–4), each with Kelvin + shadow behavior + intended use
- **sound palette** (one recurring score idea with arrangements matching the locked tone; ambient bed; foley; dialogue approach + named voices if using an external voice tool)
- a one-line **tone north-star**
  **Recommend** deriving it from theme + genre + the premise's natural setting. **Lock verbatim.** **Feeds:** LIGHTING and COLOR GRADE of every prompt, identically.

## Step 9 — Synopsis

**Purpose:** first full commit. **Write** the whole story in prose (a paragraph to a page). **Interrogate** for a saggy middle or unearned ending; fix here. **Flag** any beat that leans toward a theme you set aside, and offer to recut. End with a **one-paragraph continuous-read** sanity check (does it flow, does the click land, is the tone arc intact?). **Lock.** **Feeds:** beat sheet.

## Step 10 — Beat sheet [+]

**Purpose:** the structural skeleton. **List** the key turns in order (opening image, inciting event, midpoint shift, low point, climax, resolution — compressed for shorts). **Tag every beat** with: a **MOOD word**, a **LIGHT** state, whether it earns a **HOOK** (almost none do), and the **MATERIALS** it needs. **Check** the mood tags trace a deliberate emotional curve, not a flat string of same-energy beats. **Give dramatic irony its own beat** if the film runs on the audience knowing what the hero doesn't. **Size to runtime** (see sizing note below). **Lock.** **Feeds:** per-shot lighting/camera and the hook decision.

## Step 11 — Outline [+]

**Purpose:** beats → scenes. **Break** each beat into numbered scene-beats (what happens, where, who's present). **Keep running accounting:** total locations and characters; consolidate while it's still text. **Surface** unused assets (cut them). **Scene-delta rule:** every scene must earn its existence with a unique, irreversible story-state change — name each scene's ONE job and its delta. A scene that cannot state a new end state gets merged, cut, or rewritten; consecutive scenes must also differ visibly (State Schedule value or lighting state). **Lock** the scene sequence + final inventory. **Feeds:** the shot list (each scene's delta feeds its header and its grid prompt).

## Step 12 — Screenplay [+]

**Purpose:** the blueprint. **Write** proper format with two disciplines: **lean visual action lines**, each ≈ one shot's image; and **short scenes/dialogue beats** (clips are seconds long). **Lock.** **Feeds:** the shot list directly.

## Step 13 — Shot list [+]

**Purpose:** the deliverable; the unit of generation. **First group into SCENES** (one location + one continuous time span; an intercut beat = two scenes with alternating rows), each with a one-line header: Delta, coverage plan, Space line. **Then produce the table**, one row per shot:
`# | scene | mood | scale (W/M/CU/INSERT/POV) | motion arc (start → change → end) | primary (SUBJ/CAM) | camera move | cut-out → cut-in | light (ONE state) | duration | materials`

Column rules and camera-authoring vocabulary: `deliverable-templates.md` §B / §B2. **No-delta-no-shot:** if "what changes?" is "nothing," give a delta or cut the row. **One lighting state per row** — never "Golden Hour transitioning toward dusk"; pick ONE canonical state or split into two rows. Do NOT expand rows into render prompts and do NOT load the Stage 2 compilation recipe. **Feeds:** grids (Step 16) and prompts (Stage 2).

## Step 14 — The Bible [+]

See `deliverable-templates.md` §A. Four parts: locked Look; master `@material` list (with version notes + canonical definition lines); standing craft directives; **state schedule** (what changes between shots — fixed within each shot).

## Step 15 — Asset reference generation

Locked artifacts are text; the renderer needs images. **First audit the manifest** (identity anchors only — characters, plates, recurring hero props in ONE neutral state; strike disguised shots; fused entities get their own object refs; typical 4–8 images). **Plates must not embed a hero prop that has its own object ref.** **Charsheets: empty hands + object ref, OR tool-as-wardrobe — never both.** Present the audited list as a fork before generating. Then one asset at a time (characters first): **expand** via `medium-constraints.md`, **generate candidates**, **bind** on approval. Assets approved ≠ Stage 1 done. **Feeds:** Step 16.

## Step 16 — Generation grids

With assets approved, load `generation-grids.md`. Per scene: (1) generate and approve a **scene continuity pack** via `generateContinuityPack` (structured notes + **required** 1–3 visual keyframes — reference only, not a Seedance sequence) → `recordContinuityPackEntry`; (2) generate one **motion sheet per shot** via `generateGenerationGrid` (**4–9** panels; Panel 1 = cut-in, middle = milestones, Panel n = cut-out; estimated Dur ≤15s, prefer 8–12) — later sheets **must** bind prior terminal panel (`previousGenerationId` + `incomingAnchor*`) unless `continuityBreakReason`; (3) **record each via `recordGenerationGridEntry`** with `panel_count` + continuity-chain fields + `continuity_pack_handle` + `approved_candidate_id` = the toolCallId. One sheet = one continuous Seedance take (interpolate; no hard cuts). Stage 1 completes when every shot has a validated registry entry. **Feeds:** Stage 2.

_(No package step. Handoff = Bible + shot list + approved images + approved grids + passing registry. Export on request = concatenate locked artifacts verbatim.)_

---

## Runtime sizing (apply at Step 10, re-check at 13)

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
