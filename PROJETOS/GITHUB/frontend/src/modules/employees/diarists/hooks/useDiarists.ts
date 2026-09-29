import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/utils/format";
import type { DeleteImpact } from "@/common/components/DeleteImpactModal";
import type { Diarist, DiaristForm, DiaristStatus, DiaristWorkDay, PaymentStatus, WorkForm } from "../types";
import { emptyDiaristForm, emptyWorkForm } from "../constants";
import { dateRange } from "../domain/dates";
import { filterDiarists } from "../domain/search";
import { summarize } from "../domain/payment";
import { changePaymentStatus, createWorkDays } from "../domain/workDays";
import { diaristsRepository } from "../services/diaristsRepository";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type DeleteRequest = { title: string; impact: DeleteImpact; onConfirm: () => void };

export function useDiarists() {
  const { can } = useAuth();
  const canCreate = can("employees", "create");
  const canEdit = can("employees", "edit");
  const canDelete = can("employees", "delete");
  const [diarists, setDiarists] = useState<Diarist[]>(diaristsRepository.loadDiarists);
  const [workDays, setWorkDays] = useState<DiaristWorkDay[]>(diaristsRepository.loadWorkDays);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DiaristStatus>("all");
  const [selectedDiaristId, setSelectedDiaristId] = useState("");
  const [diaristModalOpen, setDiaristModalOpen] = useState(false);
  const [workModalOpen, setWorkModalOpen] = useState(false);
  const [editingDiaristId, setEditingDiaristId] = useState<string | null>(null);
  const [diaristForm, setDiaristForm] = useState<DiaristForm>(emptyDiaristForm);
  const [workForm, setWorkForm] = useState<WorkForm>(emptyWorkForm);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);

  const persistDiarists = (next: Diarist[]) => { diaristsRepository.saveDiarists(next); setDiarists(next); };
  const persistWorkDays = (next: DiaristWorkDay[]) => { diaristsRepository.saveWorkDays(next); setWorkDays(next); };
  const filteredDiarists = useMemo(() => filterDiarists(diarists, search, statusFilter), [diarists, search, statusFilter]);
  const selectedDiarist = diarists.find(item => item.id === selectedDiaristId) || filteredDiarists[0];
  const selectedWorkDays = useMemo(() => workDays.filter(day => day.diaristId === selectedDiarist?.id).sort((a, b) => b.date.localeCompare(a.date)), [workDays, selectedDiarist?.id]);
  const summary = useMemo(() => summarize(diarists, workDays), [diarists, workDays]);

  function openNewDiarist() {
    if (!canCreate) return;
    setEditingDiaristId(null); setDiaristForm(emptyDiaristForm); setDiaristModalOpen(true);
  }
  function openEditDiarist(diarist: Diarist) {
    if (!canEdit) return;
    setEditingDiaristId(diarist.id);
    setDiaristForm({ name: diarist.name, cpf: diarist.cpf, phone: diarist.phone, role: diarist.role,
      dailyRate: diarist.dailyRate, paymentMethod: diarist.paymentMethod, pixKey: diarist.pixKey,
      status: diarist.status, companyOrTeam: diarist.companyOrTeam || "", workplace: diarist.workplace || "", notes: diarist.notes });
    setDiaristModalOpen(true);
  }
  function openWorkModal(diarist?: Diarist) {
    if (!canCreate && !canEdit) return;
    const target = diarist || selectedDiarist || diarists[0];
    setWorkForm({ ...emptyWorkForm, diaristId: target?.id || "", role: target?.role || "", dailyRate: Number(target?.dailyRate || 0) });
    setWorkModalOpen(true);
  }
  function saveDiarist() {
    if (editingDiaristId ? !canEdit : !canCreate) return;
    if (!diaristForm.name.trim() || !diaristForm.cpf.trim() || !diaristForm.role.trim()) {
      window.alert("Informe nome, CPF e função da diarista."); return;
    }
    const now = new Date().toISOString();
    if (editingDiaristId) {
      persistDiarists(diarists.map(item => item.id === editingDiaristId ? { ...item, ...diaristForm, dailyRate: Number(diaristForm.dailyRate || 0), updatedAt: now } : item));
    } else {
      const next: Diarist = { id: createId("diarist"), ...diaristForm, dailyRate: Number(diaristForm.dailyRate || 0), createdAt: now, updatedAt: now };
      persistDiarists([...diarists, next]); setSelectedDiaristId(next.id);
    }
    setDiaristModalOpen(false);
  }
  function saveWorkDays() {
    if (!canCreate && !canEdit) return;
    if (!workForm.diaristId) { window.alert("Selecione a diarista."); return; }
    if (!dateRange(workForm.startDate, workForm.mode === "fixed-period" ? workForm.endDate : workForm.startDate).length) {
      window.alert("Confira o período informado."); return;
    }
    const created = createWorkDays(workForm, workDays, createId);
    if (!created.length) { window.alert("Todos os dias desse período já estavam lançados para essa diarista."); return; }
    persistWorkDays([...workDays, ...created]); setSelectedDiaristId(workForm.diaristId); setWorkModalOpen(false);
  }
  function updatePaymentStatus(workDay: DiaristWorkDay, status: PaymentStatus) {
    if (!canEdit) return;
    persistWorkDays(workDays.map(day => day.id === workDay.id ? changePaymentStatus(day, status) : day));
  }
  function deleteDiarist(diarist: Diarist) {
    if (!canDelete) return;
    const linkedDays = workDays.filter(day => day.diaristId === diarist.id);
    const pendingDays = linkedDays.filter(day => day.paymentStatus === "pending").length;
    setDeleteRequest({ title: "Excluir diarista", impact: {
      entityType: "diarista", entityLabel: diarist.name,
      reasons: [linkedDays.length ? "A diarista possui dias trabalhados lançados no controle." : "O cadastro faz parte do histórico de diaristas."],
      links: [{ label: "Dias trabalhados", count: linkedDays.length }, { label: "Pagamentos pendentes", count: pendingDays }],
      consequences: ["O cadastro da diarista será removido.", linkedDays.length ? "Todos os lançamentos de dias trabalhados desta diarista também serão excluídos." : "Nenhum lançamento de diária será alterado.", pendingDays ? "Os pagamentos pendentes vinculados deixarão de aparecer no controle." : "Não há pagamentos pendentes vinculados."],
      note: linkedDays.length ? "Considere inativar a diarista quando precisar preservar o histórico." : undefined,
    }, onConfirm: () => { persistDiarists(diarists.filter(item => item.id !== diarist.id)); persistWorkDays(workDays.filter(day => day.diaristId !== diarist.id)); if (selectedDiaristId === diarist.id) setSelectedDiaristId(""); } });
  }
  function deleteWorkDay(workDay: DiaristWorkDay) {
    if (!canDelete) return;
    const diarist = diarists.find(item => item.id === workDay.diaristId);
    setDeleteRequest({ title: "Excluir dia trabalhado", impact: {
      entityType: "lançamento de diária", entityLabel: `${diarist?.name || "Diarista"} · ${formatDate(workDay.date)}`,
      reasons: ["O lançamento compõe o histórico e o valor a pagar da diarista."],
      links: [{ label: "Diarista vinculada", count: diarist ? 1 : 0 }, { label: "Pagamento pendente", count: workDay.paymentStatus === "pending" ? 1 : 0 }],
      consequences: ["O dia trabalhado será removido do histórico.", "O valor desta diária deixará de compor os totais e exportações."],
    }, onConfirm: () => persistWorkDays(workDays.filter(day => day.id !== workDay.id)) });
  }
  return { diarists, workDays, search, setSearch, statusFilter, setStatusFilter, selectedDiarist, setSelectedDiaristId,
    filteredDiarists, selectedWorkDays, summary, canCreate, canEdit, canDelete, diaristModalOpen, setDiaristModalOpen,
    workModalOpen, setWorkModalOpen, editingDiaristId, diaristForm, setDiaristForm, workForm, setWorkForm,
    deleteRequest, setDeleteRequest, openNewDiarist, openEditDiarist, openWorkModal, saveDiarist, saveWorkDays,
    updatePaymentStatus, deleteDiarist, deleteWorkDay };
}
export type DiaristsModel = ReturnType<typeof useDiarists>;
