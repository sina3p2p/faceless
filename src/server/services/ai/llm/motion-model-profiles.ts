/**
 * Per-model motion capability profiles. Injected into the Motion Director
 * system prompt so the agent can shape primaryAction / cameraMove around
 * each i2v model's known strengths and failure modes instead of producing
 * a generic spec the downstream model can't actually execute.
 *
 * Keep each field short — these get inlined into the prompt verbatim.
 *   strengths: what this model handles well; the agent can lean into these.
 *   weaknesses: known failure modes; the agent should avoid prompting them.
 *   prefer:    concrete moves/framings that work reliably.
 *   avoid:     concrete moves/framings the agent should not request.
 *   endFrameSupported: must match VIDEO_MODELS — when false, Motion Director
 *                       is forced to "freeform" and the anchor reasoning
 *                       block is skipped entirely.
 */
export type MotionModelProfile = {
  label: string;
  strengths: string;
  weaknesses: string;
  prefer: string;
  avoid: string;
  endFrameSupported: boolean;
};

const SEEDANCE: MotionModelProfile = {
  label: "ByteDance Seedance 2.0",
  strengths:
    "best-in-class prompt adherence on the Artificial Analysis I2V leaderboard (beats Veo 3 / Kling 2 by a wide margin); multi-shot timeline reasoning across sequential beats; natural body mechanics, weight transfer, multi-subject scenes; rich reactive secondary physics (cloth, hair, dust, smoke); strong cinematography vocabulary (dolly, tracking, orbit, crane, rack focus, handheld) when paired with a pacing modifier; lighting words have outsized impact on output quality.",
  weaknesses:
    "identity and exposure drift past ~8s — 10–15s clips are noticeably worse than 5–6s; warps when motion reveals surfaces the start image didn't show (back of head, hidden hand, product underside); compound camera moves break it (e.g. 'dolly in while panning while tilting' produces jittery garbage); negatives are interpreted positively unless rephrased ('no warping' can trigger warping); end-frame morphs when the two frames differ in framing or subject.",
  prefer:
    "translation through space, locomotion, vehicle/object motion with realistic momentum; ONE camera move per shot paired with a speed modifier (slow/gentle/smooth); one primary motion verb plus one secondary micro-motion (drift, shimmer, ripple); positive-form constraints over negative lists.",
  avoid:
    "tight close-ups of hands manipulating small objects; compound camera moves; sudden direction reversals; long negative lists in the prompt body (use brief positive anchors instead); anchoring when the next frame has a different subject or framing; durations beyond 8s without explicit identity-anchor language.",
  endFrameSupported: true,
};

const KLING_V25: MotionModelProfile = {
  label: "Kling v2.5 Turbo Pro",
  strengths:
    "highly dynamic motions and physics realism (the 2025-09-19 release headline targeted gymnastics, dance, balance); faithful camera-language interpretation (dolly in, Dutch angle, medium shot, tracking, crash zoom map to learned behaviors); much better adherence on multi-step / causal instructions vs 2.1 ('first … then … finally'); strong start-frame fidelity (color, lighting, texture preserved); 2× faster, ~30% cheaper than 2.1 with no quality cut.",
  weaknesses:
    "hands and fingers degrade with fast motion (merging fingers, extra digits) — mitigation is SLOWING the described motion, not long negatives; identity / face drift past ~60° head turn; multi-subject crowding (>1 subject doing distinct actions blends them); more aggressive content rejection than 2.1; element overload — best with 3–4 scene elements max, more produces inconsistency; durations beyond 10s degrade.",
  prefer:
    "single-subject beats with explicit pacing words ('slowly', 'gradually', 'gently') in primaryAction; ONE camera move per shot with a recognized term; explicit motion endpoint in endState ('settles', 'comes to rest', 'holds final pose') to prevent tail jitter; 5–8 short focused negatives (not 25); cfg-friendly start-frame preservation.",
  avoid:
    "compound camera moves; >4 scene elements; long negative lists (over-constrains); rapid head turns past 60°; multiple actors interacting; durations beyond 10s; vague verbs ('moves around', 'does cool stuff').",
  endFrameSupported: true,
};

