import { ChevronDown, Eye, FileText, Pencil, Power, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import type { DocumentAlert, EmployeeDocument } from "@/types/domain";
import { useRecordsContext } from "@/modules/records/context/RecordsContext";
import { isDismissalInProgressEmployee } from "@/modules/records/hooks/useSelectedEmployeeDocuments";
import { badgeClass, formatDate, formatDateTime } from "@/utils/format";

const attachmentAccept = ".pdf,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg";

export default function EmployeeDocumentTable() {
  const {
    data,
    addDismissalDocument,
    deleteDocument,
    dismissalSelectedDocumentIds,
    openAlertEditor,
    openDocument,
    permissions,
    selectedDocuments,
    selectedEmployee,
    toggleActiveDocumentChecklist,
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

  const [uploadingDismissalDocument, setUploadingDismissalDocument] = useState(false);
  const canWriteAlerts = permissions.canCreateAlerts || permissions.canEditAlerts;
  const isDismissedEmployee = selectedEmployee?.status === "terminated";
  const isArchivedDismissal = Boolean(isDismissedEmployee && selectedEmployee?.registrationData?.dismissalApprovedAt);
  const isDismissalInProgress = isDismissalInProgressEmployee(selectedEmployee);
  const dismissalIds = new Set(dismissalSelectedDocumentIds);
  const dismissalCreatedDocumentIds = useMemo(() => {
    try {
      const saved = JSON.parse(selectedEmployee?.registrationData?.dismissalCreatedDocumentIds || "[]") as string[];
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set<string>();
    }
  }, [selectedEmployee]);
  const activeDocuments = selectedDocuments.filter((document) => !isArchivedDismissal && document.active !== false && !dismissalCreatedDocumentIds.has(document.id));
  const dismissalDocuments = selectedDocuments.filter((document) => dismissalIds.has(document.id) || dismissalCreatedDocumentIds.has(document.id));
  const archiveDocuments = selectedDocuments.filter((document) => !dismissalIds.has(document.id) && (isArchivedDismissal || document.active === false));
  const completedActiveDocumentIds = useMemo(() => {
    try {
      const saved = JSON.parse(selectedEmployee?.registrationData?.activeDocumentChecklistIds || "[]") as string[];
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set<string>();
    }
  }, [selectedEmployee]);
  const completedActiveDocuments = activeDocuments.filter((document) => completedActiveDocumentIds.has(document.id)).length;

  async function handleDismissalDocumentUpload(file: File) {
    setUploadingDismissalDocument(true);
    try {
      await addDismissalDocument(file);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Não foi possível anexar o documento de demissão.");
    } finally {
      setUploadingDismissalDocument(false);
    }
  }

  function renderDocumentRow(document: EmployeeDocument, dismissalMode: boolean, selectedForDismissal: boolean, allowActions: boolean, lockedForDismissal = false) {
    const alert = alertByDocumentId.get(document.id);
    const active = document.active !== false;
    const canViewDocument = Boolean(document.fileUrl);

    return (
      <tr key={document.id} className={dismissalMode ? "is-dismissal-row" : ""}>
        <td className="strong-cell">
          {dismissalMode ? (
            <label className="dismissal-doc-selection">
              <input
                type="checkbox"
                checked={selectedForDismissal}
                disabled={lockedForDismissal}
                onChange={() => {
                  if (!lockedForDismissal) toggleDismissalDocumentSelection(document.id);
                }}
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

        <td>{formatDateTime(document.realizedDate || document.createdAt)}</td>

        <td>{formatDateTime(document.updatedAt)}</td>

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
              {canViewDocument ? (
                <button type="button" onClick={() => openDocument(document)}>
                  <Eye size={16} />
                </button>
              ) : null}

              {allowActions && permissions.canEditDocuments ? (
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

              {allowActions && canWriteAlerts ? (
                <button
                  type="button"
                  onClick={() => openAlertEditor(document.id)}
                >
                  <Pencil size={14} />
                </button>
              ) : null}

              {allowActions && permissions.canEditDocuments ? (
                <button
                  type="button"
                  onClick={() => toggleDocument(document.id)}
                >
                  <Power size={14} /> {active ? "" : "Ativar"}
                </button>
              ) : null}

              {allowActions && permissions.canDeleteDocuments ? (
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
  }

  const sections = [
    { title: "Documentos de demissão", docs: dismissalDocuments },
    { title: "Documentos antigos", docs: archiveDocuments },
  ];

  return (
    <div className="employee-document-cards">
      <details
        key={`${selectedEmployee?.id}-active-checklist`}
        className="table-panel employee-document-card"
        open={activeDocuments.length > 0}
      >
        <summary className="employee-document-card-header">
          <span className="employee-document-card-title"><FileText size={18} aria-hidden="true" />Documentos ativos</span>
          <span className="employee-document-card-count">{isDismissalInProgress ? `${completedActiveDocuments}/${activeDocuments.length} concluídos` : `${activeDocuments.length} ${activeDocuments.length === 1 ? "documento" : "documentos"}`}</span>
          <ChevronDown className="employee-document-card-chevron" size={18} aria-hidden="true" />
        </summary>
        {isDismissalInProgress && activeDocuments.length ? (
          <div className="active-document-checklist">
            {activeDocuments.map((document) => (
              <label key={document.id} className="active-document-checklist-item">
                <input
                  type="checkbox"
                  checked={completedActiveDocumentIds.has(document.id)}
                  disabled={!permissions.canEditDocuments}
                  onChange={() => toggleActiveDocumentChecklist(document.id)}
                />
                <span>{document.name}</span>
              </label>
            ))}
          </div>
        ) : activeDocuments.length ? (
          <div className="employee-document-card-content">
            <table className="data-table">
              <thead><tr><th>Documento</th><th>Data/Hora</th><th>Atualização</th><th>Vencimento</th><th>Alerta</th><th>Ações</th></tr></thead>
              <tbody>{activeDocuments.map((document) => renderDocumentRow(document, false, false, true))}</tbody>
            </table>
          </div>
        ) : (
          <p className="employee-document-card-empty muted">Nenhum documento ativo para conferir.</p>
        )}
      </details>
      {sections.map(({ title, docs }, sectionIndex) => (
        <details
          key={`${selectedEmployee?.id}-${title}`}
          className="table-panel employee-document-card"
          open={docs.length > 0}
        >
          <summary className="employee-document-card-header">
            <span className="employee-document-card-title"><FileText size={18} aria-hidden="true" />{title}</span>
            <span className="employee-document-card-count">{docs.length} {docs.length === 1 ? "documento" : "documentos"}</span>
            <ChevronDown className="employee-document-card-chevron" size={18} aria-hidden="true" />
          </summary>
          {docs.length ? (
            <div className="employee-document-card-content">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Data/Hora</th>
                    <th>Atualização</th>
                    <th>Vencimento</th>
                    <th>Alerta</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((document) => renderDocumentRow(
                    document,
                    isDismissalInProgress,
                    dismissalIds.has(document.id) || dismissalCreatedDocumentIds.has(document.id),
                    !isArchivedDismissal,
                    dismissalCreatedDocumentIds.has(document.id),
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <p className="employee-document-card-empty muted">Nenhum documento neste grupo.</p>
            </>
          )}
        </details>
      ))}
    </div>
  );
}
