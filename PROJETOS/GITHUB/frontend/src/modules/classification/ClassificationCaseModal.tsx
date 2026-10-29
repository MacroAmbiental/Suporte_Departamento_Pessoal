import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, FileText, Upload, X } from "lucide-react";
import { loadAbsencesAndCertificatesForEmployee } from "@/modules/timekeeping/data/timeRecordsRepository";
import { openOpinionDocument } from "./classificationOpinionDocument";
import ModalPortal from "@/modules/shared/ModalPortal";
import { formatDate, formatDateTime, todayISO } from "@/utils/format";
import type { Employee, EmployeePromotion } from "@/types/domain";
import {
  CRITERIA,
  attendanceMonths,
  criterionLabels,
  monthName,
  summarizeAttendance,
  formatMoney,
  missingRequirements,
  nextStage,
  signalLabels,
  stageLabel,
  type ClassificationCase,
  type ClassificationOpinion,
  type ClassificationSurvey,
  type CriterionAnswer,
  type Signal,
} from "./classificationModel";
import { useClassificationEvents } from "./useClassificationCases";

export type EffectInput = { newRole: string; newPosition: string; newSalary: number; effectiveDate: string; termFile: File | null };

type Props = {
  item: ClassificationCase;
  employee?: Employee;
  promotions: EmployeePromotion[];
  teamName: string;
  sameRoleInTeam: number;
  canEdit: boolean;
  onClose: () => void;
  save: (item: ClassificationCase, patch: Partial<ClassificationCase>) => Promise<void>;
  advance: (item: ClassificationCase, stageTo: ClassificationCase["stage"], notes: string, patch?: Partial<ClassificationCase>) => Promise<void>;
  effect: (item: ClassificationCase, input: EffectInput) => Promise<void>;
};

const parseMoney = (text: string) => {
  const value = text.trim();
  return Number(value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value);
};

