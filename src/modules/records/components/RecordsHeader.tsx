import { Plus, Settings } from "lucide-react";
import { useRecordsContext } from "@/modules/records/context/RecordsContext";

export default function RecordsHeader() {
  const { openStandardDocsModal, openWizard, permissions } = useRecordsContext();

  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">Documentos dos Funcionários</h1>
        <p className="page-subtitle">Pastas por funcionário, documentos anexados e alertas criados em fluxo guiado.</p>
      </div>
      <div className="form-actions">
        {permissions.canManageStandardDocuments ? (
          <button className="btn btn-secondary" type="button" onClick={() => openStandardDocsModal()}>
            <Settings size={17} />
            Documentos padrões
          </button>
        ) : null}
        {permissions.canCreateDocuments ? (
          <button className="btn btn-primary" type="button" onClick={() => openWizard()}>
            <Plus size={17} />
            Adicionar documento
          </button>
        ) : null}
      </div>
    </div>
  );
}
