import { collection, doc, getDoc, getDocs, query, runTransaction, where } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import type { Employee, EmployeeDocument } from "@/types/domain";
import { todayISO } from "@/utils/format";
import { processEntryDate } from "./processEntryDate";
import { terminationModes, type TerminationMode } from "./experience";
export interface EmployeeProcessHistory {
  id: string;
  employeeId: string;
  employee: Employee;
  company: string;
  documents: EmployeeDocument[];
  modality: string;
  enteredAt: string;
  completedAt: string;
  archivedAt: string;
  notes: string;
}
export function processCompletion(employee: Employee, today = todayISO()) {
  const fields = employee.registrationData || {};
  const end = fields.scheduledDeactivationDate || fields.deactivationEffectiveDate || fields.noticeEndDate || fields.noticeDate || "";
  const hasProcess = end || fields.deactivationScheduledAt || fields.noticeScheduledAt;
  if (hasProcess && (employee.status === "terminated" || (end && end <= today))) return end || fields.deactivationCompletedDate || today;
  if (!hasProcess && fields.experienceConfirmedAt) return fields.experienceConfirmedAt.slice(0, 10);
  return "";
}
export function historyId(employee: Employee) {
  const fields = employee.registrationData || {};
  return encodeURIComponent(`${employee.id}__${fields.processStartedAt || fields.deactivationScheduledAt || fields.noticeScheduledAt || fields.scheduledDeactivationDate || fields.deactivationEffectiveDate || employee.admissionDate}`);
}
const pending = new Map<string, Promise<void>>();
export async function archiveEmployeeProcess(employee: Employee) {
  const completedAt = processCompletion(employee);
  if (!completedAt || !firestore) return;
  const id = historyId(employee);
  if (pending.has(id)) return pending.get(id);
  const db = firestore;
  const task = (async () => {
    const reference = doc(db, "employeeProcessHistory", id);
    if ((await getDoc(reference)).exists()) return;
    const [companyDoc, files] = await Promise.all([
      employee.companyId ? getDoc(doc(db, "companies", employee.companyId)) : Promise.resolve(null),
      getDocs(query(collection(db, "employeeDocuments"), where("employeeId", "==", employee.id))),
    ]);
    const fields = employee.registrationData || {};
    const snapshot: EmployeeProcessHistory = JSON.parse(JSON.stringify({
      id, employeeId: employee.id, employee, company: companyDoc?.data()?.name || "—",
      documents: files.docs.map((item) => ({ ...item.data(), id: item.id })).filter((item) => (item as EmployeeDocument).active !== false),
      modality: terminationModes[fields.terminationMode as TerminationMode] || (fields.noticeStartDate ? "Aviso prévio" : fields.scheduledDeactivationDate || fields.deactivationEffectiveDate ? "Desativação rápida" : "Contrato de experiência"),
      enteredAt: processEntryDate(employee, true), completedAt, archivedAt: new Date().toISOString(), notes: fields.processNotes || "",
    }));
    await runTransaction(db, async (transaction) => {
      if (!(await transaction.get(reference)).exists()) transaction.set(reference, snapshot);
    });
  })().finally(() => pending.delete(id));
  pending.set(id, task);
  return task;
}

