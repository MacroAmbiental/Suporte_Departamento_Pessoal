// Simple test harness for Monitoring filters
// Run with: node scripts/test-monitoring-filters.js

function getScreenLabel(entityType) {
  const lower = (entityType || "").toLowerCase();
  if (lower.includes("timekeeping") || lower.includes("time") || lower.includes("point") || lower.includes("timerecords") || lower.includes("time_records")) return "Controle de ponto";
  if (lower.includes("company") || lower.includes("empresa") || lower.includes("companies") || lower.includes("companygroup")) return "Empresas";
  if (lower.includes("employee") || lower.includes("funcionario") || lower.includes("employees")) return "Funcionários";
  if (lower.includes("benefit") || lower.includes("beneficio")) return "Benefícios";
  if (lower.includes("permission") || lower.includes("systempermissions") || lower.includes("profile")) return "Permissões do sistema";
  if (lower.includes("notification") || lower.includes("alert")) return "Notificações";
  if (lower.includes("monitor")) return "Monitoramento";
  const human = entityType ? entityType.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim() : "";
  return human || "-";
}

function getAffectedLabel(log, domain = { employees: [], benefitPlans: [], companies: [] }) {
  const meta = log.metadata || {};
  if (log.action === "bulk") {
    if (meta.count) return `${meta.count} registro(s)`;
    if (meta.changedCount) return `${meta.changedCount} registro(s)`;
  }
  const candidateKeys = [
    "employeeName", "employeeFullName", "employee_name", "fullName", "full_name", "displayName", "name", "label", "username", "title", "date", "employee",
    "groupName", "group_name", "companyName", "company_name", "unitName", "nodeName", "itemName", "beneficiaryName", "beneficiary_name",
    "planName", "plan_name", "contractName", "contract_name",
  ];
  for (const key of candidateKeys) {
    const v = meta[key];
    if (v) return String(v);
  }
  if (log.entityLabel) return String(log.entityLabel);
  if (meta.employeeId) {
    const emp = domain.employees.find((e) => e.id === String(meta.employeeId));
    if (emp) return emp.name;
  }
  const planId = meta.planId || meta.contractId;
  if (planId) {
    const plan = domain.benefitPlans.find((p) => p.id === String(planId) || p.contractId === String(planId));
    if (plan) return plan.name || String(planId);
  }
  if (meta.companyId) {
    const comp = domain.companies.find((c) => c.id === String(meta.companyId));
    if (comp) return comp.name;
  }
  if (meta.employeeId && meta.employeeName) return String(meta.employeeName);
  if (meta.name) return String(meta.name);
  if (log.entityId) return String(log.entityId || "-");
  return "-";
}

function applyFilters(logs, { usernames = [], actions = [], screens = [], affected = [], search = "", domain = {} } = {}) {
  const needle = search.trim().toLowerCase();
  return logs.filter((log) => (
    (!usernames.length || usernames.includes(log.actorUsername))
    && (!actions.length || actions.includes(log.action))
    && (!screens.length || screens.includes(getScreenLabel(log.entityType)))
    && (!affected.length || affected.includes(getAffectedLabel(log, domain)))
    && (!needle || `${log.actorUsername} ${log.actorName} ${log.description} ${log.entityLabel} ${log.entityType} ${getScreenLabel(log.entityType)} ${getAffectedLabel(log, domain)}`.toLowerCase().includes(needle))
  ));
}

// sample domain
const domain = {
  employees: [{ id: "e1", name: "MEL FABIAH OLIVEIRA DE SÁ" }, { id: "e2", name: "JOAO DA SILVA" }],
  benefitPlans: [{ id: "p1", name: "Plano Saúde" }],
  companies: [{ id: "c1", name: "ACME" }],
};

// sample logs
const logs = [
  { id: "1", action: "deactivate", entityType: "employees", entityId: "e1", entityLabel: "Mel Fabiah", description: "Usuário desativado", changedFields: ["active"], actorUsername: "admin", actorName: "Admin User", createdAt: "2026-09-25T10:00:00Z", metadata: { employeeId: "e1" } },
  { id: "2", action: "create", entityType: "timekeepingDayTables", entityId: "8202", entityLabel: "Tabela diária salva", description: "Tabela diária salva: 16 registro(s)", changedFields: [], actorUsername: "geisian", actorName: "Geisianne", createdAt: "2026-09-25T18:37:21Z", metadata: { count: 16 } },
  { id: "3", action: "edit", entityType: "companies", entityId: "c1", entityLabel: "ACME", description: "Alterou nome da empresa", changedFields: ["name"], actorUsername: "editor", actorName: "Editor User", createdAt: "2026-09-24T09:00:00Z", metadata: { companyId: "c1" } },
  { id: "4", action: "bulk", entityType: "timekeeping", entityId: "bulk-1", entityLabel: "Operação em lote", description: "Operação em lote", changedFields: [], actorUsername: "batch", actorName: "Batch Job", createdAt: "2026-09-23T08:00:00Z", metadata: { changedCount: 5 } },
];

function showCase(name, filter) {
  console.log('\n=== ' + name + ' ===');
  const res = applyFilters(logs, { ...filter, domain });
  console.log(`Matches: ${res.length}`);
  res.forEach((r) => console.log(`- [${r.id}] ${r.action} | ${getScreenLabel(r.entityType)} | ${getAffectedLabel(r, domain)} | ${r.actorUsername} | ${r.description}`));
}

showCase('No filters', {});
showCase('Filter username=admin', { usernames: ['admin'] });
showCase('Filter action=deactivate', { actions: ['deactivate'] });
showCase('Filter screen=Controle de ponto', { screens: ['Controle de ponto'] });
showCase('Filter affected=MEL FABIAH', { affected: ['MEL FABIAH OLIVEIRA DE SÁ', 'Mel Fabiah'] });
showCase('Search term "desativado"', { search: 'desativado' });

console.log('\nTest script finished');
