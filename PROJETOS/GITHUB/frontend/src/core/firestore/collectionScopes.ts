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
    "dismissedEmployees",
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
    // Feriados, jornada e status do ponto usados na apuração.
    "timekeepingColumns",
  ],
  timekeeping: [
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
    "benefitContracts",
    "benefitPlans",
    "employeeBenefits",
    "timekeepingColumns",
    // timeRecords é consultado por mês no módulo de ponto.
  ],
  afastados: [
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    "departments",
    "sectors",
    "subsectors",
    "teams",
    "employees",
    "dismissedEmployees",
  ],
  hrControl: [
    "companies",
    "companyGroups",
    "companyGroupCompanies",
    // Equipes, setores e departamentos da estrutura de grupos (dayTeamId desde 14/10).
    "companyGroupUnits",
    "departments",
    "sectors",
    "subsectors",
    "teams",
    "employees",
    "dismissedEmployees",
    "timekeepingColumns",
  ],
  abandonment: [
    "companies",
    "companyGroupUnits",
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
  aso: [
    "companies",
    "employees",
    "employeeDocuments",
  ],
  classification: [
    "companies",
    // Equipe atual vem da estrutura de grupos (mesma regra do ponto).
    "companyGroupCompanies",
    "companyGroupUnits",
    "companyGroupUnitLinks",
    "companyGroupEmployeeAssignments",
    "teams",
    "employees",
    "employeePromotions",
  ],
  // Os arquivos ficam no computador; do DP vem só a equipe atual de cada
  // funcionário (Cartão-Ponto por equipe), com a mesma regra do ponto.
  toolbox: [
    "companyGroupCompanies",
    "companyGroupUnits",
    "companyGroupUnitLinks",
    "companyGroupEmployeeAssignments",
    "teams",
    "employees",
    "dismissedEmployees",
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
  employees: ["employees", "dismissedEmployees", "companies", "employeeDocuments", "employeeProcessHistory"],
  notifications: ["documentAlerts"],
  records: ["documentAlerts"],
  // Firestore restaura empregados/feriados do IndexedDB e entrega apenas as mudanças remotas.
  hrControl: ["timekeepingColumns", "employees"],
  // Desligamento feito em outra tela tira a pessoa do quadro na hora.
  abandonment: ["employees"],
  // ASO trocado em Registros sai do quadro na hora.
  aso: ["employeeDocuments"],
};

export function collectionsForScreen(screen: AppScreen | null): DomainCollectionName[] {
  if (!screen) return [];
  return Array.from(new Set(screenScopes[screen]));
}

export function realtimeCollectionsForScreen(screen: AppScreen | null): DomainCollectionName[] {
  if (!screen) return [];
  return Array.from(new Set(realtimeScopes[screen] || []));
}

