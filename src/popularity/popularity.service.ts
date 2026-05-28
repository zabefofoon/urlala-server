import { Injectable } from "@nestjs/common"
import etcUtil from "../utils/etc.util"
import { CLEANUP_LOCK_KEY, POPULARITY_SYNC_BATCH_LIMIT, SYNC_LOCK_KEY } from "./consts"
import { PopularityRedisService } from "./popularity-redis.service"
import { PopularityRepository } from "./popularity.repository"
import type { MetricDeltas, SyncPopularUrlStatsResult } from "./types"

const hasDeltas = (deltas: MetricDeltas): boolean =>
  deltas.view > 0 || deltas.like > 0 || deltas.save > 0 || deltas.comment > 0

@Injectable()
export class PopularityService {
  constructor(
    private readonly popularityRedisService: PopularityRedisService,
    private readonly popularityRepository: PopularityRepository
  ) {}

  // Reads pending Redis deltas, persists them into the current day/week/month buckets, then acknowledges only persisted deltas.
  async syncPopularUrlStats(): Promise<SyncPopularUrlStatsResult> {
    const result = await this.popularityRedisService.withLock(SYNC_LOCK_KEY, 60 * 10, async () => {
      const dirtyUrls = await this.popularityRedisService.getDirtyUrls(POPULARITY_SYNC_BATCH_LIMIT)

      // Resolves the active aggregation buckets using Seoul time and ISO week Monday starts.
      const now = etcUtil.seoulNow()
      const bucketStarts = {
        day: now.startOf("day").format("YYYY-MM-DD"),
        week: now.startOf("isoWeek").format("YYYY-MM-DD"),
        month: now.startOf("month").format("YYYY-MM-DD"),
      }

      let processed = 0
      let skipped = 0

      for (const url of dirtyUrls) {
        const deltas = await this.popularityRedisService.getUrlDeltas(url)

        if (!hasDeltas(deltas)) {
          await this.popularityRedisService.acknowledgeDeltas(url, deltas)
          skipped += 1
          continue
        }

        await this.popularityRepository.upsertUrlStats(url, deltas, bucketStarts)
        await this.popularityRedisService.acknowledgeDeltas(url, deltas)
        processed += 1
      }

      return { processed, skipped }
    })

    return result
      ? { ...result, locked: false, batchLimit: POPULARITY_SYNC_BATCH_LIMIT }
      : { processed: 0, skipped: 0, locked: true, batchLimit: POPULARITY_SYNC_BATCH_LIMIT }
  }

  // Removes expired period rows according to retention rules: day 30 days, week 26 weeks, month 12 months.
  async cleanupPopularUrlStats(): Promise<void> {
    await this.popularityRedisService.withLock(CLEANUP_LOCK_KEY, 60 * 30, async () => {
      // Resolves exclusive cutoff dates for deleting old stats rows.
      const now = etcUtil.seoulNow()
      await this.popularityRepository.cleanupStats({
        day: now.startOf("day").subtract(30, "day").format("YYYY-MM-DD"),
        week: now.startOf("isoWeek").subtract(26, "week").format("YYYY-MM-DD"),
        month: now.startOf("month").subtract(12, "month").format("YYYY-MM-DD"),
      })
    })
  }
}
