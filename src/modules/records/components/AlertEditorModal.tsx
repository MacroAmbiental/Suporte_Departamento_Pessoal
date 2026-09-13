import { Upload, X } from "lucide-react";
import type { AlertPriority } from "@/types/domain";
import type { AlertEditorForm } from "@/modules/records/types";
import { formatDocumentFileSize, nextDueDateFromRecurrence, recurrenceOptions } from "@/modules/records/utils/recordsDocuments";

const attachmentAccept = ".pdf,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg";

type AlertEditorModalProps = {
  alertForm: AlertEditorForm;
  onChange: (alertForm: AlertEditorForm) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function AlertEditorModal({
  alertForm,
  onChange,
  onClose,
  onSave,
}: AlertEditorModalProps) {
  function nextForm(patch: AlertEditorForm) {
    const next = { ...alertForm, ...patch };
    let dueDateSource = next.dueDateSource || "manual";

    if (Object.prototype.hasOwnProperty.call(patch, "dueDate")) {
      dueDateSource = patch.dueDate ? "manual" : "auto";
    }

    if (dueDateSource === "auto" || (!next.dueDate && next.realizedDate)) {
      const autoDueDate = nextDueDateFromRecurrence(next.realizedDate || "", next.recurrence || "Anual");
      next.dueDate = autoDueDate;
      dueDateSource = autoDueDate ? "auto" : "manual";
    }

    onChange({ ...next, dueDateSource });
  }

  const dueDateIsAuto = alertForm.dueDateSource === "auto" && Boolean(alertForm.dueDate);
  const attachmentLabel = alertForm.attachmentFileName
    ? `${alertForm.attachmentFileName}${alertForm.attachmentFileSize ? ` · ${alertForm.attachmentFileSize}` : ""}`
    : "Selecionar arquivo";

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="confirm-modal alert-modal" role="dialog" aria-modal="true" aria-labelledby="alert-editor-title">
        <div className="modal-header">
          <h2 id="alert-editor-title">Editar alerta</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <label className="field is-wide-field">
            Título
            <input value={alertForm.title || ""} onChange={(event) => onChange({ ...alertForm, title: event.target.value })} />
          </label>

          <label className="field">
            Vencimento
            <input
              type="date"
              disabled={dueDateIsAuto}
              value={alertForm.dueDate || ""}
              onChange={(event) => nextForm({ dueDate: event.target.value })}
            />
          </label>

          <label className="field">
            Data de realizado
            <input
              type="date"
              value={alertForm.realizedDate || ""}
              onChange={(event) => nextForm({ realizedDate: event.target.value })}
            />
          </label>

          <label className="field">
            Prioridade
            <select value={alertForm.priority || "medium"} onChange={(event) => onChange({ ...alertForm, priority: event.target.value as AlertPriority })}>
              <option value="high">Alta</option>
              <option value="medium">Média</option>
              <option value="low">Baixa</option>
            </select>
          </label>

          <label className="field">
            Recorrência
            <select value={alertForm.recurrence || "Anual"} onChange={(event) => nextForm({ recurrence: event.target.value })}>
              {recurrenceOptions.map((option) => <option value={option} key={option}>{option}</option>)}
            </select>
          </label>

          <label className="field">
            Alertar antes (dias)
            <input
              type="number"
              value={String(alertForm.advanceDays || alertForm.notifyBeforeDays || 0)}
              onChange={(event) => onChange({ ...alertForm, advanceDays: event.target.value, notifyBeforeDays: event.target.value })}
            />
          </label>

          <label className="field is-wide-field">
            Descrição
            <textarea value={alertForm.description || ""} onChange={(event) => onChange({ ...alertForm, description: event.target.value })} />
          </label>

          <label className="field is-wide-field document-file-field alert-attachment-field">
            Anexo do documento
            <input
              type="file"
              accept={attachmentAccept}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onChange({
                  ...alertForm,
                  attachmentFile: file,
                  attachmentFileName: file.name,
                  attachmentFileSize: formatDocumentFileSize(file),
                });
              }}
            />
            <span>
              <Upload size={15} />
              {alertForm.attachmentFileUrl || alertForm.attachmentFile ? "Trocar anexo" : "Adicionar anexo"}
            </span>
            <small>{attachmentLabel}</small>
          </label>
        </div>

        <div className="form-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="button" onClick={onSave}>Salvar alerta</button>
        </div>
      </div>
    </div>
  );
}
