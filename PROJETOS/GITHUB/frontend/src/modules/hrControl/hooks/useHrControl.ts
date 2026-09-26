import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import { CalendarDays, ChartPie, Clock, DollarSign, FileText, HeartPulse, Stethoscope, Users } from "lucide-react";
import { firestore } from "@/services/firebase";
import {
  companyGroupForCompany as resolveCompanyGroupForCompany,
  dedupeStructureItems,
  primaryCompanyGroup,
  structureItemsForGroup,
} from "@/common/utils/groupStructure";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";
import { cidDetailsFromValue } from "@/modules/timekeeping/data/cidCatalog";
import { employeeEffectiveStatusForDate } from "@/modules/timekeeping/hooks/useTimekeepingModel";
import { subscribeTimeRecordsForDay } from "@/modules/timekeeping/data/timeRecordsRepository";
import { employeesWithElevenConfirmedAbsences } from "@/modules/hrControl/utils/absenteeismStreak";
import { rollingMonthKeys } from "@/modules/hrControl/utils/rollingMonths";
import { monthComparisonWindow, relativePercentChange, shiftMonthClamped } from "@/modules/hrControl/utils/monthComparison";
import { isEmployeeTerminated } from "@/modules/employees/utils/employeeStatus";
import { loadHrPointRange } from "@/modules/hrControl/utils/hrPointCache";
import { employeeMatchesBaseFilters } from "@/modules/hrControl/utils/employeeCardScope";
import { readHrSession, writeHrSession, isHrSessionFresh, type CachedRange } from "@/modules/hrControl/utils/hrSessionCache";
import type { CompanyGroup, Employee, TimekeepingColumn, TimekeepingDayTable, TimeRecord, WorkScheduleDay } from "@/types/domain";
import { formatDate } from "@/utils/format";
import {
  absenceStatuses,
  settingsColumnKey,
  defaultUsefulMinutesByWeekday,
  absenceTypeLabels,
  absenceTypeColors,
  cidPieColors,
  monitoringPageSize,
  type AbsenceType,
  type CardId,
  type CardPreferences,
  type CardSettings,
  type MonthlyChartId,
  type MonthlyChartPreferences,
  type MonthlyChartSettings,
  type HrView,
  type HrAnalysisScope,
  type MonitoringRiskFilter,
  type HrDetailFilterSets,
  type UnjustifiedAbsenceRun,
  type DualChartRow,
  type CidEmployeeEntry,
  type HrMetricTrend,
  sanitizeMonthlyChartSettings,
  sanitizeCardSettings,
  sortOptions,
  normalizeSearch,
  normalizeCpf,
  employeeFunctionLabel,
  parseLocalDate,
  toISODate,
  localTodayISO,
  monthStartISO,
  addDays,
  dateRange,
  countCalendarDaysBetween,
  countCalendarDaysInYear,
  weekStartISO,
  buildHrTimekeepingSettingsByCompanyId,
  settingsForCompany,
  weekOptionsForRange,
  monthKey,
  monthLabel,
  monthChartLabel,
  formatInteger,
  formatDecimal,
  formatCompact,
  formatCurrencyCompact,
  formatHours,
  formatPercent,
  overtimeHours,
  isAbsenceRecord,
  classifyAbsence,
  recordCompanyId,
  recordDepartmentId,
  recordSectorId,
  recordSubsectorId,
  recordFunctionKey,
  recordDayTeamId,
  recordDayTeamLabel,
  employeeMatchesDetailFilters,
  recordMatchesDetailFilters,
  savedDayMatchesCompany,
  savedDayMatchesCompanyId,
  absenceLossValue,
  tooltipText,
  cardRecordType,
  matchesCardRecord,
  employeeStatusForCard,
  matchesEmployeeKindSelection,
  countEmployeeRegistryMatches,
  microScreens,
  isHrView,
  isHrAnalysisScope,
  monitoringRiskMatches,
  isIsoDate,
  asStringArray,
  compareText,
  isUsefulSavedWorkday,
  type ClassifiedAbsence,
  type CidCategoryRow,
  type CidPieRow,
  type ChartRow,
  type MonthChartRow,
} from "@/modules/hrControl/domain/hrControlModel";
import { useHrControlFilters } from "@/modules/hrControl/hooks/useHrControlFilters";
import { useHrControlData } from "@/modules/hrControl/hooks/useHrControlData";

