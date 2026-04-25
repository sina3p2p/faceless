import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import type { BuiltResearchClaim, BuiltResearchPack } from "@/server/services/research/buildResearchPack";
import type { ResearchClaim, ResearchPackWithClaims } from "@/types/pipeline";

function mapRowToClaim(row: typeof schema.researchClaims.$inferSelect): ResearchClaim {
  return {
    id: row.id,
    researchPackId: row.researchPackId,
    videoProjectId: row.videoProjectId,
    claimOrder: row.claimOrder,
    claimText: row.claimText,
    sourceUrl: row.sourceUrl,
    evidenceSnippet: row.evidenceSnippet,
    retrievedAt: row.retrievedAt,
    asOfDate: row.asOfDate,
    confidence: row.confidence as ResearchClaim["confidence"],
    sourceTitle: row.sourceTitle,
    sourceDomain: row.sourceDomain,
    sourcePublishedAt: row.sourcePublishedAt,
    sourceType: (row.sourceType as ResearchClaim["sourceType"]) ?? null,
  };
}

export async function getResearchPackForVideo(
  videoProjectId: string
): Promise<ResearchPackWithClaims | null> {
  const pack = await db.query.researchPacks.findFirst({
    where: eq(schema.researchPacks.videoProjectId, videoProjectId),
    with: {
      claims: { orderBy: [asc(schema.researchClaims.claimOrder)] },
    },
  });
  if (!pack) return null;
  return {
    id: pack.id,
    videoProjectId: pack.videoProjectId,
    generatedAt: pack.generatedAt,
    queries: pack.queries,
    searchProvider: pack.searchProvider,
    claims: pack.claims.map(mapRowToClaim),
  };
}

export async function replaceResearchPackWithClaims(
  videoProjectId: string,
  built: BuiltResearchPack
): Promise<{ packId: string }> {
  return db.transaction(async (tx) => {
    await tx.delete(schema.researchPacks).where(eq(schema.researchPacks.videoProjectId, videoProjectId));

    const generatedAt = new Date();
    const [pack] = await tx
      .insert(schema.researchPacks)
      .values({
        videoProjectId,
        generatedAt,
        queries: built.queries,
        searchProvider: built.searchProvider,
        updatedAt: generatedAt,
      })
      .returning();

    if (!pack) throw new Error("Failed to insert research_packs row");

    const rows = built.claims.map((c: BuiltResearchClaim) => ({
      researchPackId: pack.id,
      videoProjectId,
      claimOrder: c.claimOrder,
      claimText: c.claimText,
      sourceUrl: c.sourceUrl,
      evidenceSnippet: c.evidenceSnippet,
      retrievedAt: c.retrievedAt,
      asOfDate: c.asOfDate,
      confidence: c.confidence,
      sourceTitle: c.sourceTitle,
      sourceDomain: c.sourceDomain,
      sourcePublishedAt: c.sourcePublishedAt,
      sourceType: c.sourceType,
    }));

    if (rows.length > 0) {
      await tx.insert(schema.researchClaims).values(rows);
    }

    return { packId: pack.id };
  });
}
