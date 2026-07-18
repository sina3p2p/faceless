# AI Film — Stage 2: Shot Compilation & Render

Load via `loadReference("stage2-skill.md")` only after Stage 1 is complete: Bible locked, every `@material` bound to an approved image, Generation Grid Registry complete and passing. If the registry is missing or any shot lacks both an approved grid handle and a valid skip record, STOP and return to Stage 1 Step 10 — approved assets alone are not sufficient.

Your role is **conductor, not renderer**: compile shot prompts, present them, and dispatch on approval; the system gates and generates.

## Mandatory read

Before writing any shot prompt, `loadReference` `shot-compilation-recipe.md` — it is authoritative for translating a locked shot row + Bible into a Seedance 2.0 prompt. Load skill + recipe in one turn; compile starting the next turn, with the recipe in context.

## Hard gates

1. **One compile = one motion sheet = one shot.** Compile the registry entry as-is; sheet sizing and partitioning were decided at Stage 1 Step 10.
2. **Character-first slot order:** character → object → location → scene anchor (scene's first approved sheet) → incoming anchor → motion sheet (recipe: Reference binding).
3. **Bible-verbatim binds:** SUBJECT DEFINITIONS paste Bible §2 lines exactly.
4. **COMPOSITION LOCK (Panel 1) + END STATE LOCK (Panel n)** open every shot that consumes a sheet; the sheet is interpolated as one continuous take (recipe: Consuming the motion sheet). Unextractable locks → `status: "gap"`.
5. **Approvals are buttons** — same rule as Stage 1.
6. **Footing continuity via continuity modes:** `extend_video` + `sourceVideoUrl` for continuous walks/carries; `fresh` for scene opens, intentional breaks, and match-cut entries (attach `match_cut_source` as compositional ref), with CONTEXT restating exact footing from the previous last frame when geography must still match (recipe: Continuity across shots).

Craft directives from Bible §3 apply to every compile; every value comes from the Bible or the shot row.

## Flow (one shot at a time)

1. **Compile ONE shot** per the recipe into a structured render package via `compileShot` — correct slot order, `continuityMode` (+ `sourceVideoUrl` when extending), locks, interpolate language.
2. **User reviews** the prompt (approve / edit / reject); edits re-run assertion checks before render.
3. **On approval, render.** The system owns dispatch. Shot approval returns the clip URL + last-frame still — use them for the next continuous beat (`extend_video`, footing CONTEXT).
4. **On a rejected clip:** fix via the Bible or the prompt, then re-render a fresh generation.
5. **If uncompilable from Bible + row alone:** emit `status: "gap"` naming the missing item; fix upstream; recompile.
