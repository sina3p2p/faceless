# Medium Constraints — Writing for AI Video

Consult whenever a creative choice has a generation cost. Craft rules here are production defaults for the tested model profile (canonical statements: Bible template §3 in `bible-template.md`); this file carries the writing guidance and the asset-expansion method.

## Lean INTO (AI does these beautifully)

Atmosphere, weather, particles (dust, haze, spray, smoke); striking single images and surreal/impossible visuals; slow deliberate camera movement (as a deliberate row-level choice — subject pace still defaults to natural real-time; see the motion lessons below); physical comedy and big visual gags; big landscapes, skies, water; strongly-characterized light of any kind; silhouettes and scale contrast (tiny figure in vast space).

## Steer AWAY (current failure modes)

complex hand manipulation / fine finger work; readable on-screen text (signs, documents, UI — dramatize as short labels, blurred tables, implied UI / density; do **not** promise locked legible strings Seedance will regenerate every frame); large crowds that must stay consistent shot to shot; tightly choreographed continuous action across a long take; exact repeatable likeness of a real person (also a legal/ethical minefield — prefer fully synthetic faces). If the film's climax _is_ readable screen content, flag at premise — Path A (implied) is the honest Stage 1 stance until a composite overlay path exists.

**Cast guidance:** keep the recurring hero cast intentionally small; background figures do not need identity references.

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

**Charsheet approval checklist (applied when `vision_status:attached` on the fresh gallery result, and as the user's rejection guide) — REJECT (never "close enough") on any of:** views not reading as the SAME person (the sheet's cardinal failure — the twin bug); anything held or worn that isn't locked wardrobe under the empty-hands policy; an environment or scene lighting instead of flat studio; a tinted/gradient background; a non-neutral pose or expression; the face obscured in the front view. Never claim this checklist passed on an unseen / `vision_status:unverifiable` image.

**The ten-generations test for any reference prompt:** if you generated this same prompt ten times, would all ten be recognizably the same character/place? Looseness that lets them diverge is exactly what becomes drift downstream — tighten the anchors before generating.

## Dialogue

Dialogue is allowed, including plot-critical and multi-turn scenes. Preferred production path: call `generateVoiceAnchors` once per speaking hero / recurring VO (Bible §2 `*_vo`), approve via the same gallery `asset_approval` (Approve remaining), then attach those approved audio URLs as `reference_audio_urls` on dialogue `compileShot` calls so Seedance locks timbre — per-clip fresh synthesis drifts. Match shot Dur to the spoken line (don't stretch a short line across a long take). Coverage can cut mid-conversation; one continuous lip-synced take is fine when Dur ≤15s. Background one-off figures do not need voice anchors.

## The two foundational motion lessons (compressed)

**Lock rigid form; direct living motion.** Two real failures define the poles:

- **The morphing pyramid (too little lock):** a text-driven pull-back with no plate and no fixed-state instruction let the model grow a structure from ~70% to finished inside one 9-second shot. Fix: state the exact fixed state as a present fact in CONTEXT, add the targeted static-lock clause naming the structure, and bind the location plate at the correct version so the model anchors to pixels, not invention. Deliberate on-camera changes (a beam firing, a ship lifting) get the opposite — explicit state-change in event order (never second-marks), listed in Bible §3D.
- **The frozen tableau (too much lock):** a beautiful night shot rendered as a living photograph — the row described an _image_ instead of an _event_ (no verb), a blanket "subject unchanged" froze the characters, the camera was also locked, and drifting mist can't carry a shot. Fix: **no-delta-no-shot** (every row is a motion arc or a written performance hold), **one dominant motion source per shot**, and characters always performed — the lock names its rigid target, never "subject unchanged."
- **The stretched single-beat (too thin for its Dur):** one action stretched across 8–12s reads as slow motion. Fix: enrich PRIMARY ACTION to a **2–4 beat arc** (~1 beat / 2–3s) or shorten Dur to 4–6s; default pace is natural real-time — never stack slow-words ("lingers" + "gently" + "slow dolly").
- **Frozen extras (unperformed figures):** three people in frame, only the hero moves — unbound / background-tier figures inherit the reference still's pose and freeze. Fix: every human in frame gets a verb or group motion (`"the two workers behind continue hauling rope"`); treat unnamed humans like ambient life — explicitly requested, never silent. Reference images govern identity/wardrobe/proportions only, never pose.

## Showing time pass without a montage

**Match-cut pairs:** two shots, identical framing/lens/position, where only a scheduled element differs (a structure higher, a detail dimmer, lighting state) — the cut reads as elapsed time, cheaply, with no extra location. Put every changing element on the State Schedule (Bible §4) so its progression is planned across shots. Keep match-cut pairs in the **same scene** when geography is continuous; registry mode `match_cut_source_*` records the twin when footing continuity is broken (e.g. lighting-state change) but composition must still match.

## Turn invisible stakes into visible ones

A clock the audience can't see does nothing for the image. Bind stakes to an on-screen detail (a glowing element that dims, a structure that rises, light that lengthens) so the model can _show_ the pressure. Decide at Steps 3–4; schedule in Bible §4.

## Diagnosing generated footage

When the user shares a clip that's "off":

- Extract frames (`ffmpeg -i clip.mp4 -vf fps=1 frame_%02d.jpg`) and inspect the progression.
- Decide: **prompt wording** (needs a lock, a state instruction, more beats, or background-figure verbs) or **missing reference** (needs an `@material` image)? Most "the model did something weird" problems are "we let it invent because we fed text, not a reference."
- **Stretched single-beat:** one action over a long duration → shorten Dur or enrich the arc to 2–4 beats; strip stacked slow-words.
- **Frozen extras:** unperformed figures freeze in the reference pose → give every human in frame a verb / group motion; confirm the identity-not-pose clause is on character definitions.
- Feed the lesson back into the Bible as a directive so it can't silently recur.
- Sometimes a "bug" is beautiful — offer to repurpose it as a deliberate special shot (vision/dream/transformation) rather than forcing it into a continuous-realism slot.
