import type { AppScreen, Employee, PermissionAction, PermissionProfile, PermissionProfileTarget, SystemUser } from "@/types/domain";

// Regra única de "acessos salvos" (perfis) para a tela de Permissões e o cadastro
// de funcionários. A permissão de cada pessoa é a SOMA de todos os acessos ativos
// que valem para ela (o do login + os que a pegam pelo público). Antes, salvar um
// acesso ou o cadastro trocava tudo só por aquele acesso e a pessoa perdia o que
// vinha dos outros (29/10/2026, caso da Sofia).

export type PermissionMatrixPartial = Partial<Record<AppScreen, PermissionAction[]>>;

export function targetMatches(employee: Employee, target: PermissionProfileTarget) {
  if (target.type === "employee") return employee.id === target.value;
  if (target.type === "group") return employee.groupId === target.value;
  if (target.type === "company") return employee.companyId === target.value;
  if (target.type === "department") return employee.departmentId === target.value;
  if (target.type === "sector") return employee.sectorId === target.value;
  if (target.type === "subsector") return employee.subsectorId === target.value;
  if (target.type === "position") return employee.position === target.value;
  if (target.type === "role") return employee.role === target.value;
  return false;
}

export function employeeMatchesProfile(employee: Employee, targets: PermissionProfileTarget[]) {
  const companyTargets = targets.filter((target) => target.type === "company");
  const relationTargets = targets.filter((target) => target.type !== "company");
  const companyMatches = !companyTargets.length || companyTargets.some((target) => targetMatches(employee, target));
  const relationMatches = !relationTargets.length || relationTargets.some((target) => targetMatches(employee, target));
  return companyMatches && relationMatches;
}

export type AppliedProfile = { profile: PermissionProfile; reason: "login" | "target" };

// Acessos ativos que valem para o usuário: o "Acesso salvo" do login e os que
// pegam o funcionário dele pelo público (empresa, setor, cargo, função, nome...).
export function profilesForUser(
  systemUser: Pick<SystemUser, "permissionProfileId">,
  employee: Employee | undefined,
  profiles: PermissionProfile[],
  overrides: PermissionProfile[] = [],
): AppliedProfile[] {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  overrides.forEach((profile) => byId.set(profile.id, profile));
  const applied: AppliedProfile[] = [];
  byId.forEach((profile) => {
    if (!profile.active) return;
    if (profile.id === systemUser.permissionProfileId) applied.push({ profile, reason: "login" });
    else if (employee && profile.targets?.length && employeeMatchesProfile(employee, profile.targets)) applied.push({ profile, reason: "target" });
  });
  return applied;
}

export function unionMatrix(profiles: PermissionProfile[]): PermissionMatrixPartial {
  const result: PermissionMatrixPartial = {};
  profiles.forEach((profile) => {
    Object.entries(profile.permissions || {}).forEach(([screen, actions]) => {
      const merged = new Set([...(result[screen as AppScreen] || []), ...(actions || [])]);
      result[screen as AppScreen] = Array.from(merged);
    });
  });
  return result;
}

export function effectivePermissions(
  systemUser: Pick<SystemUser, "permissionProfileId">,
  employee: Employee | undefined,
  profiles: PermissionProfile[],
  overrides: PermissionProfile[] = [],
) {
  return unionMatrix(profilesForUser(systemUser, employee, profiles, overrides).map((item) => item.profile));
}
