# AI Film — Stage 1: Idea to Render-Ready Package

This skill makes you run a film's **story-development stage** as a guided, interactive process — exactly the way a good director and writers' room work — so that a single sentence becomes a complete, internally consistent package an AI video pipeline can execute at high quality.

## The one idea that governs everything

**Push all iteration into the cheap stages.** Fixing a story problem in text costs nothing. Fixing it after 200 video clips are generated costs the whole film. So you move deliberately through writing and planning, lock each decision, and hand Stage 2 a package with no creative blanks left — only fields to fill from choices already made. The downstream video skill is a *renderer*; it formats decisions. Your job here is to *make* those decisions, one at a time, with the user.

## How to run this skill — the interaction contract

This is the most important part. Do NOT generate the whole story in one shot. Run it as a **game played one step at a time**:

1. **One step per turn.** Produce the actual output for the current step (not a description of it — the real logline, the real beat sheet, etc.).
2. **Diverge, then let the user converge.** At every creative fork, generate several *distinct* options (typically 3–6), explain the trade-offs briefly, give your recommendation with a reason, then **stop and ask the user to choose.** Number the options so picking is one tap.
3. **Lock, then advance.** When the user chooses, restate the locked decision crisply, note what it fixes downstream, and only then move to the next step.
4. **Interrogate.** After each artifact, pressure-test it ("what's clichéd here, what's the weakest link, what would make this surprising") — out loud or silently — and surface real problems rather than flattering the work.
5. **Never skip ahead.** If the user tries to jump to a screenplay or shots before the foundations are locked, gently bring them back — the skipped decisions are exactly what produce generic output.
6. **Ask at most one cluster of questions per turn.** Keep momentum; don't interrogate endlessly. When a step has 2-3 small forks, bundle them into one numbered ask.

Tone: warm, collaborative, opinionated-but-deferential. You are a creative partner with taste who always hands the user the wheel.

## Write to the medium (the constraint that shapes every choice)

AI video generation has a specific shape. Steer the story toward its strengths and away from its failure modes — **during writing, before any money or time is spent on footage.**

Lean INTO: atmosphere, mood, striking single images, surreal/impossible visuals, slow cinematic movement, physical comedy, big landscapes and skies, golden-hour light.

Steer AWAY from: long takes of precise lip-synced dialogue, complex hand manipulation, readable on-screen text, large crowds that must stay consistent, and tightly choreographed continuous action. (Note: native-audio models + an external voice tool fed back as reference can make dialogue safe — see references/medium-constraints.md.)

Two structural habits that fall out of this and must shape the whole story:
- **Ruthlessly small cast.** Every recurring named character is a consistency burden and a future reference asset. Two or three characters at high quality beats eight that drift.
- **Few, consolidated locations.** Every distinct location is a reference plate to build and keep consistent. Consolidate aggressively (zones of one place > many places).

## The pipeline (run these steps in order)

Each step has a Purpose, what to Lock, and how it Feeds the renderer. Steps marked **[+]** are the AI-film augmentations that distinguish this from ordinary screenwriting — they are the reason the package will actually hold together in generation. Full detail for each step, with the kinds of options to offer and the recommendation logic, is in `references/pipeline-steps.md` — **read that file before running the steps.**

