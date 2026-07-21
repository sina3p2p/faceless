# Pipeline Steps — Stage 1

This file is authoritative for Stage 1 order, artifacts, forks, completion criteria, reference timing, final audit, and Stage 2 handoff.

Read the complete file before starting. Apply the interaction contract from `SKILL.md`: _diverge → user converges → lock → validate → advance_. Do not advance until the current step’s **Done when** gate passes.

## Reference rule

When a step names a reference, ensure its complete contents are active before executing that step. Otherwise call `loadReference`, read the complete result, and stop if it fails. Never reconstruct a reference from memory. This file alone owns reference timing.

## Fast path

Audit supplied material against the relevant gates, lock what passes, and resume from the earliest missing or contradictory dependency. Existing story documents never eliminate the asset-reference or motion-sheet registry phases.

---

## Step 1 — Premise

**Reference:** `medium-constraints.md`  
**Artifact:** locked seed and direction  
**Fork:** direction

Load the reference before the first fork and keep it available throughout Stage 1.

Restate the seed and name what it fixes: genre, setting, required elements, source, format, or runtime. Resolve any medium, readable-UI, or real-organization dramatization issue before locking.

Offer about six genuinely different directions. Each needs a distinct protagonist, story engine, and recurring visual payoff.

**Done when:** seed, direction, protagonist, engine, and payoff are locked; medium and dramatization risks are resolved.

---

## Step 2 — Story spine

**Reference:** `medium-constraints.md`
**Artifact:** locked logline + conflict + theme  
**Fork:** logline, deeper need, and thematic claim

Offer loglines on different axes such as tone, irony, brevity, stakes, and visual appeal. Every viable version identifies protagonist, goal, obstacle, stakes, and central irony.

Separate external **want** from internal **need**. Define the opposing force, why it is hard to beat, and why the obvious shortcut fails. Offer two or three needs and about five one-sentence thematic claims; recommend the claim the ending can visibly prove.

Bundle the three decisions in one `askQuestions` call. If no spine is compelling, return to Step 1.

**Done when:** protagonist, goal, obstacle, stakes, irony, want, need, opposing force, theme, and a theme-proving ending direction are locked.

---

## Step 3 — Character design

**Reference:** `medium-constraints.md`  
**Artifact:** minimal cast and renderable character specs  
**Fork:** consequential visual and character choices

Separate recurring hero faces from disposable background figures and minimize the cast. For each hero, offer choices that materially affect silhouette, expressiveness versus consistency, fixed wardrobe, premise constraints, or visible stakes.

Write each locked hero as a human-readable `@material` spec: identity/species, build and proportions, silhouette anchor, fixed wardrobe, one readable detail, performance register, two or three never-drift features, and a unique handle. Do not expand image prompts until Step 9.

**Done when:** cast tiers are clear and minimal; every hero has one unique, internally consistent, renderable specification; recurring-prop policy agrees with `medium-constraints.md`.

---

## Step 4 — World and locations

**Reference:** `medium-constraints.md`  
**Artifact:** locked plate inventory and time structure  
**Fork:** single-day or multi-day structure

Write each recurring location as a named plate spec: geometry, landmarks, depth planes, light direction, atmosphere, fixed features, zones, and handle.

For multiple days, use a small set of canonical lighting states. Convert invisible stakes into scheduled visible changes where possible.

**Done when:** every recurring location has a plate spec; time structure is locked; lighting and changing environmental states can feed the State Schedule; hero props remain separable from plates.

---

## Step 5 — The Look

**References:** `look-template.md` and `medium-constraints.md`  
**Artifact:** one verbatim locked Look block  
**Fork:** genuine choices such as grade, lens character, or dialogue register

Load `look-template.md` before drafting. Derive the Look from theme, genre, emotional arc, setting, and medium constraints.

Complete every template field: aspect ratio (fixed at 16:9 — never a fork), lens/stock character, show grade, bounded named trims if needed, three or four canonical lighting states, sound approach, and tone north-star. Anamorphic qualities are lens character, not an invented ratio.

**Done when:** every Look field is complete and compatible; the full Look is locked verbatim.

---

## Step 6 — Beat sheet

**Reference:** `medium-constraints.md`  
**Artifact:** locked beat sheet with connective read  
**Fork:** structural repairs that require taste

Build runtime-appropriate turns: opening, inciting event, escalation, midpoint, low point, climax, and resolution. Thread connective prose between them so the story reads continuously.

Tag every beat **MOOD**, **LIGHT**, **HOOK yes/no**, and **MATERIALS**. Keep hooks rare. Give dramatic irony its own beat when it drives the story.

Repair repeated energy, a sagging middle, invisible stakes, costly action, and any ending that does not prove the theme. Apply runtime sizing below.

**Done when:** every beat has a distinct job and all four tags; the middle escalates; climax resolves the conflict; ending proves the theme; the beat count fits runtime.

---

## Step 7 — Shot list

**Reference:** `shot-list-template.md`  
**Artifact:** locked annotated shot list  
**Fork:** scene structure, coverage, and dialogue choices

Build scene by scene: divide the beat, write the complete continuity-block header, write its rows, validate, then continue. A scene is one location, one continuous time span, and stable geography; intercuts use separate alternating scenes.

Every scene must name one job, one irreversible delta, and its visible end-state difference. Merge, cut, or rewrite scenes without a delta. Do not split only because lighting changes.

