import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import { ABANDONMENT_CASES_COLLECTION } from "@/modules/hrControl/abandonment/abandonmentModel";
import { employeeProcessModalityLabel } from "@/modules/employeeProcesses/utils/experience";
import { employeeLeaveEntryForDate } from "@/modules/employeeProcesses/utils/leavePeriods";
import { addDaysISO, loadVacations, type Vacation } from "@/modules/vacation/data/vacationsRepository";
import type { Employee } from "@/types/domain";

export type SituationTag = { label: string; tone: "danger" | "warning" | "info" };

const VACATION_LOOKAHEAD_DAYS = 30;

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Situação do funcionário que importa para os documentos (pedido do Arthur,
// 28/10/2026): aviso / processo de desligamento, abandono em aberto,
// afastamento e férias (em curso ou começando nos próximos 30 dias).
export function useEmployeeSituationTags(employees: Employee[], today: string) {
  const [abandonmentEmployeeIds, setAbandonmentEmployeeIds] = useState<Set<string>>(() => new Set());
  const [vacations, setVacations] = useState<Vacation[]>([]);

  useEffect(() => {
    if (!firestore) return undefined;
    return onSnapshot(
      query(collection(firestore, ABANDONMENT_CASES_COLLECTION), where("status", "==", "open")),
      (snapshot) => setAbandonmentEmployeeIds(new Set(snapshot.docs.map((entry) => String(entry.data().employeeId || "")))),
      (error) => console.warn("Não foi possível carregar os casos de abandono.", error),
    );
  }, []);

  useEffect(() => {
    let active = true;
    loadVacations()
      .then((list) => { if (active) setVacations(list); })
      .catch((error) => console.warn("Não foi possível carregar as férias.", error));
    return () => { active = false; };
  }, []);

  return useMemo(() => {
    const until = addDaysISO(today, VACATION_LOOKAHEAD_DAYS);
    const vacationByEmployee = new Map<string, Vacation>();
    vacations
      .filter((vacation) => vacation.startDate && vacation.endDate && vacation.endDate >= today && vacation.startDate <= until)
      .sort((left, right) => left.startDate.localeCompare(right.startDate))
      .forEach((vacation) => {
        if (!vacationByEmployee.has(vacation.employeeId)) vacationByEmployee.set(vacation.employeeId, vacation);
      });

    const tagsByEmployee = new Map<string, SituationTag[]>();
    employees.forEach((employee) => {
      if (employee.status === "terminated") return;
      const tags: SituationTag[] = [];
      // Suspensão já vem do afastamento; experiência não interessa aqui.
      const process = employeeProcessModalityLabel(employee, today);
      if (process && process !== "Contrato de experiência" && process !== "Suspensão") tags.push({ label: process, tone: "danger" });
      if (abandonmentEmployeeIds.has(employee.id)) tags.push({ label: "Processo de abandono", tone: "danger" });
      const leave = employeeLeaveEntryForDate(employee, today);
      if (leave) tags.push({ label: `${leave.label} até ${shortDate(leave.end)}`, tone: "warning" });
      const vacation = vacationByEmployee.get(employee.id);
      if (vacation) {
        tags.push({
          label: vacation.startDate <= today ? `Férias até ${shortDate(vacation.endDate)}` : `Férias a partir de ${shortDate(vacation.startDate)}`,
          tone: "info",
        });
      }
      if (tags.length) tagsByEmployee.set(employee.id, tags);
    });
    return tagsByEmployee;
  }, [abandonmentEmployeeIds, employees, today, vacations]);
}
