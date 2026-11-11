import type { AppScreen, PermissionAction, SystemPermission, SystemUser, User } from "@/types/domain";

export const permissionActions: { key: PermissionAction; label: string }[] = [
  { key: "view", label: "Ver" },
  { key: "create", label: "Criar" },
  { key: "edit", label: "Editar" },
  { key: "delete", label: "Excluir" },
  { key: "manage", label: "Gerenciar" },
];

export type ScreenGroup = "Geral" | "Registros" | "Funcionários" | "Administração";

export type SystemScreen = {
  key: AppScreen;
  label: string;
  path: string;
  group: ScreenGroup;
  // Ações que a tela realmente confere. As outras não aparecem na grade.
  actions: PermissionAction[];
  // O que as ações liberam nessa tela (aparece embaixo do nome na grade).
  hint?: string;
};

const ALL: PermissionAction[] = ["view", "create", "edit", "delete", "manage"];
const VIEW_EDIT: PermissionAction[] = ["view", "edit"];
const VIEW: PermissionAction[] = ["view"];

// Lista única das telas, na ordem e nos grupos do menu (11/11/2026). Menu, rotas e a
// grade de permissões leem daqui.
export const systemScreens: SystemScreen[] = [
  { key: "dashboard", label: "Painel", path: "/app", group: "Geral", actions: VIEW },
  { key: "companies", label: "Empresas", path: "/app/companies", group: "Geral", actions: ALL, hint: "Empresas, estrutura (departamentos, setores, equipes) e lideranças." },
  { key: "records", label: "Registros", path: "/app/records", group: "Registros", actions: ALL, hint: "Documentos dos funcionários. Editar também libera os Documentos padrão por função." },
  { key: "notifications", label: "Notificações", path: "/app/notifications", group: "Registros", actions: ALL, hint: "Alertas de vencimento. Também vale para os alertas criados em Registros, ASO e Férias." },
  { key: "aso", label: "Processo de ASO", path: "/app/processo-aso", group: "Registros", actions: VIEW_EDIT, hint: "Editar = mover cartões e registrar o processo." },
  { key: "employees", label: "Funcionários", path: "/app/employees", group: "Funcionários", actions: ALL, hint: "Cadastro, diaristas e contratos. Gerenciar libera exportar salários." },
  { key: "timekeeping", label: "Controle de ponto", path: "/app/timekeeping", group: "Funcionários", actions: ALL },
  { key: "vacation", label: "Férias", path: "/app/ferias", group: "Funcionários", actions: VIEW_EDIT, hint: "Editar = lançar, fracionar e vender férias e importar o relatório da contabilidade." },
  { key: "afastados", label: "Afastados", path: "/app/afastados", group: "Funcionários", actions: VIEW_EDIT, hint: "Editar = lançar e alterar afastamentos." },
  { key: "employeeProcesses", label: "Processo de Funcionário", path: "/app/employees?tab=processos", group: "Funcionários", actions: VIEW_EDIT, hint: "Editar = experiência, aviso prévio e efetivar desligamento." },
  { key: "benefits", label: "Benefícios", path: "/app/benefits", group: "Funcionários", actions: ALL },
  { key: "dismissed", label: "Demitidos", path: "/app/employees?tab=demitidos", group: "Funcionários", actions: VIEW, hint: "Lista de desligados (alterações seguem a permissão de Funcionários)." },
  { key: "salaryTable", label: "Tabela Salarial", path: "/app/employees?tab=tabela-salarial", group: "Funcionários", actions: VIEW_EDIT, hint: "Editar = alterar faixas e valores." },
  { key: "abandonment", label: "Processo de Abandono", path: "/app/processo-abandono", group: "Funcionários", actions: VIEW_EDIT, hint: "Editar = mover cartões e registrar o processo." },
  { key: "classification", label: "Processo de Classificação", path: "/app/processo-classificacao", group: "Funcionários", actions: VIEW_EDIT, hint: "Editar = registrar etapas e efetivar a mudança no cadastro." },
  { key: "hrControl", label: "Controle RH", path: "/app/hr-control", group: "Administração", actions: VIEW, hint: "Também abre para quem vê o Controle de ponto." },
  { key: "toolbox", label: "Caixa de ferramentas", path: "/app/caixa-ferramentas", group: "Administração", actions: VIEW },
  { key: "monitoring", label: "Monitoramento", path: "/app/monitoring", group: "Administração", actions: VIEW },
  { key: "permissions", label: "Permissões do sistema", path: "/app/permissions", group: "Administração", actions: ALL, hint: "Gerenciar = aplicar perfis às pessoas." },
];

export const screenGroups: ScreenGroup[] = ["Geral", "Registros", "Funcionários", "Administração"];

// Abas de Funcionários que ganharam linha própria em 11/11/2026. Perfil ou usuário
// que ainda não tem a linha herda a permissão de Funcionários (ninguém perde acesso).
export const inheritedScreens: Partial<Record<AppScreen, AppScreen>> = {
  employeeProcesses: "employees",
  dismissed: "employees",
  salaryTable: "employees",
};

type Matrix = Partial<Record<AppScreen, PermissionAction[]>>;

