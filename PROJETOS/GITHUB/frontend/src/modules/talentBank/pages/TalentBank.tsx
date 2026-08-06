import { Briefcase, Pencil, Plus, Search, Settings2, Trash2, X } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import useCreateShortcut from "@/hooks/useCreateShortcut";
import { useDomainData } from "@/hooks/useDomainData";
import ConfirmModal from "@/common/components/ConfirmModal";
import type { DeleteImpact } from "@/common/components/DeleteImpactModal";
import { buildDomainDeletionImpact } from "@/common/utils/deletionImpact";
import ClearFiltersButton from "../../../common/components/ClearFiltersButton";
import MultiSelect from "../../../common/components/MultiSelect";
import type { TalentCandidate } from "@/types/domain";
import { todayISO } from "@/utils/format";

type CandidateKey = keyof TalentCandidate;

const columns: { key: CandidateKey; label: string; kind?: "date" | "long" }[] = [
  { key: "receivedAt", label: "DATA DO RECEBIMENTO", kind: "date" },
  { key: "fullName", label: "NOME COMPLETO" },
  { key: "cpf", label: "CPF" },
  { key: "phone", label: "TELEFONE" },
  { key: "city", label: "ENDEREÇO (CIDADE)" },
  { key: "desiredRole", label: "CARGO PRETENDIDO" },
  { key: "area", label: "ÁREA" },
  { key: "referral", label: "INDICAÇÃO" },
  { key: "firstCall", label: "1° CONVOCAÇÃO" },
  { key: "secondCall", label: "2° CONVOCAÇÃO" },
  { key: "interviewed", label: "ENTREVISTADO" },
  { key: "approved", label: "APROVADO" },
  { key: "dpAnalysis", label: "ANÁLISE DP" },
  { key: "technicalInterview", label: "ENTREVISTA TECN." },
  { key: "need", label: "NECESSIDADE" },
  { key: "status", label: "STATUS" },
  { key: "hired", label: "CONTRATADO" },
  { key: "notes", label: "OBSERVAÇÃO", kind: "long" },
];

const defaultOptions: Partial<Record<CandidateKey, string[]>> = {
  firstCall: ["-", "CONVOCADO", "NÃO ATENDEU"],
  secondCall: ["-", "CONVOCADO", "NÃO ATENDEU"],
  interviewed: ["-", "SIM", "NÃO"],
  approved: ["-", "APTO", "NÃO APTO"],
  dpAnalysis: ["-", "APTO", "PENDENTE", "NÃO APTO"],
  technicalInterview: ["-", "APTO", "PENDENTE", "NÃO APTO"],
  need: ["SIM", "NÃO", "-"],
  status: ["BANCO", "ENCERRADO CONTATO", "CONTRATADO", "-"],
  hired: ["SIM", "NÃO"],
};

function emptyCandidate(): Omit<TalentCandidate, "id"> {
  return {
    receivedAt: todayISO(),
    fullName: "",
    cpf: "",
    phone: "",
    city: "",
    desiredRole: "",
    area: "",
    referral: "",
    firstCall: "-",
    secondCall: "-",
    interviewed: "-",
    approved: "-",
    dpAnalysis: "-",
    technicalInterview: "-",
    need: "",
    status: "BANCO",
    hired: "NÃO",
    notes: "",
    createdAt: new Date().toISOString(),
  };
}

