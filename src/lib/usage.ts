import { prisma } from "@/server/db/prisma";
import { PLAN_LIMITS } from "./constants";
import type { PlanTier } from "@prisma/client";

export async function checkUsageLimit(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
  });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usageCount = await prisma.usageEntry.count({
    where: {
      userId,
      action: "video_generated",
      createdAt: { gte: startOfMonth },
    },
  });

  const limit = PLAN_LIMITS[user.planTier as PlanTier].videosPerMonth;

  return {
    allowed: usageCount < limit,
    used: usageCount,
    limit,
    remaining: Math.max(0, limit - usageCount),
  };
}

export async function recordUsage(
  userId: string,
  action: string,
  credits = 1,
  metadata?: Record<string, string | number | boolean>
): Promise<void> {
  await prisma.usageEntry.create({
    data: {
      userId,
      action,
      credits,
      metadata: metadata ? (metadata as unknown as Parameters<typeof prisma.usageEntry.create>[0]["data"]["metadata"]) : undefined,
    },
  });
}
