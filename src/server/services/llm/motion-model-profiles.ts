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
    "natural body mechanics and weight transfer; multi-subject scenes; long clips (up to 15s) with sustained motion; reactive secondary physics (cloth, hair, dust).",
  weaknesses:
    "fine finger articulation and prop handoffs; rapid orientation changes (whip pans, fast 180° turns); aggressive end-frame anchoring across dissimilar framings.",
  prefer:
    "translation through space, locomotion, vehicle/object motion with realistic momentum; medium-speed dollies, pans, gentle arcs; one continuous beat that builds and settles.",
  avoid:
    "tight close-ups of hands manipulating small objects; whip pans; sudden direction reversals; anchoring when the next frame has a different subject or framing.",
  endFrameSupported: true,
};

const KLING_V25: MotionModelProfile = {
  label: "Kling v2.5 Turbo Pro",
  strengths:
    "cinematic camera language (push-in, parallax dolly, arc); stylized motion; portrait subjects with controlled emotion.",
  weaknesses:
    "hands and fingers (frequent warping); face identity drift on fast motion; complex multi-subject interaction; long durations (best at 5s).",
  prefer:
    "single-subject beats with deliberate camera grammar; medium camera moves; clear silhouette; gestures from the shoulder and torso, not the fingers.",
  avoid:
    "two-handed prop manipulation; rapid head turns past 90°; multiple actors interacting; durations beyond 10s.",
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

const PROFILES: Record<TVideoModelId, MotionModelProfile> = {
  "seedance-2-pro": SEEDANCE,
  "seedance-2-fast": SEEDANCE,
  "kling-v2.5-turbo-pro": KLING_V25,
  "kling-3-standard": KLING_V26_PRO,
  "kling-3-pro": KLING_V3_PRO,
  "veo-31-lite": VEO_31,
  "veo-31-fast": VEO_31,
  "runway-gen4-turbo": LUMA_RAY2,
  "runway-gen4.5": LUMA_RAY2,
  "grok-imagine": GROK_IMAGINE,
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
