import dayjs from "dayjs"
import isoWeek from "dayjs/plugin/isoWeek"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"
import { SEOUL_TIMEZONE } from "src/popularity/consts"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)

export default {
  seoulNow() {
    return dayjs().tz(SEOUL_TIMEZONE)
  },
}
