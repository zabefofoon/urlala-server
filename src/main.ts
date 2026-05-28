import { NestFactory } from "@nestjs/core"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { FastifyAdapter } from "@nestjs/platform-fastify"
import { AppModule } from "./app.module"

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())

  await app.listen({
    port: Number(process.env.PORT ?? 3004),
    host: "0.0.0.0",
  })
}

void bootstrap()
