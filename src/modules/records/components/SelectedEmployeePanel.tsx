import { Bell, BellOff, Plus } from "lucide-react";
import { useRecordsContext } from "@/modules/records/context/RecordsContext";

export default function SelectedEmployeePanel() {
  const {
    activeAlertCount,
    data,
    employeeCompany,
    employeeSector,
    openWizard,
    permissions,
    selectedDocuments,
    selectedEmployee,
  } = useRecordsContext();
  const activeAlertDocumentIds = new Set(
    data.documentAlerts
      .filter((alert) => alert.status !== "completed")
      .map((alert) => alert.documentId),
  );
  const documentsWithoutAlert = selectedDocuments
    .filter((document) => !activeAlertDocumentIds.has(document.id))
    .sort((left, right) => (left.name || "").localeCompare(right.name || "", "pt-BR"));

  return (
    <article className="panel selected-employee-panel">
      <div>
        <h2 className="panel-title">{selectedEmployee?.name || "Selecione um funcionário"}</h2>
        <p className="muted">
          {employeeCompany(selectedEmployee)?.name || "-"} · {employeeSector(selectedEmployee)?.name || "-"} · Cargo: {selectedEmployee?.position || "-"} · Função: {selectedEmployee?.role || "-"}
        </p>
        <span className="badge is-active">
          <Bell size={14} /> {activeAlertCount} alertas
        </span>
        {selectedEmployee && documentsWithoutAlert.length ? (
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
          <Plus size={16} /> Adicionar nesta pasta
        </button>
      ) : null}
    </article>
  );
}
