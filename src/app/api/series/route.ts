import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { z } from "zod/v4";

const createSeriesSchema = z.object({
  name: z.string().min(1).max(100),
  niche: z.string().min(1),
  style: z.string().default("cinematic"),
  defaultVoiceId: z.string().optional(),
  captionStyle: z.string().default("default"),
  topicIdeas: z.array(z.string()).default([]),
});

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const series = await prisma.series.findMany({
    where: { userId: user.id },
    include: { _count: { select: { videoProjects: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(series);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = createSeriesSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.message);
  }

  const series = await prisma.series.create({
    data: {
      ...parsed.data,
      userId: user.id,
    },
  });

  return NextResponse.json(series, { status: 201 });
}
