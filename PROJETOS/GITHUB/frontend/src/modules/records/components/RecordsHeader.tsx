import { Settings } from "lucide-react";
import { useRecordsContext } from "@/modules/records/context/RecordsContext";

export default function RecordsHeader() {
  const { openStandardDocsModal, permissions } = useRecordsContext();

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
      </div>
    </div>
  );
}
