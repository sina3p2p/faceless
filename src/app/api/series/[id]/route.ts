import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series, videoProjects } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq, and, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const result = await db.query.series.findFirst({
    where: and(eq(series.id, id), eq(series.userId, user.id)),
    with: {
      videoProjects: {
        orderBy: desc(videoProjects.createdAt),
        limit: 20,
        with: {
          renderJobs: {
            orderBy: desc(videoProjects.createdAt),
            limit: 1,
          },
        },
      },
    },
  });

  if (!result) return notFound("Series not found");

  return NextResponse.json(result);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await db.query.series.findFirst({
    where: and(eq(series.id, id), eq(series.userId, user.id)),
  });

  if (!existing) return notFound("Series not found");

  await db.delete(series).where(eq(series.id, id));

  return NextResponse.json({ deleted: true });
}
