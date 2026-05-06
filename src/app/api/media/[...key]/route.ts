import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/api-utils";
import { getSignedDownloadUrl } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { key } = await params;
  const fullKey = key.map(decodeURIComponent).join("/");

  try {
    const url = await getSignedDownloadUrl(fullKey);
    return NextResponse.redirect(url);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
