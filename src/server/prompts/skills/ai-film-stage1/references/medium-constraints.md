# Medium Constraints — Writing for AI Video

Consult whenever a creative choice has a generation cost. Craft rules here are production defaults for the tested model profile (canonical statements: Bible template §A.3 in `deliverable-templates.md`); this file carries the writing guidance and the asset-expansion method. Extended failure histories and rationale live in `MAINTENANCE.md` (not loaded at runtime).

## Lean INTO (AI does these beautifully)

Atmosphere, weather, particles (dust, haze, spray, smoke); striking single images and surreal/impossible visuals; slow deliberate camera movement; physical comedy and big visual gags; big landscapes, skies, water; strongly-characterized light of any kind; silhouettes and scale contrast (tiny figure in vast space).

## Steer AWAY (current failure modes)

Long takes of plot-critical lip-synced dialogue; complex hand manipulation / fine finger work; readable on-screen text (signs, documents, UI — dramatize as short labels, blurred tables, implied UI); large crowds that must stay consistent shot to shot; tightly choreographed continuous action across a long take; exact repeatable likeness of a real person (also a legal/ethical minefield — prefer fully synthetic faces).

**The two structural consequences (enforce in Steps 3–4):** tiny cast (2–3 hero faces; everyone else disposable background) and few, consolidated locations (one master location with zones; keep offscreen what can stay offscreen). Each recurring face and each distinct location is a reference image and a drift risk.

## Character drift is the #1 failure mode

Generators recreate each frame rather than remembering an identity, so characters subtly change face/hair/proportions between clips. Defeat it BEFORE animation:

- **ONE approved turnaround character sheet per hero** — one image containing the character's views, bound in one slot. Separately-bound angles or slightly-varying images of the same person read as different people and _reduce_ consistency (the twin bug). Extra identity refs require a user-approved documented model profile; if identity problems appear in renders, report the observation and stop — policy changes are the user's to make.
- Write the character spec with **fixed anchor features** (the 2–3 things that never change) and **unchanging wardrobe** + one instantly-readable detail.
- **Anchor generation to approved images**: character/location refs on every shot, the motion sheet as the trajectory anchor, and the scene's first approved sheet + prior terminal panel as geography anchors. Text-only recurring identity is drift.

## Expanding a locked spec into a reference-image prompt (Step 9)

A spec is written for a human ("frail, sympathetic grey alien with a teal chest disc") — a hundred different aliens satisfy it. Expand it into a full image prompt so the candidate is born in the film's visual language. Five parts, in order:

1. **Subject + anchor features** — the spec's never-change details stated concretely (silhouette, the instantly-readable detail, fixed wardrobe).
2. **The Look, pasted in** — palette, lens/film-stock, grade (or the named locked trim the asset will serve). The reference must match the film's grade or it fights every shot it anchors — this is why the Look locks before any asset generates.
3. **Framing matched to the asset's KIND** — the purpose is identity capture, not drama; a moody hero-shot makes a beautiful image and a bad reference (its lighting bakes in):
   - _Characters_ → the **turnaround sheet**. Skeleton: _"character reference sheet (turnaround) of [subject + anchor features]: the SAME character shown three times side by side — front view, side profile, three-quarter view — standing in a neutral pose, BOTH HANDS EMPTY AND OPEN, arms hanging relaxed at the sides, identical fixed wardrobe in every view, neutral expression, full body visible, flat even studio lighting, plain empty studio."_ Say "the SAME character" explicitly; if views drift from each other, regenerate. Phrase the empty hands positively — "no props" alone under-weights. Background: a single FLAT SOLID NEUTRAL MID-GREY field — no tint, gradient, texture, or panel borders (a color cast bleeds into skin tone at render). Fold the Look in as palette/grade/stock only, never as setting or scene lighting. Stateful wardrobe (a panel that flickers, a garment that degrades) is referenced at its NEUTRAL state — the State Schedule animates it, the sheet holds still.
   - _Locations_ → a **plate**: a clean establishing wide. A location's identity IS its environment, so no plain background — but ONE lighting state (the most neutral canonical; the State Schedule re-lights per shot), composed as a working reference, not a money shot. A plate composed to BE one of the film's spectacular images is a keyframe leaking in — the spectacular shot gets generated at shot time, anchored TO the plate. **Environment-only when a hero prop/vehicle has its own ref** — a ship parked in the plate creates an identity fight with the object ref at compile time; state-schedule versions of a structure (30%/70%/100%) are separate plates under the same rule.
   - _Vehicles / hero props_ → an **object reference**: the thing itself, clean profile or three-quarter, minimal context.
