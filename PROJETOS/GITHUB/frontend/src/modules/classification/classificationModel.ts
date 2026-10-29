// Processo de Classificação (POP-RH-06 "Mudança de cargo", 29/10/2026): kanban das
// 7 etapas do POP. O pedido chega pelo link público (fatia 1); cada etapa tem
// requisitos e o cartão só avança quando eles estão preenchidos. SLA: 30 dias
// corridos a partir da solicitação.

export const CLASSIFICATION_COLLECTION = "classificationCases";
export const CLASSIFICATION_EVENTS = "events";
export const CLASSIFICATION_SLA_DAYS = 30;
export const CLASSIFICATION_MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ClassificationStage = "request" | "survey" | "opinion" | "board" | "decision" | "supervisor" | "card" | "closed";

export const classificationStages: Array<{ id: ClassificationStage; label: string; hint: string }> = [
  { id: "request", label: "1. Solicitação", hint: "Pedido recebido pelo link" },
  { id: "survey", label: "2. Levantamento", hint: "Segurança, líder, DP e RH" },
  { id: "opinion", label: "3. Parecer", hint: "Critérios e sinalização" },
  { id: "board", label: "4. Na diretoria", hint: "Parecer enviado por e-mail" },
  { id: "decision", label: "5. Decisão", hint: "Aprovado ou reprovado; DP efetiva" },
  { id: "supervisor", label: "6. Retorno ao supervisor", hint: "Supervisor informado" },
  { id: "card", label: "7. Card ao colaborador", hint: "Só quando aprovado" },
  { id: "closed", label: "Concluído", hint: "Últimos 30 dias" },
];

export const stageLabel = (stage: ClassificationStage) => classificationStages.find((item) => item.id === stage)?.label || stage;

export const CRITERIA = ["Tempo de experiência", "Escolaridade", "Atividades", "Competências técnicas", "Competências comportamentais"] as const;
export type CriterionAnswer = "" | "atende" | "parcial" | "nao";
export const criterionLabels: Record<Exclude<CriterionAnswer, "">, string> = { atende: "Atende", parcial: "Atende parcialmente", nao: "Não atende" };

export type Signal = "" | "green" | "yellow" | "red";
export const signalLabels: Record<Exclude<Signal, "">, string> = { green: "Verde", yellow: "Amarelo", red: "Vermelho" };

export type ClassificationPerson = { id: string; name: string };

export type ClassificationRequest = {
  solicitante: string;
  equipe: string;
  tempoNoCargo: string;
  funcaoSolicitada: string;
  jaDesempenha: string;
  haQuantoTempo: string;
  motivos: string[];
  informacaoAdicional?: string;
};

export type ClassificationSurvey = {
  safetyText?: string;
  safetyBy?: string;
  leaderText?: string;
  leaderName?: string;
  dpChecked?: boolean;
  rhText?: string;
  rhChecked?: boolean;
  // Puxados do sistema na hora do levantamento (ficam gravados no parecer).
  attendance?: AttendanceMonth[];
  sameRoleInTeam?: number;
};

export type AttendanceMonth = { month: string; absences: number; certificates: number };

const MONTH_NAMES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
export const monthName = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1] || month}/${month.slice(0, 4)}`;

// Os 6 meses fechados antes do pedido, como no parecer do RH.
export function attendanceMonths(requestedAt: string, count = 6) {
  const [year, month] = requestedAt.slice(0, 7).split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - count + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

export function summarizeAttendance(records: Array<{ date: string; status: string }>, months: string[]): AttendanceMonth[] {
  return months.map((month) => ({
    month,
    absences: records.filter((record) => record.date.startsWith(month) && record.status === "absence_confirmed").length,
    certificates: records.filter((record) => record.date.startsWith(month) && record.status === "medical_certificate").length,
  }));
}

export const sameRoleKey = (value: string) => value.normalize("NFD").replace(/[^ -~]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export type ClassificationOpinion = {
  nextRole?: string;
  nextRoleSalary?: string;
  targetRoleSalary?: string;
  criteria?: Record<string, CriterionAnswer>;
  signal?: Signal;
  summary?: string;
};

export type ClassificationCase = {
  id: string;
  stage: ClassificationStage;
  status: "open" | "closed";
  employeeId: string;
  employeeName: string;
  companyId: string;
  currentRole: string;
  currentPosition: string;
  request: ClassificationRequest;
  requestedAt: string;
  dueDate: string;
  openedBy: ClassificationPerson;
  updatedAt: string;
  survey?: ClassificationSurvey;
  opinion?: ClassificationOpinion;
  boardSentAt?: string;
  decision?: "approved" | "rejected";
  decisionAt?: string;
  decisionBy?: string;
  newRole?: string;
  newPosition?: string;
  newSalary?: number;
  effectiveDate?: string;
  effectedAt?: string;
  termFileUrl?: string;
  termFileName?: string;
  supervisorInformedAt?: string;
  supervisorChannel?: string;
  cardSentAt?: string;
  closedAt?: string;
};

export type ClassificationEvent = {
  id: string;
  stageFrom: ClassificationStage | "";
  stageTo: ClassificationStage;
  notes?: string;
  createdAt: string;
  createdBy: ClassificationPerson;
};

// O que falta para sair da etapa atual (lista vazia = pode avançar).
export function missingRequirements(item: ClassificationCase): string[] {
  const missing: string[] = [];
  const survey = item.survey || {};
  const opinion = item.opinion || {};
  if (item.stage === "survey") {
    if (!survey.safetyText?.trim()) missing.push("Parecer da Segurança do Trabalho");
    if (!survey.leaderText?.trim()) missing.push("Comentário do líder direto");
    if (!survey.dpChecked) missing.push("Conferência do DP (salário e histórico)");
    if (!survey.rhChecked) missing.push("Levantamento do RH (faltas, atestados, função na equipe)");
  }
  if (item.stage === "opinion") {
    CRITERIA.forEach((criterion) => { if (!opinion.criteria?.[criterion]) missing.push(`Critério: ${criterion}`); });
    if (!opinion.signal) missing.push("Sinalização (verde, amarelo ou vermelho)");
  }
  if (item.stage === "board" && !item.boardSentAt) missing.push("Data de envio à diretoria");
  if (item.stage === "decision") {
    if (!item.decision) missing.push("Decisão da diretoria");
    if (item.decision === "approved" && !item.effectedAt) missing.push("Efetivar a mudança no cadastro");
  }
  if (item.stage === "supervisor" && !item.supervisorInformedAt) missing.push("Data em que o supervisor foi informado");
  if (item.stage === "card" && !item.cardSentAt) missing.push("Data de envio do card ao colaborador");
  return missing;
}

// Próxima etapa: reprovado pula o card ao colaborador.
export function nextStage(item: ClassificationCase): ClassificationStage {
  const order: ClassificationStage[] = ["request", "survey", "opinion", "board", "decision", "supervisor", "card", "closed"];
  if (item.stage === "supervisor" && item.decision === "rejected") return "closed";
  return order[Math.min(order.indexOf(item.stage) + 1, order.length - 1)];
}

export function daysSince(fromIso: string, today: string) {
  return Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T12:00:00Z`)) / 86400000));
}

export function formatMoney(value?: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
