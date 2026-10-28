import { useMemo, useState } from "react";
import { Check, Eye, Upload, X } from "lucide-react";
import ModalPortal from "@/modules/shared/ModalPortal";
import { openEmployeeDocumentFile } from "@/services/documentStorage";
import { formatDate, formatDateTime, todayISO } from "@/utils/format";
import type { Employee } from "@/types/domain";
import {
  formatMoney,
  readyToEffect,
  reclassificationReasons,
  reclassificationStageLabels,
  roleLabel,
  type ReclassificationCase,
  type ReclassificationSeed,
} from "./reclassificationModel";
import { useReclassificationEvents } from "./useReclassificationCases";

type Props = {
  item?: ReclassificationCase;
  employees: Employee[];
  companyNameById: Map<string, string>;
  canEdit: boolean;
  onClose: () => void;
  create: (seed: ReclassificationSeed) => Promise<void>;
  approve: (item: ReclassificationCase, approvedBy: string, approvedAt: string) => Promise<void>;
  reject: (item: ReclassificationCase, reason: string) => Promise<void>;
  attachTerm: (item: ReclassificationCase, file: File) => Promise<void>;
  effect: (item: ReclassificationCase) => Promise<void>;
  markPayroll: (item: ReclassificationCase, date: string) => Promise<void>;
};

const employeeOptionLabel = (employee: Employee) => `${employee.name} — ${employee.cpf || "sem CPF"}`;

