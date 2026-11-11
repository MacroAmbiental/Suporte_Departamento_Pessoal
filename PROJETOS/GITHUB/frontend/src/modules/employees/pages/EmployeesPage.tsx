import { EmployeesProvider } from "@/modules/employees/context/EmployeesContext";
import Employees from "./Employees";
import { Navigate, useSearchParams } from "react-router-dom";
import EmployeeProcesses from "@/modules/employeeProcesses/pages/EmployeeProcesses";
import SalaryTablePage from "@/modules/salaryTable/SalaryTablePage";
import { useAuth } from "@/hooks/useAuth";
import { screenHref } from "@/services/secureRoutes";
import type { AppScreen } from "@/types/domain";

// Cada aba confere a própria permissão (11/11/2026).
const tabScreens: Record<string, AppScreen> = {
  processos: "employeeProcesses",
  demitidos: "dismissed",
  "tabela-salarial": "salaryTable",
};

export default function EmployeesPage() {
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  const employeeId = params.get("employeeId") || "";
  const modal = params.get("modal");
  const quickDismissal = params.get("quickDismissal");
  const companyIds = (params.get("companyIds") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const tab = params.get("tab") || "";
  const screen: AppScreen = tabScreens[tab] || "employees";

  if (!can(screen, "view")) {
    // Sem a aba pedida: vai para a primeira aba de Funcionários que a pessoa pode ver.
    const fallback = (["employees", "employeeProcesses", "dismissed", "salaryTable"] as AppScreen[]).find((item) => item !== screen && can(item, "view"));
    if (fallback) return <Navigate to={screenHref(fallback)} replace />;
    return (
      <section className="page">
        <div className="empty-state">
          <h1 className="page-title">Sem acesso</h1>
          <p>Seu usuário não tem permissão para esta tela.</p>
        </div>
      </section>
    );
  }

  if (tab === "processos") return <EmployeeProcesses />;
  if (tab === "tabela-salarial") return <SalaryTablePage />;
  return (
    <EmployeesProvider>
      <Employees
        showTerminatedOnly={tab === "demitidos"}
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
