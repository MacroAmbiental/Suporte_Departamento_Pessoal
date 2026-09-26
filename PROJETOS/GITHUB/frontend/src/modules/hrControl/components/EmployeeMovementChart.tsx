import { useMemo, useState } from "react";
import type { Employee } from "@/types/domain";
import { employeeKindLabels, employeeKindOf, type EmployeeKind } from "@/common/utils/employeeKind";

type ContractFilter = "all" | EmployeeKind;

const contractOptions: Array<{ value: ContractFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "contract", label: employeeKindLabels.contract },
  { value: "company", label: employeeKindLabels.company },
  { value: "diarist", label: employeeKindLabels.diarist },
];

function monthKeysForRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate || startDate > endDate) {
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - 11 + index);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date),
      };
    });
    return months;
  }

  const months = new Map<string, string>();
  const cursor = new Date(`${startDate}T00:00:00`);
  const last = new Date(`${endDate}T00:00:00`);
  const monthCursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  while (monthCursor <= last) {
    const key = `${monthCursor.getFullYear()}-${String(monthCursor.getMonth() + 1).padStart(2, "0")}`;
    months.set(key, new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(monthCursor));
    monthCursor.setMonth(monthCursor.getMonth() + 1);
  }

  return Array.from(months.entries()).map(([key, label]) => ({ key, label }));
}

export default function EmployeeMovementChart({ employees, contractFilter, startDate, endDate }: { employees: Employee[]; contractFilter?: ContractFilter; startDate?: string; endDate?: string }) {
  const [selectedContract, setSelectedContract] = useState<ContractFilter>(contractFilter ?? "all");

  const rows = useMemo(() => {
    const relevantEmployees = selectedContract === "all"
      ? employees
      : employees.filter((employee) => employeeKindOf(employee) === selectedContract);

    const months = monthKeysForRange(startDate, endDate);

    return months.map(({ key, label }) => {
      const admitted = relevantEmployees.filter((employee) => employee.admissionDate?.startsWith(key)).length;
      const dismissed = relevantEmployees.filter((employee) => employee.status === "terminated" && employee.updatedAt?.startsWith(key)).length;
      const total = admitted - dismissed;
      return { key, label, admitted, dismissed, total };
    });
  }, [employees, endDate, selectedContract, startDate]);

  const maxPositive = Math.max(1, ...rows.flatMap((row) => [row.admitted, row.dismissed, Math.max(row.total, 0)]));
  const minNegative = Math.min(0, ...rows.map((row) => Math.min(row.total, 0)));
  const minValue = minNegative < 0 ? minNegative : 0;
  const maxValue = maxPositive > 0 ? maxPositive : 0;
  const range = maxValue - minValue || 1;
  const width = 720;
  const height = 260;
  const padding = { top: 20, right: 18, bottom: 36, left: 28 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const xStep = rows.length > 1 ? innerWidth / (rows.length - 1) : innerWidth;

  const pointForValue = (value: number, index: number) => {
    const x = padding.left + index * xStep;
    const y = padding.top + innerHeight - ((value - minValue) / range) * innerHeight;
    return { x, y };
  };

  const zeroY = padding.top + innerHeight - ((0 - minValue) / range) * innerHeight;

  const buildLine = (key: "admitted" | "dismissed" | "total") => rows.map((row, index) => {
    const value = row[key];
    const { x, y } = pointForValue(value, index);
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  const admittedLine = buildLine("admitted");
  const dismissedLine = buildLine("dismissed");
  const totalLine = buildLine("total");

  return <div className="hr-line-chart">
    <div className="hr-line-chart-header">
      <div className="hr-chart-legend">
        <span><i className="hr-line-dot hr-line-admitted" />Admitidos</span>
        <span><i className="hr-line-dot hr-line-dismissed" />Demitidos</span>
        <span><i className="hr-line-dot hr-line-total" />Total</span>
      </div>
      <label className="hr-line-select">
        <span>Tipo de contrato</span>
        <select value={selectedContract} onChange={(event) => setSelectedContract(event.target.value as ContractFilter)}>
          {contractOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>

    <svg className="hr-line-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de admitidos, demitidos e saldo por mês">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = padding.top + ratio * innerHeight;
        return <line key={ratio} x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="hr-line-grid" />;
      })}
      <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} className="hr-line-zero" />

      <path d={admittedLine} className="hr-line-path hr-line-path-admitted" />
      <path d={dismissedLine} className="hr-line-path hr-line-path-dismissed" />
      <path d={totalLine} className="hr-line-path hr-line-path-total" />

      {rows.map((row, index) => {
        const { x } = pointForValue(row.admitted, index);
        const { x: x2 } = pointForValue(row.dismissed, index);
        const { x: x3 } = pointForValue(row.total, index);
        return <g key={row.key}>
          <circle cx={x} cy={pointForValue(row.admitted, index).y} r={3.5} className="hr-line-point hr-line-point-admitted" />
          <circle cx={x2} cy={pointForValue(row.dismissed, index).y} r={3.5} className="hr-line-point hr-line-point-dismissed" />
          <circle cx={x3} cy={pointForValue(row.total, index).y} r={3.5} className="hr-line-point hr-line-point-total" />
        </g>;
      })}

      {rows.map((row, index) => {
        const x = padding.left + index * xStep;
        return <text key={`${row.key}-label`} x={x} y={height - 10} textAnchor="middle" className="hr-line-label">{row.label}</text>;
      })}
    </svg>
  </div>;
}
