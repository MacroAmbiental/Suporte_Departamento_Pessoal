import type { DiaristWorkDay, WorkForm, PaymentStatus } from "../types";
import { dateRange } from "./dates";
import { todayISO } from "@/utils/format";

export function createWorkDays(form: WorkForm, existing: DiaristWorkDay[], createId: (prefix: string) => string): DiaristWorkDay[] {
 const dates = dateRange(form.startDate, form.mode === "fixed-period" ? form.endDate : form.startDate);
 const keys = new Set(existing.map(day => `${day.diaristId}|${day.date}`));
 const now = new Date().toISOString();
 return dates.filter(date => !keys.has(`${form.diaristId}|${date}`)).map(date => ({
 id: createId("work"), diaristId: form.diaristId, date, role: form.role, dailyRate: Number(form.dailyRate || 0), paymentStatus: form.paymentStatus, paidAt: form.paymentStatus === "paid" ? todayISO() : "", hiringType: form.mode,
 notes: form.mode === "open-period" ? `${form.notes || ""}${form.notes ? " · " : ""}Período sem data final definida.` : form.notes, createdAt: now, updatedAt: now,
 }));
}
export function changePaymentStatus(day: DiaristWorkDay, status: PaymentStatus): DiaristWorkDay {
 return { ...day, paymentStatus: status, paidAt: status === "paid" ? todayISO() : "", updatedAt: new Date().toISOString() };
}
