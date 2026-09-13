import type {
  Company,
  CompanyGroup,
  CompanyGroupCompany,
  Department,
  Employee,
  Sector,
  Subsector,
  Team,
} from "@/types/domain";

type StructureItem = {
  id: string;
  name: string;
  companyId?: string;
  groupId?: string;
  active?: boolean;
};

type GroupLike = Pick<CompanyGroup, "id" | "name" | "active" | "divergenceSourceCompanyId">;
type GroupCompanyLike = Pick<CompanyGroupCompany, "groupId" | "companyId">;

export function normalizeStructureText(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function primaryCompanyGroup<T extends GroupLike>(
  groups: T[],
  groupCompanies: GroupCompanyLike[] = [],
) {
  const activeGroups = groups.filter((group) => group.active !== false);
  const candidates = activeGroups.length ? activeGroups : groups;
  const macro = candidates.find((group) => {
    const normalized = normalizeStructureText(group.name || "");
    return normalized.includes("grupo macro") || normalized === "macro" || normalized.includes("macro");
  });
  if (macro) return macro;

  return [...candidates].sort((first, second) => {
    const firstCompanies = groupCompanies.filter((item) => item.groupId === first.id).length;
    const secondCompanies = groupCompanies.filter((item) => item.groupId === second.id).length;
    return secondCompanies - firstCompanies || first.name.localeCompare(second.name, "pt-BR");
  })[0];
}

export function companyGroupForCompany<T extends GroupLike>(
  companyId: string | undefined,
  groups: T[],
  groupCompanies: GroupCompanyLike[],
) {
  if (!companyId) return undefined;
  const relationGroupIds = new Set(
    groupCompanies
      .filter((item) => item.companyId === companyId)
      .map((item) => item.groupId),
  );
  if (!relationGroupIds.size) return undefined;

  const primary = primaryCompanyGroup(groups, groupCompanies);
  if (primary && primary.active !== false && relationGroupIds.has(primary.id)) return primary;

  return groups.find((group) => relationGroupIds.has(group.id) && group.active !== false);
}

export function structureGroupForCompany<T extends GroupLike>(
  companyId: string | undefined,
  groups: T[],
  groupCompanies: GroupCompanyLike[],
) {
  return companyGroupForCompany(companyId, groups, groupCompanies)
    || primaryCompanyGroup(groups, groupCompanies);
}

export function companyIdsForGroup(
  groupId: string | undefined,
  groupCompanies: GroupCompanyLike[],
) {
  if (!groupId) return [] as string[];
  return Array.from(new Set(
    groupCompanies
      .filter((item) => item.groupId === groupId)
      .map((item) => item.companyId)
      .filter(Boolean),
  ));
}

export function leaderCompanyIdForGroup(
  group: GroupLike | undefined,
  groupCompanies: GroupCompanyLike[],
  companies: Company[] = [],
) {
  if (!group) return "";
  if (group.divergenceSourceCompanyId) return group.divergenceSourceCompanyId;

  const ids = companyIdsForGroup(group.id, groupCompanies);
  const activeCompanyIds = new Set(companies.filter((company) => company.active !== false).map((company) => company.id));
  return ids.find((id) => activeCompanyIds.has(id)) || ids[0] || "";
}

export function structureItemsForGroup<T extends StructureItem>(
  items: T[],
  group: GroupLike | undefined,
  groupCompanies: GroupCompanyLike[],
  companies: Company[] = [],
) {
  if (!group) return items.filter((item) => item.active !== false);

  const leaderCompanyId = leaderCompanyIdForGroup(group, groupCompanies, companies);
  const filtered = items.filter((item) => {
    if (item.active === false) return false;
    if (item.groupId) return item.groupId === group.id;
    return Boolean(leaderCompanyId && item.companyId === leaderCompanyId);
  });

  return dedupeStructureItems(filtered);
}

export function dedupeStructureItems<T extends StructureItem>(items: T[]) {
  const byKey = new Map<string, T>();
  items.forEach((item) => {
    const key = normalizeStructureText(item.name || "") || item.id;
    const current = byKey.get(key);
    if (!current || (!current.groupId && item.groupId)) byKey.set(key, item);
  });
  return Array.from(byKey.values()).sort((first, second) => (
    first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base", numeric: true })
  ));
}

export function employeeGroup(
  employee: Pick<Employee, "companyId" | "groupId"> | undefined,
  groups: CompanyGroup[],
  groupCompanies: CompanyGroupCompany[],
) {
  if (!employee) return undefined;
  return groups.find((group) => group.id === employee.groupId && group.active !== false)
    || structureGroupForCompany(employee.companyId, groups, groupCompanies);
}

export function structureScopePayload(
  group: GroupLike | undefined,
  groupCompanies: GroupCompanyLike[],
  companies: Company[] = [],
) {
  return {
    groupId: group?.id || "",
    companyId: leaderCompanyIdForGroup(group, groupCompanies, companies),
  };
}

export type GroupStructureDepartment = Department & { groupId?: string };
export type GroupStructureSector = Sector & { groupId?: string };
export type GroupStructureSubsector = Subsector & { groupId?: string };
export type GroupStructureTeam = Team & { groupId?: string };
