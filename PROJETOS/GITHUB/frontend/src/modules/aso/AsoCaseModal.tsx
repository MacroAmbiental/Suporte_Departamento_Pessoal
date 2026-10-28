import { useState } from "react";
import { Check, Copy, Eye, Upload, X } from "lucide-react";
import ModalPortal from "@/modules/shared/ModalPortal";
import { openEmployeeDocumentFile } from "@/services/documentStorage";
import {
  ASO_CLINIC_DAYS,
  asoChannelLabels,
  asoGuideMessage,
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

type Props = {
  seed: AsoCaseSeed;
  asoCase?: AsoCase;
  currentAsoUrl?: string;
  currentAsoName?: string;
  canEdit: boolean;
  onClose: () => void;
  saveGuide: (seed: AsoCaseSeed, file: File) => Promise<void>;
  markGuideSent: (item: AsoCase, to: AsoGuideRecipient, channel: AsoChannel, notes: string) => Promise<void>;
  markExamDone: (item: AsoCase, examDate: string, notes: string) => Promise<void>;
  receiveAso: (item: AsoCase, file: File, newDueDate: string) => Promise<void>;
  markSentToSertras: (item: AsoCase, sentDate: string, notes: string) => Promise<void>;
};

const stageLabel = (stage: string) => asoStages.find((item) => item.id === stage)?.label || stage;

export default function AsoCaseModal({
  seed, asoCase, currentAsoUrl, currentAsoName, canEdit, onClose, saveGuide, markGuideSent, markExamDone, receiveAso, markSentToSertras,
}: Props) {
  const events = useAsoEvents(asoCase?.id || null);
  const stage = asoCase?.stage || "notified";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [guideFile, setGuideFile] = useState<File | null>(null);
  const [recipient, setRecipient] = useState<AsoGuideRecipient>("supervisor");
  const [channel, setChannel] = useState<AsoChannel>("whatsapp");
  const [message, setMessage] = useState(() => asoGuideMessage(seed.employeeName, formatDate(seed.dueDate)));
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
            <p className="panel-subtitle">{seed.companyName} · ASO vence em {formatDate(seed.dueDate)} · Etapa: {stageLabel(stage)}</p>
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
          <div className="aso-case-step">
            <h3>Encaminhar a guia</h3>
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
                  navigator.clipboard.writeText(message).then(() => setCopied(true)).catch(() => setError("Não foi possível copiar. Selecione o texto e copie manualmente."));
                }}
              >
                <Copy size={16} /> {copied ? "Copiada!" : "Copiar mensagem"}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() => run(() => markGuideSent(asoCase, recipient, channel, `Guia encaminhada ao ${asoRecipientLabels[recipient].toLowerCase()} por ${asoChannelLabels[channel]}.`))}
              >
                <Check size={16} /> {busy ? "Salvando..." : "Marcar como encaminhada"}
              </button>
            </div>
          </div>
        ) : null}

        {canEdit && asoCase && stage === "guide_sent" ? (
          <div className="aso-case-step">
            <h3>Exame feito</h3>
            <p className="abandonment-muted">
              Guia encaminhada ao {asoRecipientLabels[asoCase.guideSentTo || "supervisor"].toLowerCase()} por {asoChannelLabels[asoCase.guideSentChannel || "whatsapp"]}.
            </p>
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
