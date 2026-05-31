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

  // Reads pending Redis deltas, persists them into the current hourly bucket, then acknowledges only persisted deltas.
  async syncPopularUrlStats(): Promise<SyncPopularUrlStatsResult> {
    const result = await this.popularityRedisService.withLock(SYNC_LOCK_KEY, 60 * 10, async () => {
      const dirtyUrls = await this.popularityRedisService.getDirtyUrls(POPULARITY_SYNC_BATCH_LIMIT)

      const now = etcUtil.seoulNow()
      const bucketHour = now.startOf("hour").toDate()

      let processed = 0
      let skipped = 0

      for (const url of dirtyUrls) {
        const deltas = await this.popularityRedisService.getUrlDeltas(url)

        if (!hasDeltas(deltas)) {
          await this.popularityRedisService.acknowledgeDeltas(url, deltas)
          skipped += 1
          continue
        }

        await this.popularityRepository.upsertUrlHourlyStats(url, deltas, bucketHour)
        await this.popularityRedisService.acknowledgeDeltas(url, deltas)
        processed += 1
      }

      return { processed, skipped }
    })

    return result
      ? { ...result, locked: false, batchLimit: POPULARITY_SYNC_BATCH_LIMIT }
      : { processed: 0, skipped: 0, locked: true, batchLimit: POPULARITY_SYNC_BATCH_LIMIT }
  }

  // Removes hourly stat rows outside the rolling-window retention period.
  async cleanupPopularUrlStats(): Promise<void> {
    await this.popularityRedisService.withLock(CLEANUP_LOCK_KEY, 60 * 30, async () => {
      const now = etcUtil.seoulNow()
      await this.popularityRepository.cleanupHourlyStats(
        now.subtract(32, "day").startOf("hour").toDate()
      )
    })
  }
}
