import { bigint, index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

export const popularUrls = pgTable("popular_urls", {
  id: uuid("id").defaultRandom().primaryKey(),
  url: text("url").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type PopularUrls = typeof popularUrls.$inferSelect
export type NewPopularUrls = typeof popularUrls.$inferInsert

export const popularUrlHourlyStats = pgTable(
  "popular_url_hourly_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    popularUrlId: uuid("popular_url_id")
      .notNull()
      .references(() => popularUrls.id, { onDelete: "cascade" }),
    bucketHour: timestamp("bucket_hour", { withTimezone: true }).notNull(),
    clickCount: bigint("click_count", { mode: "number" }).notNull().default(0),
    saveCount: bigint("save_count", { mode: "number" }).notNull().default(0),
    likeCount: bigint("like_count", { mode: "number" }).notNull().default(0),
    commentCount: bigint("comment_count", { mode: "number" }).notNull().default(0),
    score: numeric("score", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("popular_url_hourly_stats_popular_url_id_bucket_hour_key").on(
      table.popularUrlId,
      table.bucketHour
    ),
    index("popular_url_hourly_stats_bucket_hour_rank_idx").on(
      table.bucketHour,
      table.score.desc(),
      table.saveCount.desc(),
      table.likeCount.desc(),
      table.commentCount.desc(),
      table.clickCount.desc()
    ),
  ]
)

export type PopularUrlHourlyStats = typeof popularUrlHourlyStats.$inferSelect
export type NewPopularUrlHourlyStats = typeof popularUrlHourlyStats.$inferInsert
