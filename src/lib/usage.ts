import { db } from "@/server/db";
import { users, usageEntries } from "@/server/db/schema";
import { eq, and, gte, count } from "drizzle-orm";
import { PLAN_LIMITS } from "./constants";

export async function checkUsageLimit(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) throw new Error("User not found");

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({ count: count() })
    .from(usageEntries)
    .where(
      and(
        eq(usageEntries.userId, userId),
        eq(usageEntries.action, "video_generated"),
        gte(usageEntries.createdAt, startOfMonth)
      )
    );

  const usageCount = result?.count ?? 0;
  const limit = PLAN_LIMITS[user.planTier as keyof typeof PLAN_LIMITS].videosPerMonth;

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
  await db.insert(usageEntries).values({
    userId,
    action,
    credits,
    metadata: metadata ?? null,
  });
}
