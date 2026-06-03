import { Injectable, Logger } from "@nestjs/common"
import etcUtil from "../utils/etc.util"
import {
  CLEANUP_LOCK_KEY,
  POPULARITY_SYNC_BATCH_LIMIT,
  POPULAR_BUCKET_TYPES,
  POPULAR_URLS_CACHE_LIMIT,
  SYNC_LOCK_KEY,
} from "./consts"
import { PopularityRedisService } from "./popularity-redis.service"
import { PopularityRepository } from "./popularity.repository"
import type {
  MetricDeltas,
  PopularBucketType,
  PopularBucketWindow,
  SyncPopularUrlStatsResult,
} from "./types"

const hasDeltas = (deltas: MetricDeltas): boolean =>
  deltas.view > 0 || deltas.like > 0 || deltas.save > 0 || deltas.comment > 0

@Injectable()
export class PopularityService {
  private readonly logger = new Logger(PopularityService.name)

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

      let refreshedCacheTypes: PopularBucketType[] = []

      if (processed > 0) {
        try {
          refreshedCacheTypes = await this.refreshPopularUrlsCaches()
        } catch (error) {
          this.logger.error(
            "Failed to refresh popular URL caches",
            error instanceof Error ? error.stack : String(error)
          )
        }
      }

      return { processed, skipped, refreshedCacheTypes }
    })

    return result
      ? { ...result, locked: false, batchLimit: POPULARITY_SYNC_BATCH_LIMIT }
      : {
          processed: 0,
          skipped: 0,
          locked: true,
          batchLimit: POPULARITY_SYNC_BATCH_LIMIT,
          refreshedCacheTypes: [],
        }
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

  private async refreshPopularUrlsCaches(): Promise<PopularBucketType[]> {
    const refreshedCacheTypes: PopularBucketType[] = []

    for (const type of POPULAR_BUCKET_TYPES) {
      const window = this.getPopularBucketWindow(type)
      const popularUrls = await this.popularityRepository.getPopularUrls(
        window,
        POPULAR_URLS_CACHE_LIMIT
      )

      await this.popularityRedisService.setPopularUrlsCache(
        type,
        POPULAR_URLS_CACHE_LIMIT,
        popularUrls
      )
      refreshedCacheTypes.push(type)
    }

    return refreshedCacheTypes
  }

  private getPopularBucketWindow(type: PopularBucketType): PopularBucketWindow {
    const now = etcUtil.seoulNow()
    const start =
      type === "day"
        ? now.startOf("day")
        : type === "week"
          ? now.startOf("isoWeek")
          : now.startOf("month")
    const end =
      type === "day"
        ? start.add(1, "day")
        : type === "week"
          ? start.add(1, "week")
          : start.add(1, "month")

    return {
      type,
      bucketStart: start.toDate(),
      bucketEnd: end.toDate(),
      bucketStartLabel: start.format("YYYY-MM-DD"),
    }
  }
}