export default function ReclassificationModal({ item, employees, companyNameById, canEdit, onClose, create, approve, reject, attachTerm, effect, markPayroll }: Props) {
  const events = useReclassificationEvents(item?.id || null);
  const today = todayISO();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Pedido novo
  const [employeeText, setEmployeeText] = useState("");
  const [proposedRole, setProposedRole] = useState("");
  const [proposedPosition, setProposedPosition] = useState("");
  const [proposedSalary, setProposedSalary] = useState("");
  const [reason, setReason] = useState(reclassificationReasons[0]);
  const [requestedBy, setRequestedBy] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today);
  // Etapas
  const [approvedBy, setApprovedBy] = useState("");
  const [approvedAt, setApprovedAt] = useState(today);
  const [rejecting, setRejecting] = useState(false);
  const [rejectedReason, setRejectedReason] = useState("");
  const [termFile, setTermFile] = useState<File | null>(null);
  const [payrollDate, setPayrollDate] = useState(today);

  const activeEmployees = useMemo(() => employees
    .filter((employee) => employee.status !== "terminated")
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")), [employees]);
  const selectedEmployee = useMemo(() => activeEmployees.find((employee) => employeeOptionLabel(employee) === employeeText), [activeEmployees, employeeText]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onClose();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  function submitNew() {
    if (!selectedEmployee) { setError("Escolha o funcionário na lista."); return; }
    // "3.250,00" (brasileiro) ou "3250.50": só trata o ponto como milhar se houver vírgula.
    const salaryText = proposedSalary.trim();
    const salary = Number(salaryText.includes(",") ? salaryText.replace(/\./g, "").replace(",", ".") : salaryText);
    if (!proposedRole.trim() && !proposedPosition.trim()) { setError("Informe a nova função ou o novo cargo."); return; }
    if (!Number.isFinite(salary) || salary < 0) { setError("Salário proposto inválido."); return; }
    void run(() => create({
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.name,
      companyId: selectedEmployee.companyId,
      companyName: companyNameById.get(selectedEmployee.companyId) || "",
      currentRole: selectedEmployee.role || "",
      currentPosition: selectedEmployee.position || "",
      currentSalary: Number(selectedEmployee.salary || 0),
      proposedRole: proposedRole.trim() || selectedEmployee.role || "",
      proposedPosition: proposedPosition.trim() || selectedEmployee.position || "",
      proposedSalary: proposedSalary.trim() ? salary : Number(selectedEmployee.salary || 0),
      reason,
      requestedBy: requestedBy.trim(),
      effectiveDate,
    }));
  }

  return (
    <ModalPortal className="modal-backdrop">
      <div className="modal-panel reclassification-modal" role="dialog" aria-modal="true" aria-labelledby="reclassification-title">
        <div className="modal-header">
          <div>
            <h2 id="reclassification-title">{item ? item.employeeName : "Nova reclassificação"}</h2>
            {item ? <p className="panel-subtitle">{item.companyName} · {reclassificationStageLabels[item.stage]}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        {error ? <p className="reclassification-error">{error}</p> : null}

        {!item ? (
          <div className="reclassification-step">
            <label className="field">
              Funcionário
              <input list="reclassification-employees" value={employeeText} onChange={(event) => setEmployeeText(event.target.value)} placeholder="Digite o nome e escolha na lista" />
              <datalist id="reclassification-employees">
                {activeEmployees.map((employee) => <option key={employee.id} value={employeeOptionLabel(employee)} />)}
              </datalist>
            </label>
            {selectedEmployee ? (
              <p className="muted">Hoje: {roleLabel(selectedEmployee.role || "", selectedEmployee.position || "")} · {formatMoney(Number(selectedEmployee.salary || 0))}</p>
            ) : null}
            <div className="reclassification-row">
              <label className="field">Nova função<input value={proposedRole} onChange={(event) => setProposedRole(event.target.value)} placeholder={selectedEmployee?.role || "Ex.: ENCARREGADO"} /></label>
              <label className="field">Novo cargo<input value={proposedPosition} onChange={(event) => setProposedPosition(event.target.value)} placeholder={selectedEmployee?.position || "Ex.: ENCARREGADO II"} /></label>
              <label className="field">Novo salário (R$)<input inputMode="decimal" value={proposedSalary} onChange={(event) => setProposedSalary(event.target.value)} placeholder="Ex.: 3.250,00" /></label>
            </div>
            <div className="reclassification-row">
              <label className="field">Motivo<select value={reason} onChange={(event) => setReason(event.target.value)}>{reclassificationReasons.map((option) => <option key={option}>{option}</option>)}</select></label>
              <label className="field">Pedido por<input value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} placeholder="Ex.: encarregado da equipe" /></label>
              <label className="field">Passa a valer em<input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></label>
            </div>
            <small className="muted">Campo em branco mantém o atual. O cadastro só muda na etapa "Efetivar".</small>
            <div className="form-actions">
              <button className="btn btn-primary" type="button" disabled={busy || !canEdit} onClick={submitNew}><Check size={16} /> {busy ? "Salvando..." : "Registrar pedido"}</button>
            </div>
          </div>
        ) : (
          <>
            <dl className="reclassification-summary">
              <div><dt>Hoje</dt><dd>{roleLabel(item.currentRole, item.currentPosition)}<small>{formatMoney(item.currentSalary)}</small></dd></div>
              <div><dt>Proposto</dt><dd>{roleLabel(item.proposedRole, item.proposedPosition)}<small>{formatMoney(item.proposedSalary)}</small></dd></div>
              <div><dt>Motivo</dt><dd>{item.reason}{item.requestedBy ? <small>Pedido por {item.requestedBy}</small> : null}</dd></div>
              <div><dt>Passa a valer em</dt><dd>{formatDate(item.effectiveDate)}</dd></div>
              {item.approvedBy ? <div><dt>Aprovado por</dt><dd>{item.approvedBy}<small>{formatDate(item.approvedAt || "")}</small></dd></div> : null}
              {item.rejectedReason ? <div><dt>Recusado</dt><dd>{item.rejectedReason}</dd></div> : null}
            </dl>
            {item.termFileUrl ? (
              <button className="btn btn-soft reclassification-file" type="button" onClick={() => openEmployeeDocumentFile(item.termFileUrl!, item.termFileName || "termo").catch(() => setError("Não foi possível abrir o termo."))}>
                <Eye size={14} /> Ver termo assinado
              </button>
            ) : null}

            {canEdit && item.stage === "requested" ? (
              <div className="reclassification-step">
                <h3>Aprovação</h3>
                {!rejecting ? (
                  <>
                    <div className="reclassification-row">
                      <label className="field">Aprovado por<input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} placeholder="Nome de quem aprovou" /></label>
                      <label className="field">Em<input type="date" value={approvedAt} max={today} onChange={(event) => setApprovedAt(event.target.value)} /></label>
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-secondary" type="button" onClick={() => setRejecting(true)}>Recusar</button>
                      <button className="btn btn-primary" type="button" disabled={busy || !approvedBy.trim()} onClick={() => run(() => approve(item, approvedBy.trim(), approvedAt))}><Check size={16} /> Marcar aprovado</button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="field">Motivo da recusa<input value={rejectedReason} onChange={(event) => setRejectedReason(event.target.value)} /></label>
                    <div className="form-actions">
                      <button className="btn btn-secondary" type="button" onClick={() => setRejecting(false)}>Voltar</button>
                      <button className="btn btn-primary" type="button" disabled={busy || !rejectedReason.trim()} onClick={() => run(() => reject(item, rejectedReason.trim()))}>Confirmar recusa</button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {canEdit && item.stage === "approved" ? (
              <div className="reclassification-step">
                <h3>Termo de alteração assinado</h3>
                <label className="document-file-field">
                  <input type="file" accept=".pdf,image/*" onChange={(event) => setTermFile(event.target.files?.[0] || null)} />
                  <span><Upload size={16} /> {termFile?.name || "Anexe o termo/aditivo assinado (PDF ou foto, até 10 MB)"}</span>
                </label>
                <div className="form-actions">
                  <button className="btn btn-primary" type="button" disabled={busy || !termFile} onClick={() => termFile && run(() => attachTerm(item, termFile))}><Check size={16} /> Salvar termo</button>
                </div>
              </div>
            ) : null}

            {item.stage === "signed" ? (
              <div className="reclassification-step">
                <h3>Efetivar no cadastro</h3>
                {readyToEffect(item, today) ? (
                  <p className="muted">Ao efetivar, o cadastro passa para {roleLabel(item.proposedRole, item.proposedPosition)} e {formatMoney(item.proposedSalary)}, e a mudança entra na trajetória do funcionário.</p>
                ) : (
                  <p className="muted">Disponível a partir de {formatDate(item.effectiveDate)}, data em que passa a valer.</p>
                )}
                {canEdit ? (
                  <div className="form-actions">
                    <button className="btn btn-primary" type="button" disabled={busy || !readyToEffect(item, today)} onClick={() => run(() => effect(item))}><Check size={16} /> {busy ? "Efetivando..." : "Efetivar"}</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {canEdit && item.stage === "effective" ? (
              <div className="reclassification-step">
                <h3>Lançado na folha / eSocial</h3>
                <label className="field">Data do lançamento<input type="date" value={payrollDate} max={today} onChange={(event) => setPayrollDate(event.target.value)} /></label>
                <div className="form-actions">
                  <button className="btn btn-primary" type="button" disabled={busy || !payrollDate} onClick={() => run(() => markPayroll(item, payrollDate))}><Check size={16} /> Marcar lançado e concluir</button>
                </div>
              </div>
            ) : null}

            {events.length ? (
              <>
                <h3 className="reclassification-history-title">Histórico</h3>
                <ol className="reclassification-history">
                  {events.map((event) => (
                    <li key={event.id}>
                      <strong>{reclassificationStageLabels[event.stageTo]}</strong>
                      <span>{event.notes}</span>
                      <small className="muted">{formatDateTime(event.createdAt)} · {event.createdBy?.name || "-"}</small>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </>
        )}
      </div>
    </ModalPortal>
  );
}
