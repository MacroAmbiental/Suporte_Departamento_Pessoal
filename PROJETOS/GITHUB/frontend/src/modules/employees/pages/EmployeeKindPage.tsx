import { EmployeesProvider } from "@/modules/employees/context/EmployeesContext";
import Employees, { type EmployeeScreenKind } from "./Employees";

export type EmployeeKindPageProps = {
  kind: EmployeeScreenKind;
  initialEmployeeId?: string;
  initialModal?: "deactivate";
  initialQuickDismissal?: "quick" | "warning";
  showTerminatedOnly?: boolean;
  initialCompanyIds?: string[];
};

export default function EmployeeKindPage(props: EmployeeKindPageProps) {
  return (
    <EmployeesProvider>
      <Employees
        employeeKind={props.kind}
        initialEmployeeId={props.initialEmployeeId}
        initialModal={props.initialModal}
        initialQuickDismissal={props.initialQuickDismissal}
        showTerminatedOnly={props.showTerminatedOnly}
        initialCompanyIds={props.initialCompanyIds}
      />
    </EmployeesProvider>
  );
}
