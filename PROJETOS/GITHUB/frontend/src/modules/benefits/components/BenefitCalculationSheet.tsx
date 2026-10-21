import { ArrowDown, ArrowUp, ChevronDown, Download, RefreshCcw, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ModalPortal from "@/modules/shared/ModalPortal";
import "./benefitCalculation.css";
import { useDomainData } from "@/hooks/useDomainData";
import { employeeKindLabels, employeeKindOf, type EmployeeKind } from "@/common/utils/employeeKind";
import { loadTimeRecordsRange } from "@/modules/timekeeping/data/timeRecordsRepository";
import type { BenefitContract, Employee, TimeRecord } from "@/types/domain";
import { formatCurrency, todayISO } from "@/utils/format";
import {
  calculateBenefitRows,
  calendarBusinessDays,
  periodKey,
  periodPartLabels,
  periodRange,
  pointSettingsForCompany,
  type BenefitPeriodPart,
  type BenefitCalcRow,
  type BenefitCalcRule,
} from "../calculation/benefitCalculation";
import { exportBenefitOrder } from "../calculation/orderExport";

type SortKey = "name" | "cpf" | "department" | "kind" | "businessDays" | "payableDays" | "value" | `c:${string}`;
type SortState = { key: SortKey; direction: 1 | -1 };

function previousMonth() {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatCpf(value?: string) {
  const digits = String(value || "").replace(/\D/g, "").padStart(11, "0");
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatDay(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function BenefitCalculationSheet({
  benefit,
  rule,
  ruleSaved,
  employees,
  onSaveRule,
}: {
  benefit: BenefitContract;
  rule: BenefitCalcRule;
  ruleSaved: boolean;
  employees: Employee[];
  onSaveRule: (rule: BenefitCalcRule) => Promise<void>;
}) {
  const data = useDomainData();
  const [month, setMonth] = useState(previousMonth);
  const [periodPart, setPeriodPart] = useState<BenefitPeriodPart>(rule.period === "biweekly" ? "first_half" : "month");
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
  const [departmentMenuOpen, setDepartmentMenuOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<EmployeeKind | "">("");
  const [sort, setSort] = useState<SortState>({ key: "name", direction: 1 });
  const [businessDaysDraft, setBusinessDaysDraft] = useState("");
  const [savingDays, setSavingDays] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportForm, setExportForm] = useState({ creditDate: todayISO(), departmentLabel: "", skipZero: true });
  const [exporting, setExporting] = useState(false);

  const settings = useMemo(
    () => pointSettingsForCompany(data.timekeepingColumns, benefit.companyId),
    [benefit.companyId, data.timekeepingColumns],
  );
  const calendarDays = useMemo(() => calendarBusinessDays(month, settings, periodPart), [month, periodPart, settings]);
  const overrideKey = periodKey(month, periodPart);
  const overrideDays = rule.businessDaysOverrides[overrideKey];
  const range = periodRange(month, periodPart);
  const periodText = periodPart === "month"
    ? monthLabel(month)
    : `${String(range.startDay).padStart(2, "0")} a ${String(range.endDay).padStart(2, "0")} de ${monthLabel(month)}`;
  const businessDays = overrideDays ?? calendarDays;

  useEffect(() => {
    setBusinessDaysDraft(String(businessDays));
  }, [businessDays]);

  async function loadRecords(forceRefresh = false) {
    const { start, end } = periodRange(month, periodPart);
    setLoading(true);
    setLoadError("");
    try {
      setRecords(await loadTimeRecordsRange(start, end, { forceRefresh }));
    } catch (error) {
      setRecords([]);
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar o ponto.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, periodPart]);

  const departmentNameById = useMemo(
    () => new Map(data.departments.map((department) => [department.id, department.name])),
    [data.departments],
  );
  const departmentOptions = useMemo(
    () => [...new Set(employees.map((employee) => departmentNameById.get(employee.departmentId) || "Sem departamento"))]
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [departmentNameById, employees],
  );

  // Desligado só entra se trabalhou no mês apurado (pedido do mês em que saiu).
  const eligibleEmployees = useMemo(() => {
    const presentIds = new Set(records.filter((record) => record.status === "present").map((record) => record.employeeId));
    return employees.filter((employee) => employee.status !== "terminated" || presentIds.has(employee.id));
  }, [employees, records]);

  const rows = useMemo(
    () => calculateBenefitRows({ employees: eligibleEmployees, records, rule, businessDays, settings }),
    [businessDays, eligibleEmployees, records, rule, settings],
  );

  const departmentOf = (employee: Employee) => departmentNameById.get(employee.departmentId) || "Sem departamento";

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const termDigits = term.replace(/\D/g, "");
    const filtered = rows.filter(({ employee }) => (
      (!departmentFilter.length || departmentFilter.includes(departmentOf(employee)))
      && (!kindFilter || employeeKindOf(employee) === kindFilter)
      && (!term
        || employee.name.toLowerCase().includes(term)
        || (termDigits.length >= 3 && String(employee.cpf || "").replace(/\D/g, "").includes(termDigits)))
    ));
    const sortValue = (row: BenefitCalcRow): string | number => {
      if (sort.key === "name") return row.employee.name;
      if (sort.key === "cpf") return String(row.employee.cpf || "");
      if (sort.key === "department") return departmentOf(row.employee);
      if (sort.key === "kind") return employeeKindLabels[employeeKindOf(row.employee)];
      if (sort.key.startsWith("c:")) return row.counts[sort.key.slice(2)] || 0;
      return row[sort.key as "businessDays" | "payableDays" | "value"];
    };
    return [...filtered].sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      const result = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "pt-BR");
      return result * sort.direction;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentFilter, kindFilter, rows, search, sort]);

  const totals = useMemo(() => {
    const counts: Record<string, number> = {};
    rule.components.forEach((component) => {
      counts[component.id] = visibleRows.reduce((sum, row) => sum + (row.counts[component.id] || 0), 0);
    });
    return {
      counts,
      payableDays: visibleRows.reduce((sum, row) => sum + row.payableDays, 0),
      value: visibleRows.reduce((sum, row) => sum + row.value, 0),
    };
  }, [rule.components, visibleRows]);

  function toggleSort(key: SortKey) {
    setSort((current) => (current.key === key ? { key, direction: current.direction === 1 ? -1 : 1 } : { key, direction: 1 }));
  }

  function sortIcon(key: SortKey) {
    if (sort.key !== key) return null;
    return sort.direction === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  }

  async function saveBusinessDays(nextValue: number | null) {
    const overrides = { ...rule.businessDaysOverrides };
    if (nextValue === null || nextValue === calendarDays) delete overrides[overrideKey];
    else overrides[overrideKey] = nextValue;
    setSavingDays(true);
    try {
      await onSaveRule({ ...rule, businessDaysOverrides: overrides });
    } finally {
      setSavingDays(false);
    }
  }

  function commitBusinessDaysDraft() {
    const parsed = Number(businessDaysDraft);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 31) {
      setBusinessDaysDraft(String(businessDays));
      return;
    }
    if (parsed !== businessDays) void saveBusinessDays(parsed);
  }

  function openExport() {
    setExportForm((current) => ({
      ...current,
      departmentLabel: rule.order.departmentLabel || (departmentFilter.length === 1 ? departmentFilter[0].toUpperCase() : ""),
    }));
    setExportOpen(true);
  }

  async function confirmExport() {
    const exportRows = visibleRows
      .filter((row) => !exportForm.skipZero || row.value > 0)
      .map((row) => ({ employee: row.employee, value: row.value }));
    setExporting(true);
    try {
      const suffix = exportForm.departmentLabel ? ` ${exportForm.departmentLabel}` : "";
      await exportBenefitOrder({
        fileName: `${benefit.name} ${month}${periodPart === "first_half" ? " 1a quinzena" : periodPart === "second_half" ? " 2a quinzena" : ""}${suffix}.xlsx`,
        company: data.companies.find((company) => company.id === benefit.companyId),
        layout: { ...rule.order, departmentLabel: exportForm.departmentLabel },
        creditDate: exportForm.creditDate,
        rows: exportRows,
      });
      setExportOpen(false);
    } finally {
      setExporting(false);
    }
  }

  const hasFilters = Boolean(search || departmentFilter.length || kindFilter);

  return (
    <section className="benefit-sheet">
      {!ruleSaved ? (
        <p className="benefit-sheet-notice">
          A regra deste benefício ainda não foi salva. A apuração usa a regra sugerida
          {rule.dailyValue ? ` (valor por dia ${formatCurrency(rule.dailyValue)})` : " (sem valor por dia)"} — confira na aba “Regra de cálculo”.
        </p>
      ) : null}

      <div className="benefit-sheet-toolbar">
        <label className="benefit-sheet-field">
          <span>Mês de referência</span>
          <input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
        </label>
        <label className="benefit-sheet-field">
          <span>Período</span>
          <select value={periodPart} onChange={(event) => setPeriodPart(event.target.value as BenefitPeriodPart)}>
            {(Object.keys(periodPartLabels) as BenefitPeriodPart[]).map((part) => <option key={part} value={part}>{periodPartLabels[part]}</option>)}
          </select>
        </label>
        <div className={`benefit-sheet-field ${overrideDays !== undefined ? "is-overridden" : ""}`}>
          <span>Dias úteis</span>
          <div className="benefit-sheet-days">
            <input
              type="number"
              aria-label="Dias úteis"
              min={0}
              max={31}
              value={businessDaysDraft}
              disabled={savingDays}
              onChange={(event) => setBusinessDaysDraft(event.target.value)}
              onBlur={commitBusinessDaysDraft}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
            />
            {overrideDays !== undefined ? (
              <button type="button" className="icon-button" title={`Voltar para o calendário (${calendarDays})`} disabled={savingDays} onClick={() => void saveBusinessDays(null)}>
                <RotateCcw size={14} />
              </button>
            ) : null}
          </div>
          <small>{overrideDays !== undefined ? `Corrigido à mão · calendário: ${calendarDays}` : "Pelo calendário do ponto"}</small>
        </div>
        <div className="benefit-sheet-field">
          <span>Departamento</span>
          <div className="benefit-sheet-multi">
            <button type="button" onClick={() => setDepartmentMenuOpen((current) => !current)} aria-expanded={departmentMenuOpen}>
              {departmentFilter.length ? departmentFilter.join(", ") : "Todos"} <ChevronDown size={14} />
            </button>
            {departmentMenuOpen ? (
              <div className="benefit-sheet-multi-menu" onMouseLeave={() => setDepartmentMenuOpen(false)}>
                {departmentOptions.map((name) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={departmentFilter.includes(name)}
                      onChange={() => setDepartmentFilter((current) => (
                        current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
                      ))}
                    />
                    {name}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <label className="benefit-sheet-field">
          <span>Tipo de contrato</span>
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as EmployeeKind | "")}>
            <option value="">Todos</option>
            {(Object.keys(employeeKindLabels) as EmployeeKind[]).map((kind) => <option key={kind} value={kind}>{employeeKindLabels[kind]}</option>)}
          </select>
        </label>
        <label className="benefit-sheet-search">
          <Search size={16} />
          <input placeholder="Buscar nome ou CPF" value={search} onChange={(event) => setSearch(event.target.value)} />
          {hasFilters ? (
            <button type="button" aria-label="Limpar filtros" onClick={() => { setSearch(""); setDepartmentFilter([]); setKindFilter(""); }}><X size={14} /></button>
          ) : null}
        </label>
        <div className="benefit-sheet-actions">
          <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void loadRecords(true)}>
            <RefreshCcw size={15} /> Recarregar ponto
          </button>
          <button type="button" className="btn btn-primary" disabled={loading || !visibleRows.length} onClick={openExport}>
            <Download size={15} /> Exportar pedido
          </button>
        </div>
      </div>

      <div className="benefit-sheet-summary">
        <span>Período <strong>{periodText}</strong></span>
        <span><strong>{visibleRows.length}</strong> {visibleRows.length === 1 ? "funcionário" : "funcionários"}</span>
        <span>Valor por dia <strong>{formatCurrency(rule.dailyValue)}</strong></span>
        <span>Total <strong>{formatCurrency(totals.value)}</strong></span>
        <span className="benefit-sheet-formula">
          Dias a pagar = Dias úteis {rule.components.map((component) => `${component.sign > 0 ? "+" : "−"} ${component.label}`).join(" ")}
        </span>
      </div>

      {loadError ? <p className="benefit-sheet-error">{loadError}</p> : null}

      <div className="benefit-sheet-grid-wrap">
        {loading ? <div className="benefit-sheet-loading">Carregando ponto de {periodText}…</div> : null}
        <table className="benefit-sheet-grid">
          <thead>
            <tr>
              <th className="is-index">#</th>
              <th className="is-name" onClick={() => toggleSort("name")}>Funcionário {sortIcon("name")}</th>
              <th onClick={() => toggleSort("cpf")}>CPF {sortIcon("cpf")}</th>
              <th onClick={() => toggleSort("department")}>Departamento {sortIcon("department")}</th>
              <th onClick={() => toggleSort("kind")}>Tipo {sortIcon("kind")}</th>
              <th className="is-number" onClick={() => toggleSort("businessDays")}>Dias úteis {sortIcon("businessDays")}</th>
              {rule.components.map((component) => (
                <th
                  key={component.id}
                  className={`is-number ${component.sign > 0 ? "is-plus" : "is-minus"}`}
                  onClick={() => toggleSort(`c:${component.id}`)}
                >
                  {component.sign > 0 ? "+" : "−"} {component.label} {sortIcon(`c:${component.id}`)}
                </th>
              ))}
              <th className="is-number" onClick={() => toggleSort("payableDays")}>Dias a pagar {sortIcon("payableDays")}</th>
              <th className="is-number is-value" onClick={() => toggleSort("value")}>Valor {sortIcon("value")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={row.employee.id} className={row.value <= 0 ? "is-zero" : ""}>
                <td className="is-index">{index + 1}</td>
                <td className="is-name">
                  <div className="benefit-sheet-name">
                    <span>{row.employee.name}</span>
                    {row.employee.status === "terminated" ? <small className="is-terminated">Desligado</small> : null}
                  </div>
                </td>
                <td>{formatCpf(row.employee.cpf)}</td>
                <td>{departmentOf(row.employee)}</td>
                <td>{employeeKindLabels[employeeKindOf(row.employee)]}</td>
                <td className="is-number">{row.businessDays}</td>
                {rule.components.map((component) => {
                  const count = row.counts[component.id] || 0;
                  return (
                    <td
                      key={component.id}
                      className={`is-number ${count ? "has-value" : "is-empty"}`}
                      title={count ? `Dias: ${row.dates[component.id].map(formatDay).join(", ")}` : undefined}
                    >
                      {count || "–"}
                    </td>
                  );
                })}
                <td className="is-number">{row.payableDays}</td>
                <td className="is-number is-value">{formatCurrency(row.value)}</td>
              </tr>
            ))}
            {!visibleRows.length && !loading ? (
              <tr>
                <td className="benefit-sheet-empty" colSpan={8 + rule.components.length}>
                  {employees.length ? "Nenhum funcionário com esses filtros." : "Nenhum funcionário vinculado. Vincule na aba “Funcionários”."}
                </td>
              </tr>
            ) : null}
          </tbody>
          {visibleRows.length ? (
            <tfoot>
              <tr>
                <td className="is-index" />
                <td className="is-name">Total</td>
                <td colSpan={4} />
                {rule.components.map((component) => <td key={component.id} className="is-number">{totals.counts[component.id]}</td>)}
                <td className="is-number">{totals.payableDays}</td>
                <td className="is-number is-value">{formatCurrency(totals.value)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {exportOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={(event) => { event.preventDefault(); void confirmExport(); }}>
            <div className="modal-header"><h2>Exportar pedido</h2><button className="icon-button" type="button" disabled={exporting} onClick={() => setExportOpen(false)} aria-label="Fechar"><X size={18} /></button></div>
            <p className="benefit-sheet-export-text">
              Planilha no layout “Realizar Pedido” do fornecedor, com os {visibleRows.length} funcionários filtrados.
              O valor vai na coluna <strong>{rule.order.providerColumn}</strong>.
            </p>
            {!rule.order.contractNumber ? <p className="benefit-sheet-error">Número do contrato não configurado na aba “Regra de cálculo”.</p> : null}
            <div className="form-grid">
              <label className="field">Data de crédito<input required type="date" disabled={exporting} value={exportForm.creditDate} onChange={(event) => setExportForm((current) => ({ ...current, creditDate: event.target.value }))} /></label>
              <label className="field">Departamento no pedido<input disabled={exporting} value={exportForm.departmentLabel} placeholder="Ex.: OPERACIONAL" onChange={(event) => setExportForm((current) => ({ ...current, departmentLabel: event.target.value }))} /></label>
              <label className="check-field is-wide-field"><input type="checkbox" disabled={exporting} checked={exportForm.skipZero} onChange={(event) => setExportForm((current) => ({ ...current, skipZero: event.target.checked }))} />Não incluir quem ficou com valor R$ 0,00</label>
            </div>
            <div className="form-actions"><button className="btn btn-ghost" type="button" disabled={exporting} onClick={() => setExportOpen(false)}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={exporting}><Download size={15} /> {exporting ? "Gerando..." : "Baixar Excel"}</button></div>
          </form>
        </ModalPortal>
      ) : null}
    </section>
  );
}
