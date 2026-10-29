import { EmployeesProvider } from "@/modules/employees/context/EmployeesContext";
import Employees from "./Employees";
import { useSearchParams } from "react-router-dom";
import EmployeeProcesses from "@/modules/employeeProcesses/pages/EmployeeProcesses";
import SalaryTablePage from "@/modules/salaryTable/SalaryTablePage";

export default function EmployeesPage() {
  const [params, setParams] = useSearchParams();
  const employeeId = params.get("employeeId") || "";
  const modal = params.get("modal");
  const quickDismissal = params.get("quickDismissal");
  const companyIds = (params.get("companyIds") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (params.get("tab") === "processos") return <EmployeeProcesses />;
  if (params.get("tab") === "tabela-salarial") return <SalaryTablePage />;
  return (
    <EmployeesProvider>
      <Employees
        showTerminatedOnly={params.get("tab") === "demitidos"}
        initialEmployeeId={employeeId}
        initialModal={modal === "deactivate" ? "deactivate" : undefined}
        initialQuickDismissal={quickDismissal === "quick" || quickDismissal === "warning" ? quickDismissal : undefined}
        initialCompanyIds={companyIds}
        initialNewHireRhId={params.get("novoContratadoRH") || ""}
        onInitialNewHireRhHandled={() => setParams((current) => {
          const next = new URLSearchParams(current);
          next.delete("novoContratadoRH");
          return next;
        }, { replace: true })}
      />
    </EmployeesProvider>
  );
}
