import { AlertTriangle, Briefcase, Building2, Clock, Files, Gift, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useDomainData } from "@/hooks/useDomainData";
import { useDashboardMetrics } from "@/modules/dashboard/hooks/useDashboardMetrics";
import { securePath } from "@/services/secureRoutes";
import { badgeClass, formatDate, labelStatus, todayISO } from "@/utils/format";

export default function Dashboard() {
  const data = useDomainData();
  const today = todayISO();
  const activeAlerts = data.documentAlerts.filter((alert) => alert.status !== "completed" && (alert.notifyDate || alert.dueDate) <= today);
  const { metrics: dashboardMetrics, employeeNames, loading: metricsLoading } = useDashboardMetrics(activeAlerts);

  const metrics = [
    { label: "Empresas", value: dashboardMetrics.companies, icon: Building2, to: securePath("companies") },
    { label: "Funcionários", value: dashboardMetrics.employees, icon: Users, to: securePath("employees") },
    { label: "Documentos", value: dashboardMetrics.employeeDocuments, icon: Files, to: securePath("records") },
    { label: "Alertas abertos", value: activeAlerts.length, icon: AlertTriangle, to: securePath("notifications") },
    { label: "Planos de benefício", value: dashboardMetrics.benefitPlans, icon: Gift, to: securePath("benefits") },
    { label: "Faltas", value: dashboardMetrics.absences, icon: Clock, to: securePath("timekeeping") },
    { label: "Candidatos", value: dashboardMetrics.talentCandidates, icon: Briefcase, to: securePath("talentBank") },
  ];

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Controle de RH e Benefícios</h1>
          <p className="page-subtitle">Sistema profissional de teste com tabelas relacionadas no Firebase/Firestore.</p>
        </div>
      </div>

      <div className="metric-grid">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link className="metric-card" to={metric.to} key={metric.label}>
              <span className="metric-icon is-blue"><Icon size={20} /></span>
              <span><small className="metric-label">{metric.label}</small><strong className="metric-value">{metricsLoading ? "…" : metric.value}</strong></span>
            </Link>
          );
        })}
      </div>

      <div className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><h2 className="panel-title">Documentos a vencer</h2></div>
          <div className="table-panel is-flat">
            <table className="data-table">
              <thead><tr><th>Alerta</th><th>Funcionário</th><th>Vencimento</th><th>Situação</th></tr></thead>
              <tbody>
                {activeAlerts.slice(0, 6).map((alert) => {
                  return <tr key={alert.id}><td className="strong-cell">{alert.title}</td><td>{employeeNames[alert.employeeId] ?? "-"}</td><td>{formatDate(alert.dueDate)}</td><td><span className={`badge ${badgeClass(alert.status)}`}>{labelStatus(alert.status)}</span></td></tr>;
                })}
                {!activeAlerts.length ? <tr><td colSpan={4}>Nenhum alerta aberto.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><h2 className="panel-title">Módulos conectados</h2></div>
          <div className="module-list">
            {data.customModules.map((module) => <span className="module-pill" key={module.id}>{module.name} → {labelStatus(module.targetScreen)}</span>)}
            {!data.customModules.length ? <p className="muted padded">Nenhum módulo customizado criado. Cadastre um em Empresas.</p> : null}
          </div>
        </article>
      </div>
    </section>
  );
}
