import { addDays, resignationNoticeOptions } from "./experience";

function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date;
}

export function completedServiceYears(admissionDate: string, referenceDate: string): number | null {
  if (!validDate(admissionDate) || !validDate(referenceDate) || referenceDate < admissionDate) return null;
  let years = Number(referenceDate.slice(0, 4)) - Number(admissionDate.slice(0, 4));
  if (referenceDate.slice(5) < admissionDate.slice(5)) years -= 1;
  return years;
}

/** Data-base efetiva separada da projeção do aviso e do prazo de pagamento. */
export function terminationDates(mode: string, variant: string, date: string, start: string, admissionDate = "") {
  const resignationWorked = mode === "resignation" && [resignationNoticeOptions.worked, "Aviso trabalhado"].includes(variant);
  const workedNotice = resignationWorked || (mode === "without_cause" && variant === "Aviso prévio trabalhado");
  const indemnifiedNotice = mode === "without_cause" && variant === "Aviso prévio indenizado";
  // O campo de início é o primeiro dia do aviso (dia 1), não a comunicação.
  const effectiveDate = workedNotice ? (validDate(start) ? addDays(start, 29) : "") : validDate(date) ? date : "";
  const serviceYears = completedServiceYears(admissionDate, effectiveDate);
  const employerNotice = mode === "without_cause" && (workedNotice || indemnifiedNotice);
  const additionalDays = employerNotice && serviceYears !== null ? Math.min(60, serviceYears * 3) : 0;
  const noticeDays = employerNotice ? (serviceYears === null ? 0 : 30 + additionalDays) : resignationWorked ? 30 : 0;
  const indemnifiedDays = indemnifiedNotice ? noticeDays : employerNotice ? additionalDays : 0;
  const projectionEndDate = employerNotice && noticeDays && effectiveDate ? addDays(effectiveDate, indemnifiedDays) : "";
  return {
    resignationWorked, workedNotice, indemnifiedNotice, effectiveDate,
    serviceYears, additionalDays, noticeDays, indemnifiedDays, projectionEndDate,
    lastNoticeDate: workedNotice ? effectiveDate : indemnifiedNotice ? projectionEndDate : "",
    calculationDate: effectiveDate,
  };
}
