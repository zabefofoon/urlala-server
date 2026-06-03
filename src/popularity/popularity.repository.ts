import { Injectable } from "@nestjs/common"
import { and, eq, gte, lt, sql } from "drizzle-orm"
import { db } from "../database/client"
import { popularUrlHourlyStats, popularUrls } from "../database/schema"
import type { MetricDeltas, PopularBucketWindow, PopularUrl } from "./types"

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

  async getPopularUrls(window: PopularBucketWindow, limit: number): Promise<PopularUrl[]> {
    const score = sql<number>`coalesce(sum(${popularUrlHourlyStats.score}), 0)`
    const clickCount = sql<number>`coalesce(sum(${popularUrlHourlyStats.clickCount}), 0)`
    const saveCount = sql<number>`coalesce(sum(${popularUrlHourlyStats.saveCount}), 0)`
    const likeCount = sql<number>`coalesce(sum(${popularUrlHourlyStats.likeCount}), 0)`
    const commentCount = sql<number>`coalesce(sum(${popularUrlHourlyStats.commentCount}), 0)`

    const rows = await db
      .select({
        url: popularUrls.url,
        score,
        click_count: clickCount,
        save_count: saveCount,
        like_count: likeCount,
        comment_count: commentCount,
        bucket_type: sql<PopularUrl["bucket_type"]>`${window.type}`,
        bucket_start: sql<string>`${window.bucketStartLabel}`,
      })
      .from(popularUrlHourlyStats)
      .innerJoin(popularUrls, eq(popularUrlHourlyStats.popularUrlId, popularUrls.id))
      .where(
        and(
          gte(popularUrlHourlyStats.bucketHour, window.bucketStart),
          lt(popularUrlHourlyStats.bucketHour, window.bucketEnd)
        )
      )
      .groupBy(popularUrls.url)
      .orderBy(
        sql`${score} desc`,
        sql`${saveCount} desc`,
        sql`${likeCount} desc`,
        sql`${commentCount} desc`,
        sql`${clickCount} desc`
      )
      .limit(limit)

    return rows.map((row) => ({
      ...row,
      score: Number(row.score),
      click_count: Number(row.click_count),
      save_count: Number(row.save_count),
      like_count: Number(row.like_count),
      comment_count: Number(row.comment_count),
    }))
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
