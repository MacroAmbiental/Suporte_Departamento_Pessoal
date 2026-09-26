import { useEffect, useState } from "react";
import {
  asStringArray,
  isHrAnalysisScope,
  isHrView,
  isIsoDate,
  type HrAnalysisScope,
  type HrDetailFilterSets,
  type HrView,
  type MonitoringRiskFilter,
  readHrControlFiltersCache,
  writeHrControlFiltersCache,
} from "@/modules/hrControl/domain/hrControlModel";

export type UseHrControlFiltersArgs = {
  today: string;
  defaultStartDate: string;
};

export function useHrControlFilters({ today, defaultStartDate }: UseHrControlFiltersArgs) {
  const [cachedFilters] = useState(() => readHrControlFiltersCache());

  const [periodMode, setPeriodMode] = useState<"currentMonth" | "custom">(() =>
    cachedFilters.periodMode === "custom" ||
    (cachedFilters.periodMode !== "currentMonth" && isIsoDate(cachedFilters.startDate) && cachedFilters.startDate !== `${cachedFilters.startDate.slice(0, 4)}-01-01`)
      ? "custom" : "currentMonth");

  const [activeView, setActiveView] = useState<HrView>(() => isHrView(cachedFilters.activeView) ? cachedFilters.activeView : "general");
  const [startDate, setStartDate] = useState(() => periodMode === "custom" && isIsoDate(cachedFilters.startDate) ? cachedFilters.startDate : defaultStartDate);
  const [endDate, setEndDate] = useState(() => periodMode === "custom" && isIsoDate(cachedFilters.endDate) ? cachedFilters.endDate : today);
  const [analysisScope, setAnalysisScope] = useState<HrAnalysisScope>(() => isHrAnalysisScope(cachedFilters.analysisScope) ? cachedFilters.analysisScope : "group");
  const [selectedGroupId, setSelectedGroupId] = useState(() => String(cachedFilters.selectedGroupId || ""));
  const [companyIds, setCompanyIds] = useState<string[]>(() => asStringArray(cachedFilters.companyIds));
  const [teamIds, setTeamIds] = useState<string[]>(() => asStringArray(cachedFilters.teamIds));
  const [employeeIds, setEmployeeIds] = useState<string[]>(() => asStringArray(cachedFilters.employeeIds));
  const [functionKeys, setFunctionKeys] = useState<string[]>(() => asStringArray(cachedFilters.functionKeys));
  const [cpfValues, setCpfValues] = useState<string[]>(() => asStringArray(cachedFilters.cpfValues));
  const [departmentIds, setDepartmentIds] = useState<string[]>(() => asStringArray(cachedFilters.departmentIds));
  const [sectorIds, setSectorIds] = useState<string[]>(() => asStringArray(cachedFilters.sectorIds));
  const [subsectorIds, setSubsectorIds] = useState<string[]>(() => asStringArray(cachedFilters.subsectorIds));
  const [weekKey, setWeekKey] = useState(() => String(cachedFilters.weekKey || "all"));
  const [absenceTypeFilters, setAbsenceTypeFilters] = useState<string[]>(() => asStringArray(cachedFilters.absenceTypeFilters));
  const [cidCategoryFilters, setCidCategoryFilters] = useState<string[]>(() => asStringArray(cachedFilters.cidCategoryFilters));
  const [selectedCidLabel, setSelectedCidLabel] = useState(() => String(cachedFilters.selectedCidLabel || ""));
  const [monitoringPage, setMonitoringPage] = useState<number>(() => Math.max(1, Number(cachedFilters.monitoringPage) || 1));
  const [monitoringRiskFilter, setMonitoringRiskFilter] = useState<MonitoringRiskFilter>("all");

  useEffect(() => {
    writeHrControlFiltersCache({
      activeView,
      startDate,
      endDate,
      periodMode,
      analysisScope,
      selectedGroupId,
      companyIds,
      teamIds,
      employeeIds,
      functionKeys,
      cpfValues,
      departmentIds,
      sectorIds,
      subsectorIds,
      weekKey,
      absenceTypeFilters,
      cidCategoryFilters,
      selectedCidLabel,
      monitoringPage,
    });
  }, [
    absenceTypeFilters,
    activeView,
    analysisScope,
    cidCategoryFilters,
    companyIds,
    cpfValues,
    departmentIds,
    employeeIds,
    endDate,
    functionKeys,
    monitoringPage,
    periodMode,
    sectorIds,
    selectedCidLabel,
    selectedGroupId,
    startDate,
    subsectorIds,
    teamIds,
    weekKey,
  ]);

  return {
    periodMode,
    setPeriodMode,
    activeView,
    setActiveView,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    analysisScope,
    setAnalysisScope,
    selectedGroupId,
    setSelectedGroupId,
    companyIds,
    setCompanyIds,
    teamIds,
    setTeamIds,
    employeeIds,
    setEmployeeIds,
    functionKeys,
    setFunctionKeys,
    cpfValues,
    setCpfValues,
    departmentIds,
    setDepartmentIds,
    sectorIds,
    setSectorIds,
    subsectorIds,
    setSubsectorIds,
    weekKey,
    setWeekKey,
    absenceTypeFilters,
    setAbsenceTypeFilters,
    cidCategoryFilters,
    setCidCategoryFilters,
    selectedCidLabel,
    setSelectedCidLabel,
    monitoringPage,
    setMonitoringPage,
    monitoringRiskFilter,
    setMonitoringRiskFilter,
  };
}

export type HrControlFilterState = ReturnType<typeof useHrControlFilters>;
