import { Injectable } from "@nestjs/common"
import { and, eq, lt, sql } from "drizzle-orm"
import { db } from "../database/client"
import { popularUrls, popularUrlStats } from "../database/schema"
import type { BucketType, MetricDeltas } from "./types"

// Calculates the same weighted score used by the popular URL ranking query.
const scoreOf = (deltas: MetricDeltas): number =>
  deltas.save * 5 + deltas.like * 3 + deltas.comment * 2 + deltas.view

@Injectable()
export class PopularityRepository {
  // Upserts the URL master row and increments day/week/month stat rows in one DB transaction.
  async upsertUrlStats(
    url: string,
    deltas: MetricDeltas,
    bucketStarts: Record<BucketType, string>
  ): Promise<void> {
    const now = new Date()
    const deltaScore = scoreOf(deltas)

    await db.transaction(async (tx) => {
      const [popularUrl] = await tx
        .insert(popularUrls)
        .values({
          url,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: popularUrls.url,
          set: {
            updatedAt: now,
          },
        })
        .returning({ id: popularUrls.id })

      if (!popularUrl) throw new Error(`Failed to upsert popular URL: ${url}`)

      await tx
        .insert(popularUrlStats)
        .values(
          (["day", "week", "month"] satisfies BucketType[]).map((bucketType) => ({
            popularUrlId: popularUrl.id,
            bucketType,
            bucketStart: bucketStarts[bucketType],
            clickCount: deltas.view,
            saveCount: deltas.save,
            likeCount: deltas.like,
            commentCount: deltas.comment,
            score: deltaScore,
            updatedAt: now,
          }))
        )
        .onConflictDoUpdate({
          target: [
            popularUrlStats.popularUrlId,
            popularUrlStats.bucketType,
            popularUrlStats.bucketStart,
          ],
          set: {
            clickCount: sql`${popularUrlStats.clickCount} + ${deltas.view}`,
            saveCount: sql`${popularUrlStats.saveCount} + ${deltas.save}`,
            likeCount: sql`${popularUrlStats.likeCount} + ${deltas.like}`,
            commentCount: sql`${popularUrlStats.commentCount} + ${deltas.comment}`,
            score: sql`
							(${popularUrlStats.saveCount} + ${deltas.save}) * 5
							+ (${popularUrlStats.likeCount} + ${deltas.like}) * 3
							+ (${popularUrlStats.commentCount} + ${deltas.comment}) * 2
							+ (${popularUrlStats.clickCount} + ${deltas.view})
						`,
            updatedAt: now,
          },
        })
    })
  }

  // Deletes stat rows older than the retention cutoff for each bucket type.
  async cleanupStats(cutoffs: Record<BucketType, string>): Promise<void> {
    await db
      .delete(popularUrlStats)
      .where(
        and(eq(popularUrlStats.bucketType, "day"), lt(popularUrlStats.bucketStart, cutoffs.day))
      )

    await db
      .delete(popularUrlStats)
      .where(
        and(eq(popularUrlStats.bucketType, "week"), lt(popularUrlStats.bucketStart, cutoffs.week))
      )

    await db
      .delete(popularUrlStats)
      .where(
        and(eq(popularUrlStats.bucketType, "month"), lt(popularUrlStats.bucketStart, cutoffs.month))
      )
  }
}
