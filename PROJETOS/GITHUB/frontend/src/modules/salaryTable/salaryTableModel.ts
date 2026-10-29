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

// Sem acento e sem DE/DA/DO/EM ("TÉCNICO DE SEGURANÇA" = "TECNICO EM SEGURANCA").
const normalizeName = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
  .replace(/\s+/g, " ").trim().split(" ").filter((word) => !["DE", "DA", "DO", "DAS", "DOS", "EM"].includes(word)).join(" ");

export type SalaryRoleMatch = { role: SalaryTableRole; levelIndex: number | null };

// Acha a função da tabela a partir do texto do cadastro. Aceita o nome exato
// ("PEDREIRO I"), nome + nível ("MOTORISTA III", "AUXILIAR DE OBRAS I") e o
// formato da escada de Profissionais com o passo colado ("PEDREIRO IB").
export function matchSalaryRole(roles: SalaryTableRole[], text: string): SalaryRoleMatch | null {
  const key = normalizeName(text || "");
  if (!key) return null;
  const active = roles.filter((role) => role.active);
  const byName = (name: string) => active.find((role) => normalizeName(role.name) === name);

  const exact = byName(key);
  if (exact) return { role: exact, levelIndex: exact.levelLabels.length === 1 ? 0 : null };

  const candidates = [key.match(/^(.+) ([IVX]+|[A-H])$/), key.match(/^(.+ [IVX]+)([A-H])$/)];
  for (const found of candidates) {
    if (!found) continue;
    const role = byName(found[1].trim());
    const levelIndex = role ? role.levelLabels.indexOf(found[2]) : -1;
    if (role && levelIndex >= 0) return { role, levelIndex };
  }

  // Cadastro sem o I/II de Profissionais ("PEDREIRO") → começa pela função I.
  const first = byName(`${key} I`);
  return first ? { role: first, levelIndex: null } : null;
}

// 2414 → "2.414,00" (texto para campos de salário digitados).
export const formatSalaryInput = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
}