export function withInheritedScreens<T extends Matrix>(matrix: T | undefined): T {
  const next = { ...(matrix || {}) } as Matrix;
  (Object.entries(inheritedScreens) as Array<[AppScreen, AppScreen]>).forEach(([screen, from]) => {
    if (next[screen] === undefined && next[from]) next[screen] = [...(next[from] || [])];
  });
  return next as T;
}

// Ações gravadas de um usuário numa tela (com a herança das abas novas).
export function storedScreenActions(permissions: Array<Pick<SystemPermission, "screen" | "actions">>, screen: AppScreen): PermissionAction[] | undefined {
  const own = permissions.find((entry) => entry.screen === screen);
  if (own) return own.actions || [];
  const from = inheritedScreens[screen];
  return from ? permissions.find((entry) => entry.screen === from)?.actions : undefined;
}

export const collectionScreenMap: Record<string, AppScreen> = {
  companies: "companies",
  departments: "companies",
  sectors: "companies",
  subsectors: "companies",
  teams: "companies",
  organizational_nodes: "companies",
  employee_assignments: "companies",
  companyGroups: "companies",
  companyGroupCompanies: "companies",
  companyGroupUnits: "companies",
  companyGroupUnitLinks: "companies",
  companyGroupEmployeeAssignments: "companies",
  companyGroupLeadershipAssignments: "companies",
  customModules: "companies",
  benefitContracts: "benefits",
  benefitPlans: "benefits",
  employeeBenefits: "benefits",
  employees: "employees",
  employeeDrafts: "employees",
  appDrafts: "dashboard",
  employeeDocuments: "records",
  documentAlerts: "notifications",
  timeRecords: "timekeeping",
  timekeepingColumns: "timekeeping",
  abandonmentCases: "abandonment",
  talentCandidates: "talentBank",
  systemUsers: "permissions",
  systemPermissions: "permissions",
  permissionProfiles: "permissions",
  accessKeys: "permissions",
  employeePromotions: "employees",
  vacations: "vacation",
  asoCases: "aso",
  classificationCases: "classification",
  benefitFolders: "benefits",
  benefitCustomFields: "benefits",
  talentColumnOptions: "talentBank",
};

const usernameIgnoredParts = new Set(["DA", "DAS", "DE", "DO", "DOS", "E"]);

function normalizeLetters(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function createUsernameFromName(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => normalizeLetters(part))
    .filter(Boolean);

  const significantParts = parts.filter((part) => !usernameIgnoredParts.has(part));
  const sourceParts = significantParts.length ? significantParts : parts;
  const first = sourceParts[0] || "";
  const last = sourceParts.length > 1 ? sourceParts[sourceParts.length - 1] : "";

  let username = sourceParts.length > 1
    ? `${first.slice(0, 4)}${last.slice(0, 3)}`
    : first.slice(0, 7);

  if (username.length < 7) {
    const fallback = sourceParts.join("");
    for (const char of fallback) {
      if (username.length >= 7) break;
      username += char;
    }
  }

  return username.slice(0, 7);
}

export function normalizeUsername(username: string): string {
  return normalizeLetters(username).slice(0, 7);
}

export function initialsFromName(name: string, username: string): string {
  const source = name.trim() || username.trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : source.slice(0, 2);

  return initials.toUpperCase();
}

export async function hashPassword(password: string): Promise<string> {
  const source = new TextEncoder().encode(`macro-dp:${password}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", source);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function permissionId(userId: string, screen: AppScreen): string {
  return `${userId}-${screen}`;
}

export function createFullPermissions(userId: string, updatedAt = new Date().toISOString()): SystemPermission[] {
  const actions = permissionActions.map((action) => action.key);

  return systemScreens.map((screen) => ({
    id: permissionId(userId, screen.key),
    userId,
    screen: screen.key,
    actions,
    updatedAt,
  }));
}


export function isSystemTiUser(user: Pick<User | SystemUser, "isAdmin"> | null | undefined): boolean {
  // Usuário de TI/Administrador não é identificado por nome, usuário fixo ou localStorage.
  // A origem correta é a coleção systemUsers no Firestore, campo isAdmin=true.
  return Boolean(user?.isAdmin);
}

export function userHasPermission(
  user: User | null | undefined,
  screen: AppScreen,
  action: PermissionAction = "view",
): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (!Array.isArray(user.permissions)) return false;

  const actions = storedScreenActions(user.permissions, screen);
  if (Array.isArray(actions) && (actions.includes("manage") || actions.includes(action))) return true;

  if (screen === "hrControl") {
    const timekeepingPermission = user.permissions.find((entry) => entry.screen === "timekeeping");
    return Boolean(
      timekeepingPermission?.actions?.includes("manage") ||
      timekeepingPermission?.actions?.includes(action),
    );
  }

  return false;
}

export function firstAllowedScreen(user: User | null | undefined) {
  return systemScreens.find((screen) => userHasPermission(user, screen.key, "view"));
}

export function toAuthenticatedUser(systemUser: SystemUser, permissions: SystemPermission[]): User {
  return {
    id: systemUser.id,
    username: systemUser.username,
    name: systemUser.name,
    role: systemUser.role,
    position: systemUser.position,
    initials: systemUser.initials || initialsFromName(systemUser.name, systemUser.username),
    employeeId: systemUser.employeeId,
    isAdmin: Boolean(systemUser.isAdmin),
    permissions,
  };
}
