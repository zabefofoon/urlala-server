import { Injectable, Logger } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import { SEOUL_TIMEZONE } from "./consts"
import { PopularityService } from "./popularity.service"

@Injectable()
export class PopularityScheduler {
  private readonly logger = new Logger(PopularityScheduler.name)

  constructor(private readonly popularityService: PopularityService) {}

  // Syncs Redis deltas into Postgres every 15 minutes.
  @Cron("0 */15 * * * *", {
    name: "handleEvery15Minutes",
    timeZone: SEOUL_TIMEZONE,
  })
  async handleEvery15Minutes(): Promise<void> {
    const result = await this.popularityService.syncPopularUrlStats()
    this.logger.log(`handleEvery15Minutes: ${JSON.stringify(result)}`)
  }

  // Cleans old period rows once per day after midnight in Seoul time.
  @Cron("15 0 * * *", {
    name: "handleEveryDays",
    timeZone: SEOUL_TIMEZONE,
  })
  async handleEveryDays(): Promise<void> {
    await this.popularityService.cleanupPopularUrlStats()
    this.logger.log("handleEveryDays")
  }
}