export default function TalentBank() {
  const data = useDomainData();
  const initialTalentFilters = { areas: [] as string[], roles: [] as string[], statuses: [] as string[], search: "" };
  const [filters, setFilters] = useState(initialTalentFilters);
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [optionForm, setOptionForm] = useState<{ columnKey: CandidateKey; value: string }>({ columnKey: "status", value: "" });
  const [editingOptionId, setEditingOptionId] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; columnKey: CandidateKey; value: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel: string; impact?: DeleteImpact; onConfirm: () => Promise<void> } | null>(null);
  const rows = useMemo(() => data.talentCandidates.filter((candidate) => (
    (!filters.areas.length || filters.areas.includes(candidate.area))
    && (!filters.roles.length || filters.roles.includes(candidate.desiredRole))
    && (!filters.statuses.length || filters.statuses.includes(candidate.status))
    && (!filters.search || `${candidate.fullName} ${candidate.phone} ${candidate.city} ${candidate.cpf}`.toLowerCase().includes(filters.search.toLowerCase()))
  )), [data.talentCandidates, filters]);
  const areas = Array.from(new Set(data.talentCandidates.map((item) => item.area).filter(Boolean)));
  const roles = Array.from(new Set(data.talentCandidates.map((item) => item.desiredRole).filter(Boolean)));
  const statuses = Array.from(new Set(data.talentCandidates.map((item) => item.status).filter(Boolean)));
  const hasActiveFilters = Boolean(filters.areas.length || filters.roles.length || filters.statuses.length || filters.search);

  function columnOptions(key: CandidateKey) {
    const hidden = data.talentColumnOptions.filter((option) => option.columnKey === key && option.active === false).map((option) => option.value);
    const saved = data.talentColumnOptions.filter((option) => option.columnKey === key && option.active !== false).map((option) => option.value);
    return Array.from(new Set([...(defaultOptions[key] || []).filter((option) => !hidden.includes(option)), ...saved]));
  }

  async function addRow() {
    await data.upsertTalentCandidate(emptyCandidate());
  }

  function requestDeleteRow(candidate: TalentCandidate) {
    setConfirmState({
      title: "Excluir linha",
      description: `Deseja realmente excluir a linha${candidate.fullName ? ` de ${candidate.fullName}` : ""}?`,
      confirmLabel: "Excluir linha",
      impact: buildDomainDeletionImpact(data, "talentCandidates", candidate.id, candidate.fullName || "Linha sem nome"),
      onConfirm: async () => {
        await data.removeItem("talentCandidates", candidate.id);
      },
    });
  }

  async function confirmAction() {
    const action = confirmState;
    setConfirmState(null);
    if (action) await action.onConfirm();
  }

  async function createEmployeeDraft(candidate: TalentCandidate) {
    if (candidate.employeeDraftId) return candidate.employeeDraftId;
    const company = data.companies[0];
    const department = data.departments.find((item) => item.companyId === company?.id) || data.departments[0];
    const sector = data.sectors.find((item) => item.departmentId === department?.id) || data.sectors[0];
    const draft = await data.upsertEmployeeDraft({
      companyId: company?.id || "",
      departmentId: department?.id || "",
      sectorId: sector?.id || "",
      step: 2,
      status: "draft",
      payload: {
        companyId: company?.id || "",
        departmentId: department?.id || "",
        sectorId: sector?.id || "",
        name: candidate.fullName,
        cpf: candidate.cpf,
        phone: candidate.phone,
        role: candidate.desiredRole,
        position: candidate.desiredRole,
        admissionDate: todayISO(),
        status: "active",
        complement: {
          email: "",
          emergencyContact: "",
          transportVoucher: false,
          mealVoucher: false,
          foodVoucher: false,
          healthPlan: false,
          dentalPlan: false,
          customBenefits: {},
          notes: `Pré-cadastro gerado pelo Banco de Talentos. Observação: ${candidate.notes || "-"}`,
        },
      },
      updatedAt: new Date().toISOString(),
    });
    return draft.id;
  }

  async function updateCandidate(candidate: TalentCandidate, key: CandidateKey, value: string) {
    let next: TalentCandidate = { ...candidate, [key]: value };

    if ((key === "hired" && value.toUpperCase() === "SIM") || (key === "status" && value.toUpperCase() === "CONTRATADO")) {
      const draftId = await createEmployeeDraft(next);
      next = { ...next, hired: "SIM", status: "CONTRATADO", employeeDraftId: draftId };
    }

    await data.upsertTalentCandidate(next);
  }

  async function addColumnOption() {
    if (!optionForm.value.trim()) return;
    await data.upsertTalentColumnOption({
      id: editingOptionId || undefined,
      columnKey: optionForm.columnKey,
      value: optionForm.value.trim().toUpperCase(),
      color: "",
      active: true,
      createdAt: new Date().toISOString(),
    });
    setEditingOptionId("");
    setOptionForm({ ...optionForm, value: "" });
  }

  function openOptionMenu(event: MouseEvent, columnKey: CandidateKey, value: string) {
    if (!value || !columnOptions(columnKey).includes(value)) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, columnKey, value });
  }

  function editOptionFromContext() {
    if (!contextMenu) return;
    const saved = data.talentColumnOptions.find((option) => option.columnKey === contextMenu.columnKey && option.value === contextMenu.value && option.active !== false);
    setEditingOptionId(saved?.id || "");
    setOptionForm({ columnKey: contextMenu.columnKey, value: contextMenu.value });
    setOptionsModalOpen(true);
    setContextMenu(null);
  }

  function deleteOptionFromContext() {
    if (!contextMenu) return;
    const current = { ...contextMenu };
    const saved = data.talentColumnOptions.find((option) => option.columnKey === current.columnKey && option.value === current.value);
    const linkedCandidates = data.talentCandidates.filter((candidate) => String(candidate[current.columnKey] || "") === current.value);
    setContextMenu(null);
    setConfirmState({
      title: "Excluir opção",
      description: `Deseja excluir a opção ${current.value}?`,
      confirmLabel: "Excluir opção",
      impact: {
        entityType: "opção do banco de talentos",
        entityLabel: current.value,
        reasons: [linkedCandidates.length ? "A opção está preenchida em candidatos do banco de talentos." : "A opção faz parte da lista disponível para preenchimento."],
        links: [{ label: "Candidatos que usam esta opção", count: linkedCandidates.length }],
        consequences: ["A opção deixará de aparecer na lista.", linkedCandidates.length ? "O valor será removido das linhas dos candidatos vinculados." : "Nenhuma linha de candidato será alterada."],
      },
      onConfirm: async () => {
        await data.upsertTalentColumnOption({
          id: saved?.id,
          columnKey: current.columnKey,
          value: current.value,
          color: saved?.color || "",
          active: false,
          createdAt: saved?.createdAt || new Date().toISOString(),
        });
        await Promise.all(linkedCandidates.map((candidate) => data.upsertTalentCandidate({ ...candidate, [current.columnKey]: "" })));
      },
    });
  }

  function editSavedOption(optionId: string) {
    const option = data.talentColumnOptions.find((item) => item.id === optionId);
    if (!option) return;
    setEditingOptionId(option.id);
    setOptionForm({ columnKey: option.columnKey, value: option.value });
  }

  function deleteSavedOption(optionId: string) {
    const option = data.talentColumnOptions.find((item) => item.id === optionId);
    if (!option) return;
    const linkedCandidates = data.talentCandidates.filter((candidate) => String(candidate[option.columnKey] || "") === option.value);
    setConfirmState({
      title: "Excluir opção",
      description: `Deseja excluir a opção ${option.value}?`,
      confirmLabel: "Excluir opção",
      impact: {
        entityType: "opção do banco de talentos",
        entityLabel: option.value,
        reasons: [linkedCandidates.length ? "A opção está preenchida em candidatos do banco de talentos." : "A opção faz parte da lista disponível para preenchimento."],
        links: [{ label: "Candidatos que usam esta opção", count: linkedCandidates.length }],
        consequences: ["A opção deixará de aparecer na lista.", linkedCandidates.length ? "O valor será removido das linhas dos candidatos vinculados." : "Nenhuma linha de candidato será alterada."],
      },
      onConfirm: async () => {
        await data.upsertTalentColumnOption({ ...option, active: false });
        await Promise.all(linkedCandidates.map((candidate) => data.upsertTalentCandidate({ ...candidate, [option.columnKey]: "" })));
      },
    });
  }

  useCreateShortcut(() => {
    void addRow();
  });

  return (
    <section className="page talent-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Banco de talentos</h1>
          <p className="page-subtitle">Tabela ampla customizável com selects por coluna e rascunho automático de contratação.</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={() => setOptionsModalOpen(true)}><Settings2 size={17} /> Configurar selects</button>
      </div>

      <div className="filters-panel">
        <Search size={18} />
        <MultiSelect
          label="Áreas"
          placeholder="Áreas"
          value={filters.areas}
          onChange={(areasValue) => setFilters({ ...filters, areas: areasValue })}
          options={areas.map((area) => ({ value: area, label: area }))}
        />
        <MultiSelect
          label="Cargos"
          placeholder="Cargos"
          value={filters.roles}
          onChange={(rolesValue) => setFilters({ ...filters, roles: rolesValue })}
          options={roles.map((role) => ({ value: role, label: role }))}
        />
        <MultiSelect
          label="Status"
          placeholder="Status"
          value={filters.statuses}
          onChange={(statusesValue) => setFilters({ ...filters, statuses: statusesValue })}
          options={statuses.map((status) => ({ value: status, label: status }))}
        />
        <input placeholder="Buscar" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        <ClearFiltersButton active={hasActiveFilters} onClear={() => setFilters(initialTalentFilters)} />
      </div>

      <div className="table-toolbar">
        <button className="btn btn-primary" type="button" onClick={addRow}><Plus size={17} /> Nova linha</button>
      </div>

      <div className="talent-table-wrap">
        <table className="talent-table">
          <thead>
            <tr>
              <th className="talent-action-col" aria-label="Ações"></th>
              {columns.map((column) => <th key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((candidate) => (
              <tr key={candidate.id}>
                <td className="talent-action-col">
                  <button className="talent-row-delete" type="button" onClick={() => requestDeleteRow(candidate)} aria-label="Excluir linha">
                    <X size={16} />
                  </button>
                </td>
                {columns.map((column) => {
                  const options = columnOptions(column.key);
                  const value = String(candidate[column.key] || "");
                  return (
                    <td key={column.key} className={column.kind === "long" ? "is-long" : undefined}>
                      {options.length && column.kind !== "date" ? (
                        <select value={value} onContextMenu={(event) => openOptionMenu(event, column.key, value)} onChange={(event) => updateCandidate(candidate, column.key, event.target.value)}>
                          <option value="">-</option>
                          {options.map((option) => <option value={option} key={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input
                          type={column.kind === "date" ? "date" : "text"}
                          value={value}
                          onChange={(event) => updateCandidate(candidate, column.key, event.target.value)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={columns.length + 1}>Nenhum candidato cadastrado.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {optionsModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-modal option-modal">
            <div className="modal-header">
              <h2>Select por coluna</h2>
              <button className="icon-button" type="button" onClick={() => setOptionsModalOpen(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="form-grid">
              <label className="field">Coluna<select value={optionForm.columnKey} onChange={(event) => setOptionForm({ columnKey: event.target.value as CandidateKey, value: "" })}>{columns.map((column) => <option value={column.key} key={column.key}>{column.label}</option>)}</select></label>
              <label className="field">Opção<input value={optionForm.value} onChange={(event) => setOptionForm({ ...optionForm, value: event.target.value })} /></label>
            </div>
            <button className="btn btn-primary" type="button" onClick={addColumnOption}>{editingOptionId ? "Salvar edição" : "Cadastrar select"}</button>
            <div className="option-list">
              {data.talentColumnOptions.filter((option) => option.columnKey === optionForm.columnKey && option.active !== false).map((option) => (
                <span className="module-pill" key={option.id}>
                  {option.value}
                  <button className="table-action" type="button" onClick={() => editSavedOption(option.id)}><Pencil size={14} /> Editar</button>
                  <button className="table-action" type="button" onClick={() => deleteSavedOption(option.id)}><Trash2 size={14} /> Excluir</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={editOptionFromContext}><Pencil size={14} /> Editar opção</button>
          <button type="button" onClick={deleteOptionFromContext}><Trash2 size={14} /> Excluir opção</button>
        </div>
      ) : null}
      {confirmState ? (
        <ConfirmModal
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          destructive={Boolean(confirmState.impact)}
          impact={confirmState.impact}
          onCancel={() => setConfirmState(null)}
          onConfirm={confirmAction}
        />
      ) : null}
    </section>
  );
}
