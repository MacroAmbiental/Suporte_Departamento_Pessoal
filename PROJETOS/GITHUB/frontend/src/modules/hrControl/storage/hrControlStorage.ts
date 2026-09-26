import type { HrControlFiltersCache } from "@/modules/hrControl/types/hrControl";

export const hrControlFiltersStorageKey = "hr-control-filters-v1";

export function readHrControlFiltersCache(): Partial<HrControlFiltersCache> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(hrControlFiltersStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<HrControlFiltersCache>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeHrControlFiltersCache(value: HrControlFiltersCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(hrControlFiltersStorageKey, JSON.stringify(value));
  } catch {
    // Ignore storage write failures.
  }
}
