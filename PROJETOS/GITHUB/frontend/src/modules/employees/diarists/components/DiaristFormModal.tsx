import type { DiaristsModel } from "../hooks/useDiarists";
import ModalPortal from "@/modules/shared/ModalPortal";
import { X, CheckCircle2 } from "lucide-react";
import type { DiaristStatus } from "../types";
export default function DiaristFormModal({ model }: { model: DiaristsModel }) {
 const { diaristModalOpen, setDiaristModalOpen, editingDiaristId, diaristForm, setDiaristForm, saveDiarist } = model;
 return (<>
      {diaristModalOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={(event) => { event.preventDefault(); saveDiarist(); }}>
            <div className="modal-header">
              <h2>{editingDiaristId ? "Editar diarista" : "Nova diarista"}</h2>
              <button className="icon-button" type="button" onClick={() => setDiaristModalOpen(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="form-grid">
              <label className="field">Nome<input required value={diaristForm.name} onChange={(event) => setDiaristForm({ ...diaristForm, name: event.target.value })} /></label>
              <label className="field">CPF<input required value={diaristForm.cpf} onChange={(event) => setDiaristForm({ ...diaristForm, cpf: event.target.value })} /></label>
              <label className="field">Telefone<input value={diaristForm.phone} onChange={(event) => setDiaristForm({ ...diaristForm, phone: event.target.value })} /></label>
              <label className="field">Função<input required value={diaristForm.role} onChange={(event) => setDiaristForm({ ...diaristForm, role: event.target.value })} /></label>
              <label className="field">Valor da diária<input type="number" min="0" step="0.01" value={diaristForm.dailyRate} onChange={(event) => setDiaristForm({ ...diaristForm, dailyRate: Number(event.target.value) })} /></label>
              <label className="field">Forma de pagamento<select value={diaristForm.paymentMethod} onChange={(event) => setDiaristForm({ ...diaristForm, paymentMethod: event.target.value })}><option>PIX</option><option>Dinheiro</option><option>Transferência</option><option>Depósito</option><option>Outro</option></select></label>
              <label className="field">Chave PIX<input value={diaristForm.pixKey} onChange={(event) => setDiaristForm({ ...diaristForm, pixKey: event.target.value })} placeholder="CPF, telefone, e-mail ou chave aleatória" /></label>
              <label className="field">Empresa ou equipe responsável<input value={diaristForm.companyOrTeam} onChange={(event) => setDiaristForm({ ...diaristForm, companyOrTeam: event.target.value })} /></label>
              <label className="field">Obra, setor ou local de trabalho<input value={diaristForm.workplace} onChange={(event) => setDiaristForm({ ...diaristForm, workplace: event.target.value })} /></label>
              <label className="field">Status<select value={diaristForm.status} onChange={(event) => setDiaristForm({ ...diaristForm, status: event.target.value as DiaristStatus })}><option value="active">Ativa</option><option value="inactive">Inativa</option></select></label>
              <label className="field is-wide-field">Observações<textarea value={diaristForm.notes} onChange={(event) => setDiaristForm({ ...diaristForm, notes: event.target.value })} rows={3} /></label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setDiaristModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" type="submit"><CheckCircle2 size={16} /> Salvar diarista</button>
            </div>
          </form>
        </ModalPortal>
      ) : null}
</>);
}
