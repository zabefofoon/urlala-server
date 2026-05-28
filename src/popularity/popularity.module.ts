import { Module } from "@nestjs/common"
import { PopularityRedisService } from "./popularity-redis.service"
import { PopularityRepository } from "./popularity.repository"
import { PopularityScheduler } from "./popularity.scheduler"
import { PopularityService } from "./popularity.service"

@Module({
  providers: [PopularityRedisService, PopularityRepository, PopularityService, PopularityScheduler],
})
export class PopularityModule {}
