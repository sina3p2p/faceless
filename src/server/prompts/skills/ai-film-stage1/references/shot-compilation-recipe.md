# Shot Compilation Recipe — Turning the Locked Bible into Seedance 2.0 Prompts

This is the reference the showrunner loads when Stage 1 is complete (Bible locked, all assets approved) and it begins writing the final Seedance prompts. It is **not** a story tool — every creative decision was already made and frozen in the Bible. This document is purely about *compiling* those locked decisions into precise, renderable Seedance 2.0 prompts.

---

## The one rule that governs everything

**Every value in a shot prompt comes from the Bible or the shot row. Nothing is invented here.**

The lighting comes from the shot's State Schedule entry. The color grade comes from the Bible's Look. The character's appearance comes from the approved reference image. The camera move comes from the shot row. If a value you need isn't in the Bible or the row, that is a **gap to flag**, not a blank to fill from imagination. A shot prompt is an act of *translation*, not authorship.

This is the opposite discipline from viral single-clip prompting, where each clip invents its own hook, grade, and mood to stop a scroll. A film is the reverse: every shot must *subordinate* itself to the whole, because 24 shots that each made their own striking choices do not cut together into a film — they fight.

---

## Continuity beats impact (read before using the craft tables)

The craft tables below are excellent and come from a skill built for viral clips. Their *knowledge* (camera moves, lighting setups, color science) is reusable. Their *instinct* — open with a hook, move the camera always, grade for maximum punch — is wrong for narrative and must be inverted:

- **No per-shot hooks.** A shot in a film opens by continuing the previous shot, not by re-grabbing attention with a black-to-light burst or a whip. The "2-second hook" thinking that suits TikTok destroys narrative flow. The film's hook is its opening; individual shots serve the scene, not the scroll.
- **Stillness is a legitimate, frequent choice.** Not every shot needs camera movement. A locked camera is often *correct* — it's observational, it's calm, and critically it's the safest way to avoid the morphing/drift failure mode. Move the camera when the beat's emotion calls for it, not by default.
- **One Look, applied everywhere.** Do not pick a fresh grade per shot. The Bible's Look is the single grade for the entire film; you *apply* it, you don't choose it. The only per-shot variation is the State Schedule's lighting state.
- **Match the camera move to the beat's mood, not to "make it cinematic."** A tense beat might want a slow push-in; a calm one a lock-off; a reveal a pull-back. The mood is in the shot row. Let it choose the move.

---

## One shot per generation by default (read this carefully — it's the most common quality mistake)

**Default: render ONE shot per generation.** Seedance can pack multiple shots with hard cuts into a single 15s generation — but doing so **divides the motion budget** across those shots. A 14s generation split into two shots is two thin ~7s fragments, each with little room to develop movement; the result reads as "a static image with a few small moves." A 10s generation spent on ONE shot gives that shot a full, developing, cinematic motion arc. Most of your shots are individually rich (a block sliding and reversing, a slow push-in on a reveal, an emotional beat) — each of those *deserves and needs a whole generation*. Give it one.

**The motion-budget rule:** the richer a shot's intended movement, the more it needs its own generation. A shot whose whole point is motion (something sliding, a developing camera move, an action beat) must NOT share a generation. Bundling starves it.

