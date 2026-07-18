# Pipeline Steps — Detailed Guidance

Per-step guidance for the 10-step pipeline in SKILL.md. Method everywhere: _diverge → user converges → lock → advance._ Number the options, give a reasoned recommendation, stop and let the user choose. Worked fragments from past runs are FORM models (specificity, motion arcs, cut handoffs), never content or genre to reuse — adapt option labels to the locked tone. Steps 1–5 stay short: options + one ask.

## Step 1 — Premise

Lock the seed sentence plainly and name what it already fixes — genre, setting, any built-in "button" (recurring payoff); it's a coordinate, not a destination. URL in the seed → `webExtract` first; lock the seed with what the source actually says. **Screen-thesis / readable-UI climax:** if a direction's payoff requires the audience to read specific on-screen text or UI (not merely sense density/glow), flag it — current medium stance is Path A (implied-not-read). Redesign the button to implied UI, or get an explicit user ack that legibility is aspirational and will drift. Do not invent a "locked string" asset Seedance cannot honor. **Named real orgs:** if dramatization would invent incriminating depicted "evidence" about a real company, fork fictionalize / keep hypothetical / user ack before locking. Then offer ~6 distinct directions, each with a different protagonist AND a different engine (the mechanism that generates scenes/tension/humor/dread), plus each one's recurring payoff. Flag which options give a single clear protagonist (easiest consistency) and which are most purely visual (best for AI). Lock one direction or a splice.

## Step 2 — Story spine (logline + conflict + theme, one artifact)

Prove the story has a spine, in one bundled turn.

- **Logline:** offer several on different axes — tone-forward, irony-forward, lean one-liner, character-stakes-forward (smuggles in a ticking clock). Judge each: would a stranger want to watch this? Recommend blending real stakes/clock with the clean statement of the core irony. If no version is compelling, STOP and rework the premise.
- **Conflict:** separate the external _want_ (conscious goal, drives plot) from the deeper _need_ (internal lack the story resolves) — the gap between them is where drama lives. Define the opposing force concretely and why it's hard to beat (the best obstacles don't know what they're obstructing). Build in any "why can't they just…" trap that keeps a powerful character stuck at human scale. Offer 2–3 candidates for the deeper need — each colors the ending differently; recommend the need the plot already dramatizes.
- **Theme:** offer ~5 one-sentence _claims_ about life (not topics). The theme's flavor sets the mood vocabulary that later picks lighting and color. Recommend the claim the ending will literally prove.

Bundle the asks (logline choice, need choice, theme choice) in ONE `askQuestions` call. Lock the spine as one block: protagonist + goal + obstacle + stakes + irony; want vs need; the claim.

## Step 3 — Character design

First audit the cast to the minimum viable set; name hero faces (each earns a reference image at Step 9) vs disposable background (no reference). For each main character offer the consequential forks: look/design (2–4 options, explicitly trading expressiveness against consistency — simple distinctive silhouettes drift least), any constraint the premise needs, supporting characters' flavor. Then write the locked result as a renderable `@material` spec: species/build, fixed proportions, silhouette anchor, **fixed wardrobe** + one instantly-readable detail, signature expression, 2–3 never-drift anchor features, and a handle name (`hero_charsheet`). The spec is the source for Step 9 expansion, written for a human — expansion turns it into the image prompt. Tip: turn invisible stakes into a visible on-character detail.

## Step 4 — World & locations

Write each location as a named renderable plate spec (geometry, light direction, atmosphere), then consolidate ruthlessly: one master location with zones beats many places. Offer the time-of-day structure: a single day (visible sky-clock, most consistent) vs multiple days (more scale, more lighting variation — tame it with a small set of canonical lighting states and a clock that changes _between_ shots). Lock the plate list + time structure.

## Step 5 — The Look [critical]

The #1 consistency tool: the renderer re-specifies lighting/grade/lens on every prompt, so drift here disintegrates the film. Draft ONE reusable block per the Bible §1 template (`deliverable-templates.md`) and offer only the genuine forks inside it (typically dialogue register and aspect ratio — aspect must be an API-supported value; anamorphic FEEL is lens character, not a ratio). Recommend deriving it from theme + genre + the premise's natural setting. Lock verbatim.

## Step 6 — Beat sheet (with the connective read)

List the structural turns in order (opening image, inciting event, midpoint shift, low point, climax, resolution — compressed for shorts), threaded with short connective prose between beats so the whole story reads continuously — this replaces a standalone synopsis. Tag every beat: MOOD word, LIGHT state, HOOK yes/no (almost none), MATERIALS needed. Interrogate here for the saggy middle and the unearned ending — this is the last cheap place to fix story; check the mood tags trace a deliberate emotional curve; flag any beat leaning toward a theme that was set aside. Give dramatic irony its own beat when the film runs on the audience knowing more than the hero. End with the continuous-read sanity check (does it flow, does the click land, is the tone arc intact?). Size to runtime (below).

