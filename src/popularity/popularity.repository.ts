import { Injectable } from "@nestjs/common"
import { lt, sql } from "drizzle-orm"
import { db } from "../database/client"
import { popularUrlHourlyStats, popularUrls } from "../database/schema"
import type { MetricDeltas } from "./types"

// Calculates the same weighted score used by the popular URL ranking query.
const scoreOf = (deltas: MetricDeltas): number =>
  deltas.save * 5 + deltas.like * 3 + deltas.comment * 2 + deltas.view

@Injectable()
export class PopularityRepository {
  async upsertUrlHourlyStats(url: string, deltas: MetricDeltas, bucketHour: Date): Promise<void> {
    const now = new Date()
    const deltaScore = scoreOf(deltas)

    await db.transaction(async (tx) => {
      const [popularUrl] = await tx
        .insert(popularUrls)
        .values({ url, updatedAt: now })
        .onConflictDoUpdate({ target: popularUrls.url, set: { updatedAt: now } })
        .returning({ id: popularUrls.id })

      if (!popularUrl) throw new Error(`Failed to upsert popular URL: ${url}`)

      await tx
        .insert(popularUrlHourlyStats)
        .values({
          popularUrlId: popularUrl.id,
          bucketHour,
          clickCount: deltas.view,
          saveCount: deltas.save,
          likeCount: deltas.like,
          commentCount: deltas.comment,
          score: deltaScore,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [popularUrlHourlyStats.popularUrlId, popularUrlHourlyStats.bucketHour],
          set: {
            clickCount: sql`${popularUrlHourlyStats.clickCount} + ${deltas.view}`,
            saveCount: sql`${popularUrlHourlyStats.saveCount} + ${deltas.save}`,
            likeCount: sql`${popularUrlHourlyStats.likeCount} + ${deltas.like}`,
            commentCount: sql`${popularUrlHourlyStats.commentCount} + ${deltas.comment}`,
            score: sql`
              (${popularUrlHourlyStats.saveCount} + ${deltas.save}) * 5
              + (${popularUrlHourlyStats.likeCount} + ${deltas.like}) * 3
              + (${popularUrlHourlyStats.commentCount} + ${deltas.comment}) * 2
              + (${popularUrlHourlyStats.clickCount} + ${deltas.view})
            `,
            updatedAt: now,
          },
        })
    })
  }

  async cleanupHourlyStats(cutoff: Date): Promise<void> {
    await db.delete(popularUrlHourlyStats).where(lt(popularUrlHourlyStats.bucketHour, cutoff))

    await db.execute(sql`
      delete from popular_urls
      where not exists (
        select 1
        from popular_url_hourly_stats
        where popular_url_hourly_stats.popular_url_id = popular_urls.id
      )
    `)
  }
}
