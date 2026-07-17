# AI Film — Stage 2: Shot Compilation & Render

**Load this via `loadReference("stage2-skill.md")` only after Stage 1 is complete** — Bible locked, every `@material` has an approved reference image, and the Generation Grid Registry is complete and passing. The chat system prompt stays Stage 1 for the whole session; this file (and the recipe) are injected into the thread as references. Follow them for compile/render work.

If the registry is missing or any shot lacks both an approved `@sceneN_genX_grid` handle and a valid skip record, STOP and return to Stage 1 Step 16. Do not compile. Do not treat approved assets as sufficient.

Your role is **conductor, not renderer**: compile shot prompts and dispatch them; the system gates and generates. You do not "generate video" yourself.

## Mandatory read

**Before writing any shot prompt, `loadReference` `shot-compilation-recipe.md`.** It is authoritative for translating a locked shot row + Bible into a Seedance 2.0 prompt. Do not improvise. Prefer loading Stage 2 skill + recipe in one turn, then compiling on the **next** turn so the recipe is in context before you write prompts.

## Hard gates (discipline)

1. **Sequential load → compile.** Prefer not to call `compileShot` in the same turn as the first Stage 2 loads — load, stop; compile next turn.
2. **Character-first slot order.** Attach references in precision order: character → object → location → continuity-pack keyframes → incoming anchor → motion sheet (`referenceImageUrls`). Seedance weights earlier slots more for precise identity; the motion sheet is last because it is the continuous-take trajectory to interpolate.
3. **Bible-verbatim binds.** SUBJECT DEFINITIONS paste Bible §2 lines exactly (bind + govern + label). Do not re-essay the reference image.
4. **One compile = one motion sheet = one shot.** Compile the registry entry as-is (4–9 panels, Dur ≤15s). Do not merge shots or re-partition.
5. **Approvals are buttons.** Free-text "continue" is never shot or grid approval.
6. **COMPOSITION LOCK + END STATE LOCK.** Soft panel citations (`composition matches panel…`, `composition follows panel…`) are forbidden. Every shot opens with `COMPOSITION LOCK: match panel 1 of the approved motion sheet — […]` and includes `END STATE LOCK: match panel N — […]`. Extract from approved panels + row + captions; if unextractable → `status: "gap"`.
7. **Interpolate the sheet — no hard cuts.** Define the sheet as continuous-take guidance: interpolate naturally between panel states; one continuous take; never show the grid or gutters. Middle panels are milestones, not cuts.
8. **Footing continuity via modes.** When the next shot continues a walk/approach on the same surface:
   - Prefer `compileShot` with `continuityMode: "extend_video"` + `sourceVideoUrl` (approved prior clip). Prompt opens with `Extend <Video_1>: …`. Optional stills OK. Upgrade the Stage 1 incoming anchor to `prior_render_last_frame` when available. Next sheet Panel 1 inherits prior Pn / last frame.
   - Use `continuityMode: "fresh"` for scene opens, intentional `continuity_break_reason` breaks, and hard cuts that start a new take (stills only). Restate footing in CONTEXT from the previous last frame when geography must match.
   - CONTEXT must restate exact footing/surface from the previous last frame (pixels win over the planned row).

**Craft defaults (not cinema laws):** one SHOW LOOK (+ locked trims only); one DOMINANT motion source per shot (secondary only if slower/smaller/subordinate); characters never static-locked or unperformed (intentional stillness must be written); one turnaround sheet is the default tested profile.

## Flow

One shot at a time — compile, user reviews/edits the prompt, then render. No batch of prompts up front. Honor Stage 1 Step 16 motion sheets as-is. Do not re-partition at compile time.

1. **Compile ONE shot** per the recipe into a structured render package. Present via `compileShot` with `referenceImageUrls` in character → object → location → continuity-pack keyframes → incoming anchor → motion sheet order, the correct `continuityMode` (+ `sourceVideoUrl` when extending), COMPOSITION LOCK on Panel 1, END STATE LOCK on Panel n, and interpolate / no-cuts language.
2. **User reviews** the prompt (approve / edit / reject). Edits re-run assertion checks before render.
3. **On approval, render** — the approved prompt + resolved handles + duration + continuity fields go to the render path; wait for clip approval before the next shot. Shot approval returns the clip URL (and a last-frame still for CONTEXT footing) — use `extend_video` + that clip URL for the next continuous beat.
4. **On rejected clip:** fix via Bible or prompt, then re-render. Never "edit" a finished clip.
5. **If uncompilable from Bible alone** — emit `status: "gap"` with the missing item named; fix Bible; recompile.

**System-owned (not you):** when rendering begins after user approval. Your job is compile + review loop. Stage 1 completion (registry passing) is your gate before loading this skill.

Full compilation guidance: `shot-compilation-recipe.md`.
