import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { firestore } from "@/services/firebase";

const COLLECTION = "vacations";

export interface Vacation {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
  acquisitionYear?: number;
  acquisitionStart?: string;
  soldStartDate?: string;
  soldEndDate?: string;
  daysSold?: number;
  soldNote?: string;
  motivo?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type VacationBucket = "critico" | "limite" | "vencidas" | "emdia";

export async function loadVacations(): Promise<Vacation[]> {
  if (!firestore) return [];
  const snap = await getDocs(collection(firestore, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Vacation, "id">) }));
}

export async function saveVacation(
  vacation: Omit<Vacation, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<Vacation> {
  if (!firestore) throw new Error("Firebase não configurado.");
  const now = new Date().toISOString();
  const { id, createdAt, ...rest } = vacation;
  const data = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  ) as Omit<Vacation, "id" | "createdAt" | "updatedAt">;
  if (id) {
    const ref = doc(firestore, COLLECTION, id);
    const payload = { ...data, updatedAt: now, createdAt: createdAt || now };
    await setDoc(ref, payload, { merge: true });
    return { ...(data as Vacation), id, createdAt: createdAt || now, updatedAt: now };
  }
  const ref = await addDoc(collection(firestore, COLLECTION), {
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return { ...(data as Vacation), id: ref.id, createdAt: now, updatedAt: now };
}

export async function deleteVacation(id: string): Promise<void> {
  if (!firestore) return;
  await deleteDoc(doc(firestore, COLLECTION, id));
}

export function monthsBetween(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO) return 0;
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

export function vacationReferenceDate(
  admissionDate: string | undefined,
  vacations: Vacation[],
  todayISO?: string,
): string {
  const last = [...vacations]
    .filter((v) => v.endDate && (!todayISO || v.endDate < todayISO))
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  return last?.endDate || admissionDate || "";
}

function addToISO(iso: string, opts: { years?: number; months?: number; days?: number }): string {
  const d = new Date(`${iso}T00:00:00`);
  if (opts.years) d.setFullYear(d.getFullYear() + opts.years);
  if (opts.months) d.setMonth(d.getMonth() + opts.months);
  if (opts.days) d.setDate(d.getDate() + opts.days);
  return d.toISOString().slice(0, 10);
}

export interface AcquisitionPeriod {
  index: number;
  year: number;
  startISO: string;
  endISO: string;
  limitISO: string;
  complete: boolean;
}

export function buildAcquisitionPeriods(
  admissionDate: string | undefined,
  todayISO: string,
): AcquisitionPeriod[] {
  if (!admissionDate || !/^\d{4}-\d{2}-\d{2}$/.test(admissionDate)) return [];
  const periods: AcquisitionPeriod[] = [];
  for (let index = 0; index < 80; index += 1) {
    const startISO = addToISO(admissionDate, { years: index });
    if (startISO > todayISO) break;
    const nextStart = addToISO(admissionDate, { years: index + 1 });
    const endISO = addToISO(nextStart, { days: -1 });
    const limitISO = addToISO(endISO, { months: 12 });
    periods.push({
      index,
      year: new Date(`${startISO}T00:00:00`).getFullYear(),
      startISO,
      endISO,
      limitISO,
      complete: endISO < todayISO,
    });
  }
  return periods.reverse();
}

export interface CltRight {
  days: number;
  lost: boolean;
}

export function cltRightForAbsences(absences: number): CltRight {
  if (absences > 32) return { days: 0, lost: true };
  if (absences >= 24) return { days: 12, lost: false };
  if (absences >= 15) return { days: 18, lost: false };
  if (absences >= 6) return { days: 24, lost: false };
  return { days: 30, lost: false };
}

export function vacationBucket(months: number): VacationBucket {
  if (months >= 24) return "critico";
  if (months >= 17) return "limite";
  if (months >= 12) return "vencidas";
  return "emdia";
}

export const bucketMeta: Record<
  VacationBucket,
  { label: string; sub: string; color: string; bg: string; border: string }
> = {
  critico: {
    label: "Férias vencida (crítico)",
    sub: "Vencido há mais de 12 meses",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  limite: {
    label: "Limite vencido",
    sub: "Vencido há mais de 5 meses",
    color: "#b45309",
    bg: "#fffbeb",
    border: "#fde68a",
  },
  vencidas: {
    label: "Vencidas",
    sub: "Vencido há menos de 5 meses",
    color: "#1d4ed8",
    bg: "#eff6ff",
    border: "#bfdbfe",
  },
  emdia: {
    label: "Em dia",
    sub: "Dentro do período",
    color: "#047857",
    bg: "#ecfdf5",
    border: "#a7f3d0",
  },
};

export function hasScheduledVacation(dateISO: string, vacations: Vacation[]): boolean {
  return vacations.some((v) => v.startDate && v.startDate > dateISO);
}

export function isOnVacation(dateISO: string, vacations: Vacation[]): boolean {
  if (!dateISO) return false;
  return vacations.some(
    (v) => v.startDate && v.endDate && dateISO >= v.startDate && dateISO <= v.endDate,
  );
}
