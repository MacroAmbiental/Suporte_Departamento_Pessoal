import type { TimeRecord } from "@/types/domain";

// Cada lista contém as 11 últimas datas úteis com ponto salvo da empresa,
// em ordem decrescente. Sem um registro de falta em todas elas, a sequência
// não está comprovada e o funcionário permanece no cálculo.
export function employeesWithElevenConfirmedAbsences(
  lastSavedDatesByEmployee: ReadonlyMap<string, readonly string[]>,
  records: ReadonlyArray<Pick<TimeRecord, "employeeId" | "date" | "status">>,
) {
  const statusByEmployeeDate = new Map(records.map((record) => [`${record.employeeId}:${record.date}`, record.status]));
  const excluded = new Set<string>();
  lastSavedDatesByEmployee.forEach((dates, employeeId) => {
    if (dates.length === 11 && dates.every((date) => statusByEmployeeDate.get(`${employeeId}:${date}`) === "absence_confirmed")) {
      excluded.add(employeeId);
    }
  });
  return excluded;
}
