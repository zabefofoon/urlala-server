import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

export const popularUrls = pgTable("popular_urls", {
  id: uuid("id").defaultRandom().primaryKey(),
  url: text("url").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type PopularUrls = typeof popularUrls.$inferSelect
export type NewPopularUrls = typeof popularUrls.$inferInsert

export const popularUrlStats = pgTable(
  "popular_url_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    popularUrlId: uuid("popular_url_id")
      .notNull()
      .references(() => popularUrls.id, { onDelete: "cascade" }),
    bucketType: text("bucket_type").notNull(),
    bucketStart: date("bucket_start").notNull(),
    clickCount: bigint("click_count", { mode: "number" }).notNull().default(0),
    saveCount: bigint("save_count", { mode: "number" }).notNull().default(0),
    likeCount: bigint("like_count", { mode: "number" }).notNull().default(0),
    commentCount: bigint("comment_count", { mode: "number" }).notNull().default(0),
    score: numeric("score", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "popular_url_stats_bucket_type_check",
      sql`${table.bucketType} in ('day', 'week', 'month')`
    ),
    unique("popular_url_stats_popular_url_id_bucket_type_bucket_start_key").on(
      table.popularUrlId,
      table.bucketType,
      table.bucketStart
    ),
    index("popular_url_stats_rank_idx").on(
      table.bucketType,
      table.bucketStart,
      table.score.desc(),
      table.saveCount.desc(),
      table.likeCount.desc(),
      table.commentCount.desc(),
      table.clickCount.desc()
    ),
  ]
)

export type PopularUrlStats = typeof popularUrlStats.$inferSelect
export type NewPopularUrlStats = typeof popularUrlStats.$inferInsert
