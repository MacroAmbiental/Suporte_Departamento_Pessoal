import { employeeProcessModalityLabel } from "@/modules/employeeProcesses/utils/experience";
import { addDaysISO } from "@/modules/vacation/data/vacationsRepository";
import type { Employee, EmployeeDocument } from "@/types/domain";

// Processo de ASO (pedido do Arthur, 28/10/2026): renovação do ASO acompanhada
// por etapas, do aviso 30 dias antes até o envio ao portal da SERTRAS.

export const ASO_CASES_COLLECTION = "asoCases";
export const ASO_LEAD_DAYS = 30;
// Prazo da clínica para entregar o ASO depois do exame.
export const ASO_CLINIC_DAYS = 3;

export type AsoStage = "notified" | "guide_issued" | "guide_sent" | "exam_done" | "aso_received" | "closed";

export const asoStages: Array<{ id: AsoStage; label: string; hint: string }> = [
  { id: "notified", label: "Avisado", hint: "ASO vence em até 30 dias" },
  { id: "guide_issued", label: "Guia emitida", hint: "Guia do exame anexada" },
  { id: "guide_sent", label: "Guia encaminhada", hint: "Enviada ao encarregado ou funcionário" },
  { id: "exam_done", label: "Exame feito", hint: `Clínica entrega em até ${ASO_CLINIC_DAYS} dias` },
  { id: "aso_received", label: "ASO recebido", hint: "Falta enviar à SERTRAS" },
  { id: "closed", label: "Enviado à SERTRAS", hint: "Processo encerrado" },
];

export type AsoPerson = { id: string; name: string };

export type AsoCase = {
  id: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  companyName: string;
  // ASO que está vencendo (o documento em Registros) e o vencimento dele.
  documentId: string;
  dueDate: string;
  stage: AsoStage;
  status: "open" | "closed";
  openedAt: string;
  openedBy: AsoPerson;
  stageChangedAt: string;
  updatedAt: string;
  // Etapa 2: guia do exame anexada.
  guideFileUrl?: string;
  guideFileName?: string;
  // Etapa 3: para quem e por onde a guia foi.
  guideSentTo?: AsoGuideRecipient;
  guideSentChannel?: AsoChannel;
  // Etapa 4: dia em que o funcionário fez o exame.
  examDate?: string;
  // Etapa 5: ASO novo anexado em Registros e o vencimento dele.
  newDueDate?: string;
  newAsoFileName?: string;
  // Etapa 6: envio ao portal da SERTRAS (encerra o caso).
  sertrasSentAt?: string;
  closedAt?: string;
  closedBy?: AsoPerson;
};

export const ASO_EVENTS_SUBCOLLECTION = "events";

export type AsoGuideRecipient = "supervisor" | "employee";
export const asoRecipientLabels: Record<AsoGuideRecipient, string> = {
  supervisor: "Encarregado",
  employee: "Funcionário",
};

export type AsoChannel = "whatsapp" | "email" | "in_person";
export const asoChannelLabels: Record<AsoChannel, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  in_person: "Em mãos",
};

// Histórico do caso: cada etapa vira um registro que não se edita.
export type AsoEvent = {
  id: string;
  stageFrom: AsoStage;
  stageTo: AsoStage;
  notes?: string;
  createdAt: string;
  createdBy: AsoPerson;
};

export const ASO_MAX_FILE_BYTES = 10 * 1024 * 1024;

export function asoGuideMessage(employeeName: string, dueDateLabel: string) {
  return `Olá! Segue a guia para o exame periódico (ASO) de ${employeeName}. `
    + `O ASO atual vence em ${dueDateLabel}. Por favor, faça o exame até essa data e avise o DP assim que for realizado.`;
}

// Quem aparece na coluna "Avisado" antes de existir o caso gravado.
export type AsoCandidate = {
  employee: Employee;
  document: EmployeeDocument;
  dueDate: string;
};

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

// Documento de ASO em Registros: "ASO", "ASO Periódico", "ASO - Admissional"...
export function isAsoDocument(document: Pick<EmployeeDocument, "name">) {
  return /\bASO\b/.test(normalized(document.name || ""));
}

// ASO vigente do funcionário: o ativo com o vencimento mais longe.
export function currentAsoDocument(documents: EmployeeDocument[]) {
  return documents
    .filter((document) => document.active !== false && document.expirationDate && isAsoDocument(document))
    .sort((left, right) => right.expirationDate.localeCompare(left.expirationDate))[0];
}

// Funcionário em aviso ou com desligamento marcado faz o ASO demissional, não
// entra no processo (combinado com o usuário, 28/10/2026).
export function inDismissalProcess(employee: Employee, today: string) {
  const process = employeeProcessModalityLabel(employee, today);
  return Boolean(process && process !== "Contrato de experiência" && process !== "Suspensão");
}

// Abertura automática: ASO vigente vencendo em até 30 dias (ou já vencido) e
// sem caso aberto. Não grava nada; o caso nasce na primeira ação do DP.
export function asoCandidates(
  employees: Employee[],
  documents: EmployeeDocument[],
  openCases: AsoCase[],
  today: string,
): AsoCandidate[] {
  const limit = addDaysISO(today, ASO_LEAD_DAYS);
  const documentsByEmployee = new Map<string, EmployeeDocument[]>();
  documents.forEach((document) => {
    const list = documentsByEmployee.get(document.employeeId) || [];
    list.push(document);
    documentsByEmployee.set(document.employeeId, list);
  });
  const withOpenCase = new Set(openCases.map((asoCase) => asoCase.employeeId));

  return employees
    .filter((employee) => employee.status !== "terminated" && !withOpenCase.has(employee.id) && !inDismissalProcess(employee, today))
    .flatMap((employee) => {
      const document = currentAsoDocument(documentsByEmployee.get(employee.id) || []);
      if (!document || document.expirationDate > limit) return [];
      return [{ employee, document, dueDate: document.expirationDate }];
    })
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}

// ASO periódico vale 1 ano a partir do exame (o DP pode mudar na hora).
export function defaultNewAsoDueDate(examDate: string) {
  const [year, month, day] = examDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  const next = new Date(Date.UTC(year + 1, month - 1, day));
  return next.toISOString().slice(0, 10);
}

// Clínica passou do prazo de entregar o ASO depois do exame.
export function clinicLate(asoCase: Pick<AsoCase, "stage" | "examDate">, today: string) {
  return asoCase.stage === "exam_done" && Boolean(asoCase.examDate) && addDaysISO(asoCase.examDate!, ASO_CLINIC_DAYS) < today;
}

export function daysBetween(fromISO: string, toISO: string) {
  return Math.round((Date.parse(`${toISO}T12:00:00Z`) - Date.parse(`${fromISO}T12:00:00Z`)) / 86400000);
}
