import type { Employee } from "@/types/domain";
import { todayISO } from "@/utils/format";

/** A scheduled dismissal becomes effective on its date even before status is synced. */
export function isEmployeeTerminated(employee: Pick<Employee, "status" | "registrationData">, today = todayISO()) {
  const end = employee.registrationData?.scheduledDeactivationDate || employee.registrationData?.deactivationEffectiveDate || "";
  return employee.status === "terminated" || Boolean(end && end <= today);
}
