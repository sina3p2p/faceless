# Medium Constraints — Writing for AI Video

The story decisions in Stage 1 should be shaped by how AI video generation actually behaves. This file is the "write to the medium" knowledge — consult it whenever a creative choice has a generation cost.

**Craft rules below are production defaults for the current tested model profile, not universal cinema laws.** Controlled exceptions are allowed only when explicitly locked (Bible / shot row / user-approved profile) and reviewable. Process gates (approvals-as-buttons, no invented values, registry validation) stay absolute.

## Lean INTO (AI does these beautifully)

- Atmosphere, mood, weather, particles (dust, haze, spray, smoke).
- Striking single images and surreal/impossible visuals.
- Slow, deliberate cinematic camera movement.
- Physical comedy and big visual gags (these read in images far better than wordplay).
- Big landscapes, skies, water, and strongly-characterized light of any kind (golden hour, hard noon, neon night, firelight, fog).
- Silhouettes and scale contrast (tiny figure in vast space).

## Steer AWAY (current failure modes)

- Long takes of precise, plot-critical **lip-synced dialogue**.
- Complex **hand manipulation** / fine finger work.
- **Readable on-screen text** (signs, documents, UI).
- **Large crowds that must stay consistent** shot to shot.
- Tightly **choreographed continuous action** across a long take.
- Anything requiring an exact, repeatable likeness of a **real person** (also a legal/ethical minefield — prefer fully synthetic or licensed faces).

## The two structural consequences (enforce in Steps 6–7)

- **Tiny cast.** Each recurring named character = a reference image + a drift risk. 2–3 hero faces is the target; everyone else is disposable background.
- **Few, consolidated locations.** Each distinct location = a reference plate. Treat the film as one master location with zones where possible; keep things offscreen when you can.

## Character drift is the #1 failure mode

Across essentially all current models, characters subtly change face/hair/proportions between clips because generators recreate each frame rather than remembering an identity. Defeat it BEFORE animation:

- Bind **ONE approved turnaround character sheet** per hero by default (the charsheet spec below) — one image containing the character's views, and only that image. Separately-bound angles or slightly-varying images of the same person are often read as different people and _reduce_ consistency (the twin bug). Extra identity refs require a **user-approved / documented model profile** — do not invent a second sheet on your own.
- Write the Stage 1 character spec with **fixed anchor features** (the 2–3 things the model must never change) and **unchanging wardrobe** + one instantly-readable detail.
- **Anchor generation to approved images, never bare text**: character/location references on every shot, and — in this pipeline — the **generation grid** as the composition anchor (Seedance renders all panels in order; every shot block opens with a mandatory COMPOSITION LOCK extracted from the approved panel — soft "composition matches/follows panel" citations are forbidden; see Stage 2 `shot-compilation-recipe.md`). **Scene continuity packs** (notes + 1–3 keyframes) are required geography references, never Seedance shot sequences. This pipeline deliberately does NOT use per-shot first-frame/keyframe animation; composition guidance for the edit comes from the approved generation grid + lock, not from treating continuity keyframes as panels-to-render.

## Expanding a locked spec into a reference-image prompt (Step 15)

A character/location spec is written for a _human_ to understand the design ("frail, sympathetic grey alien with a teal chest disc"). That underdetermines the image — a hundred different aliens satisfy it. Before generating, expand it into a full image prompt so the candidate is born in the film's visual language instead of a generic render. Assemble the prompt from five parts, in this order:

