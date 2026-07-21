import {
  copyFile,
  listObjectKeys,
  objectExists,
  storageKeyFrom,
} from "@/lib/storage";

/** Key-safe handle: lowercase alphanumerics + underscore (leading @ stripped). */
const HANDLE_RE = /^[a-z0-9_]+$/;

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"] as const;
const AUDIO_EXTS = ["mp3", "wav", "m4a"] as const;
const VIDEO_EXTS = ["mp4", "webm"] as const;
const ALL_EXTS = [...IMAGE_EXTS, ...AUDIO_EXTS, ...VIDEO_EXTS] as const;

export function refsPrefix(sessionId: string): string {
  return `v2/sessions/${sessionId}/refs`;
}

/** Strip `@`, lowercase, validate. Returns null when not key-safe. */
export function normalizeHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!h || !HANDLE_RE.test(h)) return null;
  return h;
}

export function assertHandle(raw: string): string {
  const h = normalizeHandle(raw);
  if (!h) {
    throw new Error(
      `Invalid handle "${raw}" — must be @?[a-z0-9_]+ after stripping @`
    );
  }
  return h;
}

/** Deterministic motion-sheet handle from scene + generation ids. */
export function gridHandleFromIds(
  sceneId: string | number,
  generationId: string
): string {
  return `scene${sceneId}_gen${generationId}_grid`;
}

export function shotClipHandle(shotId: string | number): string {
  return `shot${shotId}_clip`;
}

export function lastFrameHandle(generationId: string): string {
  return `gen${generationId}_last_frame`;
}

export function candidateKey(
  sessionId: string,
  handle: string,
  ext: string
): string {
  const h = assertHandle(handle);
  const cleanExt = ext.replace(/^\./, "").toLowerCase();
  return `${refsPrefix(sessionId)}/${h}/cand_${Date.now()}.${cleanExt}`;
}

export function canonicalKey(
  sessionId: string,
  handle: string,
  ext: string
): string {
  const h = assertHandle(handle);
  const cleanExt = ext.replace(/^\./, "").toLowerCase();
  return `${refsPrefix(sessionId)}/${h}.${cleanExt}`;
}

/**
 * Find an existing canonical object for a handle by probing known extensions.
 * Returns the full storage key, or null if none exists.
 */
export async function findCanonicalKey(
  sessionId: string,
  handle: string
): Promise<string | null> {
  const h = normalizeHandle(handle);
  if (!h) return null;
  const prefix = `${refsPrefix(sessionId)}/${h}.`;
  for (const ext of ALL_EXTS) {
    const key = `${prefix}${ext}`;
    if (await objectExists(key)) return key;
  }
  // Fallback: list in case of an unexpected extension
  const keys = await listObjectKeys(prefix, { maxKeys: 5 });
  const direct = keys.find((k) => {
    const base = k.slice(prefix.length);
    return base.length > 0 && !base.includes("/");
  });
  return direct ?? null;
}

/**
 * Copy an approved candidate (or any source key) onto the canonical handle key.
 * Ext is taken from the source key when omitted.
 */
export async function approveHandle(
  sessionId: string,
  handle: string,
  sourceKeyOrUrl: string,
  ext?: string
): Promise<string> {
  const src = storageKeyFrom(sourceKeyOrUrl) ?? sourceKeyOrUrl;
  const inferred =
    ext ??
    src.split(".").pop()?.toLowerCase() ??
    "png";
  const dest = canonicalKey(sessionId, handle, inferred);
  await copyFile(src, dest);
  return dest;
}

export type ResolveHandlesResult = {
  keys: string[];
  unknown: string[];
};

/**
 * Resolve named handles (or passthrough storage keys / media URLs) to storage keys.
 * Fail-closed: unknown handles are collected; caller should reject the tool call.
 */
export async function resolveHandles(
  sessionId: string,
  handles: string[]
): Promise<ResolveHandlesResult> {
  const keys: string[] = [];
  const unknown: string[] = [];

  for (const raw of handles) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) {
      unknown.push(raw);
      continue;
    }

    // Passthrough: already a storage key or app media URL (legacy / escape hatch)
    const asKey = storageKeyFrom(trimmed);
    if (asKey && (asKey.includes("/") || /^https?:\/\//i.test(trimmed))) {
      // Bare handle-like tokens without `/` are NOT passthrough — they must resolve
      if (asKey.includes("/")) {
        keys.push(asKey);
        continue;
      }
    }

    const found = await findCanonicalKey(sessionId, trimmed);
    if (found) {
      keys.push(found);
    } else {
      unknown.push(trimmed);
    }
  }

  return { keys, unknown };
}

/** List approved handle names (basename without extension) under the session refs prefix. */
export async function listKnownHandles(sessionId: string): Promise<string[]> {
  const prefix = `${refsPrefix(sessionId)}/`;
  const keys = await listObjectKeys(prefix, { maxKeys: 1000 });
  const handles = new Set<string>();
  for (const key of keys) {
    const rest = key.slice(prefix.length);
    // Skip candidate paths: {handle}/cand_…
    if (rest.includes("/")) continue;
    const dot = rest.lastIndexOf(".");
    const name = dot > 0 ? rest.slice(0, dot) : rest;
    if (name && HANDLE_RE.test(name)) handles.add(name);
  }
  return [...handles].sort();
}

/** Build a fail-closed error payload for the model. */
export async function unknownHandlesError(
  sessionId: string,
  unknown: string[]
): Promise<{ ok: false; errors: string[]; unknown_handles: string[]; known_handles: string[] }> {
  const known = await listKnownHandles(sessionId);
  return {
    ok: false,
    errors: [
      `Unknown handle(s): ${unknown.map((h) => `"${h}"`).join(", ")}. ` +
        `Pass approved named handles only — the app attaches pixels. ` +
        (known.length
          ? `Known handles: ${known.map((h) => `@${h}`).join(", ")}.`
          : "No approved handles in this session yet."),
    ],
    unknown_handles: unknown,
    known_handles: known.map((h) => `@${h}`),
  };
}
