export function shiftMonthClamped(date: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, length)).padStart(2, "0")}`;
}

export function monthComparisonWindow(startDate: string, endDate: string) {
  const monthStart = `${endDate.slice(0, 7)}-01`;
  const currentStart = startDate > monthStart ? startDate : monthStart;
  return {
    currentStart,
    currentEnd: endDate,
    previousStart: shiftMonthClamped(currentStart, -1),
    previousEnd: shiftMonthClamped(endDate, -1),
  };
}

export function relativePercentChange(current: number, previous: number): number | null {
  return Number.isFinite(current) && Number.isFinite(previous) && previous > 0
    ? (current - previous) / previous * 100 : null;
}
