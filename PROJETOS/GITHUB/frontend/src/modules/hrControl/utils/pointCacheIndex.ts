import type { TimekeepingDayTable } from "@/types/domain";

export type PointCacheDay = { version: string; count: number };
export type PointCacheIndex = Record<string, PointCacheDay>;

export function pointManifestVersions(tables: TimekeepingDayTable[]) {
  const byDate = new Map<string, TimekeepingDayTable[]>();
  tables.forEach((table) => byDate.set(table.date, [...(byDate.get(table.date) || []), table]));
  return Object.fromEntries([...byDate.entries()].map(([date, items]) => [date,
    JSON.stringify(items.sort((a, b) => a.id.localeCompare(b.id)).map((item) => [
      item.id, item.updatedAt || item.savedAt || "", item.version || 0,
      item.recordCount || 0, [...(item.companyIds || [])].sort(),
    ])),
  ])) as Record<string, string>;
}

export function changedPointDates(versions: Record<string, string>, index: PointCacheIndex,
  counts: Record<string, number>, forcedDates: ReadonlySet<string> = new Set()) {
  return Object.keys(versions).filter((date) => forcedDates.has(date) ||
    index[date]?.version !== versions[date] || index[date]?.count !== (counts[date] || 0));
}