4. **What to exclude** — no dramatic action, no other characters, no scene-specific lighting, no readable text. The reference is a clean identity anchor; story happens in shots.
5. **Medium-safe construction** — present the asset in its most stable legible form (hands relaxed, not mid-gesture).

**Held tools / recurring props — pick ONE policy per character and stay consistent:**

- **Default:** empty hands on the sheet + a separate `*_object_ref` for the recurring tool. Story shots attach both.
- **Wardrobe exception:** only when the tool is inseparable identity (part of the silhouette, always carried) AND no object ref will exist for it — bake it into the sheet as locked wardrobe. The two policies never mix on one asset; "tool never puts down" in the design + empty hands on the sheet + a separate object ref is a three-way identity fight.

**Charsheet approval checklist (applied twice: as the model's pre-screen before the gallery, and as the user's rejection guide in it) — REJECT (never "close enough") on any of:** views not reading as the SAME person (the sheet's cardinal failure); anything held or worn that isn't locked wardrobe under the empty-hands policy; an environment or scene lighting instead of flat studio; a tinted/gradient background; a non-neutral pose or expression; the face obscured in the front view.

**The ten-generations test for any reference prompt:** if you generated this same prompt ten times, would all ten be recognizably the same character/place? Looseness that lets them diverge is exactly what becomes drift downstream — tighten the anchors before generating.

## Dialogue: when it's safe

Native-audio models weaken the old "avoid dialogue" rule. The durable pattern: generate the **voice once** in an external tool, feed it to the video model as an **audio reference** so the voice is fixed and visuals sync to it — per-clip fresh synthesis drifts. This also fixes timing and word precision. Still keep dialogue lean; physical/visual storytelling is more robust.

## The two foundational motion lessons (compressed)

**Lock rigid form; direct living motion.** Two real failures define the poles:

- **The morphing pyramid (too little lock):** a text-driven pull-back with no plate and no fixed-state instruction let the model grow a structure from ~70% to finished inside one 9-second shot. Fix: state the exact fixed state as a present fact in CONTEXT, add the targeted static-lock clause naming the structure, and bind the location plate at the correct version so the model anchors to pixels, not invention. Deliberate on-camera changes (a beam firing, a ship lifting) get the opposite — explicit state-change in event order (never second-marks), listed in Bible §3D.
- **The frozen tableau (too much lock):** a beautiful night shot rendered as a living photograph — the row described an _image_ instead of an _event_ (no verb), a blanket "subject unchanged" froze the characters, the camera was also locked, and drifting mist can't carry a shot. Fix: **no-delta-no-shot** (every row is a motion arc or a written performance hold), **one dominant motion source per shot**, and characters always performed — the lock names its rigid target, never "subject unchanged."

## Showing time pass without a montage

**Match-cut pairs:** two shots, identical framing/lens/position, where only a scheduled element differs (a structure higher, a detail dimmer) — the cut reads as elapsed time, cheaply, with no extra location. Put every changing element on the State Schedule (Bible §4) so its progression is planned across shots.

## Turn invisible stakes into visible ones

A clock the audience can't see does nothing for the image. Bind stakes to an on-screen detail (a glowing element that dims, a structure that rises, light that lengthens) so the model can _show_ the pressure. Decide at Steps 3–4; schedule in Bible §4.

## Diagnosing generated footage

When the user shares a clip that's "off":

- Extract frames (`ffmpeg -i clip.mp4 -vf fps=1 frame_%02d.jpg`) and inspect the progression.
- Decide: **prompt wording** (needs a lock or a state instruction) or **missing reference** (needs an `@material` image)? Most "the model did something weird" problems are "we let it invent because we fed text, not a reference."
- Feed the lesson back into the Bible as a directive so it can't silently recur.
- Sometimes a "bug" is beautiful — offer to repurpose it as a deliberate special shot (vision/dream/transformation) rather than forcing it into a continuous-realism slot.
