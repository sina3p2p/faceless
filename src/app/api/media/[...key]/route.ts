import { NextRequest, NextResponse } from "next/server";
import { getSignedDownloadUrl } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fullKey = key.join("/");

  try {
    const url = await getSignedDownloadUrl(fullKey);
    return NextResponse.redirect(url);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
