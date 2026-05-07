import { NextRequest, NextResponse } from "next/server";
import { getSignedDownloadUrl } from "@/lib/storage";

// Public proxy. Keys are UUID-scoped and unguessable; this matches the
// exposure of R2_PUBLIC_URL. Required to be public so image/video providers
// can fetch the asset when we hand them mediaUrl(key).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fullKey = key.map(decodeURIComponent).join("/");

  try {
    const url = await getSignedDownloadUrl(fullKey);
    return NextResponse.redirect(url);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
