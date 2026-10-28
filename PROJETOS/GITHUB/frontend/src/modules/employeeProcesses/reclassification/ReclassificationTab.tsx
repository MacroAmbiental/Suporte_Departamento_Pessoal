import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { formatDate, todayISO } from "@/utils/format";
import {
  readyToEffect,
  reclassificationStageLabels,
  roleLabel,
  type ReclassificationCase,
} from "./reclassificationModel";
import { useReclassificationCases } from "./useReclassificationCases";
import ReclassificationModal from "./ReclassificationModal";
import "./reclassification.css";

type CardKey = "requested" | "approved" | "ready" | "effective" | "finished";

const RECENT_DAYS = 30;

export default function ReclassificationTab() {
  const data = useDomainData();
  const { user, can } = useAuth();
  const canEdit = can("employees", "edit");
  const today = todayISO();
  const { cases, ready, loadError, create, approve, reject, attachTerm, markEffective, markPayroll } = useReclassificationCases(user);
  const [filter, setFilter] = useState<CardKey | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  const companyNameById = useMemo(() => new Map(data.companies.map((company) => [company.id, company.name])), [data.companies]);
  const recentLimit = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
  const openCases = cases.filter((item) => item.status === "open");
  const finished = cases.filter((item) => item.status === "closed" && (item.closedAt || "") >= recentLimit);

  const cards: Array<{ key: CardKey; label: string; tone: string; items: ReclassificationCase[] }> = [
    { key: "requested", label: "Aguardando aprovação", tone: "yellow", items: openCases.filter((item) => item.stage === "requested") },
    { key: "approved", label: "Falta o termo assinado", tone: "yellow", items: openCases.filter((item) => item.stage === "approved") },
    { key: "ready", label: "Pronto para efetivar", tone: "blue", items: openCases.filter((item) => readyToEffect(item, today)) },
    { key: "effective", label: "Falta lançar na folha", tone: "red", items: openCases.filter((item) => item.stage === "effective") },
    { key: "finished", label: `Concluídos/recusados (${RECENT_DAYS} dias)`, tone: "green", items: finished },
  ];
  const rows = (filter ? cards.find((card) => card.key === filter)?.items || [] : openCases)
    .slice()
    .sort((left, right) => (left.effectiveDate || "").localeCompare(right.effectiveDate || ""));
  const selected = cases.find((item) => item.id === selectedId);

  // Efetivar: o cadastro recebe a nova função/cargo/salário e a mudança entra na
  // trajetória (mesmo registro que a edição do cadastro já fazia).
  async function effect(item: ReclassificationCase) {
    const current = data.employees.find((employee) => employee.id === item.employeeId);
    if (!current) throw new Error("Funcionário não encontrado.");
    if (current.status === "terminated") throw new Error("O funcionário foi desligado; a reclassificação não pode ser efetivada.");
    const now = new Date().toISOString();
    await data.upsertEmployee({
      ...current,
      role: item.proposedRole,
      position: item.proposedPosition,
      salary: item.proposedSalary,
      updatedAt: now,
    });
    await data.upsertEmployeePromotion({
      employeeId: current.id,
      effectiveDate: item.effectiveDate,
      previousRole: current.role || "",
      newRole: item.proposedRole,
      previousPosition: current.position || "",
      newPosition: item.proposedPosition,
      previousSalary: Number(current.salary || 0),
      newSalary: item.proposedSalary,
      previousWeeklyHours: Number(current.weeklyHours || 0),
      newWeeklyHours: Number(current.weeklyHours || 0),
      notes: `Reclassificação (${item.reason})${item.approvedBy ? `, aprovada por ${item.approvedBy}` : ""}.`,
      createdAt: now,
    });
    await markEffective(item);
    setMessage(`Reclassificação de ${item.employeeName} efetivada no cadastro.`);
  }

  return (
    <>
      <div className="employee-process-summary">
        {cards.map((card) => (
          <button
            type="button"
            key={card.key}
            aria-pressed={filter === card.key}
            className={`employee-process-card is-clickable${filter === card.key ? " is-selected" : ""}`}
            onClick={() => setFilter((current) => current === card.key ? "" : card.key)}
          >
            <span><i className={card.tone} />{card.label}</span>
            <strong>{ready ? card.items.length : "—"}</strong>
          </button>
        ))}
      </div>
      {message ? <p role="status">{message}</p> : null}
      {loadError ? <p role="alert">Não foi possível carregar as reclassificações. Recarregue a página.</p> : null}
      <div className="employee-process-list">
        <div className="employee-process-filters">
          {canEdit ? (
            <button type="button" className="btn btn-primary" onClick={() => { setMessage(""); setCreating(true); }}><Plus size={16} /> Nova reclassificação</button>
          ) : null}
          {filter ? <button type="button" className="btn btn-secondary" onClick={() => setFilter("")}>Mostrar todos em andamento</button> : null}
        </div>
        <div className="employee-process-table-wrap">
          <table className="data-table">
            <thead><tr><th>Funcionário</th><th>Hoje</th><th>Proposto</th><th>Motivo</th><th>Passa a valer</th><th>Etapa</th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td><button type="button" className="process-open-button" onClick={() => setSelectedId(item.id)}>{item.employeeName}</button><small className="muted reclassification-company">{item.companyName}</small></td>
                  <td>{roleLabel(item.currentRole, item.currentPosition)}</td>
                  <td><strong>{roleLabel(item.proposedRole, item.proposedPosition)}</strong></td>
                  <td>{item.reason}</td>
                  <td>{formatDate(item.effectiveDate)}</td>
                  <td>
                    <span className={`badge ${item.stage === "rejected" ? "badge-danger" : item.stage === "closed" ? "badge-success" : readyToEffect(item, today) || item.stage === "effective" ? "badge-warning" : "badge-info"}`}>
                      {readyToEffect(item, today) ? "Pronto para efetivar" : reclassificationStageLabels[item.stage]}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr><td colSpan={6} className="employee-process-empty"><p>{!ready ? "Carregando..." : filter ? "Nada nesse filtro." : "Nenhuma reclassificação em andamento. Use \"Nova reclassificação\" para registrar um pedido."}</p></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {creating || selected ? (
        <ReclassificationModal
          key={selected?.id || "new"}
          item={selected}
          employees={data.employees}
          companyNameById={companyNameById}
          canEdit={canEdit}
          onClose={() => { setCreating(false); setSelectedId(null); }}
          create={create}
          approve={approve}
          reject={reject}
          attachTerm={attachTerm}
          effect={effect}
          markPayroll={markPayroll}
        />
      ) : null}
    </>
  );
}
