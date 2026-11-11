import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { firstAllowedScreen } from "@/services/accessControl";
import { useAuth } from "@/hooks/useAuth";
import { employeeTabOf, screenHref } from "@/services/secureRoutes";
import type { AppScreen } from "@/types/domain";

// A tela de Funcionários também abriga as abas com permissão própria (Processo de
// Funcionário, Demitidos, Tabela Salarial): quem vê qualquer uma delas entra na rota,
// e EmployeesPage decide o que mostrar.
const employeeRouteScreens = ["employees", ...Object.keys(employeeTabOf)] as AppScreen[];

export default function PermissionRoute({ children, screen }: { children: ReactNode; screen: AppScreen }) {
  const { user, can } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const allowed = screen === "employees"
    ? employeeRouteScreens.some((item) => can(item, "view"))
    : can(screen, "view");

  if (!allowed) {
    const nextScreen = firstAllowedScreen(user);

    if (nextScreen) {
      return <Navigate to={screenHref(nextScreen.key)} replace />;
    }

    return (
      <section className="page">
        <div className="empty-state">
          <h1 className="page-title">Sem acesso</h1>
          <p>Seu usuário ainda não possui permissões liberadas no sistema.</p>
        </div>
      </section>
    );
  }

  return children;
}
