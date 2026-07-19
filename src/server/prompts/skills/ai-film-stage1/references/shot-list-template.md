# Shot List Template

The Annotated Shot List (the production document) — one of the two TEXT documents of the five-artifact handoff (the other is the Bible, `bible-template.md`). Fill from locked decisions only. Prompt assembly for Seedance lives in `shot-compilation-recipe.md` (Stage 2), not here.

## The Annotated Shot List

Rows are grouped into **SCENES** (one location + one continuous span of time). Each scene opens with a one-line header:

```
SCENE [n] — [location] — [lighting state(s), in order]
  Delta: [what changes irreversibly in this scene] — visually: [what must look different
          from the previous scene: a State Schedule value, the light, new action]
  Coverage: [the scale plan, e.g. "establish W → alternating M → CU for the turn"]
  Space: [geography: walls/exits/landmark sides/depth planes; where key subjects and
          objects sit relative to each other; which way movement flows across frame]
  Axis: [which way is camera-left; the 180° line; which side eyelines cross]
  Blocking: [who starts where; who moves; who stays]
  Fixed props: [what must not teleport across the scene's shots]
```

This header is the scene's **continuity block** — the single text source for scene-level geography, blocking, and screen direction that every motion sheet and compiled prompt honors (there is no separate continuity-pack artifact). The Delta line comes from the scene-delta rule applied while building the scene (Step 7) and feeds the grid prompt's what-is-new clause. Space + Axis keep geography and screen direction coherent across the scene's rows: props stay where they were, a distant landmark stays on the same side of frame, a movement exiting right enters the next frame moving right. When a scene spans multiple lighting states, list them in order — each individual shot row still carries exactly ONE (unless a locked transition exception). **A lighting-state change alone is not a scene boundary** — keep match-cut pairs and continuous geography in one scene; register a lighting break between shots with `match_cut_source_*` when composition must still match. A beat spanning two locations cutting against each other is TWO scenes with alternating rows.

One row per shot:

```
# | Scene | Mood | Scale | Motion arc (start → change → end) | Primary (SUBJ/CAM) | Camera move | Cut-out → Cut-in | Light | Dur | Materials
```

- **#** sequential. **Scene** ties to the scene header. **Mood** carried from the beat sheet — it drives the camera and lighting choice.
- **Scale**: W / M / CU / INSERT / POV. State it — an unspecified scale is decided per-render and drifts. An all-one-scale scene is a flatness flag.
- **Motion arc** — the shot as an EVENT: start state, what changes (a real verb belonging to a character, object, or the camera), end state. "Nadia lies among the roots as the figure stands over her" is a still frame; "The figure takes one slow step closer, head tilting; Nadia pushes herself back into the roots, heels dragging through soil" is a shot. Intentional stillness is written as a performance hold (breath, gaze, tension, posture, deadpan). Reaction/discovery rows name the gaze target in the arc ("detective freezes, eyes lock down-right onto the child at waist height") — an emotion word alone gets a wrong eyeline invented.
- **Primary (SUBJ/CAM)** — the single source carrying the shot's motion. Exactly one.
- **Camera move** — chosen from the camera language below to match the mood. Primary = SUBJ → the camera calms or locks; Primary = CAM → the subject calms.
- **Cut-out → Cut-in** — the edit written into the rows so it survives independent generation. Cut-out locks **footing/surface/position**, not intent: "she stands ON the stone staircase, mid-flight, facing up" — never "she walks toward the stairs." Cut-in of the next shot restates that same footing before new action. Named handoffs: eyeline, cut-on-action, exit/enter (with direction), match, POV-answer, or "rest" (a deliberate held cut — fine alone; a chain of them is the slideshow flag). Final shot's cut-out is "end". Continuous walks across generations prefer video extension (Stage 2) over text cut-ins.
- **Light** — exactly ONE canonical state per row by default. Time passes between shots: a lighting change across a cut is two rows (or a match-cut pair) inside the same scene when geography continues. An in-shot lighting transition is allowed only when that transition IS the locked beat — list it in Bible §3D and set `lighting_transition_exception` on the sheet registry entry.
- **Dur** — seconds, an ESTIMATE used for the Seedance duration parameter and the runtime total; it never appears in prompt text.
- **Materials** — every asset that APPEARS IN THE MOTION ARC: characters, plates (at which version), AND hero props. If the arc lifts the ship, `ship_object_ref` is in this cell; an arc entity absent from materials gets invented fresh at render time.

## Camera language for authoring rows (choose here; Stage 2 phrases it)

The CHOOSING vocabulary for the Camera move and Scale cells. (Wording the chosen move for Seedance lives in the compilation recipe.)

**Motivated movement:** the camera moves when MEANING moves — every non-static move answers "what is this revealing, following, or making us feel?" A move with no answer becomes a lock-off with the subject carrying the shot. A film where every shot moves is drone-soup; stillness buys the contrast that makes moving shots land.

**Mood → move idioms:**
| The beat wants | Reach for |
|---|---|
| Rising tension, dawning realization | slow push-in |
| Reveal, irony, recontextualizing a figure | pull-back or crane-up (the frame learns something) |
| Intimacy, private moment | slow push to CU, or static CU with shallow focus |
| Observation, deadpan, a beat playing without comment | lock-off (the frame refuses to react — that IS the point) |
| Unease, wrongness | Dutch tilt held, or slow unmotivated drift |
| Vertigo, floor-dropping realization | dolly-zoom — rare, once per film at most |
| Energy, pursuit | tracking/side-follow at matched speed (earn it by contrast) |
| Scale, awe | low angle looking up + slow crane/tilt |
| Vulnerability, smallness | high angle or overhead, subject small in negative space |
| Transition inside a space | foreground wipe-by (a pillar/figure briefly occludes — a cut you don't cut) |
| Walking dialogue-of-glances | reverse-track ahead of the subject |
| Study, hypnosis, held fascination | slow orbit at constant distance |

**Height and angle** go in the Camera move cell when they carry meaning: eye-level is the invisible default; name low/high/overhead/ground-level only when the beat wants power, vulnerability, layout, or texture.

**Depth staging (the strongest realism cue AI shot lists neglect):** compose in THREE planes — something soft in the extreme foreground, the subject in the mid, life in the deep background — and prefer movement TOWARD or AWAY from camera over lateral crosses: depth movement generates parallax, and correct parallax reads as "filmed." Per scene, aim for at least one three-plane row and one row whose movement travels through depth. Write the planes into the motion arc ("past the foreground doorway, the hero walks toward camera from the deep corridor") — the motion-sheet panels inherit the composition.
