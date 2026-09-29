import type { PaymentStatus, Diarist, DiaristWorkDay } from "../types";
import { todayISO } from "@/utils/format";

export function paymentLabel(status: PaymentStatus) {
  if (status === "paid") return "Pago";
  if (status === "canceled") return "Cancelado";
  return "Pendente";
}

export function paymentBadgeClass(status: PaymentStatus) {
  if (status === "paid") return "badge-success";
  if (status === "canceled") return "badge-danger";
  return "badge-warning";
}

export function summarize(diarists: Diarist[], workDays: DiaristWorkDay[]) {
 const activeCount = diarists.filter(d => d.status === "active").length;
 const paidTotal = workDays.filter(d => d.paymentStatus === "paid").reduce((sum,d) => sum + Number(d.dailyRate || 0),0);
 const pendingTotal = workDays.filter(d => d.paymentStatus === "pending").reduce((sum,d) => sum + Number(d.dailyRate || 0),0);
 const currentMonth = todayISO().slice(0,7);
 const monthDays = workDays.filter(d => d.date.startsWith(currentMonth) && d.paymentStatus !== "canceled").length;
 return { activeCount, paidTotal, pendingTotal, monthDays };
}
