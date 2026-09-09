import { Eye, FileText, Pencil, Power, Trash2, Upload } from "lucide-react";
import { useMemo } from "react";
import type { DocumentAlert, EmployeeDocument } from "@/types/domain";
import { useRecordsContext } from "@/modules/records/context/RecordsContext";
import { badgeClass, formatDate } from "@/utils/format";

const attachmentAccept = ".pdf,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg";

export default function EmployeeDocumentTable() {
  const {
    data,
    deleteDocument,
    dismissalSelectedDocumentIds,
    openAlertEditor,
    openDocument,
    permissions,
    selectedDocuments,
    selectedEmployee,
    toggleDismissalDocumentSelection,
    toggleDocument,
    updateDocumentAttachment,
  } = useRecordsContext();

  const alertByDocumentId = useMemo(
    () =>
      data.documentAlerts.reduce<Map<string, DocumentAlert>>((acc, alert) => {
        if (alert.status !== "completed" && !acc.has(alert.documentId)) {
          acc.set(alert.documentId, alert);
        }

        return acc;
      }, new Map()),
    [data.documentAlerts]
  );

  const canWriteAlerts = permissions.canCreateAlerts || permissions.canEditAlerts;

  return (
    <div className="table-panel">
      <table className="data-table">
        <thead>
          <tr>
            <th>Documento</th>
            <th>Realizado</th>
            <th>Vencimento</th>
            <th>Alerta</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          {selectedDocuments.map((document: EmployeeDocument) => {
            const alert = alertByDocumentId.get(document.id);
            const active = document.active !== false;
            const dismissalMode = selectedEmployee?.status === "terminated";
            const selectedForDismissal = dismissalSelectedDocumentIds.includes(document.id);

            return (
              <tr key={document.id} className={dismissalMode ? "is-dismissal-row" : ""}>
                <td className="strong-cell">
                  {dismissalMode ? (
                    <label className="dismissal-doc-selection">
                      <input
                        type="checkbox"
                        checked={selectedForDismissal}
                        onChange={() => toggleDismissalDocumentSelection(document.id)}
                      />
                      <span className="record-name">
                        <FileText size={15} /> {document.name}
                      </span>
                    </label>
                  ) : (
                    <>
                      <span className="record-name">
                        <FileText size={15} /> {document.name}
                      </span>
                      <span className="muted">{active ? "Ativo" : "Inativo"}</span>
                    </>
                  )}
                </td>

                <td>{formatDate(document.realizedDate)}</td>

                <td>{formatDate(document.expirationDate)}</td>

                <td>
                  {alert && !dismissalMode ? (
                    <span className={`badge ${badgeClass(alert.status)}`}>
                      {alert.title}
                    </span>
                  ) : dismissalMode ? (
                    <span className="muted">-</span>
                  ) : (
                    "-"
                  )}
                </td>

                <td>
                  {dismissalMode ? (
                    <span className="muted">Seleção para demissão</span>
                  ) : (
                    <div className="table-actions">
                      {document.fileUrl ? (
                        <button type="button" onClick={() => openDocument(document)}>
                          <Eye size={16} />
                        </button>
                      ) : null}

                      {permissions.canEditDocuments ? (
                        <>
                          <input
                            className="table-upload-input"
                            id={`document-upload-${document.id}`}
                            type="file"
                            accept={attachmentAccept}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void updateDocumentAttachment(document.id, file);
                              event.currentTarget.value = "";
                            }}
                          />
                          <label
                            className="table-upload-action"
                            htmlFor={`document-upload-${document.id}`}
                            title={document.fileUrl ? "Trocar anexo" : "Adicionar anexo"}
                            aria-label={document.fileUrl ? "Trocar anexo" : "Adicionar anexo"}
                          >
                            <Upload size={14} />
                          </label>
                        </>
                      ) : null}

                      {canWriteAlerts ? (
                        <button
                          type="button"
                          onClick={() => openAlertEditor(document.id)}
                        >
                          <Pencil size={14} /> 
                        </button>
                      ) : null}

                      {permissions.canEditDocuments ? (
                        <button
                          type="button"
                          onClick={() => toggleDocument(document.id)}
                        >
                          <Power size={14} /> {active ? "" : "Ativar"}
                        </button>
                      ) : null}

                      {permissions.canDeleteDocuments ? (
                        <button
                          type="button"
                          onClick={() => deleteDocument(document.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}

          {!selectedDocuments.length ? (
            <tr>
              <td colSpan={5}>Nenhum documento cadastrado nesta pasta.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
