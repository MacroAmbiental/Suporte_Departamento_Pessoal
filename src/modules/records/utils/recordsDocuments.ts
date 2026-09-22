import type { Company, DocumentKind, Employee } from "@/types/domain";
import { subtractDaysFromISODate } from "@/utils/date";
import type { DocumentDraft } from "@/modules/records/types";

export { subtractDaysFromISODate };

export const recurrenceOptions = ["Única", "Mensal", "Trimestral", "Semestral", "Anual", "Bienal"];

export const documentKinds: DocumentKind[] = ["pdf", "xlsx"];

export const defaultStandardDocumentNames = [
  "PGR",
  "PCMSO",
  "Ficha de EPI",
  "DDS",
  "Ordem de Serviço",
  "ASO",
  "CNH",
  "Contratos",
  "Certificados",
  "Treinamentos NR",
];

function createClientId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ? `${prefix}-${randomId}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseStandardDocumentNames(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[\n,;]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => {
      const key = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function companyStandardDocumentNames(company?: Pick<Company, "standardDocumentNames">) {
  const configured = company?.standardDocumentNames?.map((name) => name.trim()).filter(Boolean) || [];
  return configured.length ? configured : defaultStandardDocumentNames;
}

export function normalizeStandardDocumentRoleKey(value?: string) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sem-funcao";
}

export function employeeStandardDocumentRole(employee?: Pick<Employee, "role">) {
  return employee?.role?.trim() || "Sem fun\u00e7\u00e3o";
}

export function roleStandardDocumentNames(
  company: Pick<Company, "standardDocumentNamesByRole"> | undefined,
  roleName: string,
) {
  const roleKey = normalizeStandardDocumentRoleKey(roleName);
  const byRole = company?.standardDocumentNamesByRole || {};
  const configured = byRole[roleKey] || byRole[roleName.trim()] || [];
  return configured.map((name) => name.trim()).filter(Boolean);
}

export function companyHasRoleStandardDocuments(company?: Pick<Company, "standardDocumentNamesByRole">) {
  return Object.values(company?.standardDocumentNamesByRole || {}).some((names) => (
    Array.isArray(names) && names.some((name) => name.trim())
  ));
}

export function employeeStandardDocumentNames(
  company: Pick<Company, "standardDocumentNames" | "standardDocumentNamesByRole"> | undefined,
  employee: Pick<Employee, "role">,
) {
  const roleNames = roleStandardDocumentNames(company, employeeStandardDocumentRole(employee));
  if (roleNames.length) return roleNames;

  if (companyHasRoleStandardDocuments(company)) return [];

  return companyStandardDocumentNames(company);
}

export function documentKindFromFileName(fileName: string): DocumentKind {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "pdf") return "pdf";
  if (extension === "xls" || extension === "xlsx") return "xlsx";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension || "")) return "image";
  return "file";
}

export function formatDocumentFileSize(file: Pick<File, "size">) {
  return `${Math.max(1, Math.round(file.size / 1024))} KB`;
}

export function newDocumentDraft(patch: Partial<DocumentDraft> = {}): DocumentDraft {
  return {
    id: createClientId("document-draft"),
    name: "",
    kind: "pdf",
    fileUrl: "",
    size: "",
    realizedDate: "",
    expirationDateSource: "manual",
    expirationDate: "",
    createAlert: true,
    alertTitle: "",
    alertPriority: "medium",
    alertRecurrence: "Anual",
    alertAdvanceDays: "30",
    alertDescription: "",
    notifyBy: ["system"],
    ...patch,
  };
}

function addMonthsToISODate(isoDate: string, monthsToAdd: number) {
  if (!isoDate) return "";

  const [yearValue, monthValue, dayValue] = isoDate.split("-").map(Number);
  if (!yearValue || !monthValue || !dayValue) return "";

  const startMonthIndex = monthValue - 1;
  const targetMonthIndexTotal = startMonthIndex + monthsToAdd;
  const targetYear = yearValue + Math.floor(targetMonthIndexTotal / 12);
  const targetMonthIndex = ((targetMonthIndexTotal % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const targetDay = Math.min(dayValue, lastDayOfTargetMonth);

  return `${targetYear}-${String(targetMonthIndex + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function normalizeRecurrence(value?: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function nextDueDateFromRecurrence(realizedDate: string, recurrence?: string) {
  const normalized = normalizeRecurrence(recurrence);

  if (!realizedDate || !normalized || normalized.includes("unica") || normalized.includes("nica")) return "";
  if (normalized.includes("mensal")) return addMonthsToISODate(realizedDate, 1);
  if (normalized.includes("trimestral")) return addMonthsToISODate(realizedDate, 3);
  if (normalized.includes("semestral")) return addMonthsToISODate(realizedDate, 6);
  if (normalized.includes("anual")) return addMonthsToISODate(realizedDate, 12);
  if (normalized.includes("bienal")) return addMonthsToISODate(realizedDate, 24);

  return "";
}

export function documentDraftPatchFromFile(file: File): Partial<DocumentDraft> {
  return {
    file,
    name: file.name,
    kind: documentKindFromFileName(file.name),
    fileUrl: URL.createObjectURL(file),
    size: formatDocumentFileSize(file),
  };
}

export function buildEmployeeFolderPath(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" / ");
}
