export function rollingMonthKeys(anchorDate: string, count = 12) {
  const [year, month] = anchorDate.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return [];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - count + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}
