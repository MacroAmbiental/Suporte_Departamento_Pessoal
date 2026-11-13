import { useState, type ReactNode } from "react";
import { Check, Copy, Eye, Upload, X } from "lucide-react";
import ModalPortal from "@/modules/shared/ModalPortal";
import { openEmployeeDocumentFile } from "@/services/documentStorage";
import {
  ASO_CLINIC_DAYS,
  asoChannelLabels,
  asoGuideMessage,
  asoManualReasonLabels,
  asoSecondGuideMessage,
  firstGuideDate,
  secondGuideDue,
  secondGuideDueDate,
  asoRecipientLabels,
  asoStages,
  clinicLate,
  defaultNewAsoDueDate,
  type AsoCase,
  type AsoChannel,
  type AsoGuideRecipient,
} from "@/modules/aso/asoModel";
import { useAsoEvents, type AsoCaseSeed } from "@/modules/aso/useAsoCases";
import { addDaysISO } from "@/modules/vacation/data/vacationsRepository";
import { formatDate, formatDateTime, todayISO } from "@/utils/format";
import type { DocumentAlert } from "@/types/domain";

type Props = {
  seed: AsoCaseSeed;
  // Equipe atual (estrutura de grupos, igual ao Controle de ponto).
  teamName?: string;
  asoCase?: AsoCase;
  currentAsoUrl?: string;
  currentAsoName?: string;
  canEdit: boolean;
  // Alerta do ASO em Notificações: as observações são as dele.
  alert?: DocumentAlert;
  canEditObservation: boolean;
  saveObservation: (alert: DocumentAlert, value: string) => Promise<void>;
  onClose: () => void;
  saveGuide: (seed: AsoCaseSeed, file: File) => Promise<void>;
  cancelManualCase: (item: AsoCase, notes: string) => Promise<void>;
  markGuideSent: (item: AsoCase, to: AsoGuideRecipient, channel: AsoChannel, sentDate: string, notes: string) => Promise<void>;
  markSecondGuideSent: (item: AsoCase, to: AsoGuideRecipient, channel: AsoChannel, sentDate: string, notes: string) => Promise<void>;
  markExamDone: (item: AsoCase, examDate: string, notes: string) => Promise<void>;
  receiveAso: (item: AsoCase, file: File, newDueDate: string) => Promise<void>;
  markSentToSertras: (item: AsoCase, sentDate: string, notes: string) => Promise<void>;
};

const stageLabel = (stage: string) => asoStages.find((item) => item.id === stage)?.label || stage;

