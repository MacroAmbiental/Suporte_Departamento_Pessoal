import { AlertTriangle, ExternalLink, MessageCircle, Phone, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { userHasPermission } from "@/services/accessControl";
import { formatDate, formatDateTime } from "@/utils/format";
import { isUsefulSavedWorkday, localTodayISO, type HrTimekeepingSettings } from "@/modules/hrControl/domain/hrControlModel";
import type { Company, Employee, TimekeepingDayTable, TimeRecord, User } from "@/types/domain";
import {
  ABANDONMENT_TRIGGER_DAYS,
  abandonmentChannelLabels,
  abandonmentMessage,
  abandonmentOutcomeLabels,
  abandonmentResultOptions,
  abandonmentStages,
  abandonmentTemplateLabels,
  calendarDaysSince,
  employeeContacts,
  gmailLink,
  whatsappLink,
  type AbandonmentCase,
  type AbandonmentChannel,
  type AbandonmentEvent,
  type AbandonmentOutcome,
  type AbandonmentStage,
  type AbandonmentTemplate,
  type AbsenceStreak,
} from "@/modules/hrControl/abandonment/abandonmentModel";
import { useAbandonmentCases, useAbandonmentEvents } from "@/modules/hrControl/abandonment/useAbandonmentCases";
import "./abandonment.css";

type TeamGroupFor = (record: TimeRecord | undefined, employee: Employee | undefined) => { label: string; detail?: string };

const stageLabel = (stage?: AbandonmentStage) => abandonmentStages.find((item) => item.id === stage)?.label || stage || "";
// Dias corridos desde a última ação no caso: acima disso o cartão fica em destaque.
const STALE_DAYS = 2;

function daysSince(iso: string, today: string) {
  return iso ? calendarDaysSince(iso.slice(0, 10), today) - 1 : 0;
}

function PendingNote({ streak }: { streak: AbsenceStreak }) {
  if (!streak.pendingDates.length) return null;
  const dates = streak.pendingDates.map((date) => formatDate(date)).join(", ");
  return <span className="abandonment-pending">{dates} — falta pendente de confirmação (não somada)</span>;
}

export function AbandonmentBoard({ employees, employeeById, companies, savedDayTables, settingsByCompanyId, teamGroupFor, user }: {
  employees: Employee[];
  employeeById: Map<string, Employee>;
  companies: Company[];
  savedDayTables: TimekeepingDayTable[];
  settingsByCompanyId: Map<string, HrTimekeepingSettings>;
  teamGroupFor: TeamGroupFor;
  user: User | null | undefined;
}) {
  const today = localTodayISO();
  const isUsefulDay = useCallback((employee: Employee, date: string) => isUsefulSavedWorkday(employee, date, settingsByCompanyId), [settingsByCompanyId]);
  const board = useAbandonmentCases({ employees, savedDayTables, isUsefulDay, user, today });
  const canEdit = userHasPermission(user, "abandonment", "edit");
  const companyName = useCallback((id: string) => companies.find((company) => company.id === id)?.name || "", [companies]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dismissedDateByCase = useMemo(() => new Map(board.dismissedElsewhere.map(({ item, date }) => [item.id, date])), [board.dismissedElsewhere]);
  const closedDate = useCallback((item: AbandonmentCase) => dismissedDateByCase.get(item.id) ?? item.closedAt ?? "", [dismissedDateByCase]);
  const closedRecently = useMemo(() => [
    ...board.cases.filter((item) => item.status === "closed"),
    ...board.dismissedElsewhere.map(({ item }) => item),
  ]
    .filter((item) => daysSince(closedDate(item), today) <= 45)
    .sort((left, right) => closedDate(right).localeCompare(closedDate(left))), [board.cases, board.dismissedElsewhere, closedDate, today]);
  const casesByStage = useMemo(() => {
    const map = new Map<AbandonmentStage, AbandonmentCase[]>();
    board.openCases.forEach((item) => map.set(item.stage, [...(map.get(item.stage) || []), item]));
    map.forEach((list) => list.sort((left, right) => left.stageChangedAt.localeCompare(right.stageChangedAt)));
    map.set("closed", closedRecently);
    return map;
  }, [board.openCases, closedRecently]);
  const selectedCase = board.cases.find((item) => item.id === selectedCaseId) || null;

  async function assume(streak: AbsenceStreak) {
    const employee = employeeById.get(streak.employeeId);
    if (!employee) return;
    setBusy(true); setError("");
    try {
      const id = await board.openCase(employee, streak, companyName(employee.companyId));
      setSelectedCaseId(id);
    } catch (reason) {
      setError(`Não foi possível abrir o caso: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setBusy(false);
    }
  }

  const teamLabel = (employeeId: string) => {
    const group = teamGroupFor(undefined, employeeById.get(employeeId));
    return group.detail ? `${group.label} (${group.detail.replace("Sem equipe · ", "")})` : group.label;
  };

  return (
    <section className="panel padded abandonment-board">
      <header className="abandonment-board-header">
        <div>
          <h2><AlertTriangle size={18} /> Processo de abandono</h2>
          <span>
            Quem tem {ABANDONMENT_TRIGGER_DAYS}+ faltas confirmadas seguidas aparece em "Sinalizado". Ao assumir, o caso passa a registrar todo o histórico.
          </span>
        </div>
      </header>
      {board.loadError ? <p className="abandonment-error">Não foi possível carregar os dados do processo de abandono. Recarregue a página.</p> : null}
      {error ? <p className="abandonment-error">{error}</p> : null}
      {!board.casesReady && !board.loadError ? <p className="abandonment-muted">Carregando faltas e casos…</p> : null}

      <div className="abandonment-columns">
        <div className="abandonment-column is-flagged">
          <h3>Sinalizado <b>{board.flagged.length}</b></h3>
          <small>Faltas seguidas, ainda sem ninguém responsável</small>
          {board.flagged.map((streak) => {
            const employee = employeeById.get(streak.employeeId);
            return (
              <article className="abandonment-card" key={streak.employeeId}>
                <strong>{employee?.name || streak.employeeId}</strong>
                <span>{teamLabel(streak.employeeId)}</span>
                <span className={`abandonment-days ${streak.days >= 10 ? "is-high" : ""}`}>
                  {streak.days} falta(s) seguida(s) · desde {formatDate(streak.firstDate)} ({calendarDaysSince(streak.firstDate, today)} dias corridos)
                </span>
                <PendingNote streak={streak} />
                {canEdit ? (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void assume(streak)}>Assumir caso</button>
                ) : null}
              </article>
            );
          })}
        </div>

        {abandonmentStages.map((stage) => {
          const list = casesByStage.get(stage.id) || [];
          return (
            <div className={`abandonment-column ${stage.id === "closed" ? "is-closed" : ""}`} key={stage.id}>
              <h3>{stage.label} <b>{list.length}</b></h3>
              <small>{stage.id === "closed" ? "Encerrados nos últimos 45 dias" : stage.hint}</small>
              {list.map((item) => {
                const streak = board.streakByEmployee.get(item.employeeId);
                const dismissedOn = dismissedDateByCase.get(item.id);
                const active = item.status === "open" && dismissedOn === undefined;
                const idle = daysSince(item.updatedAt, today);
                const stale = active && idle >= STALE_DAYS;
                return (
                  <button type="button" className={`abandonment-card is-case${stale ? " is-stale" : ""}`} key={item.id} onClick={() => setSelectedCaseId(item.id)}>
                    <strong>{item.employeeName}</strong>
                    <span>{teamLabel(item.employeeId)}</span>
                    {dismissedOn !== undefined ? (
                      <span>Desligado em outra tela · {formatDate(dismissedOn)}</span>
                    ) : active ? (
                      <span className={`abandonment-days ${(streak?.days || 0) >= 10 ? "is-high" : ""}`}>
                        {streak ? `${streak.days} falta(s) seguida(s)` : "Sem falta no último ponto — conferir retorno"} · desde {formatDate(item.firstAbsenceDate)} ({calendarDaysSince(item.firstAbsenceDate, today)} dias corridos)
                      </span>
                    ) : null}
                    {active && streak ? <PendingNote streak={streak} /> : null}
                    {dismissedOn !== undefined || active ? null : (
                      <span>{item.outcome ? abandonmentOutcomeLabels[item.outcome] : "Encerrado"} · {formatDate(item.closedAt?.slice(0, 10))}</span>
                    )}
                    {active ? <em>{stale ? `Sem registro há ${idle} dia(s)` : `Último registro ${idle ? `há ${idle} dia(s)` : "hoje"}`}</em> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {selectedCase ? (
        <CaseModal
          item={selectedCase}
          employee={employeeById.get(selectedCase.employeeId)}
          streak={board.streakByEmployee.get(selectedCase.employeeId)}
          team={teamLabel(selectedCase.employeeId)}
          dismissedOn={dismissedDateByCase.get(selectedCase.id)}
          today={today}
          canEdit={canEdit}
          onClose={() => setSelectedCaseId(null)}
          addEvent={board.addEvent}
          moveStage={board.moveStage}
          closeCase={board.closeCase}
        />
      ) : null}
    </section>
  );
}

const eventKindLabels: Record<AbandonmentEvent["kind"], string> = {
  system: "Sistema",
  contact: "Contato",
  message: "Mensagem",
  stage: "Mudança de etapa",
  note: "Anotação",
  correction: "Correção",
  closed: "Encerramento",
};

function CaseModal({ item, employee, streak, team, dismissedOn, today, canEdit, onClose, addEvent, moveStage, closeCase }: {
  item: AbandonmentCase;
  employee: Employee | undefined;
  streak: AbsenceStreak | undefined;
  team: string;
  dismissedOn: string | undefined;
  today: string;
  canEdit: boolean;
  onClose: () => void;
  addEvent: ReturnType<typeof useAbandonmentCases>["addEvent"];
  moveStage: ReturnType<typeof useAbandonmentCases>["moveStage"];
  closeCase: ReturnType<typeof useAbandonmentCases>["closeCase"];
}) {
  const events = useAbandonmentEvents(item.id);
  const contacts = useMemo(() => employeeContacts(employee), [employee]);
  const open = item.status === "open" && dismissedOn === undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<AbandonmentChannel>("call");
  const [result, setResult] = useState(abandonmentResultOptions[0]);
  const [notes, setNotes] = useState("");
  const [correcting, setCorrecting] = useState<AbandonmentEvent | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState<AbandonmentOutcome>("returned_justified");
  const [closingNotes, setClosingNotes] = useState("");
  const [template, setTemplate] = useState<AbandonmentTemplate | null>(null);
  const [recipient, setRecipient] = useState(0);
  const [message, setMessage] = useState("");

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (reason) {
      setError(`Não foi possível gravar: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally { setBusy(false); }
  }

  function startMessage(next: AbandonmentTemplate) {
    setTemplate(next);
    const familyIndex = contacts.findIndex((contact) => contact.label === "Contato de emergência" && contact.phone);
    setRecipient(next === "family" && familyIndex >= 0 ? familyIndex : Math.max(0, contacts.findIndex((contact) => contact.phone || contact.email)));
    setMessage(abandonmentMessage(next, {
      employeeName: item.employeeName,
      companyName: item.companyName,
      firstAbsenceDate: item.firstAbsenceDate,
      absenceDays: streak?.days || item.absenceDaysAtOpen,
    }));
  }

  // Abre o WhatsApp/Gmail com o texto e registra no histórico que a mensagem foi aberta para envio.
  function sendMessage(via: "whatsapp" | "email") {
    const contact = contacts[recipient];
    if (!contact || !template) return;
    const link = via === "whatsapp"
      ? (contact.phone ? whatsappLink(contact.phone, message) : null)
      : (contact.email ? gmailLink(contact.email, "Departamento Pessoal — ausências no trabalho", message) : null);
    if (!link) return;
    window.open(link, "_blank", "noopener");
    void run(() => addEvent(item.id, {
      kind: "message",
      channel: via,
      result: "Mensagem aberta para envio",
      notes: `${abandonmentTemplateLabels[template]} — para ${contact.label} (${contact.phone || contact.email})\n\n${message}`,
    }).then(() => setTemplate(null)));
  }

  const nextStages = abandonmentStages.filter((stage) => stage.id !== "closed" && stage.id !== item.stage);

  return (
    <div className="hr-card-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="hr-card-modal abandonment-modal" role="dialog" aria-modal="true" aria-label={`Caso de abandono — ${item.employeeName}`}
        onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
        <button className="hr-card-modal-close" type="button" aria-label="Fechar" onClick={onClose}><X size={20} /></button>
        <h2>{item.employeeName}</h2>
        <p>
          {team} · {item.companyName || "-"} · Etapa: <b>{open ? stageLabel(item.stage)
            : dismissedOn !== undefined ? `Encerrado — desligado em outra tela em ${formatDate(dismissedOn)} (estava em ${stageLabel(item.stage)})`
              : `Encerrado — ${item.outcome ? abandonmentOutcomeLabels[item.outcome] : ""}`}</b>
        </p>

        <div className="abandonment-summary">
          <div><span>1ª falta</span><b>{formatDate(item.firstAbsenceDate)}</b></div>
          <div><span>Dias corridos</span><b>{calendarDaysSince(item.firstAbsenceDate, today)}</b></div>
          <div><span>Faltas seguidas agora</span><b>{streak ? streak.days : 0}</b></div>
          <div><span>Aberto por</span><b>{item.openedBy?.name || "-"}</b><small>{formatDateTime(item.openedAt)}</small></div>
        </div>
        {open && streak ? <PendingNote streak={streak} /> : null}
        {open && !streak ? <p className="abandonment-warning">No último ponto salvo não há falta confirmada para este funcionário. Confira se ele retornou e, se sim, encerre o caso.</p> : null}

        <div className="abandonment-contacts">
          {contacts.length ? contacts.map((contact) => (
            <span key={`${contact.label}-${contact.phone || contact.email || contact.raw}`}>
              <Phone size={13} /> <b>{contact.label}:</b> {contact.phone || contact.email || contact.raw}
              {contact.raw && contact.phone ? <small> ({contact.raw})</small> : null}
            </span>
          )) : <span>Nenhum telefone ou e-mail no cadastro.</span>}
        </div>

        {error ? <p className="abandonment-error">{error}</p> : null}

        {open && canEdit ? (
          <div className="abandonment-actions">
            <div className="abandonment-action-group">
              <span>Gerar mensagem</span>
              {(Object.keys(abandonmentTemplateLabels) as AbandonmentTemplate[]).map((key) => (
                <button key={key} type="button" className="hr-chart-settings-button" disabled={busy} onClick={() => startMessage(key)}>
                  <MessageCircle size={14} /> {abandonmentTemplateLabels[key]}
                </button>
              ))}
            </div>
            <div className="abandonment-action-group">
              <span>Mover para</span>
              {nextStages.map((stage) => (
                <button key={stage.id} type="button" className="hr-chart-settings-button" disabled={busy} onClick={() => void run(() => moveStage(item, stage.id))}>
                  {stage.label}
                </button>
              ))}
              <button type="button" className="hr-chart-settings-button is-danger" disabled={busy} onClick={() => setClosing(true)}>Encerrar caso</button>
            </div>
          </div>
        ) : null}

        {template ? (
          <div className="abandonment-box">
            <h3>{abandonmentTemplateLabels[template]}</h3>
            <label className="field">Enviar para
              <select value={recipient} onChange={(event) => setRecipient(Number(event.target.value))}>
                {contacts.map((contact, index) => (
                  <option key={index} value={index} disabled={!contact.phone && !contact.email}>
                    {contact.label}: {contact.phone || contact.email || "sem telefone"}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">Mensagem (pode editar antes de enviar)
              <textarea rows={template === "summons" ? 9 : 5} value={message} onChange={(event) => setMessage(event.target.value)} />
            </label>
            {template === "summons" ? <small className="abandonment-muted">Texto-base: valide o modelo da convocação com o jurídico antes de usar.</small> : null}
            <div className="hr-card-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setTemplate(null)}>Cancelar</button>
              <button type="button" className="btn btn-secondary" disabled={busy || !contacts[recipient]?.email} onClick={() => sendMessage("email")}>
                <ExternalLink size={14} /> Abrir no Gmail
              </button>
              <button type="button" className="btn btn-primary" disabled={busy || !contacts[recipient]?.phone} onClick={() => sendMessage("whatsapp")}>
                <ExternalLink size={14} /> Abrir no WhatsApp
              </button>
            </div>
          </div>
        ) : null}

        {closing ? (
          <div className="abandonment-box">
            <h3>Encerrar caso</h3>
            <label className="field">Desfecho
              <select value={outcome} onChange={(event) => setOutcome(event.target.value as AbandonmentOutcome)}>
                {(Object.keys(abandonmentOutcomeLabels) as AbandonmentOutcome[]).map((key) => <option key={key} value={key}>{abandonmentOutcomeLabels[key]}</option>)}
              </select>
            </label>
            <label className="field">Observação (obrigatória)
              <textarea rows={3} value={closingNotes} onChange={(event) => setClosingNotes(event.target.value)} />
            </label>
            <div className="hr-card-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setClosing(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={busy || !closingNotes.trim()}
                onClick={() => void run(() => closeCase(item, outcome, closingNotes.trim()).then(() => setClosing(false)))}>Encerrar</button>
            </div>
          </div>
        ) : null}

        {open && canEdit ? (
          <form className="abandonment-box" onSubmit={(event) => {
            event.preventDefault();
            if (!notes.trim() && result === "Outro") return;
            void run(() => addEvent(item.id, { kind: "contact", channel, result, notes: notes.trim() }).then(() => setNotes("")));
          }}>
            <h3>Registrar contato / tentativa</h3>
            <div className="abandonment-form-row">
              <label className="field">Meio
                <select value={channel} onChange={(event) => setChannel(event.target.value as AbandonmentChannel)}>
                  {(Object.keys(abandonmentChannelLabels) as AbandonmentChannel[]).map((key) => <option key={key} value={key}>{abandonmentChannelLabels[key]}</option>)}
                </select>
              </label>
              <label className="field">Resultado
                <select value={result} onChange={(event) => setResult(event.target.value)}>
                  {abandonmentResultOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <label className="field">O que foi dito / feito
              <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: liguei às 9h, a mãe atendeu e disse que ele está doente; pediu para ligar amanhã." />
            </label>
            <div className="hr-card-modal-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>Registrar</button>
            </div>
          </form>
        ) : null}

        <h3 className="abandonment-timeline-title">Histórico</h3>
        <ol className="abandonment-timeline">
          {events.map((event) => {
            const corrected = events.find((other) => other.correctsEventId === event.id);
            return (
              <li key={event.id} className={`is-${event.kind}${corrected ? " is-corrected" : ""}`}>
                <header>
                  <b>{eventKindLabels[event.kind]}</b>
                  {event.channel ? <span>{abandonmentChannelLabels[event.channel]}</span> : null}
                  {event.result && event.kind !== "closed" ? <span>{event.result}</span> : null}
                  {event.kind === "closed" && event.result ? <span>{abandonmentOutcomeLabels[event.result as AbandonmentOutcome]}</span> : null}
                  {event.kind === "stage" ? <span>{stageLabel(event.stageFrom)} → {stageLabel(event.stageTo)}</span> : null}
                  <time>{formatDateTime(event.createdAt)} · {event.createdBy?.name || "-"}</time>
                </header>
                {event.notes ? <p>{event.notes}</p> : null}
                {event.correctsEventId ? <small>Corrige o registro de {formatDateTime(events.find((other) => other.id === event.correctsEventId)?.createdAt)}</small> : null}
                {corrected ? <small>Este registro foi corrigido em {formatDateTime(corrected.createdAt)}.</small> : null}
                {canEdit && event.kind !== "system" && event.kind !== "correction" ? (
                  <button type="button" className="abandonment-link" onClick={() => { setCorrecting(event); setCorrectionText(""); }}>Corrigir</button>
                ) : null}
                {correcting?.id === event.id ? (
                  <div className="abandonment-correction">
                    <textarea rows={2} value={correctionText} onChange={(change) => setCorrectionText(change.target.value)} placeholder="O que estava errado e qual é a informação correta" />
                    <div className="hr-card-modal-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setCorrecting(null)}>Cancelar</button>
                      <button type="button" className="btn btn-primary" disabled={busy || !correctionText.trim()}
                        onClick={() => void run(() => addEvent(item.id, { kind: "correction", correctsEventId: event.id, notes: correctionText.trim() }).then(() => setCorrecting(null)))}>
                        Registrar correção
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
          {!events.length ? <li className="is-system"><p>Carregando histórico…</p></li> : null}
        </ol>
        <small className="abandonment-muted">Os registros não podem ser editados nem apagados. Para corrigir, use "Corrigir": a correção fica registrada junto ao original.</small>
      </section>
    </div>
  );
}
