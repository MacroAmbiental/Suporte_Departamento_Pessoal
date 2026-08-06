import { EmployeesProvider } from "@/modules/employees/context/EmployeesContext";
import Employees from "./Employees";

export default function EmployeesPage() {
  return (
    <EmployeesProvider>
      <Employees />
    </EmployeesProvider>
  );
}
