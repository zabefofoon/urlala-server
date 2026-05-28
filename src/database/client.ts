import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const requiredEnv = (key: string): string => {
  const value = process.env[key]

  if (!value) throw new Error(`${key} is required.`)

  return value
}

export const databaseConfig = {
  host: requiredEnv("DB_HOST"),
  port: Number(process.env.DB_PORT ?? 5432),
  database: requiredEnv("DB_NAME"),
  username: requiredEnv("DB_USER"),
  password: requiredEnv("DB_PASSWORD"),
} as const

export const postgresClient = postgres({
  host: databaseConfig.host,
  port: databaseConfig.port,
  database: databaseConfig.database,
  username: databaseConfig.username,
  password: databaseConfig.password,
  ssl: "require",
  max: 5,
  prepare: false,
})

export const db = drizzle(postgresClient, { schema })
