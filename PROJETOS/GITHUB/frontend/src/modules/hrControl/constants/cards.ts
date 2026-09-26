import { absenceLabels, leaveReasons, licenseReasons } from "@/modules/hrControl/constants/absences";
import type { CardChoiceField, CardPreferences, CardSettings, MonthlyChartId, MonthlyChartPreferences, MonthlyChartSettings, SettingsCardId } from "@/modules/hrControl/types/hrControl";

export const cardIds: SettingsCardId[] = ["employees", "absences", "certificates", "combined", "dayOffs", "planned", "absenteeism", "loss"];
export const monthlyChartIds: MonthlyChartId[] = ["monthlyCount", "monthlyPercent"];

export const cardChoiceFields: CardChoiceField[] = ["kinds", "statuses", "types", "leaveReasons", "licenses", "dayOffDays", "plannedWeekdays"];

export const defaultCardSettings: CardSettings = Object.fromEntries(cardIds.map((id) => [id, {
  kinds: ["contract", "company", "diarist"],
  statuses: ["active", "leave"],
  totalSystem: false,
  types: id === "absences" ? ["confirmed"] : id === "certificates" ? ["certificate"]
    : id === "dayOffs" ? ["dayOff"] : ["confirmed", "certificate"],
  leaveReasons: [...leaveReasons, "Não especificado"],
  licenses: [...licenseReasons, "Não especificado"],
  dayOffDays: ["1", "2", "3", "4", "5"],
  plannedWeekdays: ["1", "2", "3", "4", "5"],
  absenteeismBase: "period",
}])) as CardSettings;

export const defaultMonthlyChartSettings: MonthlyChartSettings = Object.fromEntries(monthlyChartIds.map((id) => [id, {
  types: ["confirmed", "certificate"],
  leaveReasons: [...leaveReasons, "Não especificado"],
  licenses: [...licenseReasons, "Não especificado"],
  dayOffDays: ["1", "2", "3", "4", "5"],
}])) as MonthlyChartSettings;

export function sanitizeMonthlyChartSettings(value: unknown): MonthlyChartSettings {
  const source = value && typeof value === "object" ? value as Partial<MonthlyChartSettings> : {};
  return Object.fromEntries(monthlyChartIds.map((id) => {
    const item = source[id];
    const defaults = defaultMonthlyChartSettings[id];
    return [id, Object.fromEntries((Object.keys(defaults) as Array<keyof MonthlyChartPreferences>).map((key) => [
      key,
      Array.isArray(item?.[key])
        ? item[key].filter((entry): entry is string => typeof entry === "string" && (key !== "types" || entry in absenceLabels))
        : [...defaults[key]],
    ]))];
  })) as MonthlyChartSettings;
}

export function sanitizeCardSettings(value: unknown): CardSettings {
  const source = value && typeof value === "object" ? value as Partial<CardSettings> : {};
  return Object.fromEntries(cardIds.map((id) => {
    const item = source[id];
    const defaults = defaultCardSettings[id];
    const arrays = Object.fromEntries(cardChoiceFields.map((key) => [
      key,
      Array.isArray(item?.[key]) ? item[key].filter((entry): entry is string => typeof entry === "string") : [...defaults[key]],
    ]));
    return [id, {
      ...arrays,
      totalSystem: Boolean(item?.totalSystem ?? defaults.totalSystem),
      absenteeismBase: item?.absenteeismBase === "planned" || item?.absenteeismBase === "worked"
        ? item.absenteeismBase
        : "period",
    }];
  })) as CardSettings;
}
