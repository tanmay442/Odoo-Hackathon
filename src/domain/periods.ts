export type PeriodInterval = 'daily' | 'weekly' | 'monthly' | 'yearly'

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

// Month and year steps clamp to the end of the target month, so a period
// starting Jan 31 rolls to Feb 28 rather than spilling into March.
export function addPeriod(start: Date, interval: PeriodInterval, count: number): Date {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('Period count must be a positive integer')
  switch (interval) {
    case 'daily':
      return new Date(start.getTime() + count * 86_400_000)
    case 'weekly':
      return new Date(start.getTime() + count * 7 * 86_400_000)
    case 'monthly': {
      const targetMonth = start.getUTCMonth() + count
      const year = start.getUTCFullYear() + Math.floor(targetMonth / 12)
      const month = ((targetMonth % 12) + 12) % 12
      const day = Math.min(start.getUTCDate(), daysInUtcMonth(year, month))
      return new Date(
        Date.UTC(
          year,
          month,
          day,
          start.getUTCHours(),
          start.getUTCMinutes(),
          start.getUTCSeconds(),
          start.getUTCMilliseconds(),
        ),
      )
    }
    case 'yearly': {
      const year = start.getUTCFullYear() + count
      const day = Math.min(start.getUTCDate(), daysInUtcMonth(year, start.getUTCMonth()))
      return new Date(
        Date.UTC(
          year,
          start.getUTCMonth(),
          day,
          start.getUTCHours(),
          start.getUTCMinutes(),
          start.getUTCSeconds(),
          start.getUTCMilliseconds(),
        ),
      )
    }
  }
}
