import type { AppScreen, DomainSnapshot } from "@/types/domain";

export type DomainCollectionName = keyof DomainSnapshot;

/**
 * Coleções carregadas apenas quando a tela correspondente está aberta.
 * Coleções grandes não ficam com listener em tempo real por padrão.
 */
const screenScopes: Record<AppScreen, DomainCollectionName[]> = {
  dashboard: ["customModules"],
  companies: [
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    "departments",
    "sectors",
    "subsectors",
    "teams",
    "employees",
  ],

  records: [
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    "departments",
    "sectors",
    "subsectors",
    "employees",
    "employeeDocuments",
    "documentAlerts",
  ],
  employees: [
    "employeeProcessHistory",
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    "companyGroupUnits",
    "companyGroupUnitLinks",
    "companyGroupEmployeeAssignments",
    "departments",
    "sectors",
    "subsectors",
    "teams",
    "employees",
    "employeeDocuments",
    "employeeDrafts",
    "employeePromotions",
    "systemUsers",
    "systemPermissions",
    "permissionProfiles",
  ],
  benefits: [
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    "departments",
    "sectors",
    "subsectors",
    "teams",
    "employees",
    "benefitContracts",
    "benefitPlans",
    "benefitFolders",
    "benefitCustomFields",
    "employeeBenefits",
  ],
  timekeeping: [
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    "departments",
    "sectors",
    "subsectors",
    "teams",
    "employees",
    "benefitContracts",
    "benefitPlans",
    "employeeBenefits",
    "timekeepingColumns",
    // timeRecords é consultado por mês no módulo de ponto.
  ],
  hrControl: [
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    "departments",
    "sectors",
    "subsectors",
    "teams",
    "employees",
    "timekeepingColumns",
  ],
  talentBank: [
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    "departments",
    "sectors",
    "subsectors",
    "talentCandidates",
    "talentColumnOptions",
  ],
  notifications: [
    "companies",
    "employees",
    "employeeDocuments",
    "documentAlerts",
  ],
  monitoring: [],
  permissions: [
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    "departments",
    "sectors",
    "subsectors",
    "employees",
    "organizational_nodes",
    "employee_assignments",
    "systemUsers",
    "systemPermissions",
    "permissionProfiles",
    "accessKeys",
  ],
  vacation: [
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    "departments",
    "sectors",
    "subsectors",
    "teams",
    "employees",
  ],
};

/**
 * Somente dados que realmente precisam refletir alterações de outros usuários
 * imediatamente mantêm listener aberto. Os demais usam cache + atualização
 * otimista após escrita, reduzindo drasticamente leituras e re-renderizações.
 */
const realtimeScopes: Partial<Record<AppScreen, DomainCollectionName[]>> = {
  // Shared cache + listener: pagination and employee subpage navigation stay local.
  employees: ["employees", "companies", "employeeDocuments", "employeeProcessHistory"],
  notifications: ["documentAlerts"],
  records: ["documentAlerts"],
};

export function collectionsForScreen(screen: AppScreen | null): DomainCollectionName[] {
  if (!screen) return [];
  return Array.from(new Set(screenScopes[screen]));
}

export function realtimeCollectionsForScreen(screen: AppScreen | null): DomainCollectionName[] {
  if (!screen) return [];
  return Array.from(new Set(realtimeScopes[screen] || []));
}


