import sharp from "sharp";
import { uploadFile, mediaUrl } from "@/lib/storage";

export const SEEDANCE2_MODELS: ReadonlySet<TVideoModelId> = new Set(["seedance-2-pro", "seedance-2-fast"]);

export function isE005(err: unknown): boolean {
  return err instanceof Error && err.message.includes("E005");
}

async function fetchImage(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`noise fetch failed: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function gaussianNoise(input: Buffer, sigma: number): Promise<Buffer> {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i++) {
    const z = Math.sqrt(-2 * Math.log(Math.random() || 1e-10)) * Math.cos(2 * Math.PI * Math.random());
    data[i] = Math.max(0, Math.min(255, data[i] + Math.round(sigma * z)));
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels as 1 | 2 | 3 | 4 },
  }).jpeg({ quality: 95 }).toBuffer();
}

async function store(buf: Buffer, key: string): Promise<string> {
  await uploadFile(key, buf, "image/jpeg");
  return mediaUrl(key);
}

/** Sigma=8 Gaussian noise — first-attempt bypass for E005. */
export async function addSeedanceNoise(imageUrl: string, label: string, projectId: string): Promise<string> {
  const input = await fetchImage(imageUrl);
  const output = await gaussianNoise(input, 8);
  return store(output, `frames/${projectId}/noised_${label}_${Date.now()}.jpg`);
}

/** Stacked perturbation for E005 retry: hue shift + JPEG precompress + sigma=15 noise. */
export async function addSeedanceNoiseEnhanced(imageUrl: string, label: string, projectId: string): Promise<string> {
  const input = await fetchImage(imageUrl);
  const precompressed = await sharp(input).modulate({ hue: 4 }).jpeg({ quality: 72 }).toBuffer();
  const output = await gaussianNoise(precompressed, 15);
  return store(output, `frames/${projectId}/noised_enh_${label}_${Date.now()}.jpg`);
}
