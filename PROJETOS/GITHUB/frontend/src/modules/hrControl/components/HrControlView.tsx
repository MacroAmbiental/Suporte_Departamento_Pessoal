import {
  AlertTriangle,
  CalendarDays,
  ChartColumn,
  ChartPie,
  HeartPulse,
  Search,
  Settings2,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import ClearFiltersButton from "@/common/components/ClearFiltersButton";
import MultiSelect from "@/common/components/MultiSelect";
import EmployeesPagination from "@/modules/employees/components/EmployeesPagination";
import { employeeKindLabels } from "@/common/utils/employeeKind";
import { formatDate } from "@/utils/format";
import {
  absenceTypeLabels,
  leaveReasons,
  licenseReasons,
  absenceLabels,
  weekdayOptions,
  microScreens,
  localTodayISO,
  monthStartISO,
  monthKey,
  countCalendarDaysBetween,
  countCalendarDaysInYear,
  monthChartLabel,
  formatInteger,
  formatHours,
  formatPercent,
  monitoringPageSize,
  type CardId,
  type MonthlyChartId,
  type HrAnalysisScope,
} from "@/modules/hrControl/domain/hrControlModel";
import EmployeeMovementChart from "@/modules/hrControl/components/EmployeeMovementChart";
import {
  HorizontalBarChart,
  DualBarChart,
  PieSummary,
  CidPieChart,
  MonthlyGroupedChart,
  MonthlyPercentChart,
  ColumnChart,
  EmployeeOvertimeChart,
  CalendarMonthHeader,
  CardChoices,
  ChartChoices,
} from "@/modules/hrControl/components/hrControlCharts";
import type { HrControlController } from "@/modules/hrControl/hooks/useHrControl";

export function HrControlView(props: HrControlController) {
  const {
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
    saveSharedCardSettings,
    saveSharedMonthlySettings,
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
    warmSession,
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
  } = props;


  return (
    <section className="page hr-control-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Controle RH</h1>
          <p className="page-subtitle">Indicadores de ponto, absenteísmo e atestados por categoria de CID.</p>
        </div>
        <div className="hr-header-actions">
          <div className="hr-scope-controls" aria-label="Escopo da análise">
            <label className="field">
              Analisar por
              <select
                value={analysisScope}
                onChange={(event) => {
                  const nextScope = event.target.value as HrAnalysisScope;
                  setAnalysisScope(nextScope);
                  setTeamIds([]);
                  if (nextScope === "group") setSelectedGroupId(defaultGroupId);
                  if (nextScope === "company") setCompanyIds([]);
                }}
              >
                <option value="group">Grupo</option>
                <option value="company">Empresa</option>
              </select>
            </label>
            {analysisScope === "group" ? (
              <label className="field">
                Grupo
                <select
                  value={selectedGroupId}
                  onChange={(event) => {
                    setSelectedGroupId(event.target.value);
                    setTeamIds([]);
                  }}
                >
                  <option value="">Selecione um grupo</option>
                  {groupOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field">
                Empresa
                <select
                  value={companyIds[0] || ""}
                  onChange={(event) => {
                    setCompanyIds(event.target.value ? [event.target.value] : []);
                    setTeamIds([]);
                  }}
                >
                  <option value="">Selecione uma empresa</option>
                  {companyOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <span className={`hr-load-badge ${recordsLoading || savedDaysLoading || (data.loading && !warmSession) || !periodReady ? "is-loading" : ""}`}>
            {recordsLoading || savedDaysLoading || (data.loading && !warmSession) || !periodReady ? "Atualizando dados" : recordsError ? "Não foi possível atualizar os pontos" : `${formatInteger(baseFilteredRecords.length)} registro(s) de ${formatInteger(savedActiveDates.length)} dia(s) salvo(s)`}
          </span>
        </div>
      </div>

      <div className="hr-screen-tabs" role="tablist" aria-label="Telas do Controle RH">
        {microScreens.map((screen) => {
          const Icon = screen.icon;
          return (
            <button
              key={screen.key}
              type="button"
              className={activeView === screen.key ? "is-active" : ""}
              onClick={() => setActiveView(screen.key)}
              role="tab"
              aria-selected={activeView === screen.key}
            >
              <Icon size={16} />
              {screen.label}
            </button>
          );
        })}
      </div>

      <div className="filters-panel hr-control-filters">
        <Search size={18} />
        <div className="hr-date-picker" ref={startCalendarRef}>
          <span className="hr-date-label" id="hr-start-date-label">Data inicial</span>
          <button
            className="hr-date-trigger"
            type="button"
            aria-labelledby="hr-start-date-label"
            aria-expanded={startCalendarOpen}
            aria-haspopup="dialog"
            disabled={activeView === "absenceMonitoring"}
            onClick={() => {
              if (activeView === "absenceMonitoring") return;
              setCalendarMonth(monthStartISO(startDate || localTodayISO()));
              setEndCalendarOpen(false);
              setStartCalendarOpen((open) => !open);
            }}
          >
            <span>{startDate ? formatDate(startDate) : "Selecione a data"}</span>
            <CalendarDays size={16} />
          </button>
          {startCalendarOpen && activeView !== "absenceMonitoring" && (
            <div className="hr-calendar-popover" role="dialog" aria-label="Selecionar data inicial">
              <CalendarMonthHeader calendarMonth={calendarMonth} onChange={setCalendarMonth} />
              <div className="hr-calendar-grid" role="grid" aria-label="Dias do mês">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <span key={index} className="hr-calendar-weekday">{day}</span>)}
                {calendarDays.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`${day.slice(0, 7) !== calendarMonth.slice(0, 7) ? "is-outside" : ""} ${day === startDate ? "is-selected" : ""}`}
                    aria-label={formatDate(day)}
                    aria-pressed={day === startDate}
                    onClick={() => { setPeriodMode("custom"); setStartDate(day); setStartCalendarOpen(false); }}
                  >{Number(day.slice(-2))}</button>
                ))}
              </div>
              <div className="hr-calendar-actions" aria-label="Atalhos de data inicial">
                <button type="button" onClick={() => { setPeriodMode("custom"); setStartDate(""); setStartCalendarOpen(false); }}>Limpar</button>
                <button type="button" onClick={() => { const current = localTodayISO(); setPeriodMode("custom"); setStartDate(current); setEndDate(current); setStartCalendarOpen(false); }}>Hoje</button>
                <button type="button" onClick={() => { selectPeriod("currentMonth"); setStartCalendarOpen(false); }}>Este Mês</button>
                <button type="button" onClick={() => { selectPeriod("previousMonth"); setStartCalendarOpen(false); }}>Mês passado</button>
                <button type="button" onClick={() => { selectPeriod("currentWeek"); setStartCalendarOpen(false); }}>Esta semana</button>
              </div>
            </div>
          )}
        </div>
        <div className="hr-date-picker" ref={endCalendarRef}>
          <span className="hr-date-label" id="hr-end-date-label">Data final</span>
          <button
            className="hr-date-trigger"
            type="button"
            aria-labelledby="hr-end-date-label"
            aria-expanded={endCalendarOpen}
            aria-haspopup="dialog"
            disabled={activeView === "absenceMonitoring"}
            onClick={() => {
              if (activeView === "absenceMonitoring") return;
              setCalendarMonth(monthStartISO(endDate || localTodayISO()));
              setStartCalendarOpen(false);
              setEndCalendarOpen((open) => !open);
            }}
          >
            <span>{endDate ? formatDate(endDate) : "Selecione a data"}</span>
            <CalendarDays size={16} />
          </button>
          {endCalendarOpen && activeView !== "absenceMonitoring" && (
            <div className="hr-calendar-popover" role="dialog" aria-label="Selecionar data final">
              <CalendarMonthHeader calendarMonth={calendarMonth} onChange={setCalendarMonth} maxMonth={monthStartISO(localTodayISO())} />
              <div className="hr-calendar-grid" role="grid" aria-label="Dias do mês">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <span key={index} className="hr-calendar-weekday">{day}</span>)}
                {calendarDays.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className={`${day.slice(0, 7) !== calendarMonth.slice(0, 7) ? "is-outside" : ""} ${day === endDate ? "is-selected" : ""}`}
                    aria-label={formatDate(day)}
                    aria-pressed={day === endDate}
                    disabled={day > localTodayISO()}
                    onClick={() => { setPeriodMode("custom"); setEndDate(day); setEndCalendarOpen(false); }}
                  >{Number(day.slice(-2))}</button>
                ))}
              </div>
              <div className="hr-calendar-actions" aria-label="Atalhos de data final">
                <button type="button" onClick={() => { setPeriodMode("custom"); setEndDate(""); setEndCalendarOpen(false); }}>Limpar</button>
                <button type="button" onClick={() => { setPeriodMode("custom"); setEndDate(localTodayISO()); setEndCalendarOpen(false); }}>Hoje</button>
                <button type="button" onClick={() => selectEndPeriod("currentMonth")}>Este Mês</button>
                <button type="button" onClick={() => selectEndPeriod("previousMonth")}>Mês passado</button>
                <button type="button" onClick={() => selectEndPeriod("currentWeek")}>Esta semana</button>
              </div>
            </div>
          )}
        </div>
        <label className="field">
          Semana
          <select value={weekKey} onChange={(event) => setWeekKey(event.target.value)} disabled={activeView === "absenceMonitoring"}>
            <option value="all">Todas</option>
            {weekOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <MultiSelect
          label="Funcionários"
          placeholder="Funcionários"
          value={employeeIds}
          onChange={setEmployeeIds}
          options={employeeOptions}
        />
        <MultiSelect
          label="Função"
          placeholder="Função"
          value={functionKeys}
          onChange={setFunctionKeys}
          options={functionOptions}
        />
        <MultiSelect
          label="CPF"
          placeholder="CPF"
          value={cpfValues}
          onChange={setCpfValues}
          options={cpfOptions}
        />
        <MultiSelect
          label="Departamento"
          placeholder="Departamento"
          value={departmentIds}
          onChange={(nextValues) => {
            setDepartmentIds(nextValues);
            setSectorIds([]);
            setSubsectorIds([]);
          }}
          options={departmentOptions}
        />
        <MultiSelect
          label="Setor"
          placeholder="Setor"
          value={sectorIds}
          onChange={(nextValues) => {
            setSectorIds(nextValues);
            setSubsectorIds([]);
          }}
          options={sectorOptions}
        />
        <MultiSelect
          label="Subsetor"
          placeholder="Subsetor"
          value={subsectorIds}
          onChange={setSubsectorIds}
          options={subsectorOptions}
        />
        <MultiSelect
          label="Equipe do dia"
          placeholder="Equipe do dia"
          value={teamIds}
          onChange={setTeamIds}
          options={teamOptions}
        />
        {activeView === "absenceTypes" ? (
          <MultiSelect
            label="Tipo de falta"
            placeholder="Tipo de falta"
            value={absenceTypeFilters}
            onChange={setAbsenceTypeFilters}
            options={absenceTypeOptions}
          />
        ) : null}
        {activeView === "cids" ? (
          <MultiSelect
            label="Categoria CID"
            placeholder="Categoria CID"
            value={cidCategoryFilters}
            onChange={setCidCategoryFilters}
            options={cidCategoryOptions}
          />
        ) : null}
        <ClearFiltersButton active={hasActiveFilters} onClear={clearFilters} />
      </div>

      {invalidRange ? (
        <div className="empty-state">
          <h2>Período inválido</h2>
          <p>A data inicial precisa ser menor ou igual à data final.</p>
        </div>
      ) : null}

      {!invalidRange && !periodReady ? (
        <div className="hr-dashboard-loading" role="status" aria-live="polite">
          <span className="hr-dashboard-loading-spinner" aria-hidden="true" />
          <strong>{savedDaysError || recordsError ? "Não foi possível carregar os registros do período." : "Carregando os dados do Controle RH…"}</strong>
          <small>{savedDaysError || recordsError ? "Verifique a conexão e reabra a tela para tentar novamente." : "Os indicadores serão exibidos após a conferência dos pontos salvos."}</small>
        </div>
      ) : null}

      {editingCard && draftCard && selectedMetric ? (
        <div className="hr-card-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingCard(null); }}>
          <section className="hr-card-modal" role="dialog" aria-modal="true" aria-labelledby="hr-card-modal-title" onKeyDown={(event) => { if (event.key === "Escape") setEditingCard(null); }}>
            <button className="hr-card-modal-close" type="button" aria-label="Fechar" onClick={() => setEditingCard(null)}><X size={20} /></button>
            <h2 id="hr-card-modal-title">Personalizar: {selectedMetric.label.toLocaleLowerCase("pt-BR")}</h2>
            <p>{editingCard === "worked" ? "Conta os dias úteis entre a primeira e a última data de ponto salva no ano." : editingCard === "planned" ? "Escolha o ano e os dias da semana. Feriados marcados no Controle de Ponto são excluídos." : editingCard === "absenteeism" ? "Escolha os tipos de falta e a base usada para calcular o percentual." : "Escolha quais registros entram neste indicador."}</p>
            <div className="hr-card-modal-sections">
              {editingCard === "employees" ? <>
                <CardChoices title="Tipo de vínculo" field="kinds" value={draftCard} onChange={setDraftCard} options={[
                  { value: "contract", label: employeeKindLabels.contract }, { value: "company", label: employeeKindLabels.company },
                  { value: "diarist", label: "Diaristas" },
                ]} />
              </> : (editingCard === "planned" || editingCard === "worked") ? <>
                <details className="hr-card-choice-group">
                  <summary>Ano de referência<span>{draftPlannedYear}</span></summary>
                  <div className="hr-card-choice-list">
                    <label className="hr-planned-year-label">Ano
                      <input type="number" min="2000" max="2100" step="1" value={draftPlannedYear}
                        onChange={(event) => setDraftPlannedYear(Number(event.target.value))} />
                    </label>
                  </div>
                </details>
                <CardChoices title="Dias úteis considerados" field="plannedWeekdays" value={draftCard}
                  onChange={setDraftCard} options={weekdayOptions} />
              </> : <>
                {(editingCard === "absenteeism" || editingCard === "loss") ? <CardChoices title="Tipo de vínculo" field="kinds" value={draftCard} onChange={setDraftCard} options={[
                  { value: "contract", label: employeeKindLabels.contract }, { value: "company", label: employeeKindLabels.company },
                  { value: "diarist", label: "Diaristas" },
                ]} /> : null}
                <CardChoices title="Tipos de falta" field="types" value={draftCard} onChange={setDraftCard}
                  options={Object.entries(absenceLabels).map(([value, label]) => ({ value, label }))} />
                {editingCard === "absenteeism" ? <details className="hr-card-choice-group">
                  <summary>Base de cálculo<span>{absenteeismBaseLabels[draftCard.absenteeismBase]}</span></summary>
                  <div className="hr-card-choice-list" role="radiogroup" aria-label="Base de cálculo do absenteísmo">
                    {(["period", "worked", "planned"] as const).map((base) => <label key={base}>
                      <input type="radio" name="hr-absenteeism-base" checked={draftCard.absenteeismBase === base}
                        onChange={() => setDraftCard({ ...draftCard, absenteeismBase: base })} />{absenteeismBaseLabels[base]}
                    </label>)}
                  </div>
                </details> : null}
                {draftCard.types.includes("leave") ? <CardChoices title="Afastado · motivo" field="leaveReasons" value={draftCard} onChange={setDraftCard}
                  options={[...leaveReasons, "Não especificado"].map((label) => ({ value: label, label }))} /> : null}
                {draftCard.types.includes("license") ? <CardChoices title="Licença · modalidade" field="licenses" value={draftCard} onChange={setDraftCard}
                  options={[...licenseReasons, "Não especificado"].map((label) => ({ value: label, label }))} /> : null}
                {draftCard.types.includes("dayOff") ? <CardChoices title="Folga · dias da semana" field="dayOffDays" value={draftCard} onChange={setDraftCard} options={weekdayOptions} /> : null}
              </>}
            </div>
            <div className="hr-card-modal-preview">{editingCard === "employees" ? "Funcionários ativos" : editingCard === "planned" ? "Calendário anual" : editingCard === "worked" ? "Período de ponto" : editingCard === "absenteeism" ? "Cálculo do absenteísmo" : editingCard === "loss" ? "Perda calculada" : "Critérios selecionados"}: <strong>{editingCard === "employees" ? formatInteger(draftEmployeeTotal) : editingCard === "planned" ? `${formatInteger(countCalendarDaysInYear(draftPlannedYear, draftCard.plannedWeekdays, annualHolidayDates))} dia(s) em ${draftPlannedYear} · feriados excluídos` : editingCard === "worked" ? draftPlannedYear === plannedYear && annualDaysReady && annualWorkedPeriod.first ? `${formatInteger(countCalendarDaysBetween(annualWorkedPeriod.first, annualWorkedPeriod.last, draftCard.plannedWeekdays, annualHolidayDates))} dia(s) de ${formatDate(annualWorkedPeriod.first)} a ${formatDate(annualWorkedPeriod.last)}` : `Consultar datas salvas em ${draftPlannedYear} ao aplicar` : editingCard === "absenteeism" ? draftAbsenteeismPreview : editingCard === "loss" ? `${draftCard.types.map((type) => absenceLabels[type]).join(" + ") || "Nenhum tipo"} · ${draftCard.kinds.length} vínculo(s) · ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(sumCardLoss(draftCard))}` : `${draftCard.types.map((type) => absenceLabels[type]).join(" + ") || "Nenhum tipo"}`}</strong></div>
            {editingCard === "employees" ? <small>Este card mostra o total de funcionários ativos no cadastro, conforme o tipo de vínculo selecionado.</small> : null}
            {sharedMessage ? <p className="hr-card-modal-error" role="alert">{sharedMessage}</p> : null}
            <div className="hr-card-modal-actions">
              <button type="button" className="hr-card-default-button" disabled={savingShared} onClick={saveSharedCardSettings}>Visualização Padrão</button>
              <button type="button" onClick={() => setEditingCard(null)}>Cancelar</button>
              <button type="button" className="hr-card-apply-button" onClick={applyCardSettings}>Aplicar filtros</button>
            </div>
            <small>{editingCard === "planned" || editingCard === "worked" ? "O ano volta ao ano vigente ao sair desta tela. No grupo, feriados de qualquer empresa selecionada são excluídos. " : editingCard === "absenteeism" ? "Quem faltou em mais de 10 dias úteis de ponto seguidos, terminando no último ponto salvo da empresa, sai da conta. Uma presença no último ponto zera a sequência. As faltas seguem o período filtrado; as bases anuais seguem o ano e os feriados dos cards de dias. " : ""}Aplicar filtros dura até sair do Controle RH. Visualização Padrão salva os critérios para todos, sem fixar o ano.</small>
          </section>
        </div>
      ) : null}

      {editingChart && draftChart ? (
        <div className="hr-card-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingChart(null); }}>
          <section className="hr-card-modal" role="dialog" aria-modal="true" aria-labelledby="hr-chart-modal-title"
            onKeyDown={(event) => { if (event.key === "Escape") setEditingChart(null); }}>
            <button className="hr-card-modal-close" type="button" aria-label="Fechar" onClick={() => setEditingChart(null)}><X size={20} /></button>
            <h2 id="hr-chart-modal-title">Personalizar: {editingChart === "monthlyCount" ? "faltas por mês" : "% de faltas por mês"}</h2>
            <p>Escolha os tipos de falta exibidos nos últimos 12 meses até o último ponto salvo.</p>
            <div className="hr-card-modal-sections">
              <ChartChoices title="Tipos de falta" field="types" value={draftChart} onChange={setDraftChart}
                options={Object.entries(absenceLabels).map(([value, label]) => ({ value, label }))} />
              {draftChart.types.includes("leave") ? <ChartChoices title="Afastado · motivo" field="leaveReasons" value={draftChart} onChange={setDraftChart}
                options={[...leaveReasons, "Não especificado"].map((label) => ({ value: label, label }))} /> : null}
              {draftChart.types.includes("license") ? <ChartChoices title="Licença · modalidade" field="licenses" value={draftChart} onChange={setDraftChart}
                options={[...licenseReasons, "Não especificado"].map((label) => ({ value: label, label }))} /> : null}
              {draftChart.types.includes("dayOff") ? <ChartChoices title="Folga · dias da semana" field="dayOffDays" value={draftChart} onChange={setDraftChart}
                options={weekdayOptions} /> : null}
            </div>
            <div className="hr-card-modal-preview">{monthlyChartsReady ? <>
              Últimos 12 meses: <strong>{formatInteger(draftMonthlyRows.reduce((sum, row) => sum + row.missedDays, 0))} ocorrência(s) · {monthChartLabel(monthlyKeys[0] || monthKey(monthAnchorDate))} a {monthChartLabel(monthlyKeys[monthlyKeys.length - 1] || monthKey(monthAnchorDate))}{editingChart === "monthlyPercent" ? ` · último mês: ${formatPercent(draftMonthlyRows[draftMonthlyRows.length - 1]?.percent || 0)}` : ""}</strong>
            </> : monthlyRangeData.status === "error" || monthlySavedDaysStatus === "error" ? "Não foi possível consultar os meses." : "Consultando os últimos 12 meses…"}</div>
            {sharedMessage ? <p className="hr-card-modal-error" role="alert">{sharedMessage}</p> : null}
            <div className="hr-card-modal-actions">
              <button type="button" className="hr-card-default-button" disabled={savingShared} onClick={saveSharedMonthlySettings}>Visualização Padrão</button>
              <button type="button" onClick={() => setEditingChart(null)}>Cancelar</button>
              <button type="button" className="hr-card-apply-button" onClick={applyMonthlySettings}>Aplicar filtros</button>
            </div>
            <small>Empresa, equipe e funcionário seguem os filtros da tela. Os gráficos mostram sempre 12 meses, independentemente das datas inicial e final. Aplicar filtros dura até sair do Controle RH; Visualização Padrão salva os critérios para todos.</small>
          </section>
        </div>
      ) : null}

      {periodReady && activeView === "general" ? (
        <>
          <div className="hr-metric-grid hr-summary-metrics" aria-label="Resumo de Controle RH">
            {metricCards.map((metric) => {
              const Icon = metric.icon;
              return (
                <article className={`hr-metric-card is-${metric.tone} is-customizable`} key={metric.id} onDoubleClick={() => openCardSettings(metric.id)} title="Dê dois cliques para personalizar" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") openCardSettings(metric.id); }}>
                  <div className="hr-metric-icon"><Icon size={24} /></div>
                  <div className="hr-metric-copy">
                    <span>{metric.label}</span>
                    <div className="hr-metric-value-row">
                      <strong>{metric.value}</strong>
                      <div className={`hr-metric-trend is-${metric.trend.tone}`} title={metric.trend.title}>
                        <b>{metric.trend.label}</b><small>{metric.trend.caption}</small>
                      </div>
                    </div>
                    {metric.id === "planned" ? <small className="hr-card-year">Ano {plannedYear} · dias do calendário</small> : null}
                    {metric.id === "worked" ? <small className="hr-card-year">{annualDaysReady ? annualWorkedPeriod.first ? `${formatDate(annualWorkedPeriod.first)} a ${formatDate(annualWorkedPeriod.last)}` : `Sem ponto salvo em ${plannedYear}` : annualDaysStatus === "error" ? "Não foi possível consultar os pontos" : "Consultando pontos salvos…"}</small> : null}
                    {metric.id === "absenteeism" ? <small className="hr-card-year">{streakPointData.status === "error" ? "Não foi possível consultar os pontos" : !absenteeismStreakReady ? "Consultando faltas consecutivas…" : `Base: ${absenteeismBaseLabels[cardSettings.absenteeism.absenteeismBase]}`}</small> : null}
                  </div>
                  <Settings2 className="hr-card-settings-icon" size={16} aria-label="Personalizar" />
                </article>
              );
            })}
          </div>

          <div className="hr-dashboard-grid hr-general-dashboard">
            <section className="hr-chart-panel">
              <header className="hr-chart-header">
                <div>
                  <h2><ChartColumn size={18} /> Ausência por equipe do dia</h2>
                  <span>Atestados + faltas - {periodText}</span>
                </div>
              </header>
              <HorizontalBarChart rows={teamAbsenceRows} />
            </section>

            <section className="hr-chart-panel">
              <header className="hr-chart-header">
                <div>
                  <h2><ChartColumn size={18} /> % por equipe do dia</h2>
                  <span>Faltas + atestados / dias previstos</span>
                </div>
              </header>
              <HorizontalBarChart rows={teamAbsencePercentRows} formatter={formatPercent} />
            </section>

            <section className="hr-chart-panel" onDoubleClick={() => openMonthlySettings("monthlyCount")}>
              <header className="hr-chart-header">
                <div>
                  <h2><ChartColumn size={18} /> Faltas e atestados por mês</h2>
                  <span>Últimos 12 meses · {monthChartLabel(monthlyKeys[0] || monthKey(monthAnchorDate))} a {monthChartLabel(monthlyKeys[monthlyKeys.length - 1] || monthKey(monthAnchorDate))}</span>
                </div>
                <button type="button" className="hr-chart-settings-button" onClick={() => openMonthlySettings("monthlyCount")}><Settings2 size={16} /> Personalizar</button>
              </header>
              {monthlyChartsReady ? <MonthlyGroupedChart rows={monthlyCountRows} types={chartSettings.monthlyCount.types} />
                : <div className="hr-empty-chart">{monthlyRangeData.status === "error" || monthlySavedDaysStatus === "error" ? "Não foi possível carregar os 12 meses." : "Carregando os 12 meses…"}</div>}
            </section>

            <section className="hr-chart-panel">
              <header className="hr-chart-header">
                <div>
                  <h2><ChartColumn size={18} /> Admissões x demissões por mês</h2>
                  <span>Evolução do quadro de funcionários</span>
                </div>
              </header>
              <EmployeeMovementChart employees={data.employees} startDate={startDate} endDate={endDate} />
            </section>

            <section className="hr-chart-panel" onDoubleClick={() => openMonthlySettings("monthlyPercent")}>
              <header className="hr-chart-header">
                <div>
                <h2><ChartColumn size={18} /> Faltas e atestados por mês (%)</h2>
                  <span>Tipos selecionados / dias previstos do mês · 12 meses</span>
                </div>
                <button type="button" className="hr-chart-settings-button" onClick={() => openMonthlySettings("monthlyPercent")}><Settings2 size={16} /> Personalizar</button>
              </header>
              {monthlyChartsReady ? <MonthlyPercentChart rows={monthlyPercentRows} types={chartSettings.monthlyPercent.types} />
                : <div className="hr-empty-chart">{monthlyRangeData.status === "error" || monthlySavedDaysStatus === "error" ? "Não foi possível carregar os 12 meses." : "Carregando os 12 meses…"}</div>}
            </section>
          </div>
        </>
      ) : null}

      {periodReady && activeView === "overtime" ? (
        <div className="hr-dashboard-grid hr-general-dashboard">
          <section className="hr-chart-panel hr-wide-chart">
            <header className="hr-chart-header">
              <div>
                <h2><ChartColumn size={18} /> Horas extras por equipe do dia</h2>
                <span>{periodText}</span>
              </div>
            </header>
            <HorizontalBarChart rows={overtimeByTeam} formatter={formatHours} />
          </section>

          <section className="hr-chart-panel hr-wide-chart">
            <header className="hr-chart-header">
              <div>
                <h2><ChartColumn size={18} /> Horas extras por mês</h2>
                <span>Somatório de HE no período filtrado</span>
              </div>
            </header>
            <ColumnChart rows={overtimeByMonth} formatter={formatHours} color="#1f95ed" />
          </section>

          <section className="hr-chart-panel hr-wide-chart">
            <header className="hr-chart-header">
              <div>
                <h2><ChartColumn size={18} /> Horas extras por funcionário</h2>
                <span>Distribuição por colaborador no período filtrado</span>
              </div>
            </header>
            <EmployeeOvertimeChart employees={baseEmployees} records={baseFilteredRecords} />
          </section>
        </div>
      ) : null}

      {periodReady && activeView === "absenceTypes" ? (
        <div className="hr-dashboard-grid hr-general-dashboard">
          <section className="hr-chart-panel hr-wide-chart">
            <header className="hr-chart-header">
              <div>
                <h2><ChartColumn size={18} /> Distribuição por tipo de falta</h2>
                <span>Percentual sobre o total de ocorrências selecionadas</span>
              </div>
            </header>
            <HorizontalBarChart rows={absenceTypePercentRows} formatter={formatPercent} />
          </section>

          <section className="hr-chart-panel">
            <header className="hr-chart-header">
              <div>
                <h2><ChartPie size={18} /> Total por tipo</h2>
                <span>Volume de ocorrências por categoria</span>
              </div>
            </header>
            <PieSummary rows={absencePieRows} />
          </section>

          <section className="hr-chart-panel">
            <header className="hr-chart-header">
              <div>
                <h2><HeartPulse size={18} /> Faltas confirmadas</h2>
                <span>Funcionários com status de falta confirmada</span>
              </div>
            </header>
            <HorizontalBarChart rows={warningRows} />
          </section>

          <section className="hr-chart-panel hr-wide-chart">
            <header className="hr-chart-header">
              <div>
                <h2><HeartPulse size={18} /> Faltas confirmadas / atestados (maior que 3)</h2>
                <span>Funcionarios acima do limite no periodo selecionado</span>
              </div>
            </header>
            <DualBarChart
              rows={repeatedAbsenceRows}
              primaryLabel={absenceTypeLabels.confirmed}
              secondaryLabel={absenceTypeLabels.certificate}
            />
          </section>
        </div>
      ) : null}

      {periodReady && activeView === "absenceMonitoring" ? (
        <div className="hr-dashboard-grid hr-general-dashboard">
          <section className="hr-chart-panel hr-wide-chart">
            <header className="hr-chart-header">
              <div>
                <h2><Users size={18} /> Funcionários com faltas consecutivas</h2>
                <span>Último ponto salvo da empresa e sequência de ausências consecutivas</span>
              </div>
            </header>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
              {absenceMonitoringPieRows.map((row) => {
                const filter = row.label.includes("3 a 9") ? "recurrence" : row.label.includes("10 a 29") ? "alert" : "abandonment";
                const isActive = monitoringRiskFilter === filter;
                const tone = filter === "recurrence" ? { border: "#ec6b35", background: "#fff6f2", icon: "#ec6b35", text: "#c65f29" }
                  : filter === "alert" ? { border: "#d59a22", background: "#fffaf0", icon: "#d59a22", text: "#9a6b00" }
                  : { border: "#d94f5c", background: "#fff3f3", icon: "#d94f5c", text: "#b0333a" };

                return (
                  <button
                    key={row.label}
                    type="button"
                    onClick={() => setMonitoringRiskFilter((current) => current === filter ? "all" : filter)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: `2px solid ${isActive ? tone.border : "#dfe7ee"}`,
                      background: isActive ? tone.background : "#f5f7fb",
                      color: tone.text,
                      cursor: "pointer",
                      minHeight: 90,
                      boxShadow: isActive ? `0 0 0 1px ${tone.border} inset` : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 999, background: "rgba(255,255,255,0.8)", color: tone.icon }}>
                        <AlertTriangle size={14} />
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", lineHeight: 1.2, whiteSpace: "nowrap" }}>
                        Falta: {row.label.replace("Recorrência:", "").replace("Alerta:", "").replace("Abandono:", "")}
                      </span>
                    </div>
                    <strong style={{ fontSize: 34, lineHeight: 1, fontWeight: 800, color: tone.icon }}>{formatInteger(row.value)}</strong>
                  </button>
                );
              })}
            </div>

            <HorizontalBarChart rows={absenceMonitoringChartRows} formatter={(value) => `${formatInteger(value)} dias`} />
          </section>

        </div>
      ) : null}

      {periodReady && activeView === "cids" ? (
        <section className="hr-chart-panel hr-wide-chart hr-general-dashboard">
          <header className="hr-chart-header">
            <div>
              <h2><Stethoscope size={18} /> CIDs em atestados</h2>
              <span>Pizza por CID registrado e lista de funcionarios por categoria</span>
            </div>
          </header>
          <div className="hr-cid-pie-grid">
            <CidPieChart rows={cidPieRows} selectedLabel={selectedCidRow?.label || ""} onSelect={setSelectedCidLabel} />
            <aside className="hr-cid-selection-panel">
              <header>
                <span>CID selecionado</span>
                <strong>{selectedCidRow?.label || "Nenhum CID"}</strong>
                {selectedCidRow ? <small>{selectedCidRow.category} - {formatInteger(selectedCidRow.value)} registro(s)</small> : null}
              </header>

              <div className="hr-cid-employee-list">
                {selectedCidEmployees.map((entry) => (
                  <article key={`${entry.employeeName}-${entry.category}`}>
                    <strong>{entry.employeeName}</strong>
                    <span>{entry.category}</span>
                    <small>{formatInteger(entry.count)} registro(s): {entry.dates.map(formatDate).join(", ")}</small>
                  </article>
                ))}
                {!selectedCidEmployees.length ? <p className="muted">Clique em uma fatia do grafico para ver os funcionarios.</p> : null}
              </div>
            </aside>
          </div>
          {cidRows.length ? (
            <div className="hr-cid-breakdown">
              {cidRows.map((row) => (
                <article className="hr-cid-group" key={row.category}>
                  <header>
                    <strong>{row.category}</strong>
                    <span>{formatInteger(row.count)}</span>
                  </header>
                  <div>
                    {row.cids.slice(0, 8).map((cid) => (
                      <p key={cid.label}>
                        <span>{cid.label}</span>
                        <strong>{formatInteger(cid.count)}</strong>
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