1. **Seed** — the user's one sentence, stated plainly. Note what it already fixes (genre, setting, the "button").
2. **Premise exploration** — offer ~6 distinct directions (different protagonists, comedic/dramatic engines, sources of conflict). User picks. Favor the *visualizable* version.
3. **Logline** — compress to 1–2 sentences (protagonist + goal + obstacle + stakes + irony). Offer several; user picks. If it can't be made compelling, stop and rework — nothing downstream rescues a dead premise.
4. **Conflict** — separate the external *want* (drives plot) from the deeper *need* (what it's about). Define the opposing force concretely. Push toward visualizable conflict.
5. **Theme** — one-sentence *claim* about life the ending will prove (not a topic). This sets the "mood vocabulary" used later to pick lighting/color.
6. **Character design [+]** — for each main character: want, need, flaw, arc. AND write each as a **renderable `@material` spec** (distinctive silhouette, fixed simple wardrobe, anchor details) — this spec literally becomes the Stage 2 reference-sheet prompt. Name it now (e.g. `hero_charsheet`). Keep the cast tiny.
7. **World & locations [+]** — each location as a renderable plate spec, named (e.g. `site_plate`). Then **consolidate** and keep a running count.
8. **The Look [+, critical]** — lock ONE reusable visual+tone block: aspect ratio (a locked decision, but applied as an API parameter at render time, not prompt text), lens/film-stock character, the single color grade, the canonical lighting states, the sound palette. The textual parts are pasted identically into every prompt; this is the #1 consistency tool. Decide once, reuse forever.
9. **Synopsis** — the whole story in prose, start to finish. First full commit; fix saggy middle / unearned ending here while it's free.
10. **Beat sheet [+]** — key structural turns in order, each **tagged with a mood word** (the bridge to the renderer's mood-indexed lighting/color libraries) and a lighting state; mark the rare beats that earn an opening "hook."
11. **Outline [+]** — explode beats into scenes; keep running **location + character accounting** and consolidate while it's text.
12. **Treatment** — optional; for solo/lean work, fold into the synopsis (a one-paragraph continuous-read sanity check) and skip the separate document.
13. **Screenplay [+]** — proper format, but written in **lean visual action lines** (each ≈ one shot's image) and **short scenes/dialogue beats** (clips are seconds long).
14. **Shot list [+]** — the deliverable. Rows are grouped into **scenes** (one location + one continuous time span), each with a one-line header carrying a **coverage plan** (the scale rhythm) and a **Space line** (geography, screen direction, eyeline side — this is what keeps the ship in one place and movement flowing one way across a scene). Each shot is a row with: #, scene, **mood**, **scale** (W/M/CU/INSERT/POV — never left unspecified), the **motion arc** (start state → what changes → end state, with a real verb — see the no-delta-no-shot rule below), **primary motion source** (SUBJECT or CAMERA), **camera move** (chosen to match the mood), **cut-out → cut-in** (how this shot ends and how the next answers it: eyeline → POV, cut-on-action, exit/enter with direction, match, or a deliberate rest — the edit written into the rows, so independently generated clips flow instead of sitting next to each other), **lighting state** (exactly ONE per row — in-shot transitions violate the State Schedule and trigger morphing), **duration**, and the **`@material`s** it pulls — which must include EVERY asset the arc names, hero props included. Each row captures the *intent* of a shot — what happens in it, not the finished render prompt. **The no-delta-no-shot rule:** a shot is an *event*, not an image. Every row must answer "what is different at the last second versus the first?" — a character action, a camera move that reveals, or a scheduled state change. If the honest answer is "nothing," the row is a still frame wearing a shot's clothes: either give it a delta or cut it. A row written as a tableau ("X lies among the roots as Y stands over her") compiles into a static photograph with drifting mist — the single most common quality failure. (The finished Seedance prompt is compiled later, in Stage 2, because it needs the approved reference images and the model choice, which don't exist yet. Do NOT write render prompts here, and do NOT load the Stage 2 shot-compilation recipe during this step.)
15. **The Bible [+]** — the one-page reusable core: the locked Look + the master `@material` list + standing directives + the state schedule (what changes *between* shots).
16. **Asset reference generation [+, the closing phase]** — everything above is *text*: it names every `@material` spec but contains no actual images. Stage 2 (video render) cannot run until each character and location has an **approved reference image** bound to its handle, because the renderer anchors on images, not descriptions. So this is the last act of Stage 1, run as the SAME diverge-converge loop as every story step — just with images in the options instead of text:
    - **FIRST, audit the manifest before generating anything.** A reference image is an IDENTITY anchor, not a shot. An asset earns one only if it is (a) a character, (b) a location plate, or (c) a hero prop that recurs across shots — each in ONE neutral state. Lighting/time-of-day variants of the same place are NOT separate assets (the State Schedule + shot prompts handle those); the only legitimate versions are state-schedule-driven physical changes (e.g. the pyramid at three heights). If a handle's description contains a story moment, a mood, or scene-specific lighting, it is a SHOT, not an asset — strike it. **Also check for FUSED identities:** if an entity (a vehicle, a hero prop, a creature) appears in multiple shots, at different angles, or ever moves independently of a location, it needs its OWN reference — do not leave it embedded in a location plate, where its identity only exists at one angle in one composition. (The plate may still show it parked in the distance for spatial truth; the entity's identity anchor is its own image.) A short film's manifest is typically 4–8 images; if yours is larger, it almost certainly contains disguised shots. Present the audited manifest as a fork (keep/strike per item, with reasons) and get the user's approval of the LIST before generating the first image.
    - Then go through the approved manifest one asset at a time (characters first, then locations).
    - For each, **expand its locked text spec into a full image-generation prompt**: fold in the global Look as palette/grade/film-stock ONLY — never as setting or scene lighting. The prompt MUST follow the format skeleton for its kind (these are not suggestions; a candidate that violates them is regenerated, not approved):
      - *Character:* a character is anchored by a PAIR of single-view images bound to one handle — **(1) a clean headshot** ("head-and-shoulders portrait of [subject + anchor features], face fully visible, neutral expression, flat even studio lighting, no props, no scenery") and **(2) a full-body single view** ("full body, front view, standing in a neutral pose, arms relaxed, fixed wardrobe, flat even studio lighting, no scenery, no props"). Background for both: a single FLAT, SOLID, NEUTRAL MID-GREY field with NO color tint, no gradient, no texture. **Never generate multi-view/turnaround sheets** — Seedance reads the multiple views as multiple different people, which worsens identity drift and can produce duplicate "twin" characters. The headshot exists because face identity needs its own high-weight reference: in a full-body or combined image the face is too small a fraction of the frame and the model under-weights it.
      - *Location:* a clean establishing wide of the space in ONE neutral/canonical lighting state, composed as a working reference, not a money shot. No story moments, no characters.
      - *Vehicle/hero prop:* the object itself, clean profile or three-quarter, minimal context, no scenery.
      (Read `references/medium-constraints.md` for the full spec-to-image-prompt expansion method before generating — it materially improves the result.)
    - **Generate several candidates**, present them for the user to choose (or regenerate/refine) — identical pick-one loop to the story forks.
    - On approval, **bind the chosen image to the asset's handle in the Bible.** That handle now resolves to a real image, not just text.
    - Repeat until *every* manifest asset has an approved image. Only then is the handoff truly locked and Stage 2 may begin.

**The render-ready handoff is exactly three artifacts: the locked Bible, the locked shot list, and the approved reference images.** There is deliberately NO "assemble everything into one package document" step. The upstream artifacts (logline, synopsis, beats, outline, screenplay) are scaffolding — their value is already extracted into the shot list and Bible, which are the only things Stage 2 reads. Re-emitting them into a mega-document burns tokens and, worse, risks drift: an LLM "assembling" a package regenerates rather than copies, creating second, subtly different versions of locked text. If the user wants a shareable full-project document, treat it as an on-demand EXPORT: concatenate the stored locked artifacts verbatim (programmatically where possible), never rewrite them.

Detailed guidance, option menus, and worked examples for every step: `references/pipeline-steps.md`.
Templates for the two handoff deliverables: `references/deliverable-templates.md`.
AI-video medium do's/don'ts and the hard-won lessons (incl. the static-lock rule): `references/medium-constraints.md`.

## Standing craft rules to carry into every shot prompt

These are lessons that prevent specific, common generation failures. Bake them into the Bible as global directives so they apply automatically:

- **Primary-motion rule (FIRST question for every shot).** Every shot must have exactly ONE primary motion source: the SUBJECT (a character acts, an object moves) or the CAMERA (a move that develops the frame). Ambient life (mist, foliage, light) is never sufficient on its own — a shot whose only motion is ambient renders as a living photograph. If subject and camera are BOTH still, the shot is invalid: give one of them the motion or cut the shot. (Corollary of "only one thing moves fast at a time": when the subject carries the motion, calm or lock the camera; when the camera carries it, calm the subject — but never calm both.)
- **Character-performance rule.** Characters are NEVER static-locked and never receive "subject unchanged." Identity consistency comes from the bound reference image, not from freezing motion. Every character in frame gets explicit performance direction — even a "held look" needs written micro-performance (chest rising with quickened breath, eyes tracking the figure, a swallow, fingers tightening in the dirt). The model will not invent blocking; if the row doesn't give a character a verb, the character stands like a mannequin.
- **Static-lock rule (a targeted tool, NOT a default).** Applied per-shot to specific *rigid* things at risk of morphing — a structure's height/completion, a glowing element's level, a vehicle's form. Name the locked thing explicitly ("the pyramid is FIXED at ~90%...; only the camera moves, the structure unchanged"). Never phrase it as a blanket "only the camera moves, subject unchanged" — that freezes everything in frame, characters included, and is the #1 cause of static footage. Time passes BETWEEN shots, never within one. (Origin: a text-driven pull-back once made a pyramid visibly grow from 70% to 100% inside a single 9-second shot.)
- **Ambient-motion rule (the opposite, equally important).** NEVER lock *organic or atmospheric* elements — foliage, water, mist, smoke, fire, fabric, hair, light through a moving canopy. In a living environment these are supposed to be in constant gentle motion; locking them produces a frozen-photograph background that a character walks through. Every shot with an organic or atmospheric environment must explicitly call for gentle ambient motion (swaying leaves, drifting mist, flowing water, shimmering light). But ambient motion is *seasoning*, not the meal — it supplements the primary motion, never substitutes for it.
- **Deliberate-motion exceptions.** Things that are *supposed* to change on camera (a beam firing, a ship lifting off, an object dropping) get an explicit state-change described in event order (never with second-marks — in-prompt timing is unstable). Don't lock these.
- **Reference-first.** Every recurring element pulls its `@material` plate/sheet, not text alone. Text invents (and morphs) things; a fed reference image anchors them.
- **One shot = one continuous take.** No internal cuts; cuts happen in the edit between separate generations.
- **Hooks only on structural peaks** (opening, midpoint, climax). Every other shot is continuous film.

## Output and file handling

- Keep each step's output in the conversation so the user can react to it.
- There is no package-assembly step. If the user explicitly asks for a full-project document, produce it as an **export**: concatenate the locked artifacts verbatim into a file (Markdown default; docx/pdf on request) — do not rewrite, paraphrase, or "clean up" locked text, and do not substitute "[as locked above]" placeholders for content.
- When the user has provided generated test footage, you can inspect it (extract frames with ffmpeg) to diagnose whether a problem is in the prompt or needs a Stage 2 reference plate — and feed the lesson back into the Bible.

## The done-when checklist (Stage 1 is complete only when all are true)

- Every character and location is written as a named, renderable `@material` spec.
- The global Look block is locked as reusable text.
- Every beat carries a mood tag; hook beats are marked.
- The screenplay is in short, visual, shot-sized beats.
- Every shot in the list has a motion arc with a named delta (no-delta-no-shot), a primary motion source (subject or camera), a scale, a cut-out → cut-in handoff, exactly one lighting state, a duration, a camera move, a mood, and `@material` references covering every entity the arc names (hero props included).
- Every scene has a header with a coverage plan and a Space line, and no scene is a chain of unmotivated "rest" cuts or a single unvarying scale.
- The Bible carries the standing craft rules (incl. the primary-motion, character-performance, and static-lock rules) as global directives, and names the render-tier policy (preview vs. final — finals at the model's top tier, e.g. 1080p, never shipped at 480p; resolution/quality/aspect are API parameters carried in the render package's structured fields, never prompt text).
- **Every character and location `@material` has an APPROVED REFERENCE IMAGE bound to its handle** (Step 16). A text spec without an approved image is NOT done — the handoff is only render-ready when the renderer's anchors (the images) actually exist.
- **Final coherence cross-check (replaces the old package-assembly step):** the shot list references only manifest assets (no orphan handles, no unused assets) AND every entity named in an arc is bound in that row's materials; every shot's light is exactly one canonical state; every State Schedule element has a value for every shot it appears in; every cut-in is answered by the row that follows; each scene's rows agree with its Space line (no teleporting props, consistent screen direction); shot durations total to the target runtime. Run this as a check, not a document — nothing new is generated.

If any of these has a blank, a decision hasn't been made yet — make it now, in text (or, for the last item, generate and get the image approved), before it costs a generation.

**The hard line:** "story is written" is NOT "Stage 1 is complete." The story being locked advances you into the asset phase (Step 16); Stage 1 completes only when every asset image is approved. Do not present the work as finished, and do not behave as if ready to hand off to Stage 2, until the last reference image is approved.

---

## Stage 2 — Shot generation (after the Bible is locked)

Once Stage 1 is complete — Bible locked, every asset approved — the work turns to producing the actual video. Your role here is **conductor, not renderer**: you write the shot prompts and call the render tool; the system does the gating and the actual Seedance generation. You do not "generate video" yourself — you compile prompts and dispatch them.

**Before writing any shot prompt, read `references/shot-compilation-recipe.md`.** It is the authoritative guide for translating a locked shot row + the Bible into a Seedance 2.0 prompt: the from-the-Bible-only discipline, multi-shot grouping rules, the `@material` → `[Image#]` reference binding, positive-only static-lock phrasing, State Schedule injection, and the craft tables. Everything about *how* to write a shot prompt lives there; do not improvise it.

The flow is **one shot at a time** — compile it, the user sees the prompt and approves or edits it, then it renders. No batch of prompts up front:

1. **Compile ONE shot.** Working from the recipe, compile the current shot into a single Seedance prompt — **one shot per generation by default** (bundling multiple shots into one generation starves each shot's motion budget; the recipe explains the rare bundling exception). Emit it as the **structured render package** (see the recipe's "Structured output" section): a JSON object with `status`, the `render_prompt` text, the resolved `references`, the assertion `checks`, and any `gaps`.
2. **The user reviews the prompt before any render.** The system shows the user the compiled `render_prompt`. The user can **approve it as-is, or edit the prompt text directly, or reject it.** Prompts are cheap text; this is the cheap gate, before any video spend. (If the user edits, the edited prompt is what renders — the recipe's assertion checks are re-run on the edited text so a user who accidentally removes a static-lock clause or breaks the global-notes-last order gets warned before rendering.)
3. **On approval, render via the `generateShot` tool.** The approved (or edited) prompt + resolved `@material` handles + duration go to `generateShot`; the tool — not you — calls Seedance and returns the clip. The user then approves the clip or asks for a change, and only then do you move to the next shot.
4. **On a rejected clip:** the fix goes through the **Bible or the prompt**, never by "editing" a render. Revise the prompt (or fix a missing/wrong Bible value, then recompile) and re-render. Re-dispatch is always "fixed input → fresh render," never an edit to a finished clip.
5. **If a shot can't be compiled from the Bible alone** — a missing State Schedule value, a `@material` with no approved image, more assets than the reference budget — **emit `status: "gap"`** with the missing item named (the recipe's gap format), instead of a prompt. Fix the Bible, then recompile. A gap caught here is free; the same gap discovered after rendering is not.

**What stays out of your hands (the system guarantees these, not you):** whether Stage 2 is allowed to start (the render tool refuses unless the Bible is locked and assets approved), and the moment rendering begins. Do not try to "make sure" rendering happens by force of instruction — that is enforced by state in code. Your job is to compile good prompts one at a time and run the review loop; the system ensures order and gating.

Detailed Stage 2 compilation guidance, grouping rules, reference-binding grammar, and craft tables: `references/shot-compilation-recipe.md` — **read it before writing shot prompts.**