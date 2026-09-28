import { Activity, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import MultiSelect from "@/common/components/MultiSelect";
import ClearFiltersButton from "@/common/components/ClearFiltersButton";
import { loadRecentAuditLogs } from "@/modules/monitoring/data/auditLogRepository";
import type { AuditAction, AuditLog } from "@/types/domain";
import { collectionScreenMap, systemScreens } from "@/services/accessControl";

const actionLabels: Record<AuditAction, string> = {
  create: "Criação",
  edit: "Edição",
  delete: "Exclusão",
  deactivate: "Desativação",
  bulk: "Operação em lote",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

export default function Monitoring() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usernames, setUsernames] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [screens, setScreens] = useState<string[]>([]);
  const [affected, setAffected] = useState<string[]>([]);
  const [quickName, setQuickName] = useState("");
  const [quickResult, setQuickResult] = useState<null | {date: string; user: string; desc: string}>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  async function load() {
    setLoading(true);
    setError("");
    try {
      setLogs(await loadRecentAuditLogs(150));
    } catch (loadError) {
      console.error(loadError);
      setError("Não foi possível carregar o monitoramento.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const usernameOptions = useMemo(() => Array.from(new Set(logs.map((log) => log.actorUsername).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((value) => ({ value, label: value })), [logs]);



  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logs.filter((log) => (
      (!usernames.length || usernames.includes(log.actorUsername))
      && (!actions.length || actions.includes(log.action))
      && (!screens.length || screens.includes(getScreenLabel(log.entityType)))
      && (!affected.length || affected.includes(getAffectedLabel(log)))
      && (!needle || `${log.actorUsername} ${log.actorName} ${log.description} ${log.entityLabel} ${log.entityType} ${getScreenLabel(log.entityType)} ${getAffectedLabel(log)}`.toLowerCase().includes(needle))
    ));
  }, [actions, logs, search, usernames, screens, affected]);

  useEffect(() => setCurrentPage(1), [actions, search, usernames, screens, affected]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filteredLogs.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = Boolean(usernames.length || actions.length || search || screens.length || affected.length);
  const domain = useDomainData();
  const { employees, benefitPlans, companies, departments, teams } = domain;

  function getScreenLabel(entityType: string) {
    const screenKey = collectionScreenMap[entityType];
    if (screenKey) {
      const found = systemScreens.find((s) => s.key === screenKey);
      return found ? found.label : String(screenKey);
    }

    // heuristics: match common substrings to screens
    const lower = (entityType || "").toLowerCase();
    if (lower.includes("timekeeping") || lower.includes("time") || lower.includes("point") || lower.includes("timerecords") || lower.includes("time_records")) return "Controle de ponto";
    if (lower.includes("company") || lower.includes("empresa") || lower.includes("companies") || lower.includes("companygroup")) return "Empresas";
    if (lower.includes("employee") || lower.includes("funcionario") || lower.includes("employees")) return "Funcionários";
    if (lower.includes("benefit") || lower.includes("beneficio")) return "Benefícios";
    if (lower.includes("permission") || lower.includes("systempermissions") || lower.includes("profile")) return "Permissões do sistema";
    if (lower.includes("notification") || lower.includes("alert")) return "Notificações";
    if (lower.includes("monitor")) return "Monitoramento";

    // fallback: try to humanize generic entityType strings
    const human = entityType
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .trim();
    return human || "-";
  }

  function getAffectedLabel(log: AuditLog) {
    // Prefer explicit metadata fields, then entityLabel, then entityId
    const meta = log.metadata || {};
    // Batch operations
    if (log.action === "bulk") {
      if (meta.count) return `${meta.count} registro(s)`;
      if (meta.changedCount) return `${meta.changedCount} registro(s)`;
    }

    // Common metadata keys that identify affected items (broadened)
    const candidateKeys = [
      "employeeName", "employeeFullName", "employee_name", "fullName", "full_name", "displayName", "name", "label", "username", "title", "date", "employee",
      "groupName", "group_name", "companyName", "company_name", "unitName", "nodeName", "itemName", "beneficiaryName", "beneficiary_name",
      "planName", "plan_name", "contractName", "contract_name",
    ];
    for (const key of candidateKeys) {
      const v = (meta as Record<string, any>)[key];
      if (v) return String(v);
    }

    if (log.entityLabel) return String(log.entityLabel);
    // try resolving common ids to human names using domain data
    const metaAny = meta as Record<string, any>;
    if (metaAny.employeeId) {
      const emp = employees.find((e) => e.id === String(metaAny.employeeId));
      if (emp) return emp.name;
    }
    if (metaAny.contractId || metaAny.planId || log.entityType === "employeeBenefits" || log.entityType === "employeeBenefits") {
      const planId = metaAny.planId || metaAny.contractId;
      if (planId) {
        const plan = benefitPlans.find((p) => p.id === String(planId) || p.contractId === String(planId));
        if (plan) return plan.name || String(planId);
      }
    }
    if (metaAny.companyId) {
      const comp = companies.find((c) => c.id === String(metaAny.companyId));
      if (comp) return comp.name;
    }
    if ((meta as Record<string, any>).employeeId && (meta as Record<string, any>).employeeName) return String((meta as Record<string, any>).employeeName);
    if ((meta as Record<string, any>).name) return String((meta as Record<string, any>).name);
    if (log.entityId) return String(log.entityId || "-");
    return "-";
  }

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1><Activity size={24} /> Monitoramento</h1>
          <p>Histórico das criações, edições, exclusões, desativações e operações em lote realizadas no sistema.</p>
        </div>
        <button className="btn btn-secondary" type="button" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      <div className="filters-panel">
        <Search size={18} />
        <MultiSelect label="Username" placeholder="Username" value={usernames} onChange={setUsernames} options={usernameOptions} />
        <MultiSelect
          label="Movimentação"
          placeholder="Movimentação"
          value={actions}
          onChange={setActions}
          options={Object.entries(actionLabels).map(([value, label]) => ({ value, label }))}
        />
        {/* Tela and Afetado filters (reactivated) */}
        <MultiSelect
          label="Tela"
          placeholder="Tela"
          value={screens}
          onChange={setScreens}
          options={Array.from(new Set(logs.map((l) => getScreenLabel(l.entityType)))).map((s) => ({ value: s, label: s }))}
        />
        <MultiSelect
          label="Afetado"
          placeholder="Afetado"
          value={affected}
          onChange={setAffected}
          options={Array.from(new Set(logs.map((l) => getAffectedLabel(l)))).map((s) => ({ value: s, label: s }))}
        />

          {quickResult ? (
            <div style={{ marginLeft: 12, padding: 8, border: "1px solid var(--muted)", borderRadius: 6, background: "var(--surface)" }}>
              <strong>Última desativação</strong>
              <div style={{ fontSize: 13 }}><strong>Data:</strong> {quickResult.date}</div>
              <div style={{ fontSize: 13 }}><strong>Usuário:</strong> {quickResult.user}</div>
              <div style={{ fontSize: 13 }}><strong>Descrição:</strong> {quickResult.desc}</div>
            </div>
          ) : null}
        <label className="field" style={{ minWidth: 240 }}>
          <span>Buscar</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Funcionário, tela ou descrição" />
        </label>
        <ClearFiltersButton active={hasFilters} onClear={() => { setUsernames([]); setActions([]); setSearch(""); setScreens([]); setAffected([]); }} />
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Username</th>
              <th>Movimentação</th>
              <th>Tela</th>
              <th>Afetado</th>
              <th>Descrição</th>
              <th>Campos alterados</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.createdAt)}</td>
                <td><strong>{log.actorUsername}</strong><br /><span className="muted">{log.actorName}</span></td>
                <td><span className="badge">{actionLabels[log.action]}</span></td>
                <td>{getScreenLabel(log.entityType)}</td>
                <td>{getAffectedLabel(log)}</td>
                <td>{log.description}</td>
                <td>{log.changedFields.length ? log.changedFields.join(", ") : "-"}</td>
              </tr>
            ))}
            {!loading && !pageRows.length ? <tr><td colSpan={7}>Nenhuma movimentação encontrada.</td></tr> : null}
            {loading ? <tr><td colSpan={7}>Carregando monitoramento…</td></tr> : null}
          </tbody>
        </table>
        <div className="pagination-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12 }}>
          <span className="muted">{filteredLogs.length} movimentação(ões)</span>
          <div className="form-actions">
            <button className="btn btn-ghost" type="button" disabled={safePage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>Anterior</button>
            <span>Página {safePage} de {totalPages}</span>
            <button className="btn btn-ghost" type="button" disabled={safePage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>Próxima</button>
          </div>
        </div>
      </div>
    </section>
  );
}
