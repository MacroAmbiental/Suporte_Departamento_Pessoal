import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactElement } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import PermissionRoute from "@/app/router/PermissionRoute";
import PrivateRoute from "@/app/router/PrivateRoute";
import Layout from "@/common/layouts/AppLayout/Layout";
import Login from "@/modules/auth/pages/Login";
import NotFound from "@/pages/NotFound";
import { screenFromSecureToken, securePath } from "@/services/secureRoutes";
import type { AppScreen } from "@/types/domain";

const screenComponents: Record<AppScreen, LazyExoticComponent<ComponentType>> = {
  dashboard: lazy(() => import("@/modules/dashboard/pages/Dashboard")),
  companies: lazy(() => import("@/modules/companies/pages/CompaniesPage")),
  records: lazy(() => import("@/modules/records/pages/Records")),
  employees: lazy(() => import("@/modules/employees/pages/EmployeesPage")),
  benefits: lazy(() => import("@/modules/benefits/pages/BenefitsPage")),
  timekeeping: lazy(() => import("@/modules/timekeeping/pages/TimekeepingPage")),
  hrControl: lazy(() => import("@/modules/hrControl/pages/HrControl")),
  notifications: lazy(() => import("@/modules/notifications/pages/NotificationsPage")),
  monitoring: lazy(() => import("@/modules/monitoring/pages/Monitoring")),
  permissions: lazy(() => import("@/modules/permissions/pages/Permissions")),
};

function ScreenLoading() {
  return (
    <section className="page" aria-busy="true" aria-live="polite">
      <div className="panel padded">
        <strong>Carregando módulo…</strong>
      </div>
    </section>
  );
}

function screen(screenName: AppScreen, element: ReactElement) {
  return <PermissionRoute screen={screenName}>{element}</PermissionRoute>;
}

function screenElement(screenName: AppScreen) {
  const Component = screenComponents[screenName];
  return screen(
    screenName,
    <Suspense fallback={<ScreenLoading />}>
      <Component />
    </Suspense>,
  );
}

function SecureScreenRoute() {
  const { routeToken } = useParams();
  const screenName = screenFromSecureToken(routeToken);

  if (!screenName) return <NotFound />;
  if (screenName === "talentBank") return <Navigate to="/app" replace />;

  return screenElement(screenName);
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/app" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={screenElement("dashboard")} />
        <Route path="s/:routeToken" element={<SecureScreenRoute />} />
        <Route path="companies" element={<Navigate to={securePath("companies")} replace />} />
        <Route path="empresas" element={<Navigate to={securePath("companies")} replace />} />
        <Route path="records" element={<Navigate to={securePath("records")} replace />} />
        <Route path="registros" element={<Navigate to={securePath("records")} replace />} />
        <Route path="employees" element={<Navigate to={securePath("employees")} replace />} />
        <Route path="funcionarios" element={<Navigate to={securePath("employees")} replace />} />
        <Route path="benefits" element={<Navigate to={securePath("benefits")} replace />} />
        <Route path="timekeeping" element={<Navigate to={securePath("timekeeping")} replace />} />
        <Route path="hr-control" element={<Navigate to={securePath("hrControl")} replace />} />
        <Route path="controle-rh" element={<Navigate to={securePath("hrControl")} replace />} />
        <Route path="talent-bank" element={<Navigate to="/app" replace />} />
        <Route path="banco-talentos" element={<Navigate to="/app" replace />} />
        <Route path="notifications" element={<Navigate to={securePath("notifications")} replace />} />
        <Route path="notificacoes" element={<Navigate to={securePath("notifications")} replace />} />
        <Route path="monitoring" element={<Navigate to={securePath("monitoring")} replace />} />
        <Route path="monitoramento" element={<Navigate to={securePath("monitoring")} replace />} />
        <Route path="permissions" element={<Navigate to={securePath("permissions")} replace />} />
        <Route path="permissoes" element={<Navigate to={securePath("permissions")} replace />} />
      </Route>
      <Route path="/painel" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
