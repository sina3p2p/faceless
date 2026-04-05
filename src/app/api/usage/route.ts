import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/api-utils";
import { checkUsageLimit } from "@/lib/usage";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const usage = await checkUsageLimit(user.id);

  return NextResponse.json(usage);
}
