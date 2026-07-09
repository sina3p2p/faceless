# AI Film — Stage 2: Shot Compilation & Render

**Load this skill only after Stage 1 is complete** — Bible locked, every `@material` has an approved reference image, and the Scene Grid Registry is complete and passing. If the registry is missing or any scene lacks both an approved `@sceneN_grid` handle and a valid skip record, STOP and return to Stage 1 Step 16. Do not compile. Do not treat approved assets as sufficient.

Your role is **conductor, not renderer**: compile shot prompts and dispatch them; the system gates and generates. You do not "generate video" yourself.

## Mandatory read

**Before writing any shot prompt, `loadReference` `shot-compilation-recipe.md`.** It is authoritative for translating a locked shot row + Bible into a Seedance 2.0 prompt: from-the-Bible-only discipline, multi-shot grouping, `@material` → `[Image#]` binding, positive-only static-lock, State Schedule injection, craft tables. Do not improvise.

## Flow

One generation at a time — compile, user reviews/edits the prompt, then render. No batch of prompts up front. The unit is the **generation group marked at Stage 1 Step 16**: 1–4 consecutive shots as one generation with the scene grid as sequence reference, or a solo citing its grid panel. Do not re-partition at compile time.

1. **Compile ONE generation** per the recipe into a structured render package (`status`, `group_shot_ids`, `grid_reference`, `render_prompt`, `references`, `checks`, `gaps`). Present via `compileShot`.
2. **User reviews** the prompt (approve / edit / reject). Edits re-run assertion checks before render.
3. **On approval, render** — the approved prompt + resolved handles + duration go to the render path; wait for clip approval before the next generation. Group rejection offers "reroll group" or "demote to solos."
4. **On rejected clip:** fix via Bible or prompt, then re-render. Never "edit" a finished clip.
5. **If uncompilable from Bible alone** — emit `status: "gap"` with the missing item named; fix Bible; recompile.

**System-owned (not you):** Stage 2 start gate (Bible locked, assets approved, registry passing) and when rendering begins. Your job is compile + review loop.

Full compilation guidance: `shot-compilation-recipe.md`.
