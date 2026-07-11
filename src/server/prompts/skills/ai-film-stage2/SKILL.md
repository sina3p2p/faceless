# AI Film — Stage 2: Shot Compilation & Render

**Load this via `loadReference("stage2-skill.md")` only after Stage 1 is complete** — Bible locked, every `@material` has an approved reference image, and the Scene Grid Registry is complete and passing. The chat system prompt stays Stage 1 for the whole session; this file (and the recipe) are injected into the thread as references. Follow them for compile/render work.

If the registry is missing or any scene lacks both an approved `@sceneN_grid` handle and a valid skip record, STOP and return to Stage 1 Step 16. Do not compile. Do not treat approved assets as sufficient.

Your role is **conductor, not renderer**: compile shot prompts and dispatch them; the system gates and generates. You do not "generate video" yourself.

## Mandatory read

**Before writing any shot prompt, `loadReference` `shot-compilation-recipe.md`.** It is authoritative for translating a locked shot row + Bible into a Seedance 2.0 prompt. Do not improvise. Prefer loading Stage 2 skill + recipe in one turn, then compiling on the **next** turn so the recipe is in context before you write prompts.

## Hard gates (discipline)

1. **Sequential load → compile.** Prefer not to call `compileShot` in the same turn as the first Stage 2 loads — load, stop; compile next turn.
2. **Character-first slot order.** Attach references character → object → location → grid (`referenceImageUrls` in that order). Seedance weights earlier slots more for precise identity.
3. **Bible-verbatim binds.** SUBJECT DEFINITIONS paste Bible §2 lines exactly (bind + govern + label). Do not re-essay the reference image.
4. **Solo by default.** Prefer one shot per `compileShot`. Groups only when Stage 1 marked a low-motion consecutive group — grouping is a cost/continuity tradeoff. Motion-rich / crash / liftoff / fulcrum / deliberate-motion spectacle shots marked solo at Step 16 stay solo unless the user explicitly accepts sharing a window.
5. **Approvals are buttons.** Free-text "continue" is never shot or grid approval.
6. **COMPOSITION LOCK on every gridded shot.** Soft panel citations (`composition matches panel…`, `composition follows panel…`) are forbidden. Every group/solo shot block opens with `COMPOSITION LOCK: match panel [p] of the approved scene grid — [framing, subject position, geography, screen direction, footing/state]`. Extract from approved panel + row + captions; if unextractable → `status: "gap"`.
7. **Footing continuity via modes.** When the next shot continues a walk/approach on the same surface:
   - Prefer `compileShot` with `continuityMode: "extend_video"` + `sourceVideoUrl` (approved prior clip). Prompt opens with `Extend <Video_1>: …`. Optional stills OK.
   - Use `continuityMode: "fresh"` for scene opens, clean breaks, and hard cuts that start a new take (stills only). Restate footing in CONTEXT from the previous last frame when geography must match.
   - CONTEXT must restate exact footing/surface from the previous last frame (pixels win over the planned row).

**Craft defaults (not cinema laws):** one SHOW LOOK (+ locked trims only); one DOMINANT motion source per shot (secondary only if slower/smaller/subordinate); characters never static-locked or unperformed (intentional stillness must be written); one turnaround sheet is the default tested profile.

## Flow

One generation at a time — compile, user reviews/edits the prompt, then render. No batch of prompts up front. The unit is usually a **solo**; honor Stage 1 Step 16 groups only when marked (1–4 consecutive low-motion shots). Do not re-partition at compile time.

1. **Compile ONE generation** per the recipe into a structured render package. Present via `compileShot` with `referenceImageUrls` in character → object → location → grid order, the correct `continuityMode` (+ `sourceVideoUrl` when extending), and a mandatory COMPOSITION LOCK on every gridded shot block.
2. **User reviews** the prompt (approve / edit / reject). Edits re-run assertion checks before render.
3. **On approval, render** — the approved prompt + resolved handles + duration + continuity fields go to the render path; wait for clip approval before the next generation. Shot approval returns the clip URL (and a last-frame still for CONTEXT footing) — use `extend_video` + that clip URL for the next continuous beat.
4. **On rejected clip:** fix via Bible or prompt, then re-render. Never "edit" a finished clip.
5. **If uncompilable from Bible alone** — emit `status: "gap"` with the missing item named; fix Bible; recompile.

**System-owned (not you):** when rendering begins after user approval. Your job is compile + review loop. Stage 1 completion (registry passing) is your gate before loading this skill.

Full compilation guidance: `shot-compilation-recipe.md`.