export function useHrControl() {

  const data = useDomainData();
  const { user } = useAuth();
  const [warmSession] = useState(() => readHrSession(user?.id));
  const sessionIsFresh = isHrSessionFresh(user?.id);
  const today = localTodayISO();
  const defaultStartDate = monthStartISO(today);
  const {
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
  } = useHrControlFilters({ today, defaultStartDate });
  const [sharedCardSettings, setSharedCardSettings] = useState<CardSettings>(() => sanitizeCardSettings(null));
  const [cardSettings, setCardSettings] = useState<CardSettings>(() => sanitizeCardSettings(null));
  const [sharedChartSettings, setSharedChartSettings] = useState<MonthlyChartSettings>(() => sanitizeMonthlyChartSettings(null));
  const [chartSettings, setChartSettings] = useState<MonthlyChartSettings>(() => sanitizeMonthlyChartSettings(null));
  const [editingChart, setEditingChart] = useState<MonthlyChartId | null>(null);
  const [draftChart, setDraftChart] = useState<MonthlyChartPreferences | null>(null);
  const [editingCard, setEditingCard] = useState<CardId | null>(null);
  const [draftCard, setDraftCard] = useState<CardPreferences | null>(null);
  const [plannedYear, setPlannedYear] = useState(() => Number(localTodayISO().slice(0, 4)));
  const [draftPlannedYear, setDraftPlannedYear] = useState(() => Number(localTodayISO().slice(0, 4)));
  const [savingShared, setSavingShared] = useState(false);
  const [sharedMessage, setSharedMessage] = useState("");
  const sharedLoaded = useRef(false);
  useEffect(() => {
    if (!firestore) return undefined;
    return onSnapshot(doc(firestore, "hrControlSettings", "sharedCards"), (snapshot) => {
      const next = sanitizeCardSettings(snapshot.data()?.cards);
      const nextCharts = sanitizeMonthlyChartSettings(snapshot.data()?.charts);
      setSharedCardSettings(next);
      setSharedChartSettings(nextCharts);
      // Do not replace a temporary view when another user edits the shared default.
      if (!sharedLoaded.current) { setCardSettings(next); setChartSettings(nextCharts); sharedLoaded.current = true; }
    }, (error) => { console.warn("Não foi possível carregar a visualização padrão.", error); });
  }, []);

  const [savedDayTables, setSavedDayTables] = useState<TimekeepingDayTable[]>(() => warmSession?.savedDayTables || []);
  const [savedDayTablesReady, setSavedDayTablesReady] = useState(Boolean(warmSession));
  const [savedDaysError, setSavedDaysError] = useState(false);
  const [annualSavedDayTables, setAnnualSavedDayTables] = useState<TimekeepingDayTable[]>(() => warmSession?.annualSavedDayTables || []);
  const [annualDaysStatus, setAnnualDaysStatus] = useState<"loading" | "ready" | "error">(warmSession?.annualLoadedYear === plannedYear ? "ready" : "loading");
  const [annualLoadedYear, setAnnualLoadedYear] = useState<number | null>(warmSession?.annualLoadedYear ?? null);
  const [savedDaysLoading, setSavedDaysLoading] = useState(!warmSession);
  useEffect(() => {
    if (warmSession && sessionIsFresh) {
      setSavedDayTables(warmSession.savedDayTables);
      setSavedDayTablesReady(true);
      setSavedDaysError(false);
      setSavedDaysLoading(false);
      return undefined;
    }

    setSavedDaysLoading(!savedDayTablesReady);
    if (!firestore) { setSavedDayTablesReady(false); setSavedDaysLoading(false); return undefined; }
    return onSnapshot(query(collection(firestore, "timekeepingDayTables"), orderBy("date", "desc"), limit(1000)),
      (snapshot) => {
        setSavedDayTables(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimekeepingDayTable));
        setSavedDayTablesReady(true);
        setSavedDaysError(false);
        setSavedDaysLoading(false);
      },
      (error) => {
        console.warn("Não foi possível acompanhar os dias de ponto salvos para o Controle RH.", error);
        setSavedDayTablesReady(false);
        setSavedDaysError(true);
        setSavedDaysLoading(false);
      });
  }, [sessionIsFresh, warmSession]);

  // One date-index query for the selected year, subscribed only while Controle RH
  // is open. This avoids the 1000-row cap of the historical point list and updates
  // the annual bounds when a point day is saved by another user.
  useEffect(() => {
    if (annualLoadedYear !== plannedYear) {
      setAnnualDaysStatus("loading");
      setAnnualSavedDayTables([]);
    }
    if (!firestore) { setAnnualDaysStatus("error"); return undefined; }
    return onSnapshot(query(
      collection(firestore, "timekeepingDayTables"),
      where("date", ">=", `${plannedYear}-01-01`),
      where("date", "<=", `${plannedYear}-12-31`),
    ), (snapshot) => {
      setAnnualSavedDayTables(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimekeepingDayTable));
      setAnnualLoadedYear(plannedYear);
      setAnnualDaysStatus("ready");
    }, (error) => {
      console.warn("Não foi possível consultar os dias de ponto salvos no ano.", error);
      setAnnualDaysStatus("error");
    });
  }, [plannedYear]);

  const [dataRevision, setDataRevision] = useState(0);
  const changedPointDatesRef = useRef<Set<string>>(new Set());
  const periodHandledRevision = useRef(0);
  const monthlyHandledRevision = useRef(0);
  const comparisonHandledRevision = useRef(0);
  const [startCalendarOpen, setStartCalendarOpen] = useState(false);
  const [endCalendarOpen, setEndCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => monthStartISO(startDate || today));
  const startCalendarRef = useRef<HTMLDivElement>(null);
  const endCalendarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!startCalendarOpen) return undefined;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!startCalendarRef.current?.contains(event.target as Node)) setStartCalendarOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStartCalendarOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [startCalendarOpen]);

  useEffect(() => {
    if (!endCalendarOpen) return undefined;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!endCalendarRef.current?.contains(event.target as Node)) setEndCalendarOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEndCalendarOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [endCalendarOpen]);

  const calendarDays = useMemo(() => {
    const first = parseLocalDate(calendarMonth);
    const firstVisible = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, index) => toISODate(addDays(firstVisible, index)));
  }, [calendarMonth]);

  useEffect(() => {
    const onTimekeepingUpdate = (event: Event) => {
      const dates = (event as CustomEvent<{ dates?: string[] }>).detail?.dates || [];
      changedPointDatesRef.current = new Set(dates.filter(isIsoDate));
      setDataRevision((revision) => revision + 1);
    };
    window.addEventListener("timekeeping-data-updated", onTimekeepingUpdate);
    return () => window.removeEventListener("timekeeping-data-updated", onTimekeepingUpdate);
  }, []);

  useEffect(() => {
    if (periodMode !== "currentMonth") return undefined;
    const updateCurrentMonth = () => {
      const current = localTodayISO();
      setStartDate((previous) => previous === monthStartISO(current) ? previous : monthStartISO(current));
      setEndDate((previous) => previous === current ? previous : current);
    };
    window.addEventListener("focus", updateCurrentMonth);
    document.addEventListener("visibilitychange", updateCurrentMonth);
    return () => {
      window.removeEventListener("focus", updateCurrentMonth);
      document.removeEventListener("visibilitychange", updateCurrentMonth);
    };
  }, [periodMode]);

  const teamById = useMemo(
    () => new Map(data.teams.map((team) => [team.id, team])),
    [data.teams],
  );
  const employeeById = useMemo(
    () => new Map(data.employees.map((employee) => [employee.id, employee])),
    [data.employees],
  );
  const groupOptions = useMemo(
    () => sortOptions(data.companyGroups
      .filter((group) => group.active !== false)
      .map((group) => ({ value: group.id, label: group.name }))),
    [data.companyGroups],
  );
  const defaultGroupId = useMemo(() => {
    const macroGroup = groupOptions.find((group) => {
      const name = normalizeSearch(group.label);
      return name.includes("grupo macro") || name.includes("macro");
    });
    return macroGroup?.value || groupOptions[0]?.value || "";
  }, [groupOptions]);
  const selectedGroupCompanyIds = useMemo(
    () => data.companyGroupCompanies
      .filter((relation) => relation.groupId === selectedGroupId)
      .map((relation) => relation.companyId),
    [data.companyGroupCompanies, selectedGroupId],
  );
  const selectedCompanyScopeIds = analysisScope === "group" ? selectedGroupCompanyIds : companyIds;
  const restrictCompanyScope = analysisScope === "group" ? Boolean(selectedGroupId) : true;
  const selectedCompanyIds = useMemo(() => new Set(selectedCompanyScopeIds), [selectedCompanyScopeIds]);
  const structureGroupsForScope = useMemo(() => {
    if (analysisScope === "group" && selectedGroupId) {
      return data.companyGroups.filter((group) => group.id === selectedGroupId && group.active !== false);
    }

    if (analysisScope === "company" && companyIds.length) {
      const byId = new Map<string, CompanyGroup>();
      companyIds.forEach((companyId) => {
        const group = resolveCompanyGroupForCompany(companyId, data.companyGroups, data.companyGroupCompanies)
          || primaryCompanyGroup(data.companyGroups, data.companyGroupCompanies);
        if (group) byId.set(group.id, group);
      });
      return Array.from(byId.values());
    }

    const primary = primaryCompanyGroup(data.companyGroups, data.companyGroupCompanies);
    return primary ? [primary] : [];
  }, [analysisScope, companyIds, data.companyGroupCompanies, data.companyGroups, selectedGroupId]);
  const structureDepartments = useMemo(() => dedupeStructureItems(
    structureGroupsForScope.flatMap((group) => structureItemsForGroup(
      data.departments,
      group,
      data.companyGroupCompanies,
      data.companies,
    )),
  ), [data.companies, data.companyGroupCompanies, data.departments, structureGroupsForScope]);
  const structureSectors = useMemo(() => dedupeStructureItems(
    structureGroupsForScope.flatMap((group) => structureItemsForGroup(
      data.sectors,
      group,
      data.companyGroupCompanies,
      data.companies,
    )),
  ), [data.companies, data.companyGroupCompanies, data.sectors, structureGroupsForScope]);
  const structureSubsectors = useMemo(() => dedupeStructureItems(
    structureGroupsForScope.flatMap((group) => structureItemsForGroup(
      data.subsectors,
      group,
      data.companyGroupCompanies,
      data.companies,
    )),
  ), [data.companies, data.companyGroupCompanies, data.subsectors, structureGroupsForScope]);
  const structureTeams = useMemo(() => dedupeStructureItems(
    structureGroupsForScope.flatMap((group) => structureItemsForGroup(
      data.teams,
      group,
      data.companyGroupCompanies,
      data.companies,
    )),
  ), [data.companies, data.companyGroupCompanies, data.teams, structureGroupsForScope]);
  const selectedTeamIds = useMemo(() => new Set(teamIds), [teamIds]);
  const selectedDepartmentIds = useMemo(() => new Set(departmentIds), [departmentIds]);
  const selectedSectorIds = useMemo(() => new Set(sectorIds), [sectorIds]);
  const selectedSubsectorIds = useMemo(() => new Set(subsectorIds), [subsectorIds]);
  const detailFilterSets = useMemo<HrDetailFilterSets>(() => ({
    employeeIds: new Set(employeeIds),
    functionKeys: new Set(functionKeys),
    cpfValues: new Set(cpfValues),
    departmentIds: selectedDepartmentIds,
    sectorIds: selectedSectorIds,
    subsectorIds: selectedSubsectorIds,
  }), [cpfValues, employeeIds, functionKeys, selectedDepartmentIds, selectedSectorIds, selectedSubsectorIds]);
  const selectedAbsenceTypes = useMemo(() => new Set(absenceTypeFilters), [absenceTypeFilters]);
  const selectedCidCategories = useMemo(() => new Set(cidCategoryFilters), [cidCategoryFilters]);
  const timekeepingSettingsByCompanyId = useMemo(
    () => buildHrTimekeepingSettingsByCompanyId(data.timekeepingColumns),
    [data.timekeepingColumns],
  );
  // A single calendar is shown per selected group/company. Dates marked as
  // holidays in any company within that scope are excluded only once.
  const annualHolidayDates = useMemo(() => {
    const companyIdsForCalendar = restrictCompanyScope
      ? Array.from(selectedCompanyIds)
      : data.companies.map((company) => company.id);
    const holidays = new Set<string>();
    if (!companyIdsForCalendar.length) {
      settingsForCompany("", timekeepingSettingsByCompanyId).holidays.forEach((date) => holidays.add(date));
    }
    companyIdsForCalendar.forEach((companyId) => {
      settingsForCompany(companyId, timekeepingSettingsByCompanyId).holidays.forEach((date) => holidays.add(date));
    });
    return holidays;
  }, [data.companies, restrictCompanyScope, selectedCompanyIds, timekeepingSettingsByCompanyId]);
  const annualPlannedDays = useMemo(
    () => countCalendarDaysInYear(plannedYear, cardSettings.planned.plannedWeekdays, annualHolidayDates),
    [annualHolidayDates, cardSettings.planned.plannedWeekdays, plannedYear],
  );
  const annualDaysReady = annualDaysStatus === "ready" && annualLoadedYear === plannedYear;
  const annualWorkedPeriod = useMemo(() => {
    const dates = Array.from(new Set(annualSavedDayTables
      .filter((table) => table.date?.startsWith(`${plannedYear}-`))
      .filter((table) => savedDayMatchesCompany(table, selectedCompanyIds, restrictCompanyScope))
      .map((table) => table.date))).sort();
    const first = dates[0] || "";
    const last = dates[dates.length - 1] || "";
    return { first, last, days: first && last
      ? countCalendarDaysBetween(first, last, cardSettings.planned.plannedWeekdays, annualHolidayDates) : 0 };
  }, [annualHolidayDates, annualSavedDayTables, cardSettings.planned.plannedWeekdays, plannedYear, restrictCompanyScope, selectedCompanyIds]);


  const invalidRange = Boolean(startDate && endDate && startDate > endDate);
  const weekOptions = useMemo(
    () => (invalidRange ? [] : weekOptionsForRange(startDate, endDate)),
    [endDate, invalidRange, startDate],
  );
  const activeDates = useMemo(
    () =>
      dateRange(startDate, endDate)
        .filter((date) => weekKey === "all" || weekStartISO(date) === weekKey),
    [endDate, startDate, weekKey],
  );
  const activeDateSet = useMemo(() => new Set(activeDates), [activeDates]);
  const activeSavedDayTables = useMemo(() => (
    savedDayTables
      .filter((table) => activeDateSet.has(table.date))
      .filter((table) => savedDayMatchesCompany(table, selectedCompanyIds, restrictCompanyScope))
  ), [activeDateSet, restrictCompanyScope, savedDayTables, selectedCompanyIds]);
  const savedDaySet = useMemo(() => new Set(activeSavedDayTables.map((table) => table.date)), [activeSavedDayTables]);
  const savedTablesByDate = useMemo(() => {
    const map = new Map<string, TimekeepingDayTable[]>();
    activeSavedDayTables.forEach((table) => {
      const current = map.get(table.date) || [];
      current.push(table);
      map.set(table.date, current);
    });
    return map;
  }, [activeSavedDayTables]);
  const savedActiveDates = useMemo(
    () => activeDates.filter((date) => savedDaySet.has(date)),
    [activeDates, savedDaySet],
  );

  const companyOptions = useMemo(
    () => sortOptions(data.companies.map((company) => ({ value: company.id, label: company.name }))),
    [data.companies],
  );
  const scopedEmployeesForOptions = useMemo(
    () => data.employees.filter((employee) => employeeMatchesBaseFilters(employee, selectedCompanyIds, restrictCompanyScope, selectedTeamIds, endDate, true)),
    [data.employees, endDate, restrictCompanyScope, selectedCompanyIds, selectedTeamIds],
  );
  const departmentOptions = useMemo(
    () =>
      sortOptions(
        structureDepartments
          .filter((department) => department.active !== false)
          .map((department) => ({ value: department.id, label: department.name })),
      ),
    [structureDepartments],
  );
  const sectorOptions = useMemo(
    () =>
      sortOptions(
        structureSectors
          .filter((sector) => sector.active !== false)
          .filter((sector) => !selectedDepartmentIds.size || selectedDepartmentIds.has(sector.departmentId))
          .map((sector) => ({ value: sector.id, label: sector.name })),
      ),
    [selectedDepartmentIds, structureSectors],
  );
  const subsectorOptions = useMemo(
    () =>
      sortOptions(
        structureSubsectors
          .filter((subsector) => subsector.active !== false)
          .filter((subsector) => !selectedDepartmentIds.size || selectedDepartmentIds.has(subsector.departmentId))
          .filter((subsector) => !selectedSectorIds.size || selectedSectorIds.has(subsector.sectorId))
          .map((subsector) => ({ value: subsector.id, label: subsector.name })),
      ),
    [selectedDepartmentIds, selectedSectorIds, structureSubsectors],
  );
  const functionOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    scopedEmployeesForOptions.forEach((employee) => {
      const label = employeeFunctionLabel(employee);
      const key = normalizeSearch(label);
      if (key && !byKey.has(key)) byKey.set(key, label);
    });
    return sortOptions(Array.from(byKey.entries()).map(([value, label]) => ({ value, label })));
  }, [scopedEmployeesForOptions]);
  const cpfOptions = useMemo(() => {
    const byCpf = new Map<string, string>();
    scopedEmployeesForOptions.forEach((employee) => {
      const label = employee.cpf?.trim() || "";
      const value = normalizeCpf(label);
      if (value && !byCpf.has(value)) byCpf.set(value, label);
    });
    return sortOptions(Array.from(byCpf.entries()).map(([value, label]) => ({ value, label })));
  }, [scopedEmployeesForOptions]);
  const employeeOptions = useMemo(
    () =>
      sortOptions(
        scopedEmployeesForOptions
          .filter((employee) => !selectedDepartmentIds.size || selectedDepartmentIds.has(employee.departmentId))
          .filter((employee) => !selectedSectorIds.size || selectedSectorIds.has(employee.sectorId))
          .filter((employee) => !selectedSubsectorIds.size || selectedSubsectorIds.has(employee.subsectorId || ""))
          .filter((employee) => !functionKeys.length || functionKeys.includes(normalizeSearch(employeeFunctionLabel(employee))))
          .filter((employee) => !cpfValues.length || cpfValues.includes(normalizeCpf(employee.cpf)))
          .map((employee) => ({ value: employee.id, label: employee.name })),
      ),
    [cpfValues, functionKeys, scopedEmployeesForOptions, selectedDepartmentIds, selectedSectorIds, selectedSubsectorIds],
  );
  const teamOptions = useMemo(
    () =>
      sortOptions(
        structureTeams
          .map((team) => ({ value: team.id, label: team.name })),
      ),
    [structureTeams],
  );
  const absenceTypeOptions = useMemo<Array<{ value: string; label: string }>>(
    () =>
      Object.entries(absenceTypeLabels as Record<string, string>).map(([value, label]) => ({
        value,
        label: String(label),
      })),
    [],
  );
  const availableTeamIds = useMemo(
    () => new Set(teamOptions.map((option) => option.value)),
    [teamOptions],
  );
  const availableEmployeeIds = useMemo(
    () => new Set(employeeOptions.map((option) => option.value)),
    [employeeOptions],
  );
  const availableFunctionKeys = useMemo(
    () => new Set(functionOptions.map((option) => option.value)),
    [functionOptions],
  );
  const availableCpfValues = useMemo(
    () => new Set(cpfOptions.map((option) => option.value)),
    [cpfOptions],
  );
  const availableDepartmentIds = useMemo(
    () => new Set(departmentOptions.map((option) => option.value)),
    [departmentOptions],
  );
  const availableSectorIds = useMemo(
    () => new Set(sectorOptions.map((option) => option.value)),
    [sectorOptions],
  );
  const availableSubsectorIds = useMemo(
    () => new Set(subsectorOptions.map((option) => option.value)),
    [subsectorOptions],
  );
  const hasActiveFilters = Boolean(
    analysisScope !== "group" ||
    (defaultGroupId ? selectedGroupId !== defaultGroupId : Boolean(selectedGroupId)) ||
    teamIds.length ||
    employeeIds.length ||
    functionKeys.length ||
    cpfValues.length ||
    departmentIds.length ||
    sectorIds.length ||
    subsectorIds.length ||
    weekKey !== "all" ||
    absenceTypeFilters.length ||
    cidCategoryFilters.length ||
    startDate !== monthStartISO(today) ||
    endDate !== today,
  );

  useEffect(() => {
    if (analysisScope !== "group") return;
    if (!groupOptions.length) {
      if (selectedGroupId) setSelectedGroupId("");
      return;
    }

    if (!selectedGroupId || !groupOptions.some((option) => option.value === selectedGroupId)) {
      setSelectedGroupId(defaultGroupId);
    }
  }, [analysisScope, defaultGroupId, groupOptions, selectedGroupId]);

  useEffect(() => {
    setTeamIds([]);
    setEmployeeIds([]);
    setFunctionKeys([]);
    setCpfValues([]);
    setDepartmentIds([]);
    setSectorIds([]);
    setSubsectorIds([]);
  }, [analysisScope, selectedGroupId, companyIds]);

  useEffect(() => {
    setTeamIds((current) => current.filter((teamId) => availableTeamIds.has(teamId)));
  }, [availableTeamIds]);

  useEffect(() => {
    setDepartmentIds((current) => current.filter((departmentId) => availableDepartmentIds.has(departmentId)));
  }, [availableDepartmentIds]);

  useEffect(() => {
    setSectorIds((current) => current.filter((sectorId) => availableSectorIds.has(sectorId)));
  }, [availableSectorIds]);

  useEffect(() => {
    setSubsectorIds((current) => current.filter((subsectorId) => availableSubsectorIds.has(subsectorId)));
  }, [availableSubsectorIds]);

  useEffect(() => {
    setFunctionKeys((current) => current.filter((functionKey) => availableFunctionKeys.has(functionKey)));
  }, [availableFunctionKeys]);

  useEffect(() => {
    setCpfValues((current) => current.filter((cpfValue) => availableCpfValues.has(cpfValue)));
  }, [availableCpfValues]);

  useEffect(() => {
    setEmployeeIds((current) => current.filter((employeeId) => availableEmployeeIds.has(employeeId)));
  }, [availableEmployeeIds]);

  useEffect(() => {
    if (weekKey !== "all" && !weekOptions.some((option) => option.value === weekKey)) {
      setWeekKey("all");
    }
  }, [weekKey, weekOptions]);

  useEffect(() => {
    if (activeView !== "absenceTypes") setAbsenceTypeFilters([]);
    if (activeView !== "cids") setCidCategoryFilters([]);
  }, [activeView]);

  useEffect(() => {
    if (warmSession && sessionIsFresh) {
      setSavedDayTables(warmSession.savedDayTables);
      setSavedDayTablesReady(true);
      setSavedDaysError(false);
      setSavedDaysLoading(false);
      return undefined;
    }

    setSavedDaysLoading(!savedDayTablesReady);
    if (!firestore) { setSavedDayTablesReady(false); setSavedDaysLoading(false); return undefined; }
    return onSnapshot(query(collection(firestore, "timekeepingDayTables"), orderBy("date", "desc"), limit(1000)),
      (snapshot) => {
        setSavedDayTables(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimekeepingDayTable));
        setSavedDayTablesReady(true);
        setSavedDaysError(false);
        setSavedDaysLoading(false);
      },
      (error) => {
        console.warn("Não foi possível acompanhar os dias de ponto salvos para o Controle RH.", error);
        setSavedDayTablesReady(false);
        setSavedDaysError(true);
        setSavedDaysLoading(false);
      });
  }, [sessionIsFresh, warmSession]);

  const customRangeActive = periodMode === "custom" && Boolean(startDate && endDate && startDate <= endDate);
  const monthAnchorDate = useMemo(() => customRangeActive ? endDate : savedDayTables.find((table) =>
    table.date <= today && savedDayMatchesCompany(table, selectedCompanyIds, restrictCompanyScope))?.date || today,
  [customRangeActive, endDate, restrictCompanyScope, savedDayTables, selectedCompanyIds, today]);
  const monthlyKeys = useMemo(() => {
    if (customRangeActive && startDate && endDate) {
      const months = new Set<string>();
      const cursor = new Date(`${startDate}T00:00:00`);
      const last = new Date(`${endDate}T00:00:00`);
      const monthCursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      while (monthCursor <= last) {
        months.add(`${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`);
        monthCursor.setMonth(monthCursor.getMonth() + 1);
      }
      return Array.from(months);
    }
    return rollingMonthKeys(monthAnchorDate);
  }, [customRangeActive, endDate, monthAnchorDate, startDate]);
  const firstMonthlyKey = monthlyKeys[0] || monthKey(monthAnchorDate);
  const lastMonthlyKey = monthlyKeys[monthlyKeys.length - 1] || monthKey(monthAnchorDate);
  const monthlyStartDate = customRangeActive && startDate ? startDate : `${firstMonthlyKey}-01`;
  const monthlyRangeKey = `${user?.id || ""}:${monthlyStartDate}:${monthAnchorDate}`;
  const comparisonWindow = useMemo(() => monthComparisonWindow(startDate, endDate), [startDate, endDate]);
  const comparisonUsesMonthlyRange = comparisonWindow.previousStart >= monthlyStartDate &&
    comparisonWindow.previousStart <= monthAnchorDate;
  const comparisonRangeKey = `${user?.id || ""}:${comparisonWindow.previousStart}:${comparisonWindow.currentEnd}`;
  const dataState = useHrControlData({
    userId: user?.id,
    savedDayTablesReady,
    savedDayTables,
    startDate,
    endDate,
    monthAnchorDate,
    monthlyStartDate,
    comparisonWindow,
    monthlyRangeKey,
    comparisonRangeKey,
    activeView,
    warmSession,
    sessionIsFresh,
    dataRevision,
    changedPointDatesRef,
  });
  const {
    records,
    setRecords,
    recordsLoading,
    setRecordsLoading,
    loadedRecordsKey,
    setLoadedRecordsKey,
    recordsError,
    setRecordsError,
    monthlySavedDayTables,
    setMonthlySavedDayTables,
    monthlySavedDaysStatus,
    setMonthlySavedDaysStatus,
    monthlySavedDaysKey,
    setMonthlySavedDaysKey,
    monthlyRangeData,
    setMonthlyRangeData,
    comparisonSavedDayTables,
    setComparisonSavedDayTables,
    comparisonSavedDaysStatus,
    setComparisonSavedDaysStatus,
    comparisonSavedDaysKey,
    setComparisonSavedDaysKey,
    comparisonRangeData,
    setComparisonRangeData,
    streakPointData,
    setStreakPointData,
    periodRangeKey,
  } = dataState;

  const baseFilteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const employee = employeeById.get(record.employeeId);
        const companyId = recordCompanyId(record, employee);
        const savedForCompany = (savedTablesByDate.get(record.date) || [])
          .some((table) => savedDayMatchesCompanyId(table, companyId));
        const teamId = recordDayTeamId(record, employee);
        return (
          savedForCompany &&
          (!restrictCompanyScope || selectedCompanyIds.has(companyId)) &&
          (!selectedTeamIds.size || selectedTeamIds.has(teamId)) &&
          recordMatchesDetailFilters(record, employee, detailFilterSets) &&
          (weekKey === "all" || weekStartISO(record.date) === weekKey)
        );
      }),
    [detailFilterSets, employeeById, records, restrictCompanyScope, savedTablesByDate, selectedCompanyIds, selectedTeamIds, weekKey],
  );

  const classifiedRecords = useMemo(
    () =>
      baseFilteredRecords
        .map((record) => ({ record, classification: classifyAbsence(record) }))
        .filter((entry): entry is { record: TimeRecord; classification: ClassifiedAbsence } => Boolean(entry.classification)),
    [baseFilteredRecords],
  );
  const absenceTypeRecords = useMemo(
    () =>
      classifiedRecords.filter((entry) =>
        !selectedAbsenceTypes.size || selectedAbsenceTypes.has(entry.classification.type),
      ),
    [classifiedRecords, selectedAbsenceTypes],
  );

  const baseEmployees = useMemo(() => {
    const employees = data.employees.filter((employee) =>
      employeeMatchesBaseFilters(employee, selectedCompanyIds, restrictCompanyScope, selectedTeamIds, endDate) &&
      employeeMatchesDetailFilters(employee, detailFilterSets),
    );
    const byId = new Map(employees.map((employee) => [employee.id, employee]));

    if (selectedTeamIds.size) {
      baseFilteredRecords.forEach((record) => {
        const employee = employeeById.get(record.employeeId);
        if (employee && !byId.has(employee.id)) byId.set(employee.id, employee);
      });
    }

    return Array.from(byId.values());
  }, [baseFilteredRecords, data.employees, detailFilterSets, employeeById, endDate, restrictCompanyScope, selectedCompanyIds, selectedTeamIds]);
  // Unlike absence denominators, the employee card can explicitly include
  // terminated staff. Apply its status choice after company/team/date filtering.
  const employeeCardCandidates = useMemo(() => {
    const byId = new Map(data.employees
      .filter((employee) => employeeMatchesBaseFilters(employee, selectedCompanyIds, restrictCompanyScope, selectedTeamIds, endDate, true) &&
        employeeMatchesDetailFilters(employee, detailFilterSets))
      .map((employee) => [employee.id, employee]));
    baseEmployees.forEach((employee) => byId.set(employee.id, employee));
    return Array.from(byId.values());
  }, [baseEmployees, data.employees, detailFilterSets, endDate, restrictCompanyScope, selectedCompanyIds, selectedTeamIds]);
  const employeeRegistrySource = useMemo(() =>
    data.employees.filter((employee) => !isEmployeeTerminated(employee)),
    [data.employees],
  );

  const monthlySavedTablesByDate = useMemo(() => {
    const map = new Map<string, TimekeepingDayTable[]>();
    monthlySavedDayTables
      .filter((table) => savedDayMatchesCompany(table, selectedCompanyIds, restrictCompanyScope))
      .forEach((table) => map.set(table.date, [...(map.get(table.date) || []), table]));
    return map;
  }, [monthlySavedDayTables, restrictCompanyScope, selectedCompanyIds]);
  const monthlyFilteredRecords = useMemo(() => monthlyRangeData.records.filter((record) => {
    if (record.date < monthlyStartDate || record.date > monthAnchorDate) return false;
    const employee = employeeById.get(record.employeeId);
    const companyId = recordCompanyId(record, employee);
    return (monthlySavedTablesByDate.get(record.date) || []).some((table) => savedDayMatchesCompanyId(table, companyId)) &&
      (!restrictCompanyScope || selectedCompanyIds.has(companyId)) &&
      (!selectedTeamIds.size || selectedTeamIds.has(recordDayTeamId(record, employee))) &&
      recordMatchesDetailFilters(record, employee, detailFilterSets);
  }), [detailFilterSets, employeeById, monthAnchorDate, monthlyRangeData.records, monthlySavedTablesByDate,
    monthlyStartDate, restrictCompanyScope, selectedCompanyIds, selectedTeamIds]);
  const monthlyChartsReady = monthlyRangeData.status === "ready" && monthlyRangeData.key === monthlyRangeKey &&
    monthlySavedDaysStatus === "ready" && monthlySavedDaysKey === monthlyRangeKey;
  const comparisonReady = comparisonUsesMonthlyRange ? monthlyChartsReady
    : comparisonSavedDaysStatus === "ready" && comparisonSavedDaysKey === comparisonRangeKey &&
      comparisonRangeData.status === "ready" && comparisonRangeData.key === comparisonRangeKey;
  const comparisonDayTablesScoped = useMemo(() =>
    (comparisonUsesMonthlyRange ? monthlySavedDayTables : comparisonSavedDayTables)
      .filter((table) => table.date >= comparisonWindow.previousStart && table.date <= comparisonWindow.currentEnd)
      .filter((table) => savedDayMatchesCompany(table, selectedCompanyIds, restrictCompanyScope)),
  [comparisonUsesMonthlyRange, monthlySavedDayTables, comparisonSavedDayTables, comparisonWindow.previousStart,
    comparisonWindow.currentEnd, restrictCompanyScope, selectedCompanyIds]);
  const comparisonFilteredRecords = useMemo(() => {
    if (comparisonUsesMonthlyRange) return monthlyFilteredRecords.filter((record) =>
      record.date >= comparisonWindow.previousStart && record.date <= comparisonWindow.currentEnd);
    const manifests = new Map<string, TimekeepingDayTable[]>();
    comparisonDayTablesScoped.forEach((table) => manifests.set(table.date, [...(manifests.get(table.date) || []), table]));
    return comparisonRangeData.records.filter((record) => {
      const employee = employeeById.get(record.employeeId);
      const companyId = recordCompanyId(record, employee);
      return record.date >= comparisonWindow.previousStart && record.date <= comparisonWindow.currentEnd &&
        (manifests.get(record.date) || []).some((table) => savedDayMatchesCompanyId(table, companyId)) &&
        (!restrictCompanyScope || selectedCompanyIds.has(companyId)) &&
        (!selectedTeamIds.size || selectedTeamIds.has(recordDayTeamId(record, employee))) &&
        recordMatchesDetailFilters(record, employee, detailFilterSets);
    });
  }, [comparisonUsesMonthlyRange, monthlyFilteredRecords, comparisonWindow.previousStart,
    comparisonWindow.currentEnd, comparisonDayTablesScoped, comparisonRangeData.records, employeeById,
    restrictCompanyScope, selectedCompanyIds, selectedTeamIds, detailFilterSets]);
  const monthlyEmployees = useMemo(() => {
    const byId = new Map(data.employees
      .filter((employee) => employeeMatchesBaseFilters(employee, selectedCompanyIds, restrictCompanyScope, selectedTeamIds, monthAnchorDate) &&
        employeeMatchesDetailFilters(employee, detailFilterSets))
      .map((employee) => [employee.id, employee]));
    if (selectedTeamIds.size) monthlyFilteredRecords.forEach((record) => {
      const employee = employeeById.get(record.employeeId);
      if (employee) byId.set(employee.id, employee);
    });
    return Array.from(byId.values());
  }, [data.employees, detailFilterSets, employeeById, monthAnchorDate, monthlyFilteredRecords,
    restrictCompanyScope, selectedCompanyIds, selectedTeamIds]);

  const isMonitoringView = activeView === "absenceMonitoring";
  const monitoringReferenceDate = useMemo(() => {
    const savedDates = [...savedDayTables, ...annualSavedDayTables]
      .map((table) => table.date)
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left));
    return savedDates[0] || endDate;
  }, [annualSavedDayTables, endDate, savedDayTables]);

  // A sequência é apurada somente quando a aba de monitoramento estiver aberta,
  // para evitar que a tela inteira fique bloqueada por listeners de todos os dias
  // salvos da empresa.
  const streakDatesByEmployee = useMemo(() => {
    if (!isMonitoringView) return new Map<string, string[]>();
    const tables = [...savedDayTables, ...annualSavedDayTables].sort((left, right) => right.date.localeCompare(left.date));
    const byEmployee = new Map<string, string[]>();
    baseEmployees.forEach((employee) => {
      const dates: string[] = [];
      const seen = new Set<string>();
      for (const table of tables) {
        if (employee.admissionDate && table.date < employee.admissionDate) break;
        if (seen.has(table.date) || !savedDayMatchesCompanyId(table, employee.companyId) ||
          !isUsefulSavedWorkday(employee, table.date, timekeepingSettingsByCompanyId)) continue;
        seen.add(table.date);
        dates.push(table.date);
        if (dates.length === 11) break;
      }
      if (dates.length === 11) byEmployee.set(employee.id, dates);
    });
    return byEmployee;
  }, [annualSavedDayTables, baseEmployees, isMonitoringView, savedDayTables, timekeepingSettingsByCompanyId]);
  const streakDates = useMemo(() =>
    isMonitoringView ? Array.from(new Set(Array.from(streakDatesByEmployee.values()).flat())).sort() : [],
  [isMonitoringView, streakDatesByEmployee]);
  const streakDatesKey = streakDates.join(",");
  useEffect(() => {
    if (!savedDayTablesReady || !isMonitoringView) return undefined;
    if (streakPointData.key !== streakDatesKey || streakPointData.status !== "ready") {
      setStreakPointData({ key: streakDatesKey, status: streakDates.length ? "loading" : "ready", records: [] });
    }
    if (!streakDates.length) return undefined;
    const byDate = new Map<string, TimeRecord[]>();
    let failed = false;
    const unsubscribers = streakDates.map((date) => subscribeTimeRecordsForDay(date, (records) => {
      if (failed) return;
      byDate.set(date, records);
      if (byDate.size === streakDates.length) {
        setStreakPointData({ key: streakDatesKey, status: "ready", records: Array.from(byDate.values()).flat() });
      }
    }, (error) => {
      console.warn("Não foi possível acompanhar os pontos usados na sequência de faltas.", error);
      failed = true;
      setStreakPointData({ key: streakDatesKey, status: "error", records: [] });
    }));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [isMonitoringView, savedDayTablesReady, streakDatesKey, streakDates, streakPointData.key, streakPointData.status]);
  const excludedFromAbsenteeism = useMemo(() => {
    if (!savedDayTablesReady || !isMonitoringView || streakPointData.status !== "ready" || streakPointData.key !== streakDatesKey) return new Set<string>();
    return employeesWithElevenConfirmedAbsences(streakDatesByEmployee, streakPointData.records);
  }, [isMonitoringView, savedDayTablesReady, streakDatesByEmployee, streakDatesKey, streakPointData]);
  const absenteeismStreakReady = savedDayTablesReady && isMonitoringView && streakPointData.status === "ready" && streakPointData.key === streakDatesKey;

  const recordByEmployeeDate = useMemo(() => {
    const map = new Map<string, TimeRecord>();
    baseFilteredRecords.forEach((record) => {
      map.set(`${record.employeeId}:${record.date}`, record);
    });
    return map;
  }, [baseFilteredRecords]);

  // O monitoramento deve refletir apenas quem ainda integra a folha de ponto
  // na data final consultada. Registros históricos de desligados são mantidos
  // para os demais indicadores, mas não geram alerta de ausência consecutiva.
  const activeMonitoringEmployeeIds = useMemo(
    () => new Set(
      data.employees
        .filter((employee) => employeeEffectiveStatusForDate(employee, monitoringReferenceDate) === "active")
        .map((employee) => employee.id),
    ),
    [data.employees, monitoringReferenceDate],
  );

  const expectedWorkDays = useMemo(() => {
    const byTeam = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const byEmployee = new Map<string, number>();
    const savedUsefulDates = new Set<string>();
    let total = 0;

    baseEmployees.forEach((employee) => {
      activeDates.forEach((date) => {
        if (employee.admissionDate && employee.admissionDate > date) return;
        if (!isUsefulSavedWorkday(employee, date, timekeepingSettingsByCompanyId)) return;

        const record = recordByEmployeeDate.get(`${employee.id}:${date}`);
        const teamId = record ? recordDayTeamId(record, employee) : employee.teamId || "";
        if (selectedTeamIds.size && !selectedTeamIds.has(teamId)) return;

        const teamLabel = record
          ? recordDayTeamLabel(record, employee, teamById)
          : teamById.get(teamId)?.name || "Sem equipe";
        const month = monthKey(date);
        total += 1;
        byEmployee.set(employee.id, (byEmployee.get(employee.id) || 0) + 1);
        savedUsefulDates.add(date);
        byTeam.set(teamLabel, (byTeam.get(teamLabel) || 0) + 1);
        byMonth.set(month, (byMonth.get(month) || 0) + 1);
      });
    });

    return { total, savedUsefulDateCount: savedUsefulDates.size, byTeam, byMonth, byEmployee };
  }, [
    activeDates,
    baseEmployees,
    recordByEmployeeDate,
    selectedTeamIds,
    teamById,
    timekeepingSettingsByCompanyId,
  ]);

  const unjustifiedAbsenceRuns = useMemo<UnjustifiedAbsenceRun[]>(() => {
    const statusByEmployeeDate = new Map<string, string>();
    records.forEach((record) => {
      if (record.date > monitoringReferenceDate) return;
      if (!activeMonitoringEmployeeIds.has(record.employeeId)) return;
      const employee = employeeById.get(record.employeeId);
      if (!employee || !isUsefulSavedWorkday(employee, record.date, timekeepingSettingsByCompanyId)) return;
      statusByEmployeeDate.set(`${record.employeeId}:${record.date}`, record.status);
    });

    const runs: UnjustifiedAbsenceRun[] = [];
    activeMonitoringEmployeeIds.forEach((employeeId) => {
      const dates = Array.from(new Set(
        Array.from(statusByEmployeeDate.keys())
          .filter((key) => key.startsWith(`${employeeId}:`))
          .map((key) => key.slice(employeeId.length + 1))
          .filter(Boolean),
      )).sort().reverse();

      if (!dates.length) return;
      const latestDate = dates[0];
      const latestStatus = statusByEmployeeDate.get(`${employeeId}:${latestDate}`);
      if (latestStatus !== "absence_confirmed") return;

      let streak = 0;
      const confirmedDates: string[] = [];
      for (const date of dates) {
        const status = statusByEmployeeDate.get(`${employeeId}:${date}`);
        if (status === "absence_confirmed") {
          streak += 1;
          confirmedDates.push(date);
          continue;
        }
        break;
      }

      if (streak > 0) {
        const runStartDate = confirmedDates[confirmedDates.length - 1];
        const runEndDate = confirmedDates[0];
        runs.push({
          employeeId,
          employeeName: employeeById.get(employeeId)?.name || "Funcionário removido",
          startDate: runStartDate,
          endDate: runEndDate,
          days: streak,
          recurringAbsencesInMonth: streak,
        });
      }
    });

    return runs.sort((left, right) => right.days - left.days || compareText(left.employeeName, right.employeeName));
  }, [activeMonitoringEmployeeIds, employeeById, monitoringReferenceDate, records, timekeepingSettingsByCompanyId]);

  const filteredMonitoringRuns = useMemo(
    () => unjustifiedAbsenceRuns.filter((run) => monitoringRiskMatches(run, monitoringRiskFilter)),
    [monitoringRiskFilter, unjustifiedAbsenceRuns],
  );

  const absenceMonitoringChartRows = useMemo<ChartRow[]>(
    () => filteredMonitoringRuns.slice(0, 20).map((run) => ({
      label: run.employeeName,
      value: run.days,
      detail: `${formatDate(run.startDate)} a ${formatDate(run.endDate)}`,
      color: run.days >= 30 ? "#d94f5c" : run.days >= 10 ? "#d59a22" : "#ec6b35",
    })),
    [filteredMonitoringRuns],
  );

  const absenceMonitoringPieRows = useMemo<ChartRow[]>(() => [
    { label: "Recorrência: 3 a 9 dias", value: filteredMonitoringRuns.filter((run) => run.days >= 3 && run.days < 10).length, color: "#ec6b35" },
    { label: "Alerta: 10 a 29 dias", value: filteredMonitoringRuns.filter((run) => run.days >= 10 && run.days < 30).length, color: "#d59a22" },
    { label: "Abandono: 30+ dias", value: filteredMonitoringRuns.filter((run) => run.days >= 30).length, color: "#d94f5c" },
  ], [filteredMonitoringRuns]);

  const monitoringTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredMonitoringRuns.length / monitoringPageSize)),
    [filteredMonitoringRuns.length],
  );
  const monitoringCurrentPage = Math.min(monitoringPage, monitoringTotalPages);
  const monitoringFirstItem = (monitoringCurrentPage - 1) * monitoringPageSize;
  const monitoringVisibleRuns = useMemo(
    () => filteredMonitoringRuns.slice(monitoringFirstItem, monitoringFirstItem + monitoringPageSize),
    [filteredMonitoringRuns, monitoringFirstItem],
  );
  const monitoringFromItem = filteredMonitoringRuns.length ? monitoringFirstItem + 1 : 0;
  const monitoringToItem = filteredMonitoringRuns.length
    ? Math.min(monitoringFirstItem + monitoringVisibleRuns.length, filteredMonitoringRuns.length)
    : 0;

  useEffect(() => {
    if (monitoringPage !== monitoringCurrentPage) {
      setMonitoringPage(monitoringCurrentPage);
    }
  }, [monitoringCurrentPage, monitoringPage]);

  function toggleMonitoringRiskFilter(filter: Exclude<MonitoringRiskFilter, "all">) {
    setMonitoringRiskFilter((current) => current === filter ? "all" : filter);
    setMonitoringPage(1);
  }

  const overtimeByTeam = useMemo<ChartRow[]>(() => {
    const totals = new Map<string, number>();

    baseFilteredRecords.forEach((record) => {
      const hours = overtimeHours(record);
      if (hours <= 0) return;
      const employee = employeeById.get(record.employeeId);
      const label = recordDayTeamLabel(record, employee, teamById);
      totals.set(label, (totals.get(label) || 0) + hours);
    });

    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value, color: "#b9ee93" }))
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label))
      .slice(0, 36);
  }, [baseFilteredRecords, employeeById, teamById]);

  const overtimeByMonth = useMemo<ChartRow[]>(() => {
    const totals = new Map<string, number>();
    const monthKeys = new Set<string>();

    const rangeStart = customRangeActive && startDate ? startDate.slice(0, 7) : monthAnchorDate.slice(0, 7);
    const rangeEnd = customRangeActive && endDate ? endDate.slice(0, 7) : monthAnchorDate.slice(0, 7);
    const monthCursor = new Date(`${rangeStart}-01T00:00:00`);
    const monthStop = new Date(`${rangeEnd}-01T00:00:00`);

    while (monthCursor <= monthStop) {
      const key = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`;
      totals.set(key, 0);
      monthKeys.add(key);
      monthCursor.setMonth(monthCursor.getMonth() + 1);
    }

    savedDayTables
      .filter((table) => savedDayMatchesCompany(table, selectedCompanyIds, restrictCompanyScope))
      .map((table) => monthKey(table.date))
      .forEach((key) => {
        if (!monthKeys.has(key)) monthKeys.add(key);
        if (!totals.has(key)) totals.set(key, 0);
      });

    baseFilteredRecords.forEach((record) => {
      const hours = overtimeHours(record);
      if (hours <= 0) return;
      const key = monthKey(record.date);
      totals.set(key, (totals.get(key) || 0) + hours);
      monthKeys.add(key);
    });

    return Array.from(monthKeys)
      .sort((left, right) => left.localeCompare(right))
      .slice(-12)
      .map((key) => ({ label: monthLabel(key), value: totals.get(key) || 0, color: "#1f95ed" }));
  }, [baseFilteredRecords, customRangeActive, endDate, monthAnchorDate, restrictCompanyScope, savedDayTables, selectedCompanyIds, startDate]);

  const teamAbsenceRows = useMemo<ChartRow[]>(() => {
    const totals = new Map<string, number>();

    classifiedRecords.forEach(({ record }) => {
      const employee = employeeById.get(record.employeeId);
      const label = recordDayTeamLabel(record, employee, teamById);
      totals.set(label, (totals.get(label) || 0) + 1);
    });

    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value, color: "#59e4a2" }))
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label))
      .slice(0, 20);
  }, [classifiedRecords, employeeById, teamById]);

  const teamAbsencePercentRows = useMemo<ChartRow[]>(() => {
    const missedByTeam = new Map<string, number>();

    classifiedRecords.forEach(({ record }) => {
      const employee = employeeById.get(record.employeeId);
      const label = recordDayTeamLabel(record, employee, teamById);
      missedByTeam.set(label, (missedByTeam.get(label) || 0) + 1);
    });

    const labels = new Set([...missedByTeam.keys(), ...expectedWorkDays.byTeam.keys()]);
    return Array.from(labels)
      .map((label) => {
        const missed = missedByTeam.get(label) || 0;
        const worked = expectedWorkDays.byTeam.get(label) || 0;
        return {
        label,
        value: worked ? (missed / worked) * 100 : 0,
        detail: `${formatInteger(missed)} falta(s) + atestado(s) / ${formatInteger(worked)} dia(s) previsto(s)`,
        color: "#1f95ed",
        };
      })
      .filter((row) => row.value > 0)
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label))
      .slice(0, 20);
  }, [classifiedRecords, employeeById, expectedWorkDays, teamById]);

  const monthlyExpectedDaysByMonth = useMemo(() => {
    const totals = new Map<string, number>();
    const recordsByEmployeeDate = new Map(monthlyFilteredRecords.map((record) => [`${record.employeeId}:${record.date}`, record]));
    const dates = dateRange(monthlyStartDate, monthAnchorDate);
    monthlyEmployees.forEach((employee) => dates.forEach((date) => {
      if (employee.admissionDate && employee.admissionDate > date) return;
      if (!isUsefulSavedWorkday(employee, date, timekeepingSettingsByCompanyId)) return;
      const record = recordsByEmployeeDate.get(`${employee.id}:${date}`);
      const teamId = record ? recordDayTeamId(record, employee) : employee.teamId || "";
      if (selectedTeamIds.size && !selectedTeamIds.has(teamId)) return;
      const key = monthKey(date);
      totals.set(key, (totals.get(key) || 0) + 1);
    }));
    return totals;
  }, [monthAnchorDate, monthlyEmployees, monthlyFilteredRecords, monthlyStartDate, selectedTeamIds, timekeepingSettingsByCompanyId]);

  const buildMonthlyRows = (settings: MonthlyChartPreferences): MonthChartRow[] => {
    const months = new Map(monthlyKeys.map((key) => [key, {
      key, label: monthChartLabel(key), byType: {} as Record<string, number>,
      missedDays: 0, workedDays: monthlyExpectedDaysByMonth.get(key) || 0, percent: 0,
    }]));
    monthlyFilteredRecords.forEach((record) => {
      if (!matchesCardRecord(record, settings)) return;
      const type = cardRecordType(record);
      const row = months.get(monthKey(record.date));
      if (row && type) row.byType[type] = (row.byType[type] || 0) + 1;
    });
    return Array.from(months.values()).map((row) => {
      const missedDays = Object.values(row.byType).reduce((sum, count) => sum + count, 0);
      return { ...row, missedDays, percent: row.workedDays ? missedDays / row.workedDays * 100 : 0 };
    });
  };
  const monthlyCountRows = useMemo(() => buildMonthlyRows(chartSettings.monthlyCount),
    [chartSettings.monthlyCount, monthlyExpectedDaysByMonth, monthlyFilteredRecords, monthlyKeys]);
  const monthlyPercentRows = useMemo(() => buildMonthlyRows(chartSettings.monthlyPercent),
    [chartSettings.monthlyPercent, monthlyExpectedDaysByMonth, monthlyFilteredRecords, monthlyKeys]);
  const absencePieRows = useMemo<ChartRow[]>(
    () =>
      (Object.keys(absenceTypeLabels) as AbsenceType[]).map((type) => ({
        label: absenceTypeLabels[type],
        value: classifiedRecords.filter((entry) => entry.classification.type === type).length,
        color: absenceTypeColors[type],
      })),
    [classifiedRecords],
  );

  const absenceTypePercentRows = useMemo<ChartRow[]>(() => {
    const counts = new Map<string, number>();
    absenceTypeRecords.forEach(({ classification }) => {
      counts.set(classification.type, (counts.get(classification.type) || 0) + 1);
    });

    const selectedTypes = Object.keys(absenceTypeLabels)
      .filter((type) => !selectedAbsenceTypes.size || selectedAbsenceTypes.has(type))
      .filter((type) => counts.has(type) || Object.prototype.hasOwnProperty.call(absenceTypeLabels, type));
    const total = selectedTypes.reduce((sum, type) => sum + (counts.get(type) || 0), 0);

    return selectedTypes
      .map((type) => ({
        label: absenceTypeLabels[type],
        value: total ? ((counts.get(type) || 0) / total) * 100 : 0,
        detail: `${formatInteger(counts.get(type) || 0)} ocorrência(s)`,
        color: absenceTypeColors[type],
      }))
      .filter((row) => row.value > 0)
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label));
  }, [absenceTypeRecords, selectedAbsenceTypes]);

  const warningRows = useMemo<ChartRow[]>(() => {
    const totals = new Map<string, number>();

    absenceTypeRecords
      .filter((entry) => entry.classification.type === "confirmed")
      .forEach(({ record }) => {
        const employee = employeeById.get(record.employeeId);
        const label = record.employeeName || employee?.name || "Funcionário sem nome";
        totals.set(label, (totals.get(label) || 0) + 1);
      });

    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value, color: absenceTypeColors.confirmed }))
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label))
      .slice(0, 24);
  }, [absenceTypeRecords, employeeById]);

  const repeatedAbsenceRows = useMemo<DualChartRow[]>(() => {
    const totals = new Map<string, { confirmed: number; certificate: number }>();

    absenceTypeRecords.forEach(({ record, classification }) => {
      if (classification.type !== "confirmed" && classification.type !== "certificate") return;
      const employee = employeeById.get(record.employeeId);
      const label = record.employeeName || employee?.name || "Funcionário sem nome";
      const current = totals.get(label) || { confirmed: 0, certificate: 0 };
      if (classification.type === "certificate") current.certificate += 1;
      else current.confirmed += 1;
      totals.set(label, current);
    });

    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, primary: value.confirmed, secondary: value.certificate }))
      .filter((row) => row.primary + row.secondary > 3)
      .sort((left, right) => (right.primary + right.secondary) - (left.primary + left.secondary) || compareText(left.label, right.label))
      .slice(0, 36);
  }, [absenceTypeRecords, employeeById]);

  const cidRows = useMemo<CidCategoryRow[]>(() => {
    const categories = new Map<string, { count: number; cids: Map<string, number> }>();

    baseFilteredRecords
      .filter((record) => record.status === "medical_certificate")
      .forEach((record) => {
        const details = cidDetailsFromValue(record.cid || "");
        const category = details.hasCode ? details.category : `Sem CID - ${details.category}`;
        if (selectedCidCategories.size && !selectedCidCategories.has(category)) return;

        const current = categories.get(category) || { count: 0, cids: new Map<string, number>() };
        current.count += 1;
        current.cids.set(details.label, (current.cids.get(details.label) || 0) + 1);
        categories.set(category, current);
      });

    return Array.from(categories.entries())
      .map(([category, item]) => ({
        category,
        count: item.count,
        cids: Array.from(item.cids.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((left, right) => right.count - left.count || compareText(left.label, right.label)),
      }))
      .sort((left, right) => right.count - left.count || compareText(left.category, right.category));
  }, [baseFilteredRecords, selectedCidCategories]);

  const cidPieRows = useMemo<CidPieRow[]>(() => {
    const totals = new Map<string, { category: string; count: number; employees: CidEmployeeEntry[] }>();

    baseFilteredRecords
      .filter((record) => record.status === "medical_certificate")
      .forEach((record) => {
        const details = cidDetailsFromValue(record.cid || "");
        const category = details.hasCode ? details.category : `Sem CID - ${details.category}`;
        if (selectedCidCategories.size && !selectedCidCategories.has(category)) return;

        const employee = employeeById.get(record.employeeId);
        const current = totals.get(details.label) || { category, count: 0, employees: [] };
        current.count += 1;
        current.employees.push({
          employeeId: record.employeeId,
          employeeName: record.employeeName || employee?.name || "Funcionario sem nome",
          category,
          date: record.date,
          cidLabel: details.label,
        });
        totals.set(details.label, current);
      });

    return Array.from(totals.entries())
      .map(([label, item], index) => ({
        label,
        value: item.count,
        category: item.category,
        employees: item.employees.sort((left, right) => compareText(left.employeeName, right.employeeName) || left.date.localeCompare(right.date)),
        color: cidPieColors[index % cidPieColors.length],
      }))
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label));
  }, [baseFilteredRecords, employeeById, selectedCidCategories]);

  const selectedCidRow = useMemo(
    () => cidPieRows.find((row) => row.label === selectedCidLabel) || cidPieRows[0],
    [cidPieRows, selectedCidLabel],
  );

  const selectedCidEmployees = useMemo(() => {
    if (!selectedCidRow) return [];
    const grouped = new Map<string, { employeeName: string; category: string; count: number; dates: string[] }>();

    selectedCidRow.employees.forEach((entry) => {
      const current = grouped.get(entry.employeeId) || {
        employeeName: entry.employeeName,
        category: entry.category,
        count: 0,
        dates: [],
      };
      current.count += 1;
      current.dates.push(entry.date);
      grouped.set(entry.employeeId, current);
    });

    return Array.from(grouped.values())
      .map((entry) => ({ ...entry, dates: entry.dates.sort((left, right) => left.localeCompare(right)) }))
      .sort((left, right) => right.count - left.count || compareText(left.employeeName, right.employeeName));
  }, [selectedCidRow]);

  useEffect(() => {
    if (!cidPieRows.length) {
      if (selectedCidLabel) setSelectedCidLabel("");
      return;
    }

    if (!cidPieRows.some((row) => row.label === selectedCidLabel)) {
      setSelectedCidLabel(cidPieRows[0].label);
    }
  }, [cidPieRows, selectedCidLabel]);

  const cidCategoryOptions = useMemo(() => {
    const categories = new Set<string>();

    baseFilteredRecords
      .filter((record) => record.status === "medical_certificate")
      .forEach((record) => {
        const details = cidDetailsFromValue(record.cid || "");
        categories.add(details.hasCode ? details.category : `Sem CID - ${details.category}`);
      });

    return sortOptions(Array.from(categories).map((category) => ({ value: category, label: category })));
  }, [baseFilteredRecords]);

  const countCardRecords = (settings: CardPreferences) => baseFilteredRecords.filter((record) => matchesCardRecord(record, settings)).length;
  const sumCardLoss = (settings: CardPreferences) => baseFilteredRecords.reduce((sum, record) => {
    const employee = employeeById.get(record.employeeId);
    return matchesCardRecord(record, settings) && matchesEmployeeKindSelection(settings.kinds, employee)
      ? sum + absenceLossValue(record, employee) : sum;
  }, 0);
  const absenteeismEmployees = (settings: CardPreferences) => baseEmployees.filter((employee) =>
    matchesEmployeeKindSelection(settings.kinds, employee) && !excludedFromAbsenteeism.has(employee.id));
  const countAbsenteeismRecords = (settings: CardPreferences) => {
    const eligible = new Set(absenteeismEmployees(settings).map((employee) => employee.id));
    return baseFilteredRecords.filter((record) => eligible.has(record.employeeId) && matchesCardRecord(record, settings)).length;
  };
  const absenteeismDenominator = (settings: CardPreferences) =>
    settings.absenteeismBase === "planned" ? annualPlannedDays
      : settings.absenteeismBase === "worked" ? (annualDaysReady ? annualWorkedPeriod.days : null)
        : absenteeismEmployees(settings).reduce((sum, employee) => sum + (expectedWorkDays.byEmployee.get(employee.id) || 0), 0);
  const absenteeismBaseLabels: Record<CardPreferences["absenteeismBase"], string> = {
    period: "Dias previstos no período", worked: "Dias Trabalhados-Ano", planned: "Dias Previstos-Ano",
  };
  const cardMetrics = (() => {
    const countEmployees = (settings: CardPreferences) => {
      return employeeRegistrySource.filter((employee) => {
        return matchesEmployeeKindSelection(settings.kinds, employee) &&
          settings.statuses.includes(employeeStatusForCard(employee));
      }).length;
    };
    const selectedAbsences = countAbsenteeismRecords(cardSettings.absenteeism);
    const denominator = absenteeismDenominator(cardSettings.absenteeism);
    return {
      employees: countEmployees(cardSettings.employees), absences: countCardRecords(cardSettings.absences),
      certificates: countCardRecords(cardSettings.certificates), combined: countCardRecords(cardSettings.combined),
      dayOffs: countCardRecords(cardSettings.dayOffs),
      planned: annualPlannedDays, absenteeism: absenteeismStreakReady && denominator ? selectedAbsences / denominator * 100 : null,
      loss: sumCardLoss(cardSettings.loss),
    };
  })();
  const monthComparisonValues = useMemo(() => {
    if (!comparisonReady) return null;
    const periods = [
      { start: comparisonWindow.currentStart, end: comparisonWindow.currentEnd },
      { start: comparisonWindow.previousStart, end: comparisonWindow.previousEnd },
    ];
    const scoped = comparisonFilteredRecords;
    const recordByDay = new Map(scoped.map((record) => [`${record.employeeId}:${record.date}`, record]));
    const employeesAt = (end: string, periodRecords: TimeRecord[], includeTerminated = false) => {
      const byId = new Map(data.employees
        .filter((employee) => employeeMatchesBaseFilters(employee, selectedCompanyIds, restrictCompanyScope, selectedTeamIds, end, includeTerminated) &&
          employeeMatchesDetailFilters(employee, detailFilterSets))
        .map((employee) => [employee.id, employee]));
      if (selectedTeamIds.size) periodRecords.forEach((record) => {
        const employee = employeeById.get(record.employeeId);
        if (employee && !byId.has(employee.id)) byId.set(employee.id, employee);
      });
      return Array.from(byId.values());
    };
    const savedSpanDays = (start: string, end: string, tables: TimekeepingDayTable[]) => {
      const dates = [...new Set(tables.filter((table) => table.date >= start && table.date <= end)
        .map((table) => table.date))].sort();
      return dates.length ? countCalendarDaysBetween(dates[0], dates[dates.length - 1],
        cardSettings.planned.plannedWeekdays, annualHolidayDates) : 0;
    };
    const monthValues = periods.map(({ start, end }) => {
      const monthRecords = scoped.filter((record) => record.date >= start && record.date <= end);
      const employees = employeesAt(end, monthRecords);
      const absenteeismEmployees = employees.filter((employee) =>
        matchesEmployeeKindSelection(cardSettings.absenteeism.kinds, employee) &&
        !excludedFromAbsenteeism.has(employee.id));
      const eligible = new Set(absenteeismEmployees.map((employee) => employee.id));
      const missed = monthRecords.filter((record) => eligible.has(record.employeeId) &&
        matchesCardRecord(record, cardSettings.absenteeism)).length;
      const denominator = cardSettings.absenteeism.absenteeismBase === "planned"
        ? countCalendarDaysBetween(start, end, cardSettings.planned.plannedWeekdays, annualHolidayDates)
        : cardSettings.absenteeism.absenteeismBase === "worked"
          ? savedSpanDays(start, end, comparisonDayTablesScoped)
          : absenteeismEmployees.reduce((total, employee) => total + dateRange(start, end).filter((date) => {
            if (employee.admissionDate && employee.admissionDate > date) return false;
            if (!isUsefulSavedWorkday(employee, date, timekeepingSettingsByCompanyId)) return false;
            const record = recordByDay.get(`${employee.id}:${date}`);
            const teamId = record ? recordDayTeamId(record, employee) : employee.teamId || "";
            return !selectedTeamIds.size || selectedTeamIds.has(teamId);
          }).length, 0);
      return {
        employees: employeeRegistrySource.filter((employee) => {
          return matchesEmployeeKindSelection(cardSettings.employees.kinds, employee) &&
            cardSettings.employees.statuses.includes(employeeStatusForCard(employee));
        }).length,
        absences: monthRecords.filter((record) => matchesCardRecord(record, cardSettings.absences)).length,
        certificates: monthRecords.filter((record) => matchesCardRecord(record, cardSettings.certificates)).length,
        combined: monthRecords.filter((record) => matchesCardRecord(record, cardSettings.combined)).length,
        dayOffs: monthRecords.filter((record) => matchesCardRecord(record, cardSettings.dayOffs)).length,
        absenteeism: absenteeismStreakReady && denominator ? missed / denominator * 100 : null,
        loss: monthRecords.reduce((total, record) => {
          const employee = employeeById.get(record.employeeId);
          return total + (matchesCardRecord(record, cardSettings.loss) &&
            matchesEmployeeKindSelection(cardSettings.loss.kinds, employee)
            ? absenceLossValue(record, employee) : 0);
        }, 0),
      };
    });
    // Both annual cards retain their annual headline. Their comparison uses the
    // same calendar month in the selected year, through the selected day.
    const annualEnd = shiftMonthClamped(`${plannedYear}-${endDate.slice(5)}`, 0);
    const annualCurrentStart = monthStartISO(annualEnd);
    const annualPreviousStart = shiftMonthClamped(annualCurrentStart, -1);
    const annualPreviousEnd = shiftMonthClamped(annualEnd, -1);
    const annualPeriods = [
      { start: annualCurrentStart, end: annualEnd },
      { start: annualPreviousStart, end: annualPreviousEnd },
    ];
    const annualValues = annualPeriods.map(({ start, end }) => ({
      planned: countCalendarDaysBetween(start, end, cardSettings.planned.plannedWeekdays, annualHolidayDates),
      worked: start.slice(0, 4) === String(plannedYear) && annualDaysReady
        ? savedSpanDays(start, end, annualSavedDayTables.filter((table) => savedDayMatchesCompany(table, selectedCompanyIds, restrictCompanyScope)))
        : null,
    }));
    return {
      current: { ...monthValues[0], ...annualValues[0] },
      previous: { ...monthValues[1], ...annualValues[1] },
    };
  }, [absenteeismStreakReady, annualDaysReady, annualHolidayDates, annualSavedDayTables, cardSettings,
    comparisonDayTablesScoped, comparisonFilteredRecords, comparisonReady, comparisonWindow,
    data.employees, detailFilterSets, employeeById, endDate, excludedFromAbsenteeism, plannedYear,
    restrictCompanyScope, selectedCompanyIds, selectedTeamIds, timekeepingSettingsByCompanyId]);
  const annualTrendEnd = shiftMonthClamped(`${plannedYear}-${endDate.slice(5)}`, 0);
  const annualTrendStart = monthStartISO(annualTrendEnd);
  const annualTrendPreviousStart = shiftMonthClamped(annualTrendStart, -1);
  const annualTrendPreviousEnd = shiftMonthClamped(annualTrendEnd, -1);
  function trendForCard(id: CardId): HrMetricTrend {
    const current = monthComparisonValues?.current[id];
    const previous = monthComparisonValues?.previous[id];
    const formatter = id === "absenteeism" ? formatPercent : id === "loss" ? formatCurrencyCompact : formatInteger;
    const annual = id === "planned" || id === "worked";
    const currentStart = annual ? annualTrendStart : comparisonWindow.currentStart;
    const currentEnd = annual ? annualTrendEnd : comparisonWindow.currentEnd;
    const previousStart = annual ? annualTrendPreviousStart : comparisonWindow.previousStart;
    const previousEnd = annual ? annualTrendPreviousEnd : comparisonWindow.previousEnd;
    const title = current === null || current === undefined || previous === null || previous === undefined
      ? "Comparação ainda indisponível" : `${formatDate(currentStart)} a ${formatDate(currentEnd)}: ${formatter(current)}; ` +
        `${formatDate(previousStart)} a ${formatDate(previousEnd)}: ${formatter(previous)}`;
    const change = id === "absenteeism" && current != null && previous != null
      ? current - previous : current != null && previous != null ? relativePercentChange(current, previous) : null;
    if (change === null || !Number.isFinite(change)) {
      return { label: monthComparisonValues ? "—" : "…", caption: monthComparisonValues ? "sem base no mês anterior" : "comparando meses", title, tone: "neutral" };
    }
    const rounded = Math.abs(change) < 0.05 ? 0 : change;
    const up = rounded > 0;
    const goodWhenIncreasing = id === "employees" || id === "planned" || id === "worked";
    return {
      label: `${rounded > 0 ? "↑ " : rounded < 0 ? "↓ " : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.abs(rounded))}${id === "absenteeism" ? " p.p." : "%"}`,
      caption: `vs. ${monthChartLabel(monthKey(previousEnd))}`,
      title,
      tone: rounded === 0 ? "neutral" : up === goodWhenIncreasing ? "good" : "bad",
    };
  }
  const metricCards: Array<{ id: CardId; label: string; value: string; icon: typeof Users; tone: string; trend: HrMetricTrend }> = [
    { id: "employees", label: "Total de Funcionários", value: formatCompact(cardMetrics.employees), icon: Users, tone: "blue", trend: trendForCard("employees") },
    { id: "absences", label: "Total de Faltas", value: formatCompact(cardMetrics.absences), icon: FileText, tone: "red", trend: trendForCard("absences") },
    { id: "certificates", label: "Total de Atestados", value: formatCompact(cardMetrics.certificates), icon: Stethoscope, tone: "green", trend: trendForCard("certificates") },
    { id: "combined", label: "Faltas + Atestados", value: formatCompact(cardMetrics.combined), icon: HeartPulse, tone: "yellow", trend: trendForCard("combined") },
    { id: "dayOffs", label: "Folgas", value: formatCompact(cardMetrics.dayOffs), icon: CalendarDays, tone: "gray", trend: trendForCard("dayOffs") },
    { id: "planned", label: "Dias Previstos-Ano", value: formatInteger(cardMetrics.planned), icon: Clock, tone: "teal", trend: trendForCard("planned") },
    { id: "worked", label: "Dias Trabalhados-Ano", value: annualDaysReady ? formatInteger(annualWorkedPeriod.days) : "—", icon: CalendarDays, tone: "green", trend: trendForCard("worked") },
    { id: "absenteeism", label: "% Absenteísmo", value: cardMetrics.absenteeism === null ? "—" : formatPercent(cardMetrics.absenteeism), icon: ChartPie, tone: "purple", trend: trendForCard("absenteeism") },
    { id: "loss", label: "Perda $", value: formatCurrencyCompact(cardMetrics.loss), icon: DollarSign, tone: "blue", trend: trendForCard("loss") },
  ];
  const selectedMetric = metricCards.find((card) => card.id === editingCard);
  const draftEmployeeTotal = draftCard && editingCard === "employees"
    ? employeeRegistrySource.filter((employee) => {
      return countEmployeeRegistryMatches(draftCard.kinds, draftCard.statuses, employee);
    }).length : 0;
  const draftEmployeeTotalInRegistry = draftCard && editingCard === "employees"
    ? employeeRegistrySource.filter((employee) => {
      return countEmployeeRegistryMatches(draftCard.kinds, draftCard.statuses, employee);
    }).length : 0;
  const draftAbsenteeismCount = draftCard && editingCard === "absenteeism" ? countAbsenteeismRecords(draftCard) : 0;
  const draftAbsenteeismDays = draftCard && editingCard === "absenteeism" ? absenteeismDenominator(draftCard) : null;
  const draftExcludedCount = draftCard && editingCard === "absenteeism" ? baseEmployees.filter((employee) =>
    matchesEmployeeKindSelection(draftCard.kinds, employee) && excludedFromAbsenteeism.has(employee.id)).length : 0;
  const draftAbsenteeismPreview = draftCard && editingCard === "absenteeism" ?
    `${absenteeismStreakReady ? `${formatInteger(draftAbsenteeismCount)} falta(s) no período ÷ ` : "consultando faltas consecutivas…"}${!absenteeismStreakReady ? "" : draftAbsenteeismDays === null
      ? annualDaysStatus === "error" && draftCard.absenteeismBase === "worked" ? "consulta dos pontos indisponível" : "consultando pontos…"
      : draftAbsenteeismDays
        ? `${formatInteger(draftAbsenteeismDays)} dia(s) (${absenteeismBaseLabels[draftCard.absenteeismBase]}) = ${formatPercent(draftAbsenteeismCount / draftAbsenteeismDays * 100)}`
        : `0 dia(s) (${absenteeismBaseLabels[draftCard.absenteeismBase]}) = —`}${absenteeismStreakReady ? ` · ${formatInteger(draftExcludedCount)} funcionário(s) excluído(s) por mais de 10 faltas seguidas` : ""}` : "";
  const draftMonthlyRows = draftChart && editingChart ? buildMonthlyRows(draftChart) : [];
  function openMonthlySettings(id: MonthlyChartId) {
    const settings = chartSettings[id];
    setDraftChart({ types: [...settings.types], leaveReasons: [...settings.leaveReasons],
      licenses: [...settings.licenses], dayOffDays: [...settings.dayOffDays] });
    setEditingChart(id);
    setSharedMessage("");
  }
  function applyMonthlySettings() {
    if (!editingChart || !draftChart) return;
    setChartSettings((previous) => ({ ...previous, [editingChart]: draftChart }));
    setEditingChart(null);
  }
  async function saveSharedMonthlySettings() {
    if (!editingChart || !draftChart || !firestore) { setSharedMessage("Conexão indisponível para salvar o padrão."); return; }
    const id = editingChart;
    const next = { ...sharedChartSettings, [id]: draftChart };
    setSavingShared(true);
    setSharedMessage("");
    try {
      await setDoc(doc(firestore, "hrControlSettings", "sharedCards"),
        { charts: { [id]: draftChart }, updatedAt: new Date().toISOString() }, { merge: true });
      setSharedChartSettings(next);
      setChartSettings((previous) => ({ ...previous, [id]: draftChart }));
      setEditingChart(null);
    } catch (error) {
      console.error("Falha ao salvar a visualização padrão do gráfico mensal.", error);
      setSharedMessage("Não foi possível salvar para todos. Verifique a permissão da coleção hrControlSettings.");
    } finally { setSavingShared(false); }
  }
  function openCardSettings(id: CardId) {
    const settings = cardSettings[id === "worked" ? "planned" : id];
    setDraftCard({ ...settings, kinds: [...settings.kinds], statuses: [...settings.statuses],
      types: [...settings.types], leaveReasons: [...settings.leaveReasons],
      licenses: [...settings.licenses], dayOffDays: [...settings.dayOffDays],
      plannedWeekdays: [...settings.plannedWeekdays] });
    if (id === "planned" || id === "worked") setDraftPlannedYear(plannedYear);
    setEditingCard(id);
    setSharedMessage("");
  }
  function applyCardSettings() {
    if (!editingCard || !draftCard) return;
    if ((editingCard === "planned" || editingCard === "worked") && (!Number.isInteger(draftPlannedYear) || draftPlannedYear < 2000 || draftPlannedYear > 2100)) {
      setSharedMessage("Informe um ano entre 2000 e 2100.");
      return;
    }
    const settingsId = editingCard === "worked" ? "planned" : editingCard;
    setCardSettings((previous) => ({ ...previous, [settingsId]: draftCard }));
    if (settingsId === "planned") setPlannedYear(draftPlannedYear);
    setEditingCard(null);
  }
  async function saveSharedCardSettings() {
    if (!editingCard || !draftCard || !firestore) { setSharedMessage("Conexão indisponível para salvar o padrão."); return; }
    if ((editingCard === "planned" || editingCard === "worked") && (!Number.isInteger(draftPlannedYear) || draftPlannedYear < 2000 || draftPlannedYear > 2100)) {
      setSharedMessage("Informe um ano entre 2000 e 2100.");
      return;
    }
    const settingsId = editingCard === "worked" ? "planned" : editingCard;
    const next = { ...sharedCardSettings, [settingsId]: draftCard };
    setSavingShared(true);
    setSharedMessage("");
    try {
      await setDoc(doc(firestore, "hrControlSettings", "sharedCards"), { cards: { [settingsId]: draftCard }, updatedAt: new Date().toISOString() }, { merge: true });
      setSharedCardSettings(next);
      setCardSettings((previous) => ({ ...previous, [settingsId]: draftCard }));
      if (settingsId === "planned") setPlannedYear(draftPlannedYear);
      setEditingCard(null);
    } catch (error) {
      console.error("Falha ao salvar visualização padrão.", error);
      setSharedMessage("Não foi possível salvar para todos. Verifique a permissão da coleção hrControlSettings.");
    } finally { setSavingShared(false); }
  }

  function clearFilters() {
    setAnalysisScope("group");
    setSelectedGroupId(defaultGroupId);
    setCompanyIds([]);
    setTeamIds([]);
    setEmployeeIds([]);
    setFunctionKeys([]);
    setCpfValues([]);
    setDepartmentIds([]);
    setSectorIds([]);
    setSubsectorIds([]);
    setWeekKey("all");
    setAbsenceTypeFilters([]);
    setCidCategoryFilters([]);
    setPeriodMode("currentMonth");
    setStartDate(monthStartISO(today));
    setEndDate(today);
    setMonitoringPage(1);
    setMonitoringRiskFilter("all");
  }

  function selectPeriod(period: "currentMonth" | "previousMonth" | "currentWeek") {
    const current = parseLocalDate(localTodayISO());
    const currentISO = toISODate(current);
    if (period === "currentMonth") {
      setPeriodMode("currentMonth");
      setStartDate(monthStartISO(currentISO));
      setEndDate(currentISO);
    } else if (period === "previousMonth") {
      setPeriodMode("custom");
      setStartDate(toISODate(new Date(current.getFullYear(), current.getMonth() - 1, 1)));
      setEndDate(toISODate(new Date(current.getFullYear(), current.getMonth(), 0)));
    } else {
      setPeriodMode("custom");
      setStartDate(weekStartISO(currentISO));
      setEndDate(currentISO);
    }
    setWeekKey("all");
    setMonitoringPage(1);
  }

  function selectEndPeriod(period: "currentMonth" | "previousMonth" | "currentWeek") {
    const current = parseLocalDate(localTodayISO());
    const currentISO = toISODate(current);
    const nextEnd = period === "previousMonth"
      ? toISODate(new Date(current.getFullYear(), current.getMonth(), 0))
      : currentISO;
    setPeriodMode(period === "currentMonth" && startDate === monthStartISO(currentISO) ? "currentMonth" : "custom");
    setEndDate(nextEnd);
    setWeekKey("all");
    setMonitoringPage(1);
    setEndCalendarOpen(false);
  }

  const periodText = `${formatDate(startDate)} até ${formatDate(endDate)}`;
  const periodReady = (!data.loading || Boolean(warmSession)) && savedDayTablesReady && loadedRecordsKey === periodRangeKey;
  useEffect(() => {
    if (!user?.id || !periodReady) return;
    writeHrSession(user.id, {
      records, loadedRecordsKey, savedDayTables, annualSavedDayTables, annualLoadedYear,
      monthlySavedDayTables, monthlySavedDaysKey, monthlyRangeData,
      comparisonSavedDayTables, comparisonSavedDaysKey, comparisonRangeData, streakPointData,
    });
  }, [user?.id, periodReady, records, loadedRecordsKey, savedDayTables, annualSavedDayTables,
    annualLoadedYear, monthlySavedDayTables, monthlySavedDaysKey, monthlyRangeData,
    comparisonSavedDayTables, comparisonSavedDaysKey, comparisonRangeData, streakPointData]);

  return {
    warmSession,
    saveSharedCardSettings,
    saveSharedMonthlySettings,
    setPeriodMode,
    setActiveView,
    setStartDate,
    setEndDate,
    setAnalysisScope,
    setSelectedGroupId,
    setCompanyIds,
    setTeamIds,
    setEmployeeIds,
    setFunctionKeys,
    setCpfValues,
    setDepartmentIds,
    setSectorIds,
    setSubsectorIds,
    setWeekKey,
    setAbsenceTypeFilters,
    setCidCategoryFilters,
    setSelectedCidLabel,
    setMonitoringPage,
    setMonitoringRiskFilter,
    setSharedCardSettings,
    setCardSettings,
    setSharedChartSettings,
    setChartSettings,
    setEditingChart,
    setDraftChart,
    setEditingCard,
    setDraftCard,
    setPlannedYear,
    setDraftPlannedYear,
    setSavingShared,
    setSharedMessage,
    setRecords,
    setRecordsLoading,
    setLoadedRecordsKey,
    setRecordsError,
    setSavedDayTables,
    setSavedDayTablesReady,
    setSavedDaysError,
    setAnnualSavedDayTables,
    setAnnualDaysStatus,
    setAnnualLoadedYear,
    setSavedDaysLoading,
    setDataRevision,
    setStartCalendarOpen,
    setEndCalendarOpen,
    setCalendarMonth,
    setMonthlySavedDayTables,
    setMonthlySavedDaysStatus,
    setMonthlySavedDaysKey,
    setMonthlyRangeData,
    setComparisonSavedDayTables,
    setComparisonSavedDaysStatus,
    setComparisonSavedDaysKey,
    setComparisonRangeData,
    setStreakPointData,
    periodMode,
    activeView,
    startDate,
    endDate,
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
    monitoringRiskFilter,
    sharedCardSettings,
    cardSettings,
    sharedChartSettings,
    chartSettings,
    editingChart,
    draftChart,
    editingCard,
    draftCard,
    plannedYear,
    draftPlannedYear,
    savingShared,
    sharedMessage,
    records,
    recordsLoading,
    loadedRecordsKey,
    recordsError,
    savedDayTables,
    savedDayTablesReady,
    savedDaysError,
    annualSavedDayTables,
    annualDaysStatus,
    annualLoadedYear,
    savedDaysLoading,
    dataRevision,
    startCalendarOpen,
    endCalendarOpen,
    calendarMonth,
    monthlySavedDayTables,
    monthlySavedDaysStatus,
    monthlySavedDaysKey,
    monthlyRangeData,
    comparisonSavedDayTables,
    comparisonSavedDaysStatus,
    comparisonSavedDaysKey,
    comparisonRangeData,
    streakPointData,
    data,
    today,
    defaultStartDate,
    sharedLoaded,
    changedPointDatesRef,
    periodHandledRevision,
    monthlyHandledRevision,
    startCalendarRef,
    endCalendarRef,
    invalidRange,
    calendarDays,
    teamById,
    employeeById,
    groupOptions,
    defaultGroupId,
    selectedGroupCompanyIds,
    selectedCompanyScopeIds,
    restrictCompanyScope,
    selectedCompanyIds,
    structureGroupsForScope,
    structureDepartments,
    structureSectors,
    structureSubsectors,
    structureTeams,
    selectedTeamIds,
    selectedDepartmentIds,
    selectedSectorIds,
    selectedSubsectorIds,
    detailFilterSets,
    selectedAbsenceTypes,
    selectedCidCategories,
    timekeepingSettingsByCompanyId,
    annualHolidayDates,
    annualPlannedDays,
    annualDaysReady,
    annualWorkedPeriod,
    weekOptions,
    activeDates,
    activeDateSet,
    activeSavedDayTables,
    savedDaySet,
    savedTablesByDate,
    savedActiveDates,
    companyOptions,
    scopedEmployeesForOptions,
    departmentOptions,
    sectorOptions,
    subsectorOptions,
    functionOptions,
    cpfOptions,
    employeeOptions,
    teamOptions,
    absenceTypeOptions,
    availableTeamIds,
    availableEmployeeIds,
    availableFunctionKeys,
    availableCpfValues,
    availableDepartmentIds,
    availableSectorIds,
    availableSubsectorIds,
    hasActiveFilters,
    periodRangeKey,
    monthAnchorDate,
    monthlyKeys,
    monthlyStartDate,
    monthlyRangeKey,
    comparisonWindow,
    comparisonUsesMonthlyRange,
    comparisonRangeKey,
    comparisonHandledRevision,
    baseFilteredRecords,
    classifiedRecords,
    absenceTypeRecords,
    baseEmployees,
    employeeCardCandidates,
    monthlySavedTablesByDate,
    monthlyFilteredRecords,
    monthlyChartsReady,
    comparisonReady,
    comparisonDayTablesScoped,
    comparisonFilteredRecords,
    monthlyEmployees,
    streakDatesByEmployee,
    streakDates,
    streakDatesKey,
    excludedFromAbsenteeism,
    absenteeismStreakReady,
    recordByEmployeeDate,
    activeMonitoringEmployeeIds,
    expectedWorkDays,
    unjustifiedAbsenceRuns,
    filteredMonitoringRuns,
    absenceMonitoringChartRows,
    absenceMonitoringPieRows,
    monitoringTotalPages,
    monitoringCurrentPage,
    monitoringFirstItem,
    monitoringVisibleRuns,
    monitoringFromItem,
    monitoringToItem,
    toggleMonitoringRiskFilter,
    overtimeByTeam,
    overtimeByMonth,
    teamAbsenceRows,
    teamAbsencePercentRows,
    monthlyExpectedDaysByMonth,
    buildMonthlyRows,
    monthlyCountRows,
    monthlyPercentRows,
    absenceTypePercentRows,
    absencePieRows,
    warningRows,
    repeatedAbsenceRows,
    cidRows,
    cidPieRows,
    selectedCidRow,
    selectedCidEmployees,
    cidCategoryOptions,
    countCardRecords,
    sumCardLoss,
    absenteeismEmployees,
    countAbsenteeismRecords,
    absenteeismDenominator,
    absenteeismBaseLabels,
    cardMetrics,
    monthComparisonValues,
    annualTrendEnd,
    annualTrendStart,
    annualTrendPreviousStart,
    annualTrendPreviousEnd,
    trendForCard,
    metricCards,
    selectedMetric,
    draftEmployeeTotal,
    draftEmployeeTotalInRegistry,
    draftAbsenteeismCount,
    draftAbsenteeismDays,
    draftExcludedCount,
    draftAbsenteeismPreview,
    draftMonthlyRows,
    openMonthlySettings,
    applyMonthlySettings,
    openCardSettings,
    applyCardSettings,
    clearFilters,
    selectPeriod,
    selectEndPeriod,
    periodText,
    periodReady,
    user,
  };
}

export type HrControlController = ReturnType<typeof useHrControl>;