export default function ClassificationCaseModal({ item, employee, promotions, teamName, sameRoleInTeam, canEdit, onClose, save, advance, effect }: Props) {
  const events = useClassificationEvents(item.id);
  const today = todayISO();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [survey, setSurvey] = useState<ClassificationSurvey>(() => ({ leaderName: item.request.solicitante, ...item.survey }));
  const [opinion, setOpinion] = useState<ClassificationOpinion>(() => ({ ...item.opinion, criteria: { ...(item.opinion?.criteria || {}) } }));
  const [boardSentAt, setBoardSentAt] = useState(item.boardSentAt || today);
  const [decision, setDecision] = useState(item.decision || "");
  const [decisionBy, setDecisionBy] = useState(item.decisionBy || "Diretoria");
  const [decisionAt, setDecisionAt] = useState(item.decisionAt || today);
  const [newRole, setNewRole] = useState(item.newRole || item.request.funcaoSolicitada);
  const [newPosition, setNewPosition] = useState(item.newPosition || item.request.funcaoSolicitada);
  const [newSalary, setNewSalary] = useState(item.newSalary ? String(item.newSalary) : item.opinion?.targetRoleSalary || "");
  const [effectiveDate, setEffectiveDate] = useState(item.effectiveDate || today);
  const [termFile, setTermFile] = useState<File | null>(null);
  const [supervisorAt, setSupervisorAt] = useState(item.supervisorInformedAt || today);
  const [supervisorChannel, setSupervisorChannel] = useState(item.supervisorChannel || "WhatsApp");
  const [cardSentAt, setCardSentAt] = useState(item.cardSentAt || today);

  // Rascunho da etapa atual: é o que vai para "Salvar" e o que os requisitos conferem.
  const draft = useMemo<Partial<ClassificationCase>>(() => {
    if (item.stage === "survey") return { survey };
    if (item.stage === "opinion") return { opinion };
    if (item.stage === "board") return { boardSentAt };
    if (item.stage === "decision") return decision ? { decision: decision as "approved" | "rejected", decisionBy, decisionAt } : {};
    if (item.stage === "supervisor") return { supervisorInformedAt: supervisorAt, supervisorChannel };
    if (item.stage === "card") return { cardSentAt };
    return {};
  }, [item.stage, survey, opinion, boardSentAt, decision, decisionBy, decisionAt, supervisorAt, supervisorChannel, cardSentAt]);
  const missing = missingRequirements({ ...item, ...draft });
  const target = nextStage({ ...item, ...draft });
  const [attendanceError, setAttendanceError] = useState("");

  // Levantamento do RH: faltas e atestados dos 6 meses antes do pedido, do Ponto,
  // e quantos na equipe já têm a função pedida. Ficam no rascunho para gravar.
  useEffect(() => {
    if (item.stage !== "survey" || item.survey?.attendance) return undefined;
    let active = true;
    const months = attendanceMonths(item.requestedAt);
    const end = new Date(Date.UTC(Number(months[5].slice(0, 4)), Number(months[5].slice(5, 7)), 0)).toISOString().slice(0, 10);
    loadAbsencesAndCertificatesForEmployee(item.employeeId, `${months[0]}-01`, end)
      .then((records) => { if (active) setSurvey((current) => ({ ...current, attendance: summarizeAttendance(records, months), sameRoleInTeam })); })
      .catch(() => { if (active) setAttendanceError("Não foi possível buscar as faltas e atestados no Ponto."); });
    return () => { active = false; };
  }, [item.stage, item.survey?.attendance, item.requestedAt, item.employeeId, sameRoleInTeam]);

  const history = promotions.filter((promotion) => promotion.employeeId === item.employeeId).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  async function run(action: () => Promise<void>, close = true) {
    setBusy(true); setError("");
    try {
      await action();
      if (close) onClose();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Não foi possível salvar.");
    } finally { setBusy(false); }
  }

  const editable = canEdit && item.status === "open";
  const field = (label: string, input: React.ReactNode) => <label className="field">{label}{input}</label>;

  return (
    <ModalPortal className="modal-backdrop">
      <div className="modal-panel classification-modal" role="dialog" aria-modal="true" aria-labelledby="classification-title">
        <div className="modal-header">
          <div>
            <h2 id="classification-title">{item.employeeName}</h2>
            <p className="panel-subtitle">{stageLabel(item.stage)} · pedido em {formatDate(item.requestedAt.slice(0, 10))} · prazo {formatDate(item.dueDate)}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <details className="classification-request-summary" open={item.stage === "request"}>
          <summary>Solicitação de {item.request.solicitante}: {item.currentRole || "—"} → {item.request.funcaoSolicitada}</summary>
          <dl>
            <div><dt>Equipe</dt><dd>{item.request.equipe || "—"}</dd></div>
            <div><dt>Tempo no cargo</dt><dd>{item.request.tempoNoCargo}</dd></div>
            <div><dt>Já desempenha a função?</dt><dd>{item.request.jaDesempenha} ({item.request.haQuantoTempo})</dd></div>
            <div className="is-wide"><dt>Motivos</dt><dd>{item.request.motivos.join("; ")}</dd></div>
            {item.request.informacaoAdicional ? <div className="is-wide"><dt>Informação adicional</dt><dd>{item.request.informacaoAdicional}</dd></div> : null}
          </dl>
        </details>

        {error ? <p className="classification-error">{error}</p> : null}

        {item.stage === "survey" ? (
          <div className="classification-step">
            <h3>Levantamento de informações</h3>
            <div className="classification-block">
              <strong>Segurança do Trabalho</strong>
              {field("Conduta: advertências, uso de EPI, bafômetro", <textarea rows={2} disabled={!editable} value={survey.safetyText || ""} onChange={(event) => setSurvey((current) => ({ ...current, safetyText: event.target.value }))} />)}
              {field("Quem respondeu", <input disabled={!editable} value={survey.safetyBy || ""} onChange={(event) => setSurvey((current) => ({ ...current, safetyBy: event.target.value }))} />)}
            </div>
            <div className="classification-block">
              <strong>Líder direto</strong>
              {field("Nome", <input disabled={!editable} value={survey.leaderName || ""} onChange={(event) => setSurvey((current) => ({ ...current, leaderName: event.target.value }))} />)}
              {field("Comentário", <textarea rows={2} disabled={!editable} value={survey.leaderText || ""} onChange={(event) => setSurvey((current) => ({ ...current, leaderText: event.target.value }))} />)}
            </div>
            <div className="classification-block">
              <strong>Departamento Pessoal</strong>
              <p className="muted">Salário atual: {formatMoney(employee?.salary)} · Admissão: {formatDate(employee?.admissionDate || "")} · Função atual: {[employee?.role, employee?.position].filter(Boolean).join(" / ") || "—"}</p>
              {history.length ? <ul className="classification-history-list">{history.map((promotion) => <li key={promotion.id}>{formatDate(promotion.effectiveDate)}: {promotion.previousRole || "—"} → {promotion.newRole || "—"}</li>)}</ul> : <p className="muted">Sem mudanças de função registradas na trajetória.</p>}
              <label className="classification-check"><input type="checkbox" disabled={!editable} checked={Boolean(survey.dpChecked)} onChange={(event) => setSurvey((current) => ({ ...current, dpChecked: event.target.checked }))} /> DP conferiu salário e histórico funcional</label>
            </div>
            <div className="classification-block">
              <strong>Recursos Humanos</strong>
              {attendanceError ? <p className="classification-error">{attendanceError}</p> : null}
              {survey.attendance ? (
                <table className="classification-attendance">
                  <thead><tr><th>Mês</th><th>Faltas</th><th>Atestados</th></tr></thead>
                  <tbody>{survey.attendance.map((month) => <tr key={month.month}><td>{monthName(month.month)}</td><td>{month.absences}</td><td>{month.certificates}</td></tr>)}</tbody>
                </table>
              ) : !attendanceError ? <p className="muted">Buscando faltas e atestados no Ponto...</p> : null}
              <p className="muted">Na equipe, {survey.sameRoleInTeam ?? sameRoleInTeam} pessoa(s) já exercem a função {item.request.funcaoSolicitada}.</p>
              {field("Faltas e atestados, pessoas com a função na equipe, competências do cargo", <textarea rows={3} disabled={!editable} value={survey.rhText || ""} onChange={(event) => setSurvey((current) => ({ ...current, rhText: event.target.value }))} />)}
              <label className="classification-check"><input type="checkbox" disabled={!editable} checked={Boolean(survey.rhChecked)} onChange={(event) => setSurvey((current) => ({ ...current, rhChecked: event.target.checked }))} /> RH concluiu o levantamento</label>
            </div>
          </div>
        ) : null}

        {item.stage === "opinion" ? (
          <div className="classification-step">
            <h3>Parecer</h3>
            <div className="classification-row">
              {field("Função atual", <input disabled value={[item.currentRole, item.currentPosition].filter(Boolean).join(" / ")} />)}
              {field("Função seguinte (escada)", <input disabled={!editable} value={opinion.nextRole || ""} onChange={(event) => setOpinion((current) => ({ ...current, nextRole: event.target.value }))} placeholder="Ex.: PEDREIRO IB" />)}
              {field("Salário da função seguinte", <input disabled={!editable} value={opinion.nextRoleSalary || ""} onChange={(event) => setOpinion((current) => ({ ...current, nextRoleSalary: event.target.value }))} placeholder="Ex.: 2.023,00" />)}
              {field("Salário da função pretendida", <input disabled={!editable} value={opinion.targetRoleSalary || ""} onChange={(event) => setOpinion((current) => ({ ...current, targetRoleSalary: event.target.value }))} placeholder="Ex.: 1.927,00" />)}
            </div>
            <table className="classification-criteria">
              <thead><tr><th>Critério</th>{Object.values(criterionLabels).map((label) => <th key={label}>{label}</th>)}</tr></thead>
              <tbody>
                {CRITERIA.map((criterion) => (
                  <tr key={criterion}>
                    <td>{criterion}</td>
                    {(Object.keys(criterionLabels) as Array<Exclude<CriterionAnswer, "">>).map((answer) => (
                      <td key={answer}><input type="radio" name={`criterion-${criterion}`} disabled={!editable} checked={opinion.criteria?.[criterion] === answer} onChange={() => setOpinion((current) => ({ ...current, criteria: { ...(current.criteria || {}), [criterion]: answer } }))} aria-label={`${criterion}: ${criterionLabels[answer]}`} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="classification-signal" role="group" aria-label="Sinalização">
              <span>Sinalização</span>
              {(Object.keys(signalLabels) as Array<Exclude<Signal, "">>).map((signal) => (
                <button key={signal} type="button" disabled={!editable} className={`classification-signal-option is-${signal}${opinion.signal === signal ? " is-selected" : ""}`} onClick={() => setOpinion((current) => ({ ...current, signal }))}>{signalLabels[signal]}</button>
              ))}
            </div>
            {field("Síntese do parecer (opcional)", <textarea rows={3} disabled={!editable} value={opinion.summary || ""} onChange={(event) => setOpinion((current) => ({ ...current, summary: event.target.value }))} />)}
          </div>
        ) : null}

        {item.stage === "board" ? (
          <div className="classification-step">
            <h3>Envio do parecer à diretoria</h3>
            {field("Enviado por e-mail em", <input type="date" disabled={!editable} max={today} value={boardSentAt} onChange={(event) => setBoardSentAt(event.target.value)} />)}
          </div>
        ) : null}

        {item.stage === "decision" ? (
          <div className="classification-step">
            <h3>Decisão da diretoria</h3>
            <div className="classification-signal" role="group" aria-label="Decisão">
              <button type="button" disabled={!editable || Boolean(item.effectedAt)} className={`classification-signal-option is-green${decision === "approved" ? " is-selected" : ""}`} onClick={() => setDecision("approved")}>Aprovado</button>
              <button type="button" disabled={!editable || Boolean(item.effectedAt)} className={`classification-signal-option is-red${decision === "rejected" ? " is-selected" : ""}`} onClick={() => setDecision("rejected")}>Reprovado</button>
            </div>
            <div className="classification-row">
              {field("Decidido por", <input disabled={!editable} value={decisionBy} onChange={(event) => setDecisionBy(event.target.value)} />)}
              {field("Em", <input type="date" disabled={!editable} max={today} value={decisionAt} onChange={(event) => setDecisionAt(event.target.value)} />)}
            </div>
            {decision === "approved" ? (
              <div className="classification-block">
                <strong>Mudança no cadastro (DP)</strong>
                {item.effectedAt ? (
                  <p className="muted">Efetivado em {formatDateTime(item.effectedAt)}: {[item.newRole, item.newPosition].filter(Boolean).join(" / ")} · {formatMoney(item.newSalary)} a partir de {formatDate(item.effectiveDate || "")}.</p>
                ) : (
                  <>
                    <div className="classification-row">
                      {field("Nova função", <input disabled={!editable} value={newRole} onChange={(event) => setNewRole(event.target.value)} />)}
                      {field("Novo cargo", <input disabled={!editable} value={newPosition} onChange={(event) => setNewPosition(event.target.value)} />)}
                      {field("Novo salário (R$)", <input disabled={!editable} value={newSalary} onChange={(event) => setNewSalary(event.target.value)} />)}
                      {field("Vale a partir de", <input type="date" disabled={!editable} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />)}
                    </div>
                    <label className="document-file-field">
                      <input type="file" accept=".pdf,image/*" disabled={!editable} onChange={(event) => setTermFile(event.target.files?.[0] || null)} />
                      <span><Upload size={16} /> {termFile?.name || "Termo/aditivo assinado (opcional, até 10 MB)"}</span>
                    </label>
                    {editable ? (
                      <div className="form-actions">
                        <button className="btn btn-primary" type="button" disabled={busy || !newRole.trim() || !Number.isFinite(parseMoney(newSalary)) || !newSalary.trim()} onClick={() => run(async () => {
                          await save(item, draft);
                          await effect(item, { newRole: newRole.trim(), newPosition: newPosition.trim(), newSalary: parseMoney(newSalary), effectiveDate, termFile });
                        }, false)}>
                          <Check size={16} /> {busy ? "Efetivando..." : "Efetivar no cadastro"}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {item.stage === "supervisor" ? (
          <div className="classification-step">
            <h3>Retorno ao supervisor ({item.decision === "approved" ? "aprovado" : "reprovado"})</h3>
            <div className="classification-row">
              {field("Informado em", <input type="date" disabled={!editable} max={today} value={supervisorAt} onChange={(event) => setSupervisorAt(event.target.value)} />)}
              {field("Por onde", <select disabled={!editable} value={supervisorChannel} onChange={(event) => setSupervisorChannel(event.target.value)}>{["WhatsApp", "E-mail", "Pessoalmente", "Telefone"].map((option) => <option key={option}>{option}</option>)}</select>)}
            </div>
          </div>
        ) : null}

        {item.stage === "card" ? (
          <div className="classification-step">
            <h3>Card de aprovação ao colaborador</h3>
            {field("Enviado em", <input type="date" disabled={!editable} max={today} value={cardSentAt} onChange={(event) => setCardSentAt(event.target.value)} />)}
          </div>
        ) : null}

        {["opinion", "board", "decision", "supervisor", "card", "closed"].includes(item.stage) ? (
          <button className="btn btn-secondary classification-document-button" type="button" onClick={() => {
            try {
              openOpinionDocument({ item: { ...item, ...(item.stage === "opinion" ? { opinion } : {}) }, employee, teamName, promotions });
            } catch (openError) { setError(openError instanceof Error ? openError.message : "Não foi possível gerar o parecer."); }
          }}><FileText size={16} /> Gerar parecer</button>
        ) : null}

        {editable && item.stage !== "closed" ? (
          <div className="classification-actions">
            {missing.length ? <p className="classification-missing">Falta para avançar: {missing.join(" · ")}</p> : null}
            <div className="form-actions">
              {Object.keys(draft).length ? <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => run(() => save(item, draft), false)}>Salvar</button> : null}
              <button className="btn btn-primary" type="button" disabled={busy || missing.length > 0} onClick={() => run(() => advance(item, target, `${stageLabel(item.stage)} concluída.`, draft))}>
                {target === "closed" ? "Concluir processo" : <>Avançar para {stageLabel(target)} <ArrowRight size={16} /></>}
              </button>
            </div>
          </div>
        ) : null}

        {events.length ? (
          <>
            <h3 className="classification-history-title">Histórico</h3>
            <ol className="classification-history">
              {events.map((event) => (
                <li key={event.id}>
                  <strong>{event.stageFrom ? `${stageLabel(event.stageFrom)} → ` : ""}{stageLabel(event.stageTo)}</strong>
                  <span>{event.notes}</span>
                  <small className="muted">{formatDateTime(event.createdAt)} · {event.createdBy?.name || "-"}</small>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </ModalPortal>
  );
}
