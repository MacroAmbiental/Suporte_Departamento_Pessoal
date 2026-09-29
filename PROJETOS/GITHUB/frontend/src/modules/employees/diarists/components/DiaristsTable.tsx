import type { DiaristsModel } from "../hooks/useDiarists";
import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/utils/format";
export default function DiaristsTable({ model }: { model: DiaristsModel }) {
 const { filteredDiarists, workDays, selectedDiarist, setSelectedDiaristId, openWorkModal, canEdit, canDelete, openEditDiarist, deleteDiarist } = model;
 return (<>
        <section className="table-panel">
          <div className="section-heading">
            <div>
              <h2>Cadastro de diaristas</h2>
              <p>Dados ficam guardados para lançar novos dias quando a pessoa voltar a trabalhar.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Função</th>
                  <th>Diária</th>
                  <th>Status</th>
                  <th>Dias</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredDiarists.map((diarist) => {
                  const days = workDays.filter((day) => day.diaristId === diarist.id && day.paymentStatus !== "canceled");
                  const pending = days.filter((day) => day.paymentStatus === "pending").reduce((sum, day) => sum + Number(day.dailyRate || 0), 0);
                  return (
                    <tr key={diarist.id} onClick={() => setSelectedDiaristId(diarist.id)} className={selectedDiarist?.id === diarist.id ? "is-selected" : ""}>
                      <td className="diarist-name-cell"><strong>{diarist.name}</strong><span>{diarist.cpf} · {diarist.phone || "sem telefone"}</span></td>
                      <td>{diarist.role}</td>
                      <td>{formatCurrency(Number(diarist.dailyRate || 0))}</td>
                      <td><span className={`badge ${diarist.status === "active" ? "badge-success" : "badge-danger"}`}>{diarist.status === "active" ? "Ativa" : "Inativa"}</span></td>
                      <td>{days.length}<br /><small>Pendente: {formatCurrency(pending)}</small></td>
                      <td>
                        <div className="diarist-actions">
                          <button className="icon-button" type="button" title="Lançar dia trabalhado" onClick={(event) => { event.stopPropagation(); openWorkModal(diarist); }}><CalendarDays size={16} /></button>
                          {canEdit ? <button className="icon-button" type="button" title="Editar" onClick={(event) => { event.stopPropagation(); openEditDiarist(diarist); }}><Pencil size={16} /></button> : null}
                          {canDelete ? <button className="icon-button danger" type="button" title="Excluir" onClick={(event) => { event.stopPropagation(); deleteDiarist(diarist); }}><Trash2 size={16} /></button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filteredDiarists.length ? <tr><td colSpan={6}>Nenhuma diarista cadastrada.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
</>);
}
