import type { CollectType } from "./types"

export const DIRTY_URLS_KEY = "dirty_urls"
export const SYNC_LOCK_KEY = "lock:popular_url_stats:sync"
export const CLEANUP_LOCK_KEY = "lock:popular_url_stats:cleanup"
export const SEOUL_TIMEZONE = "Asia/Seoul"
export const POPULARITY_SYNC_BATCH_LIMIT = 1000
export const POPULAR_URLS_CACHE_LIMIT = 20
export const POPULAR_URLS_CACHE_TTL_SECONDS = 60 * 10
export const POPULAR_BUCKET_TYPES = ["day", "week", "month"] as const

export const DELTA_KEYS: Record<CollectType, string> = {
  view: "url_view_delta",
  like: "url_like_delta",
  save: "url_save_delta",
  comment: "url_comment_delta",
}

export const REDIS_DELTA_KEYS = [
  DELTA_KEYS.view,
  DELTA_KEYS.like,
  DELTA_KEYS.save,
  DELTA_KEYS.comment,
] as const
