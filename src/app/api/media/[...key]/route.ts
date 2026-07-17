import { NextRequest, NextResponse } from "next/server";
import {
  getStoredObject,
} from "@/lib/storage";

/**
 * Public HMAC-gated media proxy for AI providers (and anything that cannot
 * use cookie auth or short-lived R2 signed URLs in the request body).
 *
 * GET /api/media/{key}?exp={unix}&sig={hmac}
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key: parts } = await params;

  const key = parts.join("/");

  const obj = await getStoredObject(key);
  if (!obj) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(obj.body), {
    status: 200,
    headers: {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.body.byteLength),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
