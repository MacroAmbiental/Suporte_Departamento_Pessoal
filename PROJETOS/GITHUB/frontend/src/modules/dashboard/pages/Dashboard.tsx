import { AlertTriangle, Building2, Clock, Files, Gift, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { useDashboardMetrics } from "@/modules/dashboard/hooks/useDashboardMetrics";
import { securePath } from "@/services/secureRoutes";
import { badgeClass, formatDate, labelStatus, todayISO } from "@/utils/format";

export default function Dashboard() {
  const data = useDomainData();
  const { user } = useAuth();
  const today = todayISO();
  const activeAlerts = data.documentAlerts.filter((alert) => {
    const employee = data.employees.find((item) => item.id === alert.employeeId);
    return alert.status !== "completed" && employee?.status !== "terminated" && (alert.notifyDate || alert.dueDate) <= today;
  });
  const { metrics: dashboardMetrics, employeeNames, loading: metricsLoading } = useDashboardMetrics(activeAlerts);

  const metrics = [
    { label: "Empresas", value: dashboardMetrics.companies, icon: Building2, to: securePath("companies"), tone: "is-blue" },
    { label: "Funcionários", value: dashboardMetrics.employees, icon: Users, to: securePath("employees"), tone: "is-green" },
    { label: "Documentos", value: dashboardMetrics.employeeDocuments, icon: Files, to: securePath("records"), tone: "is-yellow" },
    { label: "Alertas abertos", value: activeAlerts.length, icon: AlertTriangle, to: securePath("notifications"), tone: "is-red" },
    { label: "Planos de benefício", value: dashboardMetrics.benefitPlans, icon: Gift, to: securePath("benefits"), tone: "is-blue" },
    { label: "Faltas", value: dashboardMetrics.absences, icon: Clock, to: securePath("timekeeping"), tone: "is-red" },
  ];

  const greetingName = user?.name || user?.username || "Usuário";

  return (
    <section className="page dashboard-page">
      <div className="dashboard-hero panel">
        <div className="dashboard-hero__content">
          <span className="dashboard-badge">
            <Sparkles size={14} />
            Visão geral do sistema
          </span>
          <h1 className="page-title dashboard-title">Bem-vindo ao Sistema de Departamento Pessoal, {greetingName}</h1>
          <p className="page-subtitle dashboard-subtitle">
            Acompanhe colaboradores, documentos, alertas e indicadores de RH em um único painel organizado e atualizado.
          </p>
        </div>
      </div>

      <div className="metric-grid">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link className="metric-card" to={metric.to} key={metric.label}>
              <span className={`metric-icon ${metric.tone}`}><Icon size={20} /></span>
              <span><small className="metric-label">{metric.label}</small><strong className="metric-value">{metricsLoading ? "…" : metric.value}</strong></span>
            </Link>
          );
        })}
      </div>

    </section>
  );
}
