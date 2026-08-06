import type { AppScreen, PermissionAction, SystemPermission, SystemUser, User } from "@/types/domain";

export const permissionActions: { key: PermissionAction; label: string }[] = [
  { key: "view", label: "Ver" },
  { key: "create", label: "Criar" },
  { key: "edit", label: "Editar" },
  { key: "delete", label: "Excluir" },
  { key: "manage", label: "Gerenciar" },
];

export const systemScreens: { key: AppScreen; label: string; path: string }[] = [
  { key: "dashboard", label: "Painel", path: "/app" },
  { key: "companies", label: "Empresas", path: "/app/companies" },
  { key: "records", label: "Registros", path: "/app/records" },
  { key: "employees", label: "Funcionários", path: "/app/employees" },
  { key: "benefits", label: "Benefícios", path: "/app/benefits" },
  { key: "timekeeping", label: "Controle de ponto", path: "/app/timekeeping" },
  { key: "hrControl", label: "Controle RH", path: "/app/hr-control" },
  { key: "talentBank", label: "Banco de talentos", path: "/app/talent-bank" },
  { key: "notifications", label: "Notificações", path: "/app/notifications" },
  { key: "monitoring", label: "Monitoramento", path: "/app/monitoring" },
  { key: "permissions", label: "Permissões do sistema", path: "/app/permissions" },
];

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
  talentCandidates: "talentBank",
  systemUsers: "permissions",
  systemPermissions: "permissions",
  permissionProfiles: "permissions",
  accessKeys: "permissions",
  employeePromotions: "employees",
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

  const permission = user.permissions.find((entry) => entry.screen === screen);
  if (permission && Array.isArray(permission.actions)) {
    if (permission.actions.includes("manage") || permission.actions.includes(action)) return true;
  }

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
