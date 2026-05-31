export type CollectType = "view" | "like" | "save" | "comment"

export type MetricDeltas = Record<CollectType, number>

export interface SyncPopularUrlStatsResult {
  processed: number
  skipped: number
  locked: boolean
  batchLimit: number
}
