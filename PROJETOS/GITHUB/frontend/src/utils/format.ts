import type { AlertPriority, AlertStatus, AttendanceStatus, BenefitType, EmployeeStatus } from "@/types/domain";

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(value?: string): string {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value?: string): string {
  if (!value) return "-";
  // Data sem hora ("2023-12-14", ou gravada como meia-noite UTC) apareceria
  // como 21:00 do dia anterior: mostra só a data.
  if (/^\d{4}-\d{2}-\d{2}(T00:00(:00(\.000)?)?Z)?$/.test(value)) return formatDate(value);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

export function normalizeUrl(value: string): string {
  if (!value) return "";
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

// Status do alerta na data de hoje. O status gravado é o do dia em que o alerta
// foi salvo e não se atualiza: vencido passou do vencimento, ativo está na
// janela de aviso (Alertar antes) e pendente ainda não chegou nela.
export function alertStatusOnDate(
  alert: { status: AlertStatus; dueDate: string; notifyDate?: string },
  today = todayISO(),
): AlertStatus {
  if (alert.status === "completed") return "completed";
  if (alert.dueDate && alert.dueDate < today) return "overdue";
  return (alert.notifyDate || alert.dueDate || "") > today ? "pending" : "active";
}

export function getAlertStatus(dueDate: string, current: AlertStatus = "active"): AlertStatus {
  if (current === "completed") return current;
  if (!dueDate) return current;
  return dueDate < todayISO() ? "overdue" : current;
}

export function labelStatus(value: AlertStatus | AlertPriority | AttendanceStatus | EmployeeStatus | BenefitType | string): string {
  const labels: Record<string, string> = {
    active: "Ativo",
    overdue: "Vencido",
    pending: "Pendente",
    completed: "Concluído",
    high: "Alta",
    medium: "Média",
    low: "Baixa",
    present: "Presente",
    absent: "Falta",
    justified: "Justificado",
    medical_certificate: "Atestado",
    absence_pending: "Falta / Pendência",
    absence_confirmed: "Falta",
    vacation: "Férias",
    leave: "Afastado",
    day_off: "Folga",
    dsr: "DSR",
    holiday: "Feriado",
    terminated: "Desligado",
    transport: "Vale transporte",
    meal: "Vale refeição",
    food: "Vale alimentação",
    health: "Plano de saúde",
    dental: "Plano dental",
    custom: "Personalizado",
    manual: "Manual",
    seculum: "Seculum",
    system: "Sistema",
    email: "E-mail",
    whatsapp: "WhatsApp",
    pdf: "PDF",
    xlsx: "XLSX",
    image: "Imagem",
    file: "Arquivo",
    folder: "Pasta",
    draft: "Rascunho",
    in_review: "Em revisão",
    companies: "Empresas",
    employees: "Funcionários",
    records: "Registros",
    benefits: "Benefícios",
    timekeeping: "Controle de ponto",
    hrControl: "Controle RH",
    talentBank: "Banco de talentos",
  };
  return labels[value] ?? value;
}

export function badgeClass(value: string): string {
  const map: Record<string, string> = {
    active: "is-active",
    completed: "is-done",
    present: "is-active",
    low: "is-low",
    overdue: "is-overdue",
    high: "is-high",
    absent: "is-overdue",
    absence_confirmed: "is-overdue",
    absence_pending: "is-pending",
    pending: "is-pending",
    medium: "is-medium",
    justified: "is-medium",
    medical_certificate: "is-medium",
    leave: "is-neutral",
    vacation: "is-neutral",
    day_off: "is-neutral",
    dsr: "is-neutral",
    holiday: "is-neutral",
    terminated: "is-overdue",
  };
  return map[value] ?? "is-neutral";
}
