import { Check, Plus, Upload, X } from "lucide-react";
import type { AlertPriority, DocumentKind, Employee } from "@/types/domain";
import type { DocumentDraft } from "@/modules/records/types";
import {
  documentKinds,
  recurrenceOptions,
} from "@/modules/records/utils/recordsDocuments";
import { labelStatus } from "@/utils/format";

type DocumentWizardProps = {
  step: number;
  employees: Employee[];
  draftEmployeeId: string;
  documents: DocumentDraft[];
  canCreateAlerts: boolean;
  onClose: () => void;
  onStepChange: (step: number) => void;
  onDraftEmployeeChange: (employeeId: string) => void;
  onDocumentChange: (
    documentId: string,
    patch: Partial<DocumentDraft>
  ) => void;
  onDocumentFileChange: (documentId: string, file?: File) => void;
  onAddDocument: () => void;
  onSave: () => void;
  getEmployeeCompanyName: (employee: Employee) => string;
};

export default function DocumentWizard({
  step,
  employees,
  draftEmployeeId,
  documents,
  canCreateAlerts,
  onClose,
  onStepChange,
  onDraftEmployeeChange,
  onDocumentChange,
  onDocumentFileChange,
  onAddDocument,
  onSave,
  getEmployeeCompanyName,
}: DocumentWizardProps) {
  const selectedEmployee = employees.find((employee) => employee.id === draftEmployeeId);

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-panel wizard-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-wizard-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="document-wizard-title">Adicionar documentos</h2>
            {selectedEmployee ? (
              <p className="muted" style={{ marginTop: 4 }}>
                Funcionário: {selectedEmployee.name}
                {getEmployeeCompanyName(selectedEmployee) ? ` · ${getEmployeeCompanyName(selectedEmployee)}` : ""}
              </p>
            ) : null}
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="wizard-vertical">
          <button
            className={step === 1 ? "is-active" : ""}
            type="button"
            onClick={() => onStepChange(1)}
          >
            1. Documentos
          </button>

          <button
            className={step === 2 ? "is-active" : ""}
            type="button"
            onClick={() => onStepChange(2)}
          >
            2. Alertas
          </button>
        </div>

        {step === 1 ? (
          <div className="document-draft-list">
            {documents.map((document) => (
              <div className="document-draft" key={document.id}>
                <label
                  className="field document-file-field"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();

                    const file = event.dataTransfer?.files?.[0];

                    if (file) {
                      onDocumentFileChange(document.id, file);
                    }
                  }}
                >
                  Arquivo PDF/Excel, arraste aqui
                  <input
                    type="file"
                    accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) =>
                      onDocumentFileChange(
                        document.id,
                        event.target.files?.[0]
                      )
                    }
                  />
                  <span>
                    <Upload size={15} />{" "}
                    {document.file?.name || document.name || "Selecionar arquivo"}
                  </span>
                </label>

                <label className="field">
                  Nome
                  <input
                    value={document.name}
                    onChange={(event) =>
                      onDocumentChange(document.id, {
                        name: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="field">
                  Data de anexo
                  <input
                    type="date"
                    value={document.attachmentDate || ""}
                    onChange={(event) =>
                      onDocumentChange(document.id, {
                        attachmentDate: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="field">
                  Realizado
                  <input
                    type="date"
                    value={document.realizedDate || ""}
                    onChange={(event) =>
                      onDocumentChange(document.id, {
                        realizedDate: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="field">
                  Tipo
                  <select
                    value={document.kind}
                    onChange={(event) =>
                      onDocumentChange(document.id, {
                        kind: event.target.value as DocumentKind,
                      })
                    }
                  >
                    {documentKinds.map((kind) => (
                      <option value={kind} key={kind}>
                        {labelStatus(kind)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  Tamanho
                  <input
                    value={document.size}
                    onChange={(event) =>
                      onDocumentChange(document.id, {
                        size: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="field">
                  Vencimento
                  <input
                    type="date"
                    disabled={document.expirationDateSource === "auto" && Boolean(document.expirationDate)}
                    value={document.expirationDate || ""}
                    onChange={(event) =>
                      onDocumentChange(document.id, {
                        expirationDate: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ))}

            <button className="btn btn-soft" type="button" onClick={onAddDocument}>
              <Plus size={16} /> Adicionar outro documento
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          canCreateAlerts ? (
            <div className="wizard-alert-list">
              {documents.map((document) => {
                const alertFieldsDisabled = !document.createAlert;

                return (
                  <article className="panel form-card" key={document.id}>
                    <div className="panel-header">
                      <h3 className="panel-title">
                        {document.name || "Documento sem nome"}
                      </h3>

                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={document.createAlert}
                          onChange={(event) =>
                            onDocumentChange(document.id, {
                              createAlert: event.target.checked,
                            })
                          }
                        />{" "}
                        Criar alerta
                      </label>
                    </div>

                    <div className="form-grid">
                      <label className="field">
                        Título
                        <input
                          disabled={alertFieldsDisabled}
                          value={document.alertTitle}
                          onChange={(event) =>
                            onDocumentChange(document.id, {
                              alertTitle: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label className="field">
                        Prioridade
                        <select
                          disabled={alertFieldsDisabled}
                          value={document.alertPriority}
                          onChange={(event) =>
                            onDocumentChange(document.id, {
                              alertPriority: event.target
                                .value as AlertPriority,
                            })
                          }
                        >
                          <option value="high">Alta</option>
                          <option value="medium">Média</option>
                          <option value="low">Baixa</option>
                        </select>
                      </label>

                      <label className="field">
                        Recorrência
                        <select
                          disabled={alertFieldsDisabled}
                          value={document.alertRecurrence}
                          onChange={(event) =>
                            onDocumentChange(document.id, {
                              alertRecurrence: event.target.value,
                            })
                          }
                        >
                          {recurrenceOptions.map((option) => (
                            <option value={option} key={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        Alertar antes, em dias
                        <input
                          disabled={alertFieldsDisabled}
                          type="number"
                          value={document.alertAdvanceDays}
                          onChange={(event) =>
                            onDocumentChange(document.id, {
                              alertAdvanceDays: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label className="field is-wide-field">
                        Descrição
                        <textarea
                          disabled={alertFieldsDisabled}
                          value={document.alertDescription}
                          onChange={(event) =>
                            onDocumentChange(document.id, {
                              alertDescription: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="panel">
              <div className="panel-body">
                Seu usuário não tem permissão para criar alertas.
              </div>
            </div>
          )
        ) : null}

        <div className="form-actions">
          {step > 1 ? (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => onStepChange(step - 1)}
            >
              Voltar
            </button>
          ) : null}

          {step < 2 ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => onStepChange(step + 1)}
            >
              Avançar
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={onSave}>
              <Check size={16} /> Salvar documentos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
