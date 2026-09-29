import type { DiaristsModel } from "../hooks/useDiarists";
import { Plus, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/utils/format";
import { paymentLabel, paymentBadgeClass } from "../domain/payment";
import type { PaymentStatus } from "../types";
export default function DiaristWorkHistory({ model }: { model: DiaristsModel }) {
 const { selectedDiarist, selectedWorkDays, canCreate, canEdit, canDelete, openWorkModal, updatePaymentStatus, deleteWorkDay } = model;
 return (<>
        <section className="table-panel">
          <div className="diarist-detail-header">
            <div>
              <h2>{selectedDiarist ? selectedDiarist.name : "Histórico de trabalho"}</h2>
              <p>{selectedDiarist ? `${selectedDiarist.role} · ${selectedDiarist.paymentMethod} · ${selectedDiarist.pixKey || "sem chave PIX"}` : "Selecione uma diarista para ver os dias trabalhados."}</p>
            </div>
            {selectedDiarist && (canCreate || canEdit) ? <button className="btn btn-secondary" type="button" onClick={() => openWorkModal(selectedDiarist)}><Plus size={16} /> Lançar dia</button> : null}
          </div>

          <div className="workday-list">
            {selectedWorkDays.map((workDay) => (
              <div className="workday-item" key={workDay.id}>
                <div><strong>{formatDate(workDay.date)}</strong><small>{workDay.role}</small></div>
                <div><strong>{formatCurrency(Number(workDay.dailyRate || 0))}</strong><small>{workDay.notes || "Sem observação"}</small></div>
                <select value={workDay.paymentStatus} disabled={!canEdit} onChange={(event) => updatePaymentStatus(workDay, event.target.value as PaymentStatus)}>
                  <option value="pending">Pendente</option>
                  <option value="paid">Pago</option>
                  <option value="canceled">Cancelado</option>
                </select>
                <div className="diarist-actions">
                  <span className={`badge ${paymentBadgeClass(workDay.paymentStatus)}`}>{paymentLabel(workDay.paymentStatus)}</span>
                  {canDelete ? <button className="icon-button danger" type="button" onClick={() => deleteWorkDay(workDay)}><Trash2 size={15} /></button> : null}
                </div>
              </div>
            ))}
            {selectedDiarist && !selectedWorkDays.length ? <p className="muted">Ainda não há dias trabalhados lançados para essa diarista.</p> : null}
            {!selectedDiarist ? <p className="muted">Cadastre ou selecione uma diarista para começar o controle.</p> : null}
          </div>
        </section>
</>);
}
