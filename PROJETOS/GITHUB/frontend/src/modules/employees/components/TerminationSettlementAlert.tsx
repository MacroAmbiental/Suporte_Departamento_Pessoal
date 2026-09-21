import { useState } from "react";
import type { Employee } from "@/types/domain";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { formatDate, todayISO } from "@/utils/format";
import { isLateTerminationSettlementPayment, terminationSettlementLateMessage } from "../terminationSettlement";

function remainingDays(dueDate: string, today: string) {
  return Math.round((Date.parse(`${dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
}

function monthDays(month: string) {
  const [year, value] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, value - 1, 1));
  const total = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return { year, month: value, offset: first.getUTCDay(), total };
}

function shiftMonth(month: string, amount: number) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function TerminationSettlementAlert({ employee, today }: { employee: Employee; today: string }) {
  const data = useDomainData();
  const { can, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [paidDate, setPaidDate] = useState(todayISO());
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState((employee.registrationData?.terminationSettlementDueDate || today).slice(0, 7));
  const dueDate = employee.registrationData?.terminationSettlementDueDate || "";
  const dismissalDate = employee.registrationData?.scheduledDeactivationDate || employee.registrationData?.deactivationEffectiveDate || "";
  const paid = employee.registrationData?.terminationSettlementPaid === "true";
  const remaining = dueDate ? remainingDays(dueDate, today) : Number.POSITIVE_INFINITY;
  const latePayment = isLateTerminationSettlementPayment(paidDate, dueDate);
  const calendar = monthDays(calendarMonth);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(calendar.year, calendar.month - 1, 1)));
  if (!dueDate || paid) return null;
  const status = remaining < 0 ? `Vencido há ${Math.abs(remaining)} dia(s)` : remaining === 0 ? "Vence hoje" : `Faltam ${remaining} dia(s)`;
  async function confirmPayment() {
    if (busy || !can("employees", "edit")) return;
    const current = data.employees.find((item) => item.id === employee.id);
    if (!current || current.registrationData?.terminationSettlementPaid === "true") return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await data.upsertEmployee({ ...current, registrationData: { ...current.registrationData, terminationSettlementPaid: "true", terminationSettlementPaidAt: paidDate, terminationSettlementPaidBy: user?.id || "" }, updatedAt: now });
    } finally { setBusy(false); }
  }
  return <>
    <div className="experience-tracking-compact">
    <div className="experience-tracking-item">
      <div className="experience-tracking-item-main"><span className="experience-tracking-item-label">Verbas rescisórias</span><span className="experience-tracking-item-date">Vencimento: {formatDate(dueDate)}</span></div>
      <div className="experience-tracking-item-side"><span className={`experience-tracking-item-status ${remaining < 0 ? "is-danger" : "is-warning"}`}>{status}</span>{can("employees", "edit") && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setPaymentModalOpen(true)}>Valor Paga?</button>}</div>
    </div>
    </div>
    {paymentModalOpen && <div className="modal-backdrop" role="presentation"><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby={`payment-modal-${employee.id}`}><h2 id={`payment-modal-${employee.id}`}>Confirmar pagamento da indenização</h2><p>Informe a data em que o pagamento das verbas rescisórias foi realizado.</p><div className="field"><strong>Data do pagamento: {formatDate(paidDate)}</strong><div style={{ display: "grid", gap: 10, marginTop: 8, padding: 12, border: "1px solid #d7e4ef", borderRadius: 10 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setCalendarMonth((month) => shiftMonth(month, -1))}>‹</button><strong style={{ textTransform: "capitalize" }}>{monthLabel}</strong><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setCalendarMonth((month) => shiftMonth(month, 1))}>›</button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", fontSize: 12 }}><>{["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <strong key={`${day}-${index}`}>{day}</strong>)}</>{Array.from({ length: calendar.offset }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: calendar.total }, (_, index) => { const day = index + 1; const value = `${calendarMonth}-${String(day).padStart(2, "0")}`; const disabled = Boolean(dismissalDate && value < dismissalDate); const due = value === dueDate; return <button key={value} type="button" disabled={busy || disabled} aria-label={`${formatDate(value)}${due ? ", décimo dia corrido e vencimento" : ""}`} onClick={() => setPaidDate(value)} style={{ minHeight: 32, border: due ? "2px solid #d18b00" : paidDate === value ? "2px solid #2586b5" : "1px solid transparent", borderRadius: 7, background: due ? "#fff2cc" : paidDate === value ? "#e6f4fc" : "transparent", color: disabled ? "#aab7c4" : "#244367", fontWeight: due || paidDate === value ? 800 : 500, cursor: disabled ? "not-allowed" : "pointer" }}>{day}{due && <span aria-hidden="true" style={{ display: "block", fontSize: 8 }}>10º</span>}</button>; })}</div><small style={{ color: "#8a6200", fontWeight: 700 }}>Destaque amarelo: 10º dia corrido / prazo para pagamento ({formatDate(dueDate)}).</small></div></div><div className="form-actions"><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setPaymentModalOpen(false)}>Cancelar</button><button className="btn btn-primary" type="button" disabled={busy || !paidDate} onClick={() => void confirmPayment()}>{busy ? "Registrando..." : "Confirmar pagamento"}</button></div></div></div>}
  </>;
}
