import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { uploadFile } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return badRequest("No file provided");

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return badRequest("File must be JPEG, PNG, or WebP");
  }

  if (file.size > 10 * 1024 * 1024) {
    return badRequest("File must be under 10MB");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `temp/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await uploadFile(key, buffer, file.type);

  return NextResponse.json({ url: key });
}
