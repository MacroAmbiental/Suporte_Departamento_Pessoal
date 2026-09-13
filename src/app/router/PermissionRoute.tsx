import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { firstAllowedScreen } from "@/services/accessControl";
import { useAuth } from "@/hooks/useAuth";
import { securePath } from "@/services/secureRoutes";
import type { AppScreen } from "@/types/domain";

export default function PermissionRoute({ children, screen }: { children: ReactNode; screen: AppScreen }) {
  const { user, can } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!can(screen, "view")) {
    const nextScreen = firstAllowedScreen(user);

    if (nextScreen) {
      return <Navigate to={securePath(nextScreen.key)} replace />;
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