1. **Subject + anchor features** — the spec's 2–3 never-change details stated concretely (silhouette, the one instantly-readable detail, fixed wardrobe). These are the identity the reference must lock.
2. **The Look, pasted in** — the SHOW LOOK global block every shot uses by default: palette, lens/film-stock character, color grade. Controlled scene/sequence trims are allowed only when named inside the locked Look. The reference image must match the film's grade (or the locked trim it will serve) or it will fight every shot it anchors. This is why the Look must be locked (Step 8) before any asset is generated.
3. **Framing matched to the asset's KIND** — the form differs, the purpose (identity capture, not drama) never does. A moody hero-shot makes a beautiful image and a bad reference — the lighting bakes in and fights every shot it anchors:
   - _Characters_ → **default: the character sheet — one image per character**, containing the SAME character in multiple views (a turnaround). One generation, one approval, one handle, one slot. Skeleton: _"character reference sheet (turnaround) of [subject + anchor features]: the SAME character shown three times side by side — front view, side profile, three-quarter view — standing in a neutral pose, BOTH HANDS EMPTY AND OPEN, arms hanging relaxed at the sides, identical fixed wardrobe in every view, neutral expression, full body visible, flat even studio lighting, plain empty studio."_ Say "the SAME character" explicitly and fix the wardrobe identical across views — the whole value of the sheet is one identity from several angles; if the views drift from each other, regenerate. Phrase the empty hands positively — "no props" alone under-weights and held objects slip through.

   **Held tools / recurring props — pick ONE policy and stay consistent:**
   - **Default (preferred):** empty hands on the sheet + a separate `*_object_ref` for any recurring held tool/prop. Story shots attach both; the character never "owns" the tool as baked wardrobe.
   - **Wardrobe exception:** only if the tool is inseparable identity (always worn/held as part of the silhouette) AND you will NOT also create an object ref for it — then bake it into the sheet as locked wardrobe and never list it as a separate prop. Do not write "tool never puts down" in the design AND empty the hands AND also invent a separate object ref — that contradiction causes identity fights.

   Background: a single FLAT, SOLID, NEUTRAL MID-GREY field with NO color tint, no gradient, no texture, no borders or panels between views. Fold in the Look as palette/grade/film-stock ONLY — never as setting or scene lighting.

   **Approval checklist.** REJECT a candidate, don't approve "close enough," if ANY of: the views do not read as the SAME person (face, build, or wardrobe differing between views — the sheet's cardinal failure); anything held in any hand when using the empty-hands policy, or a bag/strap/tool worn that isn't locked wardrobe; an environment or scene lighting instead of flat studio; a tinted or gradient background (a color cast bleeds into skin tone at render); a non-neutral pose or expression; the face obscured or unclear in the front view. Stateful wardrobe elements (a chest panel that flickers, a garment that degrades) are referenced at their NEUTRAL state — the State Schedule animates them, the sheet must not.

   **One turnaround sheet per character is the default tested model profile, not a universal truth.** Do not split a character across multiple images (no headshot + full-body sets, no per-angle images bound separately) unless the user has approved a documented alternate profile. If identity problems appear in renders, report the observation and stop — any policy change (including extra identity refs) is the user's to make.
   - _Locations_ → a **plate**: a clean establishing wide of the space. A location's identity IS its environment, so no plain background here — but ONE lighting state only (pick the most neutral/canonical; the State Schedule re-lights it per shot), and composed as a _working reference, not a money shot_. If the plate is being composed to BE one of the film's spectacular images, stop: that's a keyframe leaking in. The spectacular shot gets generated at shot time, anchored TO the plate.

   **No fused hero props.** If a vehicle / ship / tool already has (or will have) its own `*_object_ref`, the location plate must be **environment-only** — do not park the ship in the plate, do not embed the glowing tool in the landscape. Fusing creates an identity fight between plate and object ref at compile time. Physical state-schedule versions of a structure (pyramid at 30%/70%/100%) are still separate plates; those versions must not smuggle in a hero prop that has its own ref.
   - _Vehicles / hero props_ → an **object reference**: the thing itself, clean profile or three-quarter, minimal context. Plate-style scenery around it dilutes the anchor.

4. **What to exclude** — no dramatic action, no other characters, no scene-specific lighting, no readable text. The reference is a clean identity anchor; story happens later, in shots.
5. **Medium-safe construction** — avoid baking in the known failure modes (complex hands mid-gesture, etc.); present the asset in its most stable, legible form.

The test for a good reference prompt: _if you generated this same prompt ten times, would all ten be recognizably the same character/place?_ If the spec is loose enough that they'd diverge, tighten the anchor features before generating — that looseness is exactly what becomes drift downstream.

## Dialogue: when it's safe

The old rule "avoid dialogue" is weaker for native-audio models. The durable safe pattern:

- Generate the **voice once** in an external tool (e.g. an AI voice generator), then feed it to the video model as an **audio reference** so the voice is fixed and the visuals sync to it — instead of letting each clip invent (and drift) the voice.
- This also fixes timing/word precision, which matters for dialogue-driven beats. Still keep dialogue lean; physical/visual storytelling is more robust and universal.

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
- **No-delta-no-shot:** every shot row is written as a motion arc (start → change → end) with a real verb — or, for intentional stillness, a written performance hold (breath, gaze, tension, posture, deadpan). A row with no answer to "what's different / what's held at the end?" doesn't reach compilation.
- **Dominant-motion rule (production default):** every shot has one DOMINANT motion source — subject or camera. Secondary motion is allowed when slower, smaller, and subordinate. Both-fast fails; neither fails. A prompt failing this is emitted as a gap, not rendered.
- **Characters are never static-locked or unperformed:** identity comes from the reference-image binding; every character on screen gets written performance direction. Intentional stillness is allowed when written as breath, gaze, tension, posture, or deadpan hold — not as absent performance. The model does not invent blocking.
  Static-lock and this rule are two sides of one principle: **lock rigid form, direct living motion.** The morphing pyramid came from too little lock; the frozen tableau came from too much.

## Generation grids

Moved to its own reference: see `references/generation-grids.md` for continuity packs, generation-grid prompt formula, layout geometry, failure catalog, approval protocol, and consumption grammar (Step 16).

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
- Decide whether the problem is **prompt wording** (add a lock or a state instruction) or **missing reference** (needs an `@material` reference image — charsheet image, plate, or object ref). Many "the model did something weird" problems are really "we let it invent because we fed text, not a reference."
- Feed the lesson back into the Bible as a directive so it can't silently recur.
- Sometimes a "bug" is beautiful (the morphing structure looked gorgeous). Offer to repurpose it as a deliberate special shot (a vision/dream/transformation beat) rather than forcing it into a normal continuous shot where it would break realism.
