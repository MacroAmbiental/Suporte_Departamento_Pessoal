import { EmployeesProvider } from "@/modules/employees/context/EmployeesContext";
import Employees from "./Employees";
import { useSearchParams } from "react-router-dom";
import EmployeeProcesses from "./EmployeeProcesses";

export default function EmployeesPage() {
  const [params] = useSearchParams();
  const employeeId = params.get("employeeId") || "";
  const modal = params.get("modal");

  if (params.get("tab") === "processos") return <EmployeeProcesses />;
  return (
    <EmployeesProvider>
      <Employees initialEmployeeId={employeeId} initialModal={modal === "deactivate" ? "deactivate" : modal === "reactivate" ? "reactivate" : undefined} />
    </EmployeesProvider>
  );
}