Use the exact template schemas and camera vocabulary. Track locations, cast, props, shot count, and estimated runtime while authoring. Produce a full screenplay only on request. Author rows only; final video prompt assembly belongs to Stage 2.

**Done when:** every beat has coverage; every scene has a valid delta and continuity block; every row passes the row template, describes start → change → end, has one dominant motion source and one lighting state unless excepted, binds every recurring visible entity, and provides usable cut handoffs; runtime fits and the list is locked.

---

## Step 8 — The Bible

**Reference:** `bible-template.md`  
**Artifact:** locked Visual and Tone Bible  
**Fork:** State Schedule

Assemble, do not rewrite:

- §1 — Step 5 Look verbatim;
- §2 — canonical `@material` definitions from Steps 3–4;
- §3 — template directives completed from locked beats and rows;
- §4 — State Schedule authored now.

The State Schedule covers every changing physical, wardrobe, prop, location, lighting, clock, damage, depletion, and match-cut state. Present only this schedule as the creative fork, then run contradiction checks and lock the Bible.

**Done when:** §1 is verbatim; §2 covers every image-bound material; §3 preserves canonical directives; §4 covers every changing element and match cut; Bible and shot list agree; the Bible is locked.

---

## Step 9 — Asset references

**Reference:** `medium-constraints.md`  
**Artifact:** approved reference-image set with all required handles bound  
**Fork:** audited asset manifest

Audit identity anchors only: hero characters, recurring plates, recurring hero props/vehicles, and required location-state versions. Remove disguised shots, one-off figures, redundant views, and plate/object identity conflicts. Apply the held-tool policy.

Expand each spec into its image prompt using only its locked definition, the locked Look, and the expansion method in `medium-constraints.md`; dispatch independent generations together; return one candidate per item; pre-screen visible pixels.

The user rejects individual candidates with an objection and approves acceptable ones through `asset_approval`. Regenerate only rejected items.

**Done when:** the manifest is approved; every item has one approved reference; character sheets pass their checklist; plates and objects do not conflict; every Bible §2 image handle resolves; no rejection remains unresolved.

---

## Step 9b — Voice anchors

**Reference:** `medium-constraints.md` (Dialogue)  
**Artifact:** approved `@*_vo` audio samples for every recurring speaking character / VO  
**Fork:** only when voice casting is a genuine creative choice (otherwise pick and proceed)

After image assets are approved (or in the same pre-grid window), call `generateVoiceAnchors` once with every Bible §2 Voices entry that speaks on camera or as recurring VO. Use a short in-character sample (1–2 sentences), one distinct ElevenLabs `voiceId` per hero when known. Background one-offs: skip.

The user rejects individuals with an objection and approves via the same gallery `asset_approval` (Approve remaining). Regenerate only rejected handles.

**Done when:** every speaking hero / recurring VO has one approved `@*_vo` URL; Bible §2 Voices resolves; no rejection remains unresolved.

---

## Step 10 — Motion sheets and registry

**Reference:** `generation-grids.md`  
**Artifact:** approved motion sheets and passing Generation Grid Registry  
**Fork:** only user-controlled exceptions allowed by the reference

Load and follow the complete reference. Prerequisites are a locked Bible, locked shot list, complete continuity blocks, and approved assets.

Generate one sheet per shot unless the reference permits a valid recorded skip. Follow it for panels, anchors, continuity chains, breaks, match cuts, lighting, approvals, and skips. Sheet approval must arrive through `grid_approval`.

**Done when:** every shot appears exactly once; every non-skipped shot has an approved sheet; every approval or skip is recorded; continuity and lighting fields validate; the registry passes.

---

## Runtime sizing

Apply at Step 6 and recheck at Step 7, for any target runtime:

```text
shot budget = target runtime in seconds ÷ intended average shot length
```

- Scale the beat count to the runtime; shorter films compress the spine, longer films deepen it.
- Add shots to important middle or climax beats rather than repetitive beats.
- Compress long time passage with scheduled changes and match cuts.
- Each shot must satisfy `generation-grids.md` duration limits.

## Interrogation

Before locking, identify the most clichéd choice, weakest link, repeated energy, ending/theme mismatch, avoidable generation cost, and contradictions with locked material. Surface actual failures only.

## Final Stage 1 audit

Run silently after Step 10. Confirm:

- Bible and shot list are locked.
- Every image-bound material resolves to one approved asset.
- Every speaking hero / recurring VO resolves to one approved `@*_vo` (or the film is silent / dialogue-free by design).
- Every shot resolves to exactly one approved-sheet or valid-skip entry.
- No orphan handles or unbound motion-arc entities exist.
- State Schedule, lighting, continuity, cut handoffs, and match cuts agree.
- Estimated durations fit the target.
- No Stage 2 creative decision remains.
- The Generation Grid Registry passes.

Stage 1 produces: locked Bible, locked shot list, approved reference images, approved voice anchors (when the film has dialogue), approved motion sheets, and a passing registry.

## Stage 2 handoff

Only after the final audit passes:

1. In the same turn call:

   ```text
   loadReference("stage2-skill.md")
   loadReference("shot-compilation-recipe.md")
   ```

2. Read both complete files.
3. Do not compile or render during that loading turn.
4. Begin Stage 2 on the next turn with both references active.

If either load fails, report the missing file and stop. Stage 2 must not invent missing creative decisions.
