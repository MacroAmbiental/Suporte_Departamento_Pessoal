import type { DocumentAlert, Employee, EmployeeDocument } from "@/types/domain";

export function formatNotificationTitle(title: string) {
  return title.trim();
}

export type ClosureReason = "completed" | "document_deleted" | "dismissal" | "document_inactive" | "employee_terminated";

export const closureLabels: Record<ClosureReason, string> = {
  completed: "Concluído",
  document_deleted: "Documento excluído",
  dismissal: "Demissão homologada",
  document_inactive: "Documento desativado",
  employee_terminated: "Funcionário desligado",
};

function dismissalAlertIds(employee?: Employee) {
  try {
    const snapshot = JSON.parse(employee?.registrationData?.dismissalAlertSnapshot || "[]") as Array<{ id?: string }>;
    return new Set(Array.isArray(snapshot) ? snapshot.map((alert) => alert.id || "").filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

// Por que o alerta saiu da lista ativa (null = continua ativo). Não fica
// gravado: vem do documento e do funcionário. Antes, documento excluído e
// demissão homologada apareciam como "Concluído", e alerta de documento
// desativado ou de funcionário desligado sumia de todas as abas.
export function closureReason(alert: DocumentAlert, document?: EmployeeDocument, employee?: Employee): ClosureReason | null {
  if (alert.status === "completed") {
    if (dismissalAlertIds(employee).has(alert.id)) return "dismissal";
    if (alert.realized === "yes" || document) return "completed";
    return "document_deleted";
  }
  if (!document) return "document_deleted";
  if (document.active === false) return "document_inactive";
  if (employee?.status === "terminated") return "employee_terminated";
  return null;
}

// Alerta que já entrou na janela de aviso e continua ativo: é o que aparece em
// "Próximos alertas", no sino do menu e no Painel.
export function alertsToNotify(
  alerts: DocumentAlert[],
  documents: EmployeeDocument[],
  employees: Employee[],
  today: string,
) {
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  return alerts.filter((alert) => (
    !closureReason(alert, documentById.get(alert.documentId), employeeById.get(alert.employeeId))
    && (alert.notifyDate || alert.dueDate) <= today
  ));
}