const KLING_V26_PRO: MotionModelProfile = {
  label: "Kling 3.0 Standard (v1.6 pro under the hood)",
  strengths:
    "soft cinematic motion; reliable end-frame interpolation when frames are visually close; pleasant defaults on locked or drifting cameras.",
  weaknesses:
    "fingers and small props; aggressive translation across the frame; fast cameras; faces under high motion.",
  prefer:
    "subtle/moderate intensity beats; locked or slow-drift cameras; close-to-identical end-frame compositions when anchoring.",
  avoid:
    "frenetic intensity; whip pans; multi-subject interaction; anchoring across cuts that change framing or subject.",
  endFrameSupported: true,
};

const KLING_V3_PRO: MotionModelProfile = {
  label: "Kling 3.0 Pro (v2.1 master)",
  strengths:
    "high-fidelity cinematic motion; better face/identity stability than v2.5; richer secondary physics; strong on stylized human action.",
  weaknesses:
    "still imperfect on fingers and small handheld props; no end-frame support — must resolve naturally inside the clip.",
  prefer:
    "self-contained beats that build, peak, and settle within the clip; moderate-to-dynamic intensity; deliberate camera grammar; gestures from the body, not the fingers.",
  avoid:
    "tight finger-level manipulation; reliance on a target end-frame; multi-subject interaction with prop handoffs.",
  endFrameSupported: false,
};

const VEO_31: MotionModelProfile = {
  label: "Google Veo 3.1",
  strengths:
    "natural physics and believable secondary motion; multi-subject scenes; faster cameras; strong text-prompt adherence; good results on dynamic and frenetic intensities.",
  weaknesses:
    "no end-frame support — every clip must self-resolve; some softness on extreme close-ups of hands.",
  prefer:
    "self-contained beats; the full intensity range up to frenetic; complex camera moves (push, arc, whip) when the subject's own motion justifies them; multi-element scenes.",
  avoid:
    "any reliance on next-frame anchoring; treating the end-frame as guaranteed alignment for the next cut.",
  endFrameSupported: false,
};

const LUMA_RAY2: MotionModelProfile = {
  label: "Luma Ray-2 (Dream Machine)",
  strengths:
    "stylized and cinematic motion; smooth camera moves; pleasant atmospheric secondary physics (smoke, particles, light shifts).",
  weaknesses:
    "tight character work (hands, faces under fast motion); no end-frame support; multi-subject interaction; precise prop trajectories.",
  prefer:
    "atmospheric or environmental beats; medium-paced camera moves; stylized subjects; subtle/moderate intensities.",
  avoid:
    "finger-level manipulation; precise object trajectories; multi-actor interaction; reliance on end-frame anchoring.",
  endFrameSupported: false,
};

const GROK_IMAGINE: MotionModelProfile = {
  label: "xAI Grok Imagine Video",
  strengths:
    "broad duration range (1–15s); decent on simple single-subject motion; built-in audio.",
  weaknesses:
    "less predictable than the other backends; weak on multi-subject interaction; weak on fast cameras; no end-frame support.",
  prefer:
    "simple, single-subject, single-action beats; locked or gentle cameras; subtle/moderate intensity.",
  avoid:
    "multi-subject interaction; aggressive camera moves; finger/prop detail; reliance on end-frame anchoring.",
  endFrameSupported: false,
};

const PIXVERSE_V6: MotionModelProfile = {
  label: "Pixverse V6",
  strengths:
    "strongest-in-class explicit camera control via natural language (20+ cinematic lens controls — focal length, aperture, depth of field, lens distortion); holds 15s @ 1080p as a single coherent generation without the inter-clip drift of V4/V5; excellent start-frame fidelity (analyzes subject/environment/lighting before generating motion); stylized output (anime, 3d animation, clay, comic, cyberpunk) is a documented strength; rewards literal-descriptive prompts — no metaphor needed.",
  weaknesses:
    "high re-roll rate on photoreal scenes (~3.2 takes per usable clip vs 1.4 Kling 3.0 / 1.3 Runway Gen-4.5); hands and small anatomy break (extra fingers, distorted hands); camera direction obedience asymmetric — pull-back / rise / dolly-in / push-in work but rightward pans are frequently ignored and exotic moves degrade; multi-subject 'clone army' and face-morphing on long durations; no end-frame support; text/signage rendering unreliable; burying negatives in the positive prompt actually HURTS quality.",
  prefer:
    "echo the subject from the image in the opening clause (5-part structure: Subject + Action + Atmospheric motion + Camera + Style/Mood); ONE primary action with a concrete physical verb (drifting, rotating, rising, falling, swaying, rippling); reliable camera moves only (slow dolly-in / push-in, slow pull-back, rise, crane, tilt, tracking, orbit, static locked-off); encode trajectory into the action verb itself (the model has no terminal-frame conditioning).",
  avoid:
    "rightward pans, whip pans, dolly zoom, snap zooms, compound moves; metaphorical or aesthetic-tag prompts ('dances with the soul of the cosmos'); multiple competing actions; readable text/signage; ending-state instructions (no end_image to align to); inline negative lists in the positive prompt; multi-subject scenes with distinct actions; durations beyond 10s without slowing the action and simplifying the camera.",
  endFrameSupported: false,
};

