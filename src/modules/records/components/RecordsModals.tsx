import ConfirmModal from "@/common/components/ConfirmModal";
import AlertEditorModal from "@/modules/records/components/AlertEditorModal";
import DocumentWizard from "@/modules/records/components/DocumentWizard";
import StandardDocumentsModal from "@/modules/records/components/StandardDocumentsModal";
import { useRecordsContext } from "@/modules/records/context/RecordsContext";

export default function RecordsModals() {
  const records = useRecordsContext();

  return (
    <>
      {records.standardDocsModalOpen ? (
        <StandardDocumentsModal
          groupOptions={records.standardDocsGroupOptions}
          companyOptions={records.standardDocsCompanyOptions}
          scopeType={records.standardDocsScopeType}
          groupId={records.standardDocsGroupId}
          companyId={records.standardDocsCompanyId}
          roleKey={records.standardDocsRoleKey}
          roles={records.standardDocsRoles}
          text={records.standardDocsText}
          saving={records.savingStandardDocs}
          onClose={() => records.setStandardDocsModalOpen(false)}
          onScopeChange={records.updateStandardDocsScope}
          onRoleChange={records.updateStandardDocsRole}
          onTextChange={records.setStandardDocsText}
          onSave={records.saveStandardDocs}
        />
      ) : null}

      {records.wizardOpen && records.permissions.canCreateDocuments ? (
        <DocumentWizard
          step={records.wizardStep}
          employees={records.recordsFilters.filteredEmployees}
          draftEmployeeId={records.draftEmployeeId}
          documents={records.documents}
          canCreateAlerts={records.permissions.canCreateAlerts}
          onClose={() => records.setWizardOpen(false)}
          onStepChange={records.setWizardStep}
          onDraftEmployeeChange={records.setDraftEmployeeId}
          onDocumentChange={records.updateDocument}
          onDocumentFileChange={records.handleFile}
          onAddDocument={records.addDocument}
          onSave={records.saveDocuments}
          getEmployeeCompanyName={(employee) => records.employeeCompany(employee)?.name || "-"}
        />
      ) : null}

      {records.alertEditorOpen ? (
        <AlertEditorModal
          alertForm={records.alertForm}
          onChange={records.setAlertForm}
          onClose={() => records.setAlertEditorOpen(false)}
          onSave={records.saveAlertEditor}
        />
      ) : null}

      {records.confirmState ? (
        <ConfirmModal
          title={records.confirmState.title}
          description={records.confirmState.description}
          confirmLabel={records.confirmState.confirmLabel}
          destructive={Boolean(records.confirmState.impact)}
          impact={records.confirmState.impact}
          onCancel={() => records.setConfirmState(null)}
          onConfirm={records.confirmAction}
        />
      ) : null}
    </>
  );
}
