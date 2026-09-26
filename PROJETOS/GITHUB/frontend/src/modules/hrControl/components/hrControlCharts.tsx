import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { formatDate } from "@/utils/format";
import { employeeKindLabels, employeeKindOf, type EmployeeKind } from "@/common/utils/employeeKind";
import {
  absenceLabels,
  monthlyTypeColors,
  parseLocalDate,
  toISODate,
  localTodayISO,
  formatInteger,
  formatPercent,
  formatHours,
  describePieSlice,
  tooltipText,
  overtimeHours,
  type ChartRow,
  type DualChartRow,
  type MonthChartRow,
  type CidPieRow,
  type MonthlyChartId,
  type MonthlyChartPreferences,
  type CardId,
  type CardPreferences,
  type CardChoiceField,
} from "@/modules/hrControl/domain/hrControlModel";
import type { Employee, TimeRecord, TimekeepingDayTable } from "@/types/domain";

export function HorizontalBarChart({
  rows,
  formatter = formatInteger,
}: {
  rows: ChartRow[];
  formatter?: (value: number) => string;
}) {
  const maxValue = Math.max(1, ...rows.map((row) => row.value));

  if (!rows.length) {
    return <div className="hr-empty-chart">Sem dados no período selecionado.</div>;
  }

  return (
    <div className="hr-bar-chart">
      {rows.map((row) => {
        const width = `${Math.max(4, (row.value / maxValue) * 100)}%`;
        const tooltip = tooltipText([
          row.label,
          `Valor: ${formatter(row.value)}`,
          row.detail,
        ]);
        return (
          <div
            className="hr-bar-row hr-has-tooltip"
            data-tooltip={tooltip}
            key={row.label}
            tabIndex={0}
            aria-label={tooltip}
          >
            <div className="hr-bar-label" title={row.label}>{row.label}</div>
            <div className="hr-bar-track" aria-label={`${row.label}: ${formatter(row.value)}`}>
              <span
                className="hr-bar-fill"
                style={{ "--hr-target-width": width, backgroundColor: row.color } as CSSProperties}
              />
            </div>
            <div className="hr-bar-value">{formatter(row.value)}</div>
            {row.detail ? <div className="hr-bar-detail">{row.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

export function DualBarChart({
  rows,
  primaryLabel,
  secondaryLabel,
}: {
  rows: DualChartRow[];
  primaryLabel: string;
  secondaryLabel: string;
}) {
  const maxValue = Math.max(1, ...rows.map((row) => Math.max(row.primary, row.secondary)));

  if (!rows.length) {
    return <div className="hr-empty-chart">Sem dados no período selecionado.</div>;
  }

  return (
    <div className="hr-dual-chart">
      <div className="hr-chart-legend">
        <span><i className="hr-dot is-primary" /> {primaryLabel}</span>
        <span><i className="hr-dot is-secondary" /> {secondaryLabel}</span>
      </div>
      {rows.map((row) => {
        const tooltip = tooltipText([
            row.label,
            `${primaryLabel}: ${formatInteger(row.primary)}`,
            `${secondaryLabel}: ${formatInteger(row.secondary)}`,
            `Total: ${formatInteger(row.primary + row.secondary)}`,
        ]);
        return (
        <div
          className="hr-dual-row hr-has-tooltip"
          data-tooltip={tooltip}
          key={row.label}
          tabIndex={0}
          aria-label={tooltip}
        >
          <strong title={row.label}>{row.label}</strong>
          <div className="hr-dual-bars">
            <span
              className="hr-dual-bar is-primary"
              style={{ "--hr-target-width": `${Math.max(4, (row.primary / maxValue) * 100)}%` } as CSSProperties}
            >
              {row.primary ? formatInteger(row.primary) : ""}
            </span>
            <span
              className="hr-dual-bar is-secondary"
              style={{ "--hr-target-width": `${Math.max(4, (row.secondary / maxValue) * 100)}%` } as CSSProperties}
            >
              {row.secondary ? formatInteger(row.secondary) : ""}
            </span>
          </div>
        </div>
        );
      })}
    </div>
  );
}

export function PieSummary({ rows }: { rows: ChartRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  let cursor = 0;
  const gradient = rows
    .map((row) => {
      const start = cursor;
      cursor += total ? (row.value / total) * 100 : 0;
      return `${row.color || "#8db3d3"} ${start}% ${cursor}%`;
    })
    .join(", ");

  if (!total) {
    return <div className="hr-empty-chart">Sem faltas ou atestados no período.</div>;
  }

  const pieTooltip = tooltipText([
    `Total: ${formatInteger(total)}`,
    ...rows.map((row) => `${row.label}: ${formatInteger(row.value)} (${formatPercent((row.value / total) * 100)})`),
  ]);

  return (
    <div className="hr-pie-layout">
      <div
        className="hr-pie hr-has-tooltip"
        data-tooltip={pieTooltip}
        style={{ background: `conic-gradient(${gradient})` }}
        tabIndex={0}
        aria-label={pieTooltip}
      >
        <span>{formatInteger(total)}</span>
      </div>
      <div className="hr-pie-legend">
        {rows.map((row) => {
          const tooltip = `${row.label}\n${formatInteger(row.value)} registro(s)\n${formatPercent((row.value / total) * 100)} do total`;
          return (
          <p
            className="hr-has-tooltip"
            data-tooltip={tooltip}
            key={row.label}
            tabIndex={0}
            aria-label={tooltip}
          >
            <i style={{ backgroundColor: row.color }} />
            <span>{row.label}</span>
            <strong>{formatInteger(row.value)} ({formatPercent((row.value / total) * 100)})</strong>
          </p>
          );
        })}
      </div>
    </div>
  );
}

export function CidPieChart({
  rows,
  selectedLabel,
  onSelect,
}: {
  rows: CidPieRow[];
  selectedLabel: string;
  onSelect: (label: string) => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  let cursor = 0;

  if (!total) {
    return <div className="hr-empty-chart">Sem CIDs registrados nos atestados do periodo.</div>;
  }

  return (
    <div className="hr-cid-pie-layout">
      <div className="hr-cid-pie-stage">
        <svg viewBox="0 0 220 220" role="img" aria-label="CIDs registrados nos atestados">
          {rows.map((row) => {
            const startAngle = cursor;
            const angle = (row.value / total) * 360;
            const endAngle = cursor + angle;
            cursor = endAngle;
            const selected = row.label === selectedLabel;
            const tooltip = `${row.label}\n${formatInteger(row.value)} registro(s)\n${formatPercent((row.value / total) * 100)}`;

            if (rows.length === 1) {
              return (
                <circle
                  aria-label={tooltip}
                  className={`hr-cid-pie-slice ${selected ? "is-selected" : ""}`}
                  cx="110"
                  cy="110"
                  data-tooltip={tooltip}
                  fill={row.color}
                  key={row.label}
                  onClick={() => onSelect(row.label)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onSelect(row.label);
                  }}
                  r="92"
                  role="button"
                  tabIndex={0}
                />
              );
            }

            return (
              <path
                aria-label={tooltip}
                className={`hr-cid-pie-slice ${selected ? "is-selected" : ""}`}
                d={describePieSlice(110, 110, 92, startAngle, endAngle)}
                data-tooltip={tooltip}
                fill={row.color}
                key={row.label}
                onClick={() => onSelect(row.label)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(row.label);
                }}
                role="button"
                tabIndex={0}
              />
            );
          })}
          <circle cx="110" cy="110" fill="#fff" r="45" />
          <text className="hr-cid-pie-total" textAnchor="middle" x="110" y="106">{formatInteger(total)}</text>
          <text className="hr-cid-pie-caption" textAnchor="middle" x="110" y="126">atestados</text>
        </svg>
      </div>
      <div className="hr-cid-pie-legend">
        {rows.map((row) => (
          <button
            className={row.label === selectedLabel ? "is-selected" : ""}
            key={row.label}
            type="button"
            onClick={() => onSelect(row.label)}
          >
            <i style={{ backgroundColor: row.color }} />
            <span>{row.label}</span>
            <strong>{formatInteger(row.value)}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

export function MonthlyGroupedChart({ rows, types }: { rows: MonthChartRow[]; types: string[] }) {
  const maxValue = Math.max(1, ...rows.flatMap((row) => types.map((type) => row.byType[type] || 0)));

  if (!rows.length) {
    return <div className="hr-empty-chart">Sem meses disponíveis.</div>;
  }

  return (
    <div className="hr-month-chart">
      <div className="hr-chart-legend">
        {types.map((type) => <span key={type}><i className="hr-dot" style={{ backgroundColor: monthlyTypeColors[type] }} /> {absenceLabels[type]}</span>)}
        {!types.length ? <span>Selecione um tipo de falta para visualizar os valores.</span> : null}
      </div>
      <div className="hr-month-columns">
        {rows.map((row) => {
          const tooltip = tooltipText([
            row.label,
            ...types.map((type) => `${absenceLabels[type]}: ${formatInteger(row.byType[type] || 0)}`),
            `Total: ${formatInteger(row.missedDays)}`,
          ]);
          return (
          <div
            className="hr-month-group hr-has-tooltip"
            data-tooltip={tooltip}
            title={tooltip}
            key={row.key}
            tabIndex={0}
            aria-label={tooltip}
          >
            <div className="hr-month-bars">
              {types.map((type) => <span key={type} className="hr-month-bar"
                style={{ "--hr-target-height": `${row.byType[type] ? Math.max(3, (row.byType[type] / maxValue) * 100) : 0}%`, backgroundColor: monthlyTypeColors[type] } as CSSProperties}
                aria-label={`${absenceLabels[type]}: ${formatInteger(row.byType[type] || 0)}`} />)}
            </div>
            <strong>{row.label}</strong>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonthlyPercentChart({ rows, types }: { rows: MonthChartRow[]; types: string[] }) {
  const maxValue = Math.max(8, ...rows.map((row) => row.percent));

  if (!rows.length) {
    return <div className="hr-empty-chart">Sem meses disponíveis.</div>;
  }

  return (
    <div className="hr-month-percent-chart">
      {rows.map((row) => {
        const tooltip = tooltipText([
          row.label,
          `Absenteísmo: ${formatPercent(row.percent)}`,
          ...types.map((type) => `${absenceLabels[type]}: ${formatInteger(row.byType[type] || 0)}`),
          `Ocorrências selecionadas: ${formatInteger(row.missedDays)}`,
          `Dias previstos: ${formatInteger(row.workedDays)}`,
        ]);
        return (
        <div
          className="hr-month-percent-column hr-has-tooltip"
          data-tooltip={tooltip}
          title={tooltip}
          key={row.key}
          tabIndex={0}
          aria-label={tooltip}
        >
          <b>{formatPercent(row.percent)}</b>
          <span className="hr-month-percent-bar" style={{ "--hr-target-height": `${row.percent ? Math.max(3, (row.percent / maxValue) * 100) : 0}%` } as CSSProperties} />
          <strong>{row.label}</strong>
        </div>
        );
      })}
    </div>
  );
}

export function ColumnChart({ rows, formatter = formatInteger, color = "#1f95ed" }: { rows: ChartRow[]; formatter?: (value: number) => string; color?: string; }) {
  const maxValue = Math.max(1, ...rows.map((row) => row.value));

  if (!rows.length) {
    return <div className="hr-empty-chart">Sem meses disponíveis.</div>;
  }

  return (
    <div className="hr-month-percent-chart hr-column-chart">
      {rows.map((row) => {
        const height = `${Math.max(6, (row.value / maxValue) * 100)}%`;
        const tooltip = tooltipText([
          row.label,
          `Valor: ${formatter(row.value)}`,
          row.detail,
        ]);
        return (
          <div
            className="hr-month-percent-column hr-column-column hr-has-tooltip"
            data-tooltip={tooltip}
            title={tooltip}
            key={row.label}
            tabIndex={0}
            aria-label={tooltip}
          >
            <b>{formatter(row.value)}</b>
            <span className="hr-month-percent-bar hr-column-bar" style={{ backgroundColor: row.color || color, "--hr-target-height": height } as CSSProperties} />
            <strong>{row.label}</strong>
          </div>
        );
      })}
    </div>
  );
}

export function EmployeeOvertimeChart({ employees, records }: { employees: Employee[]; records: TimeRecord[] }) {
  type ContractFilter = "all" | EmployeeKind;
  const contractOptions: Array<{ value: ContractFilter; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "contract", label: employeeKindLabels.contract },
    { value: "company", label: employeeKindLabels.company },
    { value: "diarist", label: employeeKindLabels.diarist },
  ];
  const [selectedContract, setSelectedContract] = useState<ContractFilter>("all");

  const rows = useMemo<ChartRow[]>(() => {
    const employeeIds = new Set(
      selectedContract === "all"
        ? employees.map((employee) => employee.id)
        : employees
            .filter((employee) => employeeKindOf(employee) === selectedContract)
            .map((employee) => employee.id),
    );

    const totals = new Map<string, number>();
    const names = new Map<string, string>();

    employees.forEach((employee) => {
      names.set(employee.id, employee.name || "Funcionário removido");
    });

    records.forEach((record) => {
      if (!employeeIds.has(record.employeeId)) return;
      const hours = overtimeHours(record);
      if (hours <= 0) return;
      totals.set(record.employeeId, (totals.get(record.employeeId) || 0) + hours);
    });

    return Array.from(totals.entries())
      .map(([employeeId, value]) => ({
        label: names.get(employeeId) || "Funcionário removido",
        value,
        color: "#b9ee93",
      }))
      .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
  }, [employees, records, selectedContract]);

  return (
    <div className="hr-line-chart">
      <div className="hr-line-chart-header">
        <div className="hr-chart-legend">
          <span><i className="hr-line-dot hr-line-admitted" /> Horas extras</span>
        </div>
        <label className="hr-line-select">
          <span>Tipo de contrato</span>
          <select value={selectedContract} onChange={(event) => setSelectedContract(event.target.value as ContractFilter)}>
            {contractOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <HorizontalBarChart rows={rows} formatter={formatHours} />
    </div>
  );
}

export function CalendarMonthHeader({ calendarMonth, onChange, maxMonth }: {
  calendarMonth: string;
  onChange: (month: string) => void;
  maxMonth?: string;
}) {
  const current = parseLocalDate(calendarMonth);
  const year = current.getFullYear();
  const monthIndex = current.getMonth();
  const todayYear = Number(localTodayISO().slice(0, 4));
  const firstYear = Math.min(1900, year);
  const lastYear = Math.max(maxMonth ? Number(maxMonth.slice(0, 4)) : todayYear + 5, year);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => lastYear - index);
  const months = Array.from({ length: 12 }, (_, index) => new Date(2020, index, 1).toLocaleDateString("pt-BR", { month: "long" }));
  const changeMonth = (targetYear: number, targetMonth: number) => {
    const selected = toISODate(new Date(targetYear, targetMonth, 1));
    onChange(maxMonth && selected > maxMonth ? maxMonth : selected);
  };

  return <div className="hr-calendar-header">
    <button type="button" aria-label="Mês anterior" onClick={() => changeMonth(year, monthIndex - 1)}><ChevronLeft size={18} /></button>
    <select aria-label="Selecionar mês" value={monthIndex} onChange={(event) => changeMonth(year, Number(event.target.value))}>
      {months.map((label, index) => <option key={index} value={index} disabled={Boolean(maxMonth && `${year}-${String(index + 1).padStart(2, "0")}` > maxMonth.slice(0, 7))}>{label}</option>)}
    </select>
    <select aria-label="Selecionar ano" value={year} onChange={(event) => changeMonth(Number(event.target.value), monthIndex)}>
      {years.map((option) => <option key={option} value={option} disabled={Boolean(maxMonth && option > Number(maxMonth.slice(0, 4)))}>{option}</option>)}
    </select>
    <button type="button" aria-label="Próximo mês" disabled={Boolean(maxMonth && calendarMonth >= maxMonth)} onClick={() => changeMonth(year, monthIndex + 1)}><ChevronRight size={18} /></button>
  </div>;
}

export function CardChoices({ title, field, value, onChange, options }: {
  title: string; field: CardChoiceField; value: CardPreferences;
  onChange: (next: CardPreferences) => void; options: Array<{ value: string; label: string }>;
}) {
  return <details className="hr-card-choice-group">
    <summary>{title}<span>{value[field].length} selecionado(s)</span></summary>
    <div className="hr-card-choice-list">{options.map((option) =>
      <label key={option.value}><input type="checkbox" checked={value[field].includes(option.value)} onChange={() =>
        onChange({ ...value, [field]: value[field].includes(option.value) ? value[field].filter((item) => item !== option.value) : [...value[field], option.value] })
      } />{option.label}</label>
    )}</div>
  </details>;
}

export function ChartChoices({ title, field, value, onChange, options }: {
  title: string; field: keyof MonthlyChartPreferences; value: MonthlyChartPreferences;
  onChange: (next: MonthlyChartPreferences) => void; options: Array<{ value: string; label: string }>;
}) {
  return <details className="hr-card-choice-group">
    <summary>{title}<span>{value[field].length} selecionado(s)</span></summary>
    <div className="hr-card-choice-list">{options.map((option) => <label key={option.value}>
      <input type="checkbox" checked={value[field].includes(option.value)} onChange={() =>
        onChange({ ...value, [field]: value[field].includes(option.value)
          ? value[field].filter((item) => item !== option.value) : [...value[field], option.value] })} />{option.label}
    </label>)}</div>
  </details>;
}


