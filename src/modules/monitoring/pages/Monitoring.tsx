import { Activity, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import MultiSelect from "@/common/components/MultiSelect";
import ClearFiltersButton from "@/common/components/ClearFiltersButton";
import { loadRecentAuditLogs } from "@/modules/monitoring/data/auditLogRepository";
import type { AuditAction, AuditLog } from "@/types/domain";

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
      && (!needle || `${log.actorUsername} ${log.actorName} ${log.description} ${log.entityLabel} ${log.entityType}`.toLowerCase().includes(needle))
    ));
  }, [actions, logs, search, usernames]);

  useEffect(() => setCurrentPage(1), [actions, search, usernames]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filteredLogs.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = Boolean(usernames.length || actions.length || search);

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
        <label className="field" style={{ minWidth: 240 }}>
          <span>Buscar</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Funcionário, tela ou descrição" />
        </label>
        <ClearFiltersButton active={hasFilters} onClear={() => { setUsernames([]); setActions([]); setSearch(""); }} />
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Data e hora</th>
              <th>Username</th>
              <th>Movimentação</th>
              <th>Item</th>
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
                <td>{log.entityLabel || log.entityId || "-"}<br /><span className="muted">{log.entityType}</span></td>
                <td>{log.description}</td>
                <td>{log.changedFields.length ? log.changedFields.join(", ") : "-"}</td>
              </tr>
            ))}
            {!loading && !pageRows.length ? <tr><td colSpan={6}>Nenhuma movimentação encontrada.</td></tr> : null}
            {loading ? <tr><td colSpan={6}>Carregando monitoramento…</td></tr> : null}
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
