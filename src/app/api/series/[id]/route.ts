import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const series = await prisma.series.findFirst({
    where: { id, userId: user.id },
    include: {
      videoProjects: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!series) return notFound("Series not found");

  return NextResponse.json(series);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const series = await prisma.series.findFirst({
    where: { id, userId: user.id },
  });

  if (!series) return notFound("Series not found");

  await prisma.series.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
