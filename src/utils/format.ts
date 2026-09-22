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

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

export function normalizeUrl(value: string): string {
  if (!value) return "";
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
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
    absence_confirmed: "Falta Confirmada",
    vacation: "Férias",
    leave: "Afastado",
    day_off: "Folga",
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
    terminated: "is-overdue",
  };
  return map[value] ?? "is-neutral";
}
