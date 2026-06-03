export type CollectType = "view" | "like" | "save" | "comment"
export type PopularBucketType = "day" | "week" | "month"

export type MetricDeltas = Record<CollectType, number>

export interface PopularUrl {
  url: string
  score: number
  click_count: number
  save_count: number
  like_count: number
  comment_count: number
  bucket_type: PopularBucketType
  bucket_start: string
}

export interface PopularBucketWindow {
  type: PopularBucketType
  bucketStart: Date
  bucketEnd: Date
  bucketStartLabel: string
}

export interface SyncPopularUrlStatsResult {
  processed: number
  skipped: number
  locked: boolean
  batchLimit: number
  refreshedCacheTypes: PopularBucketType[]
}