**Multi-shot bundling is the EXCEPTION, used only when ALL of these hold:**
- The shots share the same location, lighting state, and character(s) — a genuinely continuous moment, not a scene change. (A wide → a close-up of the *same* moment can bundle; a location change cannot.)
- Each bundled shot is *short and low-motion* — a quick reaction, a held look — so dividing the budget doesn't starve them.
- You specifically want the in-model cut's smoothness for closely-related beats.
- Cap at 2–3 shots (not 5 — that's the absolute model ceiling, not a target), ≤15s total.

When in doubt, render separately and stitch the cut in post — the post-cut is trivial and you keep the full motion budget per shot. **Different location, different lighting, or a motion-heavy shot → always its own generation.**

For the rare multi-shot generation, label each shot (`Shot 1:`, `Shot 2:`) with its own action and camera, and put the **global render notes (Look, grade, lighting, reference bindings) at the END** — Seedance follows closing notes more reliably for camera and lighting.

**Grouping is ideally marked in the Bible's shot list during Stage 1.** If unmarked, default to one-per-generation; only bundle when the strict exception above clearly applies.

---

## Reference binding — the @material → [Image#] translation

Stage 1 wrote `@material` handles (e.g. `@hero_charsheet`, `@giza_plate`). Seedance 2.0 reference mode takes uploaded images addressed as `[Image1]`, `[Image2]`, etc., **in the order they're attached** (first attached = `[Image1]`). Compilation resolves each handle to its approved image URL and assigns it a slot.

Two hard rules:

1. **Attach only the assets that appear in this shot (or group).** Reference mode accepts up to 9 images, but 3–5 focused references beat more. Pull only the character(s) and location(s) actually on screen. If a shot/group names more distinct assets than the cap allows, that's a gap — flag it (the shot is probably too crowded), don't silently drop refs.

2. **State explicitly what to extract from each reference.** Never just attach an image — say what attribute it governs, or the model merges attributes unpredictably. Use the form:
   - `[Image1] = identity and wardrobe of the protagonist`
   - `[Image2] = environment, architecture, and composition of the location`
   - `[Image3] = identity of the second character`

For a multi-shot group, the same `[Image#]` set carries across all shots in the generation, which is exactly how Seedance keeps the character consistent across the internal cuts.

---

## Static-lock — positive phrasing only

When a shot is flagged static-lock (subject must not change/morph during the shot), state it in **positive** terms. Seedance interprets "no X" as a cue for X — negatives backfire. Use the worked phrasings:

- For the subject/structure: `CRITICAL: the [subject] is FIXED — it remains exactly as shown in [Image#] throughout this shot; only the camera moves, subject unchanged.`
- The identity anchor: `Stable identity, natural proportions, clean edges throughout.`

Never write "the pyramid does not grow" or "no morphing" — write the fixed state as a present fact and let only the camera move. This is the fix for the morphing-pyramid bug; it is mandatory wherever the State Schedule says a thing is fixed within a shot but changes between shots (structure heights, glow levels, etc.).

**The lock-vs-motion tension (important):** when a shot has BOTH a thing that must move (a sliding block, a raised hand) AND a large fixed structure (the pyramid), asking the model to freeze most of the frame while animating one small piece is hard — its safe resolution is to barely move anything, producing the "static image with a few moves" look. Two fixes: (1) **frame tighter** — if the motion is a block and a hand, frame on the block-and-hand, not the whole monument, so the locked structure isn't dominating the frame and fighting the motion; (2) **only lock what's actually in frame and at risk of drifting** — don't burn the model's attention locking a pyramid that's barely in a tight shot. Reserve the full structure-lock for wide shots where the structure is the subject. A motion-rich shot wants a framing that lets the motion be the main event.

---

## State Schedule injection

The Bible's State Schedule records what changes *between* shots but is *fixed within* a shot (structure completion %, lighting state, a visible-clock value like a draining glow). For each shot, read its scheduled values and state them as explicit present facts in the prompt:

- `Structure at 70% completion, frozen at this state for the shot.`
- `Lighting state: [GOLDEN-HOUR] — warm low-angle sun, long shadows.`
- `The disc glows at LOW state — faint aquamarine, barely lit.`

If a shot's State Schedule value is missing for something visibly stateful (a structure that's mid-build, a clock that's draining), that's a gap — flag it.

---

## Duration

Pull the shot's duration from the shot row; it must be one of Seedance 2.0's allowed values (4–15s). For a multi-shot group, the sum of the shots' durations is the generation length and must be ≤15s. Keep individual narrative shots short (commonly 5–10s) — long single takes are where motion drift creeps in.

---

## Prompt section order (single shot)

Assemble in this order, global notes last:

1. **CONTEXT** — one line: what this shot is, where it sits in the scene. (Not a hook. A continuation.)
2. **PRIMARY ACTION** — what happens / what's in frame, in plain visual terms. **State scale relationships explicitly when scale matters** — the model defaults to wrong proportions if you don't. "Limestone blocks" alone renders person-height boulders and a toy-looking pyramid; instead write the relationship: "limestone blocks roughly waist-to-chest height, the pyramid a monumental structure rising hundreds of feet, human workers tiny against it." Whenever a shot depends on bigness, smallness, or proportion, name the relationship between the elements — don't assume the model infers it.
3. **CAMERA** — the move from the shot row, matched to the beat's mood (see encyclopedia). State stillness explicitly if locked.
4. **STATE** — the State Schedule values as present facts.
5. **STATIC-LOCK** — if flagged, the positive fixed-state clause.
6. **GLOBAL RENDER NOTES (last):** the Look (grade, lens/film-stock character), the lighting state, and the reference bindings (`[Image#] = ...`). These go at the end because Seedance weights closing notes most for look and camera.

For a multi-shot group: `Shot 1: [context/action/camera] … Shot 2: …` then ONE shared GLOBAL RENDER NOTES block at the end covering all shots.

---

## Gap report format

When a required value is missing or ambiguous, do not render. Return a gap naming the shot and the exact missing input, e.g.:

- `Shot 14: no State Schedule lighting value for this beat — needs a lighting state.`
- `Shot 9: references @ship but no approved image is bound to that handle.`
- `Group 12–15: 6 distinct assets named, exceeds focused-reference budget — scene likely too crowded, confirm which assets are essential.`

The gap goes back to the showrunner, which fixes the Bible (with full story context) and recompiles. A gap is a success — it caught an incompleteness cheaply, before spending a video generation.

---

# CRAFT REFERENCE (knowledge tables — apply, don't let them dictate impact-thinking)

The following are reusable craft tables. Use them to phrase a camera move, a lighting state, or a grade precisely. Ignore any instinct in them toward hooks, per-shot grading freedom, or movement-for-its-own-sake — those are governed by the narrative rules above.

## Camera Movement Encyclopedia (match to the beat's mood)

| Movement | When it fits a beat | Seedance phrasing |
|---|---|---|
| **Dolly Forward / Push-In** | rising tension, growing intimacy, focus | "Camera dollies forward at constant slow speed, subject centered, sharp focus maintained, no focus breathing." |
| **Dolly Back / Pull-Out** | reveal, release, isolation, context | "Camera pulls back steadily, subject anchored in frame, background gradually revealed." |
| **Truck Left/Right** | lateral reveal, following without reframing | "Camera trucks [left/right] smoothly, subject holds frame position, parallax: background moves slower than foreground." |
| **Pan / Tilt** | survey a space, reveal scale up/down | "Camera [pans/tilts] smoothly with eased start and stop, no jerk, ending on [subject]." |
| **Handheld** | urgency, documentary realism, unease | "Handheld micro-vibration, subtle breathing motion, not locked-off; human imperfection." |
| **Steadicam / Gimbal Follow** | flowing, controlled motion with a moving subject | "Gimbal-smooth follow at constant distance, liquid stabilization, subtle breathing only." |
| **Tracking / Side Follow** | subject moving through environment | "Camera tracks subject from the side at matched speed, environment reveals progressively via parallax." |
| **Crane Up / Down** | establish scale; descend to intimacy | "Camera [rises/descends] smoothly, [tilt to keep subject in frame], landscape revealed on rise." |
| **Orbit / 360** | study a subject, hypnotic emphasis | "Camera orbits the subject at constant distance, subject frame-centered, background revealed through rotation." |
| **Rack Focus** | shift attention between planes | "Focus racks from [foreground] to [background] smoothly; the other plane softens during the shift." |
| **Dutch Angle** | unease, psychological imbalance | "Frame tilted [15–25]° and held throughout; diagonal horizon; tension without explicit threat." |
| **Lock-Off / Static** | calm, observation, safety — and drift-avoidance | "Camera locked, zero movement; subject moves within a still frame; observational stillness." |

**Combine at most 1–2 moves per shot.** More than that reads as chaos and increases drift.

## Lighting Library (the State Schedule names which; this is how to phrase it)

| State | Mood | Phrasing (color temp + character) |
|---|---|---|
| **Three-Point (neutral)** | controlled, clean | "Warm key at 45°, soft fill at ~1/3 key, gentle rim; soft-edged shadows." |
| **Chiaroscuro / Low-Key** | mystery, tension | "Single hard key, minimal fill, most of frame in shadow, crushed blacks; noir contrast." |
| **Silhouette / Backlit** | mystery, separation | "Subject backlit against a bright source, rendered as a shape, rim defines the outline." |
| **Golden Hour** | warmth, nostalgia, beauty | "Warm ~3000–3200K low-angle light, atmospheric haze, warm-spill soft shadows." |
| **Moonlight / Cool Night** | isolation, eerie calm | "Cool ~6500K directional light, blue-tinted shadows, low intensity." |
| **Harsh Midday** | exposure, heat, relentlessness | "Hard ~5500K overhead sun, short hard-edged shadows, high contrast, heat shimmer." |
| **Practical / Firelight** | intimacy, primal, danger | "Warm ~1800–2000K flickering source, large dancing soft shadows." |
| **Soft Overcast** | calm, clarity, vulnerability | "Diffuse omnidirectional ~5500K light, soft-edged shadows, even illumination." |
| **Volumetric / God Rays** | grandeur, otherworldly | "Directional light through particle-filled air, visible beams, dust motes in shafts." |

## Color Grade (the Bible's Look picks ONE — apply it, don't choose per shot)

The Bible already specifies the film's grade. Phrase it consistently every shot. Common grades, for reference only:

| Grade | Character | Phrasing |
|---|---|---|
| **Golden / Warm Nostalgia** | warm amber, warm shadows | "Color temperature ~3200K amber-gold; warm orange-brown shadows (not blue); nostalgic warm glow." |
| **Teal & Orange** | cyan shadows, orange highlights | "Shadows cyan-teal, highlights orange-gold, midtones neutral; modern cinema palette." |
| **Cool / Cold Isolation** | blue, desaturated | "~6500K, blue-cyan shadows, slight warmth in highlights, mild desaturation." |
| **Desaturated + Accent** | muted world, one saturated color | "Overall saturation reduced; one accent color [name] held at full saturation." |
| **Bleach Bypass** | gritty, lifted blacks, grain | "Blacks lifted to dark grey, compressed contrast, visible grain, analog feel." |

State the film-stock/lens character the Bible specifies (e.g. "35mm fine grain, subtle anamorphic oval bokeh, warm halation") in the same global block, every shot, so the whole film coheres.

## Sound (Seedance reference mode generates ambient audio automatically)

In reference mode, synchronized ambient audio is on by default — acceptable for film. If a shot wants a specific anchored sound, name it ("the crack of stone settling," "wind over sand") so the audio has something concrete to lock to. **Dialogue/voice consistency is deferred to the later audio phase** (voice fed as reference there); do not rely on fresh-synthesized dialogue per clip for consistency.

---

## Quick checklist before emitting a prompt (or a gap)

- Did every value come from the Bible or the shot row? (If not → gap.)
- Are only the on-screen assets attached, each with an explicit extract-this binding?
- Is the grade the Bible's single Look, not a per-shot choice?
- Is the lighting the shot's State Schedule state?
- If anything is fixed-within-shot, is the static-lock clause present in positive phrasing?
- One shot per generation unless the strict bundling exception applies (shared location/lighting, short low-motion beats, ≤2–3 shots, ≤15s)?
- Is a motion-rich shot given its own full generation (not starved by sharing)?
- Are scale relationships stated where proportion matters?
- No per-shot "hook"; camera move matched to the beat's mood (or locked)?