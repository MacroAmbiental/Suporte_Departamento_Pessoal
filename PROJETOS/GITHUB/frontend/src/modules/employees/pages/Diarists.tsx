import ModalPortal from "@/modules/shared/ModalPortal";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import DeleteImpactModal, { type DeleteImpact } from "@/common/components/DeleteImpactModal";
import { formatCurrency, formatDate, todayISO } from "@/utils/format";

type DiaristStatus = "active" | "inactive";
type PaymentStatus = "pending" | "paid" | "canceled";

type Diarist = {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  role: string;
  dailyRate: number;
  paymentMethod: string;
  pixKey: string;
  status: DiaristStatus;
  companyOrTeam: string;
  workplace: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type DiaristWorkDay = {
  id: string;
  diaristId: string;
  date: string;
  role: string;
  dailyRate: number;
  paymentStatus: PaymentStatus;
  paidAt: string;
  hiringType: "single" | "fixed-period" | "open-period";
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type DiaristForm = Omit<Diarist, "id" | "createdAt" | "updatedAt">;

type WorkForm = {
  diaristId: string;
  mode: "single" | "fixed-period" | "open-period";
  startDate: string;
  endDate: string;
  role: string;
  dailyRate: number;
  paymentStatus: PaymentStatus;
  notes: string;
};

const DIARISTS_KEY = "macro_diarists_registry_v1";
const WORK_DAYS_KEY = "macro_diarists_work_days_v1";

const emptyDiaristForm: DiaristForm = {
  name: "",
  cpf: "",
  phone: "",
  role: "",
  dailyRate: 0,
  paymentMethod: "PIX",
  pixKey: "",
  status: "active",
  companyOrTeam: "",
  workplace: "",
  notes: "",
};

const emptyWorkForm: WorkForm = {
  diaristId: "",
  mode: "single",
  startDate: todayISO(),
  endDate: todayISO(),
  role: "",
  dailyRate: 0,
  paymentStatus: "pending",
  notes: "",
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateRange(startDate: string, endDate: string) {
  const start = parseDate(startDate);
  const end = parseDate(endDate || startDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(toISO(cursor));
  }
  return dates;
}

function paymentLabel(status: PaymentStatus) {
  if (status === "paid") return "Pago";
  if (status === "canceled") return "Cancelado";
  return "Pendente";
}

function paymentBadgeClass(status: PaymentStatus) {
  if (status === "paid") return "badge-success";
  if (status === "canceled") return "badge-danger";
  return "badge-warning";
}

export default function Diarists() {
  const { can } = useAuth();
  const canCreate = can("employees", "create");
  const canEdit = can("employees", "edit");
  const canDelete = can("employees", "delete");

  const [diarists, setDiarists] = useState<Diarist[]>(() => readStorage<Diarist[]>(DIARISTS_KEY, []));
  const [workDays, setWorkDays] = useState<DiaristWorkDay[]>(() => readStorage<DiaristWorkDay[]>(WORK_DAYS_KEY, []));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DiaristStatus>("all");
  const [selectedDiaristId, setSelectedDiaristId] = useState<string>("");
  const [diaristModalOpen, setDiaristModalOpen] = useState(false);
  const [workModalOpen, setWorkModalOpen] = useState(false);
  const [editingDiaristId, setEditingDiaristId] = useState<string | null>(null);
  const [diaristForm, setDiaristForm] = useState<DiaristForm>(emptyDiaristForm);
  const [workForm, setWorkForm] = useState<WorkForm>(emptyWorkForm);
  const [deleteRequest, setDeleteRequest] = useState<{ title: string; impact: DeleteImpact; onConfirm: () => void } | null>(null);

  function persistDiarists(next: Diarist[]) {
    setDiarists(next);
    writeStorage(DIARISTS_KEY, next);
  }

  function persistWorkDays(next: DiaristWorkDay[]) {
    setWorkDays(next);
    writeStorage(WORK_DAYS_KEY, next);
  }

  const filteredDiarists = useMemo(() => {
    const query = normalize(search);
    return diarists
      .filter((diarist) => statusFilter === "all" || diarist.status === statusFilter)
      .filter((diarist) => {
        if (!query) return true;
        return normalize(`${diarist.name} ${diarist.cpf} ${diarist.phone} ${diarist.role} ${diarist.pixKey}`).includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [diarists, search, statusFilter]);

  const selectedDiarist = diarists.find((diarist) => diarist.id === selectedDiaristId) || filteredDiarists[0];
  const selectedWorkDays = useMemo(() => {
    if (!selectedDiarist) return [];
    return workDays
      .filter((day) => day.diaristId === selectedDiarist.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedDiarist, workDays]);

  const summary = useMemo(() => {
    const activeCount = diarists.filter((diarist) => diarist.status === "active").length;
    const paidTotal = workDays.filter((day) => day.paymentStatus === "paid").reduce((sum, day) => sum + Number(day.dailyRate || 0), 0);
    const pendingTotal = workDays.filter((day) => day.paymentStatus === "pending").reduce((sum, day) => sum + Number(day.dailyRate || 0), 0);
    const currentMonth = todayISO().slice(0, 7);
    const monthDays = workDays.filter((day) => day.date.startsWith(currentMonth) && day.paymentStatus !== "canceled").length;
    return { activeCount, paidTotal, pendingTotal, monthDays };
  }, [diarists, workDays]);

  function openNewDiarist() {
    if (!canCreate) return;
    setEditingDiaristId(null);
    setDiaristForm(emptyDiaristForm);
    setDiaristModalOpen(true);
  }

  function openEditDiarist(diarist: Diarist) {
    if (!canEdit) return;
    setEditingDiaristId(diarist.id);
    setDiaristForm({
      name: diarist.name,
      cpf: diarist.cpf,
      phone: diarist.phone,
      role: diarist.role,
      dailyRate: diarist.dailyRate,
      paymentMethod: diarist.paymentMethod,
      pixKey: diarist.pixKey,
      status: diarist.status,
      companyOrTeam: diarist.companyOrTeam || "",
      workplace: diarist.workplace || "",
      notes: diarist.notes,
    });
    setDiaristModalOpen(true);
  }

  function openWorkModal(diarist?: Diarist) {
    if (!canCreate && !canEdit) return;
    const target = diarist || selectedDiarist || diarists[0];
    setWorkForm({
      ...emptyWorkForm,
      diaristId: target?.id || "",
      role: target?.role || "",
      dailyRate: Number(target?.dailyRate || 0),
    });
    setWorkModalOpen(true);
  }

  function submitDiarist(event: FormEvent) {
    event.preventDefault();
    if (!diaristForm.name.trim() || !diaristForm.cpf.trim() || !diaristForm.role.trim()) {
      window.alert("Informe nome, CPF e função da diarista.");
      return;
    }
    const now = new Date().toISOString();
    if (editingDiaristId) {
      persistDiarists(diarists.map((diarist) => diarist.id === editingDiaristId ? { ...diarist, ...diaristForm, dailyRate: Number(diaristForm.dailyRate || 0), updatedAt: now } : diarist));
    } else {
      const next: Diarist = {
        id: createId("diarist"),
        ...diaristForm,
        dailyRate: Number(diaristForm.dailyRate || 0),
        createdAt: now,
        updatedAt: now,
      };
      persistDiarists([...diarists, next]);
      setSelectedDiaristId(next.id);
    }
    setDiaristModalOpen(false);
  }

  function submitWorkDays(event: FormEvent) {
    event.preventDefault();
    if (!workForm.diaristId) {
      window.alert("Selecione a diarista.");
      return;
    }
    const dates = dateRange(workForm.startDate, workForm.mode === "fixed-period" ? workForm.endDate : workForm.startDate);
    if (!dates.length) {
      window.alert("Confira o período informado.");
      return;
    }
    const now = new Date().toISOString();
    const existingKeys = new Set(workDays.map((day) => `${day.diaristId}|${day.date}`));
    const created = dates
      .filter((date) => !existingKeys.has(`${workForm.diaristId}|${date}`))
      .map((date) => ({
        id: createId("work"),
        diaristId: workForm.diaristId,
        date,
        role: workForm.role,
        dailyRate: Number(workForm.dailyRate || 0),
        paymentStatus: workForm.paymentStatus,
        paidAt: workForm.paymentStatus === "paid" ? todayISO() : "",
        hiringType: workForm.mode,
        notes: workForm.mode === "open-period" ? `${workForm.notes || ""}${workForm.notes ? " · " : ""}Período sem data final definida.` : workForm.notes,
        createdAt: now,
        updatedAt: now,
      } satisfies DiaristWorkDay));

    if (!created.length) {
      window.alert("Todos os dias desse período já estavam lançados para essa diarista.");
      return;
    }
    persistWorkDays([...workDays, ...created]);
    setSelectedDiaristId(workForm.diaristId);
    setWorkModalOpen(false);
  }

  function updatePaymentStatus(workDay: DiaristWorkDay, status: PaymentStatus) {
    if (!canEdit) return;
    persistWorkDays(workDays.map((day) => day.id === workDay.id ? {
      ...day,
      paymentStatus: status,
      paidAt: status === "paid" ? todayISO() : "",
      updatedAt: new Date().toISOString(),
    } : day));
  }

  function deleteDiarist(diarist: Diarist) {
    if (!canDelete) return;
    const linkedDays = workDays.filter((day) => day.diaristId === diarist.id);
    const pendingDays = linkedDays.filter((day) => day.paymentStatus === "pending").length;
    setDeleteRequest({
      title: "Excluir diarista",
      impact: {
        entityType: "diarista",
        entityLabel: diarist.name,
        reasons: [linkedDays.length ? "A diarista possui dias trabalhados lançados no controle." : "O cadastro faz parte do histórico de diaristas."],
        links: [
          { label: "Dias trabalhados", count: linkedDays.length },
          { label: "Pagamentos pendentes", count: pendingDays },
        ],
        consequences: [
          "O cadastro da diarista será removido.",
          linkedDays.length ? "Todos os lançamentos de dias trabalhados desta diarista também serão excluídos." : "Nenhum lançamento de diária será alterado.",
          pendingDays ? "Os pagamentos pendentes vinculados deixarão de aparecer no controle." : "Não há pagamentos pendentes vinculados.",
        ],
        note: linkedDays.length ? "Considere inativar a diarista quando precisar preservar o histórico." : undefined,
      },
      onConfirm: () => {
        persistDiarists(diarists.filter((item) => item.id !== diarist.id));
        persistWorkDays(workDays.filter((day) => day.diaristId !== diarist.id));
        if (selectedDiaristId === diarist.id) setSelectedDiaristId("");
      },
    });
  }

  function deleteWorkDay(workDay: DiaristWorkDay) {
    if (!canDelete) return;
    const diarist = diarists.find((item) => item.id === workDay.diaristId);
    setDeleteRequest({
      title: "Excluir dia trabalhado",
      impact: {
        entityType: "lançamento de diária",
        entityLabel: `${diarist?.name || "Diarista"} · ${formatDate(workDay.date)}`,
        reasons: ["O lançamento compõe o histórico e o valor a pagar da diarista."],
        links: [
          { label: "Diarista vinculada", count: diarist ? 1 : 0 },
          { label: "Pagamento pendente", count: workDay.paymentStatus === "pending" ? 1 : 0 },
        ],
        consequences: ["O dia trabalhado será removido do histórico.", "O valor desta diária deixará de compor os totais e exportações."],
      },
      onConfirm: () => {
        persistWorkDays(workDays.filter((day) => day.id !== workDay.id));
      },
    });
  }

  async function exportDiarists() {
    const rows = workDays.map((day) => {
      const diarist = diarists.find((item) => item.id === day.diaristId);
      return {
        Diarista: diarist?.name || "",
        CPF: diarist?.cpf || "",
        Telefone: diarist?.phone || "",
        Função: day.role || diarist?.role || "",
        Data: formatDate(day.date),
        "Valor da diária": Number(day.dailyRate || 0),
        Pagamento: paymentLabel(day.paymentStatus),
        "Forma de pagamento": diarist?.paymentMethod || "",
        "Chave PIX": diarist?.pixKey || "",
        Observações: day.notes || "",
      };
    });
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: "Nenhum lançamento de diarista cadastrado." }]);
    worksheet["!cols"] = [
      { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 12 },
      { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Diaristas");
    XLSX.writeFile(workbook, `controle-diaristas-${todayISO()}.xlsx`);
  }

  return (
    <>
      <style>{`
        .diarist-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 14px; margin-bottom: 18px; }
        .diarist-card { background: #fff; border: 1px solid #d9e4ef; border-radius: 18px; padding: 18px; box-shadow: 0 14px 35px rgba(15, 35, 60, 0.06); }
        .diarist-card span { display: block; color: #64748b; font-size: 13px; margin-bottom: 8px; }
        .diarist-card strong { color: #08294d; font-size: 24px; }
        .diarist-layout { display: grid; grid-template-columns: minmax(420px, 1.1fr) minmax(420px, 0.9fr); gap: 18px; align-items: start; }
        .diarist-name-cell strong { display: block; color: #0b2443; }
        .diarist-name-cell span { display: block; color: #64748b; font-size: 12px; margin-top: 3px; }
        .diarist-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
        .diarist-detail-header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
        .diarist-detail-header h2 { margin: 0; color: #08294d; }
        .diarist-detail-header p { margin: 5px 0 0; color: #64748b; }
        .workday-list { display: grid; gap: 10px; }
        .workday-item { display: grid; grid-template-columns: 100px 1fr 120px auto; gap: 12px; align-items: center; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; background: #f8fbff; }
        .workday-item strong { color: #0b2443; }
        .workday-item small { color: #64748b; display: block; margin-top: 2px; }
        .badge-warning { background: #fff7d6; color: #9a6700; border-color: #f3c951; }
        .badge-success { background: #dff7ea; color: #047857; border-color: #8bd8ae; }
        .badge-danger { background: #ffe4e6; color: #be123c; border-color: #f5a4af; }
        @media (max-width: 1100px) { .diarist-summary-grid, .diarist-layout { grid-template-columns: 1fr; } .workday-item { grid-template-columns: 1fr; } }
      `}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Diaristas</h1>
          <p className="page-subtitle">Controle separado de pessoas que trabalham eventualmente, sem folha de ponto, login, benefícios ou jornada fixa.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" type="button" onClick={exportDiarists}>
            <Download size={17} /> Exportar Excel
          </button>
          {canCreate ? (
            <button className="btn btn-primary" type="button" onClick={openNewDiarist}>
              <UserPlus size={17} /> Nova diarista
            </button>
          ) : null}
        </div>
      </div>

      <div className="diarist-summary-grid">
        <div className="diarist-card"><span>Diaristas ativas</span><strong>{summary.activeCount}</strong></div>
        <div className="diarist-card"><span>Dias trabalhados no mês</span><strong>{summary.monthDays}</strong></div>
        <div className="diarist-card"><span>Valor pendente</span><strong>{formatCurrency(summary.pendingTotal)}</strong></div>
        <div className="diarist-card"><span>Valor pago</span><strong>{formatCurrency(summary.paidTotal)}</strong></div>
      </div>

      <div className="filters-panel">
        <Search size={18} />
        <label className="field">
          Buscar
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, CPF, telefone, função ou PIX" />
        </label>
        <label className="field">
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | DiaristStatus)}>
            <option value="all">Todas</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </select>
        </label>
      </div>

      <div className="diarist-layout">
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
      </div>

      {diaristModalOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={submitDiarist}>
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

      {deleteRequest ? (
        <DeleteImpactModal
          title={deleteRequest.title}
          impact={deleteRequest.impact}
          onCancel={() => setDeleteRequest(null)}
          onConfirm={() => {
            deleteRequest.onConfirm();
            setDeleteRequest(null);
          }}
        />
      ) : null}

      {workModalOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={submitWorkDays}>
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
    </>
  );
}
