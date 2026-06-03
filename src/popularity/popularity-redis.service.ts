import { Injectable } from "@nestjs/common"
import { Redis } from "@upstash/redis"
import { randomUUID } from "node:crypto"
import {
  DELTA_KEYS,
  DIRTY_URLS_KEY,
  POPULAR_URLS_CACHE_TTL_SECONDS,
  REDIS_DELTA_KEYS,
} from "./consts"
import type { MetricDeltas, PopularBucketType, PopularUrl } from "./types"

const ACK_DELTAS_SCRIPT = `
local url = ARGV[1]
local remaining = 0

for i = 1, #KEYS - 1 do
  local delta = tonumber(ARGV[i + 1]) or 0

  if delta > 0 then
    redis.call("HINCRBY", KEYS[i], url, -delta)
  end

  local current = tonumber(redis.call("HGET", KEYS[i], url) or "0")

  if current <= 0 then
    redis.call("HDEL", KEYS[i], url)
  else
    remaining = remaining + current
  end
end

if remaining == 0 then
  redis.call("SREM", KEYS[#KEYS], url)
end

return remaining
`

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end

return 0
`

// Converts Redis values into non-negative integer deltas.
const toCount = (value: unknown): number => {
  const count = Number(value ?? 0)
  if (!Number.isFinite(count) || count <= 0) return 0
  return Math.trunc(count)
}

@Injectable()
export class PopularityRedisService {
  private readonly redis = Redis.fromEnv()

  // Runs a callback only when this process acquires the Redis lock, then releases it safely by token.
  async withLock<T>(
    key: string,
    ttlSeconds: number,
    callback: () => Promise<T>
  ): Promise<T | undefined> {
    const token = randomUUID()
    const acquired = await this.redis.set(key, token, { nx: true, ex: ttlSeconds })

    if (!acquired) return undefined

    try {
      return await callback()
    } finally {
      await this.redis.eval(RELEASE_LOCK_SCRIPT, [key], [token])
    }
  }

  // Returns at most limit dirty URLs without loading the entire Redis set.
  async getDirtyUrls(limit: number): Promise<string[]> {
    const urls = await this.redis.srandmember<string[] | string>(DIRTY_URLS_KEY, limit)

    if (!urls) return []
    if (Array.isArray(urls)) return urls

    return [urls]
  }

  // Reads all metric deltas for one URL from Redis hashes.
  async getUrlDeltas(url: string): Promise<MetricDeltas> {
    const [view, like, save, comment] = await this.redis
      .pipeline()
      .hget(DELTA_KEYS.view, url)
      .hget(DELTA_KEYS.like, url)
      .hget(DELTA_KEYS.save, url)
      .hget(DELTA_KEYS.comment, url)
      .exec()

    return {
      view: toCount(view),
      like: toCount(like),
      save: toCount(save),
      comment: toCount(comment),
    }
  }

  // Subtracts only the deltas already persisted to DB, preserving events that arrived during sync.
  async acknowledgeDeltas(url: string, deltas: MetricDeltas): Promise<void> {
    await this.redis.eval(
      ACK_DELTAS_SCRIPT,
      [...REDIS_DELTA_KEYS, DIRTY_URLS_KEY],
      [url, deltas.view, deltas.like, deltas.save, deltas.comment]
    )
  }

  async setPopularUrlsCache(
    type: PopularBucketType,
    limit: number,
    popularUrls: PopularUrl[]
  ): Promise<void> {
    await this.redis.set(`popular-urls:${type}:${limit}:v1`, popularUrls, {
      ex: POPULAR_URLS_CACHE_TTL_SECONDS,
    })
  }
}
