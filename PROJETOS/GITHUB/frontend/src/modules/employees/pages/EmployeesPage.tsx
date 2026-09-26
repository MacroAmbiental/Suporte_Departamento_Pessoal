import { EmployeesProvider } from "@/modules/employees/context/EmployeesContext";
import Employees from "./Employees";
import { useSearchParams } from "react-router-dom";
import EmployeeProcesses from "@/modules/employeeProcesses/pages/EmployeeProcesses";

export default function EmployeesPage() {
  const [params] = useSearchParams();
  const employeeId = params.get("employeeId") || "";
  const modal = params.get("modal");
  const quickDismissal = params.get("quickDismissal");

  if (params.get("tab") === "processos") return <EmployeeProcesses />;
  return (
    <EmployeesProvider>
      <Employees
        showTerminatedOnly={params.get("tab") === "demitidos"}
        initialEmployeeId={employeeId}
        initialModal={modal === "deactivate" ? "deactivate" : undefined}
        initialQuickDismissal={quickDismissal === "quick" || quickDismissal === "warning" ? quickDismissal : undefined}
      />
    </EmployeesProvider>
  );
}
