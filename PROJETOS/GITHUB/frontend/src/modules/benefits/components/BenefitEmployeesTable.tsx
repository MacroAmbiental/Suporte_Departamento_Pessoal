import { ArrowDown, ArrowUp } from "lucide-react";
import type { Employee } from "@/types/domain";
import "./benefitEmployees.css";

// Tabela de funcionários de Benefícios (04/11/2026): usada na aba
// Funcionários (só leitura) e no modal "Gerenciar funcionários" (com caixa
// de seleção). Substitui os cards, que mostravam só 12 pessoas por página.

export type BenefitEmployeeSortKey = "name" | "role" | "lotacao" | "team" | "kind";
export type BenefitEmployeeSort = { key: BenefitEmployeeSortKey; dir: "asc" | "desc" };

export type BenefitEmployeeInfo = {
  department: string;
  sector: string;
  team: string;
  kind: string;
  company: string;
  status: string;
  conflicts: string[];
};

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function sortValue(employee: Employee, info: BenefitEmployeeInfo, key: BenefitEmployeeSortKey): string {
  if (key === "role") return employee.role || employee.position || "";
  if (key === "lotacao") return `${info.department} ${info.sector}`;
  if (key === "team") return info.team;
  if (key === "kind") return `${info.kind} ${info.company}`;
  return employee.name;
}

export function sortBenefitEmployees(
  employees: Employee[],
  sort: BenefitEmployeeSort,
  describe: (employee: Employee) => BenefitEmployeeInfo,
): Employee[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...employees].sort((a, b) => (
    factor * collator.compare(sortValue(a, describe(a), sort.key), sortValue(b, describe(b), sort.key))
    || collator.compare(a.name, b.name)
  ));
}

const columns: Array<{ key: BenefitEmployeeSortKey; label: string }> = [
  { key: "name", label: "Funcionário" },
  { key: "role", label: "Função" },
  { key: "lotacao", label: "Departamento · Setor" },
  { key: "team", label: "Equipe" },
  { key: "kind", label: "Vínculo · Empresa" },
];

type Props = {
  employees: Employee[];
  describe: (employee: Employee) => BenefitEmployeeInfo;
  sort: BenefitEmployeeSort;
  onSort: (sort: BenefitEmployeeSort) => void;
  emptyText: string;
  className?: string;
  // Modo seleção (modal): caixa de seleção por linha.
  selectedIds?: Set<string>;
  onToggle?: (employeeId: string) => void;
  disabled?: boolean;
  // Aba Funcionários: destaca quem está vinculado quando a lista mistura.
  assignedIds?: Set<string>;
};

export default function BenefitEmployeesTable({
  employees,
  describe,
  sort,
  onSort,
  emptyText,
  className = "",
  selectedIds,
  onToggle,
  disabled = false,
  assignedIds,
}: Props) {
  const selectable = Boolean(selectedIds && onToggle);

  function headerClick(key: BenefitEmployeeSortKey) {
    onSort(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  return (
    <div className={`benefit-employees-table-wrap ${className}`}>
      <table className="benefit-employees-table">
        <thead>
          <tr>
            {selectable ? <th className="is-check" aria-label="Selecionar" /> : null}
            {columns.map((column) => (
              <th key={column.key} aria-sort={sort.key === column.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => headerClick(column.key)}>
                  {column.label}
                  {sort.key === column.key ? (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null}
                </button>
              </th>
            ))}
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => {
            const info = describe(employee);
            const isSelected = selectedIds?.has(employee.id) ?? false;
            const isBlocked = info.conflicts.length > 0 && !isSelected;
            const isAssigned = assignedIds?.has(employee.id);
            const rowClass = [
              info.conflicts.length ? "is-conflict" : "",
              selectable && isSelected ? "is-selected" : "",
              assignedIds && !isAssigned ? "is-unassigned" : "",
            ].filter(Boolean).join(" ");
            return (
              <tr
                key={employee.id}
                className={rowClass}
                onClick={selectable && !disabled && !isBlocked ? () => onToggle?.(employee.id) : undefined}
              >
                {selectable ? (
                  <td className="is-check" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${employee.name}`}
                      checked={isSelected}
                      disabled={disabled || isBlocked}
                      onChange={() => onToggle?.(employee.id)}
                    />
                  </td>
                ) : null}
                <td className="is-name">
                  <strong>{employee.name}</strong>
                  <small>{employee.registration ? `Matr. ${employee.registration}` : "Sem matrícula"}</small>
                </td>
                <td>{employee.role || employee.position || "—"}</td>
                <td>
                  <span>{info.department}</span>
                  <small>{info.sector}</small>
                </td>
                <td>{info.team}</td>
                <td>
                  <span>{info.kind}</span>
                  <small>{info.company}</small>
                </td>
                <td className="is-status">
                  {info.conflicts.length ? (
                    <span className="benefit-employee-badge is-conflict" title={`Já tem ${info.conflicts.join(", ")}`}>
                      Incompatível: {info.conflicts.join(", ")}
                    </span>
                  ) : assignedIds && !isAssigned ? (
                    <span className="benefit-employee-badge is-muted">Não vinculado</span>
                  ) : (
                    <span className="benefit-employee-badge">{info.status}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!employees.length ? <p className="benefit-employees-empty">{emptyText}</p> : null}
    </div>
  );
}
