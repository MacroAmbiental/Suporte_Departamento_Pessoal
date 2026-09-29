import { Download, UserPlus } from "lucide-react";
import DeleteImpactModal from "@/common/components/DeleteImpactModal";
import { useDiarists } from "../hooks/useDiarists";
import { exportDiarists } from "../services/exportDiarists";
import DiaristsSummary from "./DiaristsSummary";
import DiaristsFilters from "./DiaristsFilters";
import DiaristsTable from "./DiaristsTable";
import DiaristWorkHistory from "./DiaristWorkHistory";
import DiaristFormModal from "./DiaristFormModal";
import WorkDayFormModal from "./WorkDayFormModal";
import "../styles.css";

export default function DiaristsPage() {
  const model = useDiarists();
  return <>
    <div className="page-header">
      <div>
        <h1 className="page-title">Diaristas</h1>
        <p className="page-subtitle">Controle separado de pessoas que trabalham eventualmente, sem folha de ponto, login, benefícios ou jornada fixa.</p>
      </div>
      <div className="page-header-actions">
        <button className="btn btn-secondary" type="button" onClick={() => void exportDiarists(model.diarists, model.workDays)}><Download size={17} /> Exportar Excel</button>
        {model.canCreate ? <button className="btn btn-primary" type="button" onClick={model.openNewDiarist}><UserPlus size={17} /> Nova diarista</button> : null}
      </div>
    </div>
    <DiaristsSummary model={model} />
    <DiaristsFilters model={model} />
    <div className="diarist-layout">
      <DiaristsTable model={model} />
      <DiaristWorkHistory model={model} />
    </div>
    <DiaristFormModal model={model} />
    <WorkDayFormModal model={model} />
    {model.deleteRequest ? <DeleteImpactModal title={model.deleteRequest.title} impact={model.deleteRequest.impact}
      onCancel={() => model.setDeleteRequest(null)} onConfirm={() => { model.deleteRequest?.onConfirm(); model.setDeleteRequest(null); }} /> : null}
  </>;
}
