export const DIARISTS_KEY = "macro_diarists_registry_v1";
export const WORK_DAYS_KEY = "macro_diarists_work_days_v1";

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

