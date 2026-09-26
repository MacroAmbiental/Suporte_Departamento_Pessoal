import { Bell, BellOff, Plus } from "lucide-react";
import { employeeKindOf, employeeKindLabels } from "@/common/utils/employeeKind";
import { employeeProcessModalityLabel } from "@/modules/employeeProcesses/utils/experience";
import { useRecordsContext } from "@/modules/records/context/RecordsContext";
import { isDismissalArchivedEmployee, isDismissalInProgressEmployee } from "@/modules/records/hooks/useSelectedEmployeeDocuments";
import { formatDateTime, todayISO } from "@/utils/format";

export default function SelectedEmployeePanel() {
  const {
    activeAlertCount,
    confirmDismissalCancellation,
    confirmDismissalHomologation,
    data,
    employeeCompany,
    employeeSector,
    employeeTeam,
    openWizard,
    permissions,
    selectedDocuments,
    selectedEmployee,
  } = useRecordsContext();

  const contractTypeLabel = selectedEmployee ? employeeKindLabels[employeeKindOf(selectedEmployee)] : "-";

  const activeAlertDocumentIds = new Set(
    data.documentAlerts
      .filter((alert) => alert.status !== "completed")
      .map((alert) => alert.documentId),
  );
  const documentsWithoutAlert = selectedDocuments
    .filter((document) => !activeAlertDocumentIds.has(document.id))
    .sort((left, right) => (left.name || "").localeCompare(right.name || "", "pt-BR"));
  const isDismissedEmployee = selectedEmployee?.status === "terminated";
  const isDismissalInProgress = isDismissalInProgressEmployee(selectedEmployee);
  const isDismissalArchived = isDismissalArchivedEmployee(selectedEmployee);
  const dismissalTimestamp = selectedEmployee?.registrationData?.dismissalApprovedAt || selectedEmployee?.registrationData?.dismissalCancelledAt || "";
  const dismissalModalityLabel = selectedEmployee ? employeeProcessModalityLabel(selectedEmployee, todayISO()) : "";

  return (
    <article className={`panel selected-employee-panel ${isDismissedEmployee || isDismissalInProgress ? "is-dismissed" : ""}`.trim()}>
      <div>
        <h2 className="panel-title">{selectedEmployee?.name || "Selecione um funcionário"}</h2>
        <p className="muted">
          {employeeCompany(selectedEmployee)?.name || "-"} · {employeeSector(selectedEmployee)?.name || "-"} · Cargo: {selectedEmployee?.position || "-"} · Função: {selectedEmployee?.role || "-"} · Equipe: {employeeTeam(selectedEmployee)?.name || "-"} · Contrato: {contractTypeLabel}
        </p>
        {!isDismissedEmployee && !isDismissalInProgress ? (
          <span className="badge is-active">
            <Bell size={14} /> {activeAlertCount} alertas
          </span>
        ) : isDismissalArchived ? (
          <span className="badge is-terminated">
            <BellOff size={14} /> Demissão homologada
          </span>
        ) : (
          <span className="badge is-terminated">
            <Bell size={14} /> {dismissalModalityLabel || "Demissão em andamento"}
          </span>
        )}
        {dismissalTimestamp ? (
          <small className="muted dismissal-timestamp">
            {isDismissalArchived ? "Homologado em" : "Atualizado em"} {formatDateTime(dismissalTimestamp)}
          </small>
        ) : null}
        {selectedEmployee && !isDismissedEmployee && documentsWithoutAlert.length ? (
          <div className="employee-missing-alert-docs">
            <span><BellOff size={13} /> Documentos sem alerta nesta pasta</span>
            <div>
              {documentsWithoutAlert.map((document) => (
                <small key={document.id} title={document.name}>{document.name || "Documento sem nome"}</small>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {selectedEmployee && permissions.canCreateDocuments ? (
        <button className="btn btn-soft" type="button" onClick={() => openWizard(selectedEmployee.id)}>
          <Plus size={16} /> Adicionar documento
        </button>
      ) : null}
    </article>
  );
}
