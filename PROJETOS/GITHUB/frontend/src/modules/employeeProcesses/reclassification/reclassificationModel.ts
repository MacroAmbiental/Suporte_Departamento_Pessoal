// Processo de Reclassificação (28/10/2026): mudança de função/cargo/salário com
// pedido, aprovação, termo assinado e efetivação no cadastro, em vez de editar o
// cadastro direto. Quem aprovou é registrado pelo DP (a diretoria não tem login).

export const RECLASSIFICATION_COLLECTION = "reclassificationCases";
export const RECLASSIFICATION_EVENTS = "events";
export const RECLASSIFICATION_MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ReclassificationStage = "requested" | "approved" | "signed" | "effective" | "closed" | "rejected";

export const reclassificationStageLabels: Record<ReclassificationStage, string> = {
  requested: "Aguardando aprovação",
  approved: "Falta o termo assinado",
  signed: "Termo assinado",
  effective: "Efetivado, falta lançar na folha",
  closed: "Concluído",
  rejected: "Recusado",
};

export const reclassificationReasons = ["Promoção", "Mudança de função", "Equiparação salarial", "Reajuste por mérito", "Outro"];

export type ReclassificationPerson = { id: string; name: string };

export type ReclassificationCase = {
  id: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  companyName: string;
  currentRole: string;
  currentPosition: string;
  currentSalary: number;
  proposedRole: string;
  proposedPosition: string;
  proposedSalary: number;
  reason: string;
  requestedBy: string;
  effectiveDate: string;
  stage: ReclassificationStage;
  status: "open" | "closed";
  openedAt: string;
  openedBy: ReclassificationPerson;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  termFileUrl?: string;
  termFileName?: string;
  effectiveAt?: string;
  payrollRegisteredAt?: string;
  closedAt?: string;
};

export type ReclassificationEvent = {
  id: string;
  stageFrom: ReclassificationStage | "";
  stageTo: ReclassificationStage;
  notes?: string;
  createdAt: string;
  createdBy: ReclassificationPerson;
};

export type ReclassificationSeed = Pick<ReclassificationCase,
  "employeeId" | "employeeName" | "companyId" | "companyName" | "currentRole" | "currentPosition" | "currentSalary"
  | "proposedRole" | "proposedPosition" | "proposedSalary" | "reason" | "requestedBy" | "effectiveDate">;

// Pronto para efetivar: termo assinado e a data de vigência chegou.
export function readyToEffect(item: Pick<ReclassificationCase, "stage" | "effectiveDate">, today: string) {
  return item.stage === "signed" && Boolean(item.effectiveDate) && item.effectiveDate <= today;
}

export function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function roleLabel(role: string, position: string) {
  return [role, position].filter(Boolean).join(" / ") || "—";
}
