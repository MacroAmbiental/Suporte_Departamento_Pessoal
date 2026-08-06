export function subtractDaysFromISODate(isoDate: string, daysToSubtract: number) {
  if (!isoDate) return "";

  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;

  date.setDate(date.getDate() - Math.max(0, daysToSubtract));

  return date.toISOString().slice(0, 10);
}
