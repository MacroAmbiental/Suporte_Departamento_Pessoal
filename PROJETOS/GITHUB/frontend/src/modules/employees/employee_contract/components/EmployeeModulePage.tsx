import "../styles.css";
import EmployeeKindPage from "@/modules/employees/pages/EmployeeKindPage";
import { useEmployeeModule } from "../hooks/useEmployeeModule";

export default function EmployeeModulePage() {
  const module = useEmployeeModule();
  return <EmployeeKindPage kind={module.kind} />;
}
