// Tabela Salarial: uma linha por função, com salário inicial + % de reajuste
// entre níveis. Os níveis são calculados em cadeia (nível N = nível N-1 × (1 + %)),
// igual às fórmulas da planilha; o que lá foi digitado à mão fica em
// fixedLevels e vence o cálculo.
export const SALARY_TABLE_COLLECTION = "salaryTableRoles";

export interface SalaryTableRole {
  id: string;
  category: string;
  name: string;
  levelLabels: string[];
  baseSalary: number;
  percent: number;
  fixedLevels?: Record<string, number>;
  active: boolean;
  order: number;
  source?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export type SalaryTableRoleDraft = Omit<SalaryTableRole, "id" | "createdAt" | "updatedAt" | "updatedBy">;

const roundCents = (value: number) => Math.round(value * 100) / 100;

export function computeLevels(role: Pick<SalaryTableRole, "levelLabels" | "baseSalary" | "percent" | "fixedLevels">): number[] {
  const levels: number[] = [];
  role.levelLabels.forEach((_, index) => {
    const fixed = role.fixedLevels?.[String(index)];
    if (fixed !== undefined) levels.push(fixed);
    else if (index === 0) levels.push(role.baseSalary);
    else levels.push(levels[index - 1] * (1 + role.percent / 100));
  });
  return levels.map(roundCents);
}

export function salaryRoleId(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
}