const VIDU_Q3_PRO: MotionModelProfile = {
  label: "Vidu Q3 Pro",
  strengths:
    "strongest-in-class explicit camera control via natural language (20+ cinematic lens controls — focal length, aperture, depth of field, lens distortion); holds 15s @ 1080p as a single coherent generation without the inter-clip drift of V4/V5; excellent start-frame fidelity (analyzes subject/environment/lighting before generating motion); stylized output (anime, 3d animation, clay, comic, cyberpunk) is a documented strength; rewards literal-descriptive prompts — no metaphor needed.",
  weaknesses:
    "high re-roll rate on photoreal scenes (~3.2 takes per usable clip vs 1.4 Kling 3.0 / 1.3 Runway Gen-4.5); hands and small anatomy break (extra fingers, distorted hands); camera direction obedience asymmetric — pull-back / rise / dolly-in / push-in work but rightward pans are frequently ignored and exotic moves degrade; multi-subject 'clone army' and face-morphing on long durations; no end-frame support; text/signage rendering unreliable; burying negatives in the positive prompt actually HURTS quality.",
  prefer:
    "echo the subject from the image in the opening clause (5-part structure: Subject + Action + Atmospheric motion + Camera + Style/Mood); ONE primary action with a concrete physical verb (drifting, rotating, rising, falling, swaying, rippling); reliable camera moves only (slow dolly-in / push-in / pull-back, slow rise, crane, tilt, tracking, orbit, static locked-off); encode trajectory into the action verb itself (the model has no terminal-frame conditioning).",
  avoid:
    "rightward pans, whip pans, dolly zoom, snap zooms, compound moves; metaphorical or aesthetic-tag prompts ('dances with the soul of the cosmos'); multiple competing actions; readable text/signage; ending-state instructions (no end_image to align to); inline negative lists in the positive prompt; multi-subject scenes with distinct actions; durations beyond 10s without slowing the action and simplifying the camera.",
  endFrameSupported: false,
};

const PROFILES: Record<TVideoModelId, MotionModelProfile> = {
  "seedance-2-pro": SEEDANCE,
  "seedance-2-fast": SEEDANCE,
  "seedance-2-mini": SEEDANCE,
  "kling-v2.5-turbo-pro": KLING_V25,
  "kling-3-standard": KLING_V26_PRO,
  "kling-3-pro": KLING_V3_PRO,
  "veo-31-lite": VEO_31,
  "veo-31-fast": VEO_31,
  "runway-gen4-turbo": LUMA_RAY2,
  "runway-gen4.5": LUMA_RAY2,
  "grok-imagine": GROK_IMAGINE,
  "pixverse-v6": PIXVERSE_V6,
  "vidu-q3-pro": VIDU_Q3_PRO,
};

export function getMotionModelProfile(modelId: TVideoModelId | undefined | null): MotionModelProfile | null {
  if (!modelId) return null;
  return PROFILES[modelId] ?? null;
}

/** Compact prompt block describing the target i2v model's motion capabilities. */
export function buildTargetModelBlock(modelId: TVideoModelId | undefined | null): string {
  const profile = getMotionModelProfile(modelId);
  if (!profile) return "";
  return `\nTARGET MODEL: ${profile.label} — design moves it can actually execute.
- Strengths: ${profile.strengths}
- Weaknesses: ${profile.weaknesses}
- Prefer: ${profile.prefer}
- Avoid: ${profile.avoid}
Treat "Avoid" as hard constraints in primaryAction and cameraMove. Surface model-specific failure modes (e.g. finger morphs, identity drift) explicitly in negativeMotion.\n`;
}
