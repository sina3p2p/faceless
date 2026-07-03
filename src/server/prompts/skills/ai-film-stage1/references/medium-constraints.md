# Medium Constraints — Writing for AI Video

The story decisions in Stage 1 should be shaped by how AI video generation actually behaves. This file is the "write to the medium" knowledge — consult it whenever a creative choice has a generation cost.

## Lean INTO (AI does these beautifully)

- Atmosphere, mood, weather, particles (dust, haze, spray, smoke).
- Striking single images and surreal/impossible visuals.
- Slow, deliberate cinematic camera movement.
- Physical comedy and big visual gags (these read in images far better than wordplay).
- Big landscapes, skies, golden-hour light, warm stone, water.
- Silhouettes and scale contrast (tiny figure in vast space).

## Steer AWAY (current failure modes)

- Long takes of precise, plot-critical **lip-synced dialogue**.
- Complex **hand manipulation** / fine finger work.
- **Readable on-screen text** (signs, documents, UI).
- **Large crowds that must stay consistent** shot to shot.
- Tightly **choreographed continuous action** across a long take.
- Anything requiring an exact, repeatable likeness of a **real person** (also a legal/ethical minefield — prefer fully synthetic or licensed faces).

## The two structural consequences (enforce in Steps 6–7)

- **Tiny cast.** Each recurring named character = a reference sheet + a drift risk. 2–3 hero faces is the target; everyone else is disposable background.
- **Few, consolidated locations.** Each distinct location = a reference plate. Treat the film as one master location with zones where possible; keep things offscreen when you can.

## Character drift is the #1 failure mode

Across essentially all current models, characters subtly change face/hair/proportions between clips because generators recreate each frame rather than remembering an identity. Defeat it BEFORE animation:

- Build a **character reference sheet** per hero (multiple angles: front, profiles, three-quarter; a few medium and full-body), under neutral consistent lighting. Diminishing returns past ~12–15 images; too many slightly-varying images can _reduce_ consistency.
- Write the Stage 1 character spec with **fixed anchor features** (the 2–3 things the model must never change) and **unchanging wardrobe** + one instantly-readable detail.
- **Always animate image-to-video, not text-to-video** when possible: lock composition as a still keyframe, then animate it. Far more control than letting the model invent everything from text.

## Expanding a locked spec into a reference-image prompt (Step 16)

A character/location spec is written for a _human_ to understand the design ("frail, sympathetic grey alien with a teal chest disc"). That underdetermines the image — a hundred different aliens satisfy it. Before generating, expand it into a full image prompt so the candidate is born in the film's visual language instead of a generic render. Assemble the prompt from five parts, in this order:

1. **Subject + anchor features** — the spec's 2–3 never-change details stated concretely (silhouette, the one instantly-readable detail, fixed wardrobe). These are the identity the reference must lock.
2. **The Look, pasted in** — the SAME global block every shot uses: palette, lens/film-stock character, color grade. The reference image must match the film's grade or it will fight every shot it anchors. This is why the Look must be locked (Step 8) before any asset is generated.
3. **Framing matched to the asset's KIND** — the form differs, the purpose (identity capture, not drama) never does. A moody hero-shot makes a beautiful image and a bad reference — the lighting bakes in and fights every shot it anchors:
   - _Characters_ → a **headshot + full-body PAIR**, both bound to the one handle. (1) Headshot: _"head-and-shoulders portrait of [subject + anchor features], face fully visible, neutral expression, flat even studio lighting, no props, no scenery."_ (2) Full body: _"full body, front view, standing in a neutral pose, arms relaxed, fixed wardrobe only, flat even studio lighting, no scenery, no props."_ Background for both: a single FLAT, SOLID, NEUTRAL MID-GREY field with NO color tint, no gradient, no texture, no borders or panels. Fold in the Look as palette/grade/film-stock ONLY — never as setting or scene lighting. If a candidate has an environment, scene lighting, a tinted/gradient background, or a hand-prop, it is not a clean reference — regenerate, don't approve. **Never generate multi-view/turnaround sheets** (three views in one image) and never bind multiple angles of the same character as separate references: Seedance identifies the views as different people, which _worsens_ ID drift and invites duplicate-character artifacts. Official guidance: headshot + full-body is sufficient; the dedicated headshot exists because the face needs its own high-weight reference (in a full-body image the face area is too small and gets under-weighted, causing face drift mid-video).
   - _Locations_ → a **plate**: a clean establishing wide of the space. A location's identity IS its environment, so no plain background here — but ONE lighting state only (pick the most neutral/canonical; the State Schedule re-lights it per shot), and composed as a _working reference, not a money shot_. If the plate is being composed to BE one of the film's spectacular images, stop: that's a keyframe leaking in. The spectacular shot gets generated at shot time, anchored TO the plate.
   - _Vehicles / hero props_ → an **object reference**: the thing itself, clean profile or three-quarter, minimal context. Plate-style scenery around it dilutes the anchor.
4. **What to exclude** — no dramatic action, no other characters, no scene-specific lighting, no readable text. The reference is a clean identity anchor; story happens later, in shots.
5. **Medium-safe construction** — avoid baking in the known failure modes (complex hands mid-gesture, etc.); present the asset in its most stable, legible form.

The test for a good reference prompt: _if you generated this same prompt ten times, would all ten be recognizably the same character/place?_ If the spec is loose enough that they'd diverge, tighten the anchor features before generating — that looseness is exactly what becomes drift downstream.

