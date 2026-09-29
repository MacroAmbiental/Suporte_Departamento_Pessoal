import type { DiaristsModel } from "../hooks/useDiarists";
import ModalPortal from "@/modules/shared/ModalPortal";
import { X, CircleDollarSign } from "lucide-react";
import type { PaymentStatus } from "../types";
export default function WorkDayFormModal({ model }: { model: DiaristsModel }) {
 const { workModalOpen, setWorkModalOpen, workForm, setWorkForm, diarists, saveWorkDays } = model;
 return (<>
      {workModalOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={(event) => { event.preventDefault(); saveWorkDays(); }}>
            <div className="modal-header">
              <h2>Lançar dia trabalhado</h2>
              <button className="icon-button" type="button" onClick={() => setWorkModalOpen(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="form-grid">
              <label className="field is-wide-field">Diarista<select required value={workForm.diaristId} onChange={(event) => {
                const diarist = diarists.find((item) => item.id === event.target.value);
                setWorkForm({ ...workForm, diaristId: event.target.value, role: diarist?.role || workForm.role, dailyRate: Number(diarist?.dailyRate || workForm.dailyRate || 0) });
              }}><option value="">Selecione</option>{diarists.filter((diarist) => diarist.status === "active").map((diarist) => <option key={diarist.id} value={diarist.id}>{diarist.name}</option>)}</select></label>
              <div className="field is-wide-field">
                <span>Tipo de contratação</span>
                <label className="check-field"><input type="radio" checked={workForm.mode === "single"} onChange={() => setWorkForm({ ...workForm, mode: "single", endDate: workForm.startDate })} /> Diária única</label>
                <label className="check-field"><input type="radio" checked={workForm.mode === "fixed-period"} onChange={() => setWorkForm({ ...workForm, mode: "fixed-period", endDate: workForm.endDate || workForm.startDate })} /> Período determinado</label>
                <label className="check-field"><input type="radio" checked={workForm.mode === "open-period"} onChange={() => setWorkForm({ ...workForm, mode: "open-period", endDate: "" })} /> Período sem data final definida</label>
              </div>
              <label className="field">Data inicial<input type="date" value={workForm.startDate} onChange={(event) => setWorkForm({ ...workForm, startDate: event.target.value, endDate: workForm.mode === "single" ? event.target.value : workForm.endDate })} /></label>
              <label className="field">Data final<input type="date" disabled={workForm.mode !== "fixed-period"} value={workForm.mode === "fixed-period" ? workForm.endDate : ""} onChange={(event) => setWorkForm({ ...workForm, endDate: event.target.value })} /></label>
              <label className="field">Função no dia<input value={workForm.role} onChange={(event) => setWorkForm({ ...workForm, role: event.target.value })} /></label>
              <label className="field">Valor da diária<input type="number" min="0" step="0.01" value={workForm.dailyRate} onChange={(event) => setWorkForm({ ...workForm, dailyRate: Number(event.target.value) })} /></label>
              <label className="field">Pagamento<select value={workForm.paymentStatus} onChange={(event) => setWorkForm({ ...workForm, paymentStatus: event.target.value as PaymentStatus })}><option value="pending">Pendente</option><option value="paid">Pago</option><option value="canceled">Cancelado</option></select></label>
              <label className="field is-wide-field">Observação<textarea rows={3} value={workForm.notes} onChange={(event) => setWorkForm({ ...workForm, notes: event.target.value })} placeholder="Local, atividade, responsável, observações do dia..." /></label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setWorkModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" type="submit"><CircleDollarSign size={16} /> Salvar lançamento</button>
            </div>
          </form>
        </ModalPortal>
      ) : null}
</>);
}