// Observações do alerta do ASO (as mesmas da tela de Notificações). Acompanha
// a mudança feita lá enquanto o texto daqui não foi mexido.
function AsoObservation({ alert, canEdit, save }: {
  alert?: DocumentAlert;
  canEdit: boolean;
  save: (alert: DocumentAlert, value: string) => Promise<void>;
}) {
  const saved = alert?.description || "";
  const [value, setValue] = useState(saved);
  const [baseline, setBaseline] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  if (saved !== baseline) {
    // Mudou no banco (outra tela/usuário): se não há edição local, mostra o novo.
    setBaseline(saved);
    if (value === baseline) setValue(saved);
  }

  if (!alert) {
    return (
      <div className="aso-case-observation">
        <h3>Observações</h3>
        <p className="abandonment-muted">Este ASO não tem alerta em Notificações, então não há observações.</p>
      </div>
    );
  }

  const changed = value.trim() !== saved;
  async function submit() {
    if (!alert) return;
    setBusy(true);
    setStatus("");
    try {
      await save(alert, value);
      setStatus("Observação salva.");
    } catch (saveError) {
      setStatus(saveError instanceof Error ? saveError.message : "Não foi possível salvar a observação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="aso-case-observation">
      <h3>Observações <small className="abandonment-muted">(as mesmas de Notificações)</small></h3>
      {canEdit ? (
        <>
          <textarea
            rows={3}
            value={value}
            onChange={(event) => { setValue(event.target.value); setStatus(""); }}
            placeholder="Adicionar observação..."
            aria-label="Observações do ASO"
          />
          <div className="form-actions">
            {status ? <small className="abandonment-muted">{status}</small> : null}
            <button className="btn btn-secondary" type="button" disabled={busy || !changed} onClick={() => void submit()}>
              <Check size={16} /> {busy ? "Salvando..." : "Salvar observação"}
            </button>
          </div>
        </>
      ) : (
        <p className={saved ? undefined : "abandonment-muted"}>{saved || "Sem observações."}</p>
      )}
    </div>
  );
}

// Encaminhar a guia (1ª ou 2ª): para quem, por onde, quando e a mensagem pronta.
function GuideSendStep({ title, intro, initialMessage, initialRecipient, initialChannel, busy, buttonLabel, onSend, onError }: {
  title: string;
  intro?: ReactNode;
  initialMessage: string;
  initialRecipient?: AsoGuideRecipient;
  initialChannel?: AsoChannel;
  busy: boolean;
  buttonLabel: string;
  onSend: (to: AsoGuideRecipient, channel: AsoChannel, sentDate: string) => void;
  onError: (message: string) => void;
}) {
  const [recipient, setRecipient] = useState<AsoGuideRecipient>(initialRecipient || "supervisor");
  const [channel, setChannel] = useState<AsoChannel>(initialChannel || "whatsapp");
  const [sentDate, setSentDate] = useState(todayISO());
  const [message, setMessage] = useState(initialMessage);
  const [copied, setCopied] = useState(false);

  return (
    <div className="aso-case-step">
      <h3>{title}</h3>
      {intro}
      <div className="aso-case-row">
        <label className="field">
          Para
          <select value={recipient} onChange={(event) => setRecipient(event.target.value as AsoGuideRecipient)}>
            {Object.entries(asoRecipientLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field">
          Por onde
          <select value={channel} onChange={(event) => setChannel(event.target.value as AsoChannel)}>
            {Object.entries(asoChannelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field">
          Data do envio
          <input type="date" value={sentDate} max={todayISO()} onChange={(event) => setSentDate(event.target.value)} />
        </label>
      </div>
      <label className="field">
        Mensagem pronta (pode editar antes de copiar)
        <textarea rows={4} value={message} onChange={(event) => { setMessage(event.target.value); setCopied(false); }} />
      </label>
      <div className="form-actions">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(message).then(() => setCopied(true)).catch(() => onError("Não foi possível copiar. Selecione o texto e copie manualmente."));
          }}
        >
          <Copy size={16} /> {copied ? "Copiada!" : "Copiar mensagem"}
        </button>
        <button className="btn btn-primary" type="button" disabled={busy || !sentDate} onClick={() => onSend(recipient, channel, sentDate)}>
          <Check size={16} /> {busy ? "Salvando..." : buttonLabel}
        </button>
      </div>
    </div>
  );
}

export default function AsoCaseModal({
  seed, teamName, asoCase, currentAsoUrl, currentAsoName, canEdit, alert, canEditObservation, saveObservation,
  onClose, saveGuide, cancelManualCase, markGuideSent, markSecondGuideSent, markExamDone, receiveAso, markSentToSertras,
}: Props) {
  const events = useAsoEvents(asoCase?.id || null);
  const stage = asoCase?.stage || "notified";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guideFile, setGuideFile] = useState<File | null>(null);
  const today = todayISO();
  const [examDate, setExamDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [newAsoFile, setNewAsoFile] = useState<File | null>(null);
  const [newDueDate, setNewDueDate] = useState(() => (asoCase?.examDate ? defaultNewAsoDueDate(asoCase.examDate) : ""));
  const [sentDate, setSentDate] = useState(todayISO());

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

  function openFile(url?: string, name?: string) {
    if (!url) return;
    openEmployeeDocumentFile(url, name || "documento").catch((openError) => {
      setError(openError instanceof Error ? openError.message : "Não foi possível abrir o arquivo.");
    });
  }

  return (
    <ModalPortal className="modal-backdrop">
      <div className="modal-panel aso-case-modal" role="dialog" aria-modal="true" aria-labelledby="aso-case-title">
        <div className="modal-header">
          <div>
            <h2 id="aso-case-title">{seed.employeeName}</h2>
            <p className="panel-subtitle">
              {seed.companyName} · Equipe: {teamName || "sem equipe"} · {seed.dueDate ? `ASO vence em ${formatDate(seed.dueDate)}` : "Sem ASO em Registros"} · Etapa: {stageLabel(stage)}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="aso-case-files">
          {currentAsoUrl ? (
            <button className="btn btn-soft" type="button" onClick={() => openFile(currentAsoUrl, currentAsoName)}><Eye size={14} /> Ver ASO atual</button>
          ) : null}
          {asoCase?.guideFileUrl ? (
            <button className="btn btn-soft" type="button" onClick={() => openFile(asoCase.guideFileUrl, asoCase.guideFileName)}><Eye size={14} /> Ver guia</button>
          ) : null}
        </div>

        {asoCase?.origin === "manual" ? (
          <div className="aso-case-step">
            <h3>Adicionado manualmente · {asoManualReasonLabels[asoCase.manualReason || "other"]}</h3>
            {asoCase.manualNotes ? <p className="abandonment-muted">{asoCase.manualNotes}</p> : null}
            <small className="abandonment-muted">Por {asoCase.openedBy?.name || "-"} em {formatDateTime(asoCase.openedAt)}.</small>
            {canEdit && stage === "notified" ? (
              <div className="form-actions">
                <button
                  className="btn btn-soft"
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => cancelManualCase(asoCase, "Removido do processo (adicionado por engano)."))}
                >
                  <X size={16} /> Remover do processo
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <AsoObservation alert={alert} canEdit={canEditObservation} save={saveObservation} />

        {error ? <p className="abandonment-error">{error}</p> : null}
        {!canEdit ? <p className="abandonment-muted">Você pode ver o processo, mas não tem permissão para avançar as etapas.</p> : null}

        {canEdit && stage === "notified" ? (
          <div className="aso-case-step">
            <h3>Emitir a guia do exame</h3>
            <label className="document-file-field">
              <input type="file" accept=".pdf,image/*" onChange={(event) => setGuideFile(event.target.files?.[0] || null)} />
              <span><Upload size={16} /> {guideFile?.name || "Anexe a guia (PDF ou foto, até 10 MB)"}</span>
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" type="button" disabled={busy || !guideFile} onClick={() => guideFile && run(() => saveGuide(seed, guideFile))}>
                <Check size={16} /> {busy ? "Salvando..." : "Salvar guia"}
              </button>
            </div>
          </div>
        ) : null}

        {canEdit && asoCase && stage === "guide_issued" ? (
          <GuideSendStep
            title="Encaminhar a 1ª guia"
            initialMessage={asoGuideMessage(seed.employeeName, formatDate(seed.dueDate))}
            busy={busy}
            buttonLabel="Marcar 1ª guia encaminhada"
            onError={setError}
            onSend={(to, via, sentDate) => run(() => markGuideSent(asoCase, to, via, sentDate,
              `1ª guia encaminhada ao ${asoRecipientLabels[to].toLowerCase()} por ${asoChannelLabels[via]} em ${formatDate(sentDate)}.`))}
          />
        ) : null}

        {canEdit && asoCase && stage === "guide_sent" ? (
          <GuideSendStep
            title="Encaminhar a 2ª guia"
            intro={(
              <p className={secondGuideDue(asoCase, today) ? "aso-overdue-text" : "abandonment-muted"}>
                1ª guia encaminhada ao {asoRecipientLabels[asoCase.guideSentTo || "supervisor"].toLowerCase()} por {asoChannelLabels[asoCase.guideSentChannel || "whatsapp"]} em {formatDate(firstGuideDate(asoCase))}.
                {" "}{secondGuideDue(asoCase, today)
                  ? `O prazo da 2ª guia era ${formatDate(secondGuideDueDate(asoCase))}: encaminhe a 2ª guia.`
                  : `A 2ª guia deve ser encaminhada em ${formatDate(secondGuideDueDate(asoCase))}, se o exame ainda não tiver sido feito.`}
              </p>
            )}
            initialMessage={asoSecondGuideMessage(seed.employeeName, formatDate(seed.dueDate))}
            initialRecipient={asoCase.guideSentTo}
            initialChannel={asoCase.guideSentChannel}
            busy={busy}
            buttonLabel="Marcar 2ª guia encaminhada"
            onError={setError}
            onSend={(to, via, sentDate) => run(() => markSecondGuideSent(asoCase, to, via, sentDate,
              `2ª guia encaminhada ao ${asoRecipientLabels[to].toLowerCase()} por ${asoChannelLabels[via]} em ${formatDate(sentDate)}.`))}
          />
        ) : null}

        {canEdit && asoCase && (stage === "guide_sent" || stage === "guide_resent") ? (
          <div className="aso-case-step">
            <h3>Exame feito</h3>
            {stage === "guide_resent" ? (
              <p className="abandonment-muted">
                2ª guia encaminhada ao {asoRecipientLabels[asoCase.secondGuideSentTo || "supervisor"].toLowerCase()} por {asoChannelLabels[asoCase.secondGuideSentChannel || "whatsapp"]}
                {asoCase.secondGuideSentAt ? ` em ${formatDate(asoCase.secondGuideSentAt)}` : ""}.
              </p>
            ) : (
              <p className="abandonment-muted">Se o funcionário já fez o exame, marque aqui mesmo sem a 2ª guia.</p>
            )}
            <div className="aso-case-row">
              <label className="field">
                Data do exame
                <input type="date" value={examDate} max={todayISO()} onChange={(event) => setExamDate(event.target.value)} />
              </label>
              <label className="field">
                Observação (opcional)
                <input type="text" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: clínica, horário" />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !examDate}
                onClick={() => run(() => markExamDone(asoCase, examDate, `Exame feito em ${formatDate(examDate)}.${notes.trim() ? ` ${notes.trim()}` : ""}`))}
              >
                <Check size={16} /> {busy ? "Salvando..." : "Marcar exame feito"}
              </button>
            </div>
          </div>
        ) : null}

        {asoCase && stage === "exam_done" ? (
          <div className="aso-case-step">
            <h3>ASO recebido da clínica</h3>
            {asoCase.examDate ? (
              <p className={clinicLate(asoCase, todayISO()) ? "aso-overdue-text" : "abandonment-muted"}>
                Exame feito em {formatDate(asoCase.examDate)}. A clínica entrega até {formatDate(addDaysISO(asoCase.examDate, ASO_CLINIC_DAYS))}
                {clinicLate(asoCase, todayISO()) ? " (atrasada)" : ""}.
              </p>
            ) : null}
            {canEdit ? (
              <>
                <label className="document-file-field">
                  <input type="file" accept=".pdf,image/*" onChange={(event) => setNewAsoFile(event.target.files?.[0] || null)} />
                  <span><Upload size={16} /> {newAsoFile?.name || "Anexe o ASO novo (PDF ou foto, até 10 MB)"}</span>
                </label>
                <label className="field">
                  Vencimento do ASO novo
                  <input type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} />
                </label>
                <small className="abandonment-muted">
                  Ao salvar, o ASO novo substitui o atual em Registros, o alerta atual é concluído e o do próximo vencimento é criado.
                </small>
                <div className="form-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy || !newAsoFile || !newDueDate}
                    onClick={() => newAsoFile && run(() => receiveAso(asoCase, newAsoFile, newDueDate))}
                  >
                    <Check size={16} /> {busy ? "Salvando..." : "Salvar ASO recebido"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {asoCase && stage === "aso_received" ? (
          <div className="aso-case-step">
            <h3>Enviar à SERTRAS</h3>
            <p className="abandonment-muted">
              ASO novo ({asoCase.newAsoFileName || "anexado"}) vence em {formatDate(asoCase.newDueDate || "")}. Suba o arquivo no portal da SERTRAS e marque aqui.
            </p>
            {canEdit ? (
              <>
                <label className="field">
                  Data do envio
                  <input type="date" value={sentDate} max={todayISO()} onChange={(event) => setSentDate(event.target.value)} />
                </label>
                <div className="form-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy || !sentDate}
                    onClick={() => run(() => markSentToSertras(asoCase, sentDate, `Enviado ao portal da SERTRAS em ${formatDate(sentDate)}.`))}
                  >
                    <Check size={16} /> {busy ? "Salvando..." : "Marcar enviado à SERTRAS"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {asoCase && stage === "closed" ? (
          <div className="aso-case-step">
            <h3>Processo encerrado</h3>
            <p className="abandonment-muted">Enviado à SERTRAS em {formatDate(asoCase.sertrasSentAt || "")}. O próximo ASO vence em {formatDate(asoCase.newDueDate || "")}.</p>
          </div>
        ) : null}

        {events.length ? (
          <>
            <h3 className="abandonment-timeline-title">Histórico</h3>
            <ol className="abandonment-timeline">
              {events.map((event) => (
                <li key={event.id}>
                  <strong>{stageLabel(event.stageFrom)} → {stageLabel(event.stageTo)}</strong>
                  <span>{event.notes}</span>
                  <small className="abandonment-muted">{formatDateTime(event.createdAt)} · {event.createdBy?.name || "-"}</small>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </div>
    </ModalPortal>
  );
}