## Dialogue: when it's safe

The old rule "avoid dialogue" is weaker for native-audio models. The durable safe pattern:

- Generate the **voice once** in an external tool (e.g. an AI voice generator), then feed it to the video model as an **audio reference** so the voice is fixed and the visuals sync to it — instead of letting each clip invent (and drift) the voice.
- This also fixes timing/word precision, which matters for comedy. Still keep dialogue lean; physical/visual comedy is more robust and universal.

## The static-lock lesson (the morphing-pyramid bug)

A real failure: a text-prompted slow pull-back asked for "reveal the pyramid." With the camera moving and no instruction to hold the structure fixed, the model **interpolated the pyramid from ~70% built to 100% finished within a single 9-second shot** — growth on the wrong axis (it should happen between shots, as an edit, not within one).

Diagnosis and fix:

- The growth happened partly because the shot was **text-driven** (no plate to anchor to) and partly because nothing told the model the structure was **static**.
- **Belt:** in the prompt, state the exact fixed state in CONTEXT ("~90% built, stepped, not finished — constant throughout") and add to CAMERA: "CRITICAL: [structure] is FIXED — does not change size/height/completion; only the camera moves."
- **Suspenders:** feed the **location plate at the correct fixed version** as an `@material`, so the model anchors to an image instead of inventing.
- Generalize it to a **standing directive** (Bible §3, static-lock) so it applies to every shot automatically: structures don't change mid-shot, glowing/level/quantity details don't change mid-shot, only the camera moves relative to the locked thing; time passes between shots.
- **Don't over-apply:** shots where something is _supposed_ to move on camera (a beam firing, a ship lifting, an object dropping) need the opposite — an explicit state-change described in event order (never with second-marks; in-prompt timing is unstable). List these as deliberate exceptions (Bible §3, deliberate-motion list). And the lock must always **name its rigid target** — never the blanket "subject unchanged," which freezes characters too (see the frozen-tableau lesson below).

## The frozen-tableau lesson (the mirror-image bug)

The exact opposite failure, from a real clip: a night-forest shot with two characters rendered as a **living photograph** — six seconds in which nobody moved, nothing happened, and only the mist drifted. The lighting was beautiful; the shot was dead. Diagnosis:

- The shot row described an _image_ ("she lies among the roots as the figure stands over her"), not an _event_ — no verb, no delta. The compiler translated it faithfully into a static tableau.
- Blanket static-lock ("only the camera moves, subject unchanged") froze the characters along with everything else, and the camera was _also_ locked — so both possible motion sources were cancelled at once.
- Ambient motion (the mist) was present but ambient life is seasoning, not the meal: it cannot carry a shot.
  The fixes, generalized into standing rules:
- **No-delta-no-shot:** every shot row is written as a motion arc (start → change → end) with a real verb. A row with no answer to "what's different at the end?" doesn't reach compilation.
- **Primary-motion rule:** every shot has exactly one primary motion source — subject or camera. Never both fast; never neither. A prompt failing this is emitted as a gap, not rendered.
- **Characters are never locked:** identity comes from the reference-image binding; every character on screen gets written performance direction, minimum a micro-performance (breath, gaze, a small gesture). The model does not invent blocking.
  Static-lock and this rule are two sides of one principle: **lock rigid form, direct living motion.** The morphing pyramid came from too little lock; the frozen tableau came from too much.

## Render resolution (don't ship previews)

Video models expose resolution tiers; the cheap tier (e.g. 480p) is for fast preview passes only. A clip approved into the edit must be re-rendered (or rendered first-time) at the top tier (e.g. 1080p), with any further upscale in post. A film assembled from 480p drafts reads as low quality no matter how good the prompts are. **Resolution, quality, and aspect ratio are API parameters owned by the app** — the render package carries them as structured fields, the app passes them on the generateShot call, and they never appear as words in the prompt (the model ignores them there). Make the tier an explicit field in every render package so it can't be silently defaulted down.

## Showing time pass without a montage

- **Match-cut pairs:** two shots with identical framing/lens/camera position where only a scheduled element differs (a structure higher, a detail dimmer). The cut reads as elapsed time, cheaply and cleanly — and needs no extra location.
- Put every changing element on a **state schedule** (Bible §4) so its progression is planned across shots, never improvised.

## Turn invisible stakes into visible ones

A clock the audience can't see does nothing for the image. Bind stakes to an on-screen detail (a glowing element that dims, a structure that rises, light that lengthens) so the model can _show_ the pressure instead of you having to explain it. Decide this at Step 6/7 and schedule it in Bible §4.

## Diagnosing generated footage

When the user shares a clip that's "off":

- Extract frames (e.g. `ffmpeg -i clip.mp4 -vf fps=1 frame_%02d.jpg`) and inspect the progression across the shot.
- Decide whether the problem is **prompt wording** (add a lock or a state instruction) or **missing reference** (needs a Stage 2 `@material` plate/sheet). Many "the model did something weird" problems are really "we let it invent because we fed text, not a reference."
- Feed the lesson back into the Bible as a directive so it can't silently recur.
- Sometimes a "bug" is beautiful (the morphing structure looked gorgeous). Offer to repurpose it as a deliberate special shot (a vision/dream/transformation beat) rather than forcing it into a normal continuous shot where it would break realism.
