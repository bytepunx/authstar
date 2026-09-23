export interface DateRangeInput {
  from: string
  to: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

// Guardrail from Story 002 / ADR 0036: "a maximum date range per query,
// well under `retentionMonths`, not merely capped at it." Returns an error
// message for a 400, or `null` if the range is acceptable.
export function validateDateRange(range: DateRangeInput, maxDays: number): string | null {
  const from = new Date(range.from)
  const to = new Date(range.to)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return 'dateRange.from/dateRange.to must be valid ISO-8601 date-times'
  }
  if (from.getTime() > to.getTime()) {
    return 'dateRange.from must not be after dateRange.to'
  }
  const spanDays = (to.getTime() - from.getTime()) / MS_PER_DAY
  if (spanDays > maxDays) {
    return `date range exceeds the maximum of ${maxDays} days`
  }
  return null
}