## Step 7 — Shot list (scenes built with outline logic inline)

THE deliverable, built **scene by scene**: for each beat, break it into scenes (one location + one continuous time span; an intercut beat = two scenes with alternating rows), write the scene's full continuity-block header, then its rows — and only then move to the next beat's scenes.

While writing each header, apply the old outline's disciplines inline:

- **Scene-delta rule:** every scene names its ONE job and its irreversible story-state change; a scene that can't state a new end state gets merged, cut, or rewritten, and consecutive scenes must differ visibly (a State Schedule value or the lighting state). **Do not open a new scene solely because lighting changes** — lighting progression belongs inside one scene's continuity block when location and geography stay continuous (match-cut pairs that only change light/scheduled content stay co-scenic).
- **Running accounting:** track total locations and characters against the locked inventory as scenes accumulate; consolidate while it's still text; cut assets no scene uses.

Header schema, column rules, and camera-choosing vocabulary: `deliverable-templates.md` §B and §B2. Keep a running total of shots and seconds against the target runtime.

**Dialogue pass (conditional):** for dialogue-driven scenes, write the lean dialogue beats directly into the rows' motion arcs; when spoken flow needs judging on the page, draft a short screenplay-format excerpt for just those scenes and lock the lines before the rows. A full formatted screenplay is produced only if the user asks for one as a deliverable.

Author rows only — prompt assembly is Stage 2's job.

## Step 8 — The Bible (assembly + State Schedule fork)

Assemble §A from locked artifacts: §1 the Look verbatim (Step 5), §2 the master `@material` list with canonical definition lines (Steps 3–4 specs), §3 the standing directives from the template (fill G's hook shots and D's deliberate-motion list from the beat sheet and rows). The one authored part is **§4 the State Schedule** — every changing element's progression across shots, the lighting progression, and match-cut pairs. Present the State Schedule as this step's fork (the rest is a silent concatenation check), lock, and the Bible is done.

## Step 9 — Asset reference generation

Audit the manifest first: identity anchors only (characters, plates, recurring hero props in ONE neutral state), typically 4–8 images; strike disguised shots; fused entities get their own object refs; plates stay environment-only when a hero prop has its own ref; charsheets follow the held-tool policy in `medium-constraints.md`. Present the audited list as a fork — this is the taste decision; everything after it is verification.

On manifest approval, run the batch: expand EVERY spec per `medium-constraints.md` (assets are independent — every expansion derives only from the locked spec + the locked Look, so nothing waits on anything), dispatch all generations together. The app returns **one candidate per asset** in ONE gallery.

**Gallery review is per-item approve/reject (not choose-among):**

- When the tool result shows `vision_status:attached`, pre-screen every candidate against its approval checklist (`medium-constraints.md`) — especially the twin-bug check on charsheets — in that turn. Failures regenerate before asking the user to approve, or show pre-flagged when regen budget is tight. Never claim a visual check on `vision_status:unverifiable`.
- The user REJECTS individual assets (each rejection names the objection; that asset regenerates with the objection folded into its expansion prompt and returns to the gallery) and APPROVES the remainder via the gallery Approve button (`asset_approval` with per-asset candidate ids / storage keys) — never free text, never `askQuestions` for approval.
- Regenerated assets come back as a small follow-up gallery; repeat until every manifest entry is bound.

Characters still lead the gallery ordering (they're the highest-stakes identities and the most likely rejections — surfacing them first gets their re-roll cycle started earliest). Assets approved ≠ Stage 1 done — proceed to Step 10.

## Step 10 — Motion sheets

With assets approved, load `generation-grids.md` and follow it: one motion sheet per shot, anchored for scene continuity by the header's continuity block + plate + the scene's first approved sheet + the prior terminal panel (or match-cut source), recording every approval or skip via `recordGenerationGridEntry`. Pre-screen each fresh sheet while `vision_status:attached`; Approve-grid only — no approval `askQuestions`. Stage 1 completes when every shot has a validated registry entry.

---

## Runtime sizing (apply at Step 6, re-check at 7)

Shot budget = total seconds ÷ average clip length.

- ~2–3 min short ≈ 20–26 shots ≈ a 7-beat spine (compress multi-day grinds into ONE time-passing beat: match-cut + a scheduled changing element).
- ~8–12 min short ≈ ~13 beats, room for a real escalation montage.
  To lengthen, give the middle and climax more shots rather than adding beats.

## The interrogation prompts (use after each artifact)

- What's the most clichéd choice here, and what's the surprising alternative?
- What's the weakest link — the thing that would make a viewer disengage?
- Is each beat doing a _different_ job, or are two beats the same energy?
- Does the ending _prove_ the theme, or just stop?
- Is anything here expensive for AI video, and can we rewrite toward the medium's strengths without losing the point?
