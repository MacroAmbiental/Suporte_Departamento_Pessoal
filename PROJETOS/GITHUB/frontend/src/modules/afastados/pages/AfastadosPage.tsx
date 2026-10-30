import { useMemo, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import ConfirmModal from "@/common/components/ConfirmModal";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { licenseReasons } from "@/modules/hrControl/constants/absences";
import {
  LEAVE_PERIODS_FIELD,
  employeeLeaveEntries,
  readLeavePeriods,
  type LeaveEntry,
  type LeavePeriod,
} from "@/modules/employeeProcesses/utils/leavePeriods";
import ModalPortal from "@/modules/shared/ModalPortal";
import type { Employee } from "@/types/domain";
import { createId, formatDate, todayISO } from "@/utils/format";
import { justificativaDoTipo, sincronizarAfastamentoSecullum } from "../data/afastamentosSecullum";
import AfastadosSecullum from "./AfastadosSecullum";
import "./afastados.css";

// Tipos lançados aqui. Os nomes de INSS são os mesmos de Processos: Férias
// reconhece o afastamento previdenciário pelo começo do nome.
const periodTypes: { label: string; kind: LeavePeriod["kind"]; group: string }[] = [
  { label: "Incapacidade Temporária", kind: "leave", group: "INSS" },
  { label: "Incapacidade Temporária acidentário", kind: "leave", group: "INSS" },
  { label: "Afastamento por invalidez", kind: "leave", group: "INSS" },
  { label: "Atestado médico", kind: "certificate", group: "Atestado" },
  // Afastamento que não é INSS (ex.: internação, afastamento por decisão da empresa); no Secullum é AFASTOU.
  { label: "Outro afastamento", kind: "leave", group: "Outros" },
  ...licenseReasons.map((label) => ({ label, kind: "license" as const, group: "Licença" })),
];

const kindLabels: Record<LeaveEntry["kind"], string> = {
  leave: "Afastamento",
  license: "Licença",
  certificate: "Atestado",
  suspension: "Suspensão",
};

type Situation = "current" | "active" | "upcoming" | "ended" | "all";

const situationOptions: { value: Situation; label: string }[] = [
  { value: "current", label: "Em andamento e próximos" },
  { value: "active", label: "Em andamento" },
  { value: "upcoming", label: "Próximos" },
  { value: "ended", label: "Encerrados" },
  { value: "all", label: "Todos" },
];

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const cpfOf = (employee: Employee) => {
  const cpf = (employee.cpf || "").replace(/\D/g, "");
  return cpf.length === 11 ? cpf : "";
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function matchesSituation(entry: LeaveEntry, situation: Situation, today: string) {
  if (situation === "all") return true;
  if (situation === "ended") return entry.end < today;
  if (situation === "active") return entry.start <= today && today <= entry.end;
  if (situation === "upcoming") return entry.start > today;
  return entry.end >= today;
}

type PeriodForm = { employeeId: string; employeeSearch: string; label: string; start: string; end: string; reason: string; cid: string };

const emptyForm = (today: string): PeriodForm => ({ employeeId: "", employeeSearch: "", label: periodTypes[0].label, start: today, end: today, reason: "", cid: "" });

export default function AfastadosPage() {
  const data = useDomainData();
  const { user, can } = useAuth();
  const canEdit = can("afastados", "edit") || can("afastados", "create");
  const today = todayISO();
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [situation, setSituation] = useState<Situation>("current");
  const [search, setSearch] = useState("");
  const [closingLeaveByKey, setClosingLeaveByKey] = useState<Record<string, string>>({});
  const [closingBusyByKey, setClosingBusyByKey] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<PeriodForm | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<{ employee: Employee; entry: LeaveEntry } | null>(null);
  const [pageError, setPageError] = useState("");
  const [sendingId, setSendingId] = useState("");

  const companyName = useMemo(() => new Map(data.companies.map((company) => [company.id, company.name])), [data.companies]);
  const activeEmployees = useMemo(
    () => data.employees.filter((employee) => employee.status !== "terminated").sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [data.employees],
  );

  const employeesWithLeaves = useMemo(() => {
    const term = normalize(search.trim());
    return data.employees
      .filter((employee) => selectedGroup === "all" || companyName.get(employee.companyId) === selectedGroup)
      .filter((employee) => !term || normalize(employee.name).includes(term))
      .map((employee) => ({
        employee,
        entries: employeeLeaveEntries(employee).filter((entry) => matchesSituation(entry, situation, today)),
      }))
      .filter((item) => item.entries.length > 0)
      .sort((left, right) => left.employee.name.localeCompare(right.employee.name, "pt-BR"));
  }, [data.employees, selectedGroup, companyName, search, situation, today]);

  const groups = useMemo(() => [
    { value: "all", label: "Todas" },
    ...Array.from(new Set(data.companies.map((company) => company.name))).map((name) => ({ value: name, label: name })),
  ], [data.companies]);

  async function saveEmployeePeriods(employee: Employee, periods: LeavePeriod[]) {
    const registrationData = { ...(employee.registrationData || {}) };
    if (periods.length) registrationData[LEAVE_PERIODS_FIELD] = JSON.stringify(periods);
    else delete registrationData[LEAVE_PERIODS_FIELD];
    await data.upsertEmployee({ ...employee, registrationData, updatedAt: new Date().toISOString() });
  }

  async function closeLeave(employee: Employee, entry: LeaveEntry) {
    const key = `${employee.id}:${entry.periodId || entry.kind}:${entry.start}`;
    const nextDate = closingLeaveByKey[key] || today;
    if (nextDate < entry.start || nextDate > entry.end) return;
    setClosingBusyByKey((current) => ({ ...current, [key]: true }));
    try {
      if (entry.periodId) {
        const now = new Date().toISOString();
        const period = readLeavePeriods(employee).find((item) => item.id === entry.periodId);
        if (period?.secullum === "lancado" && nextDate !== period.end) {
          await sincronizarAfastamentoSecullum(user?.id, {
            acao: "alterar", cpf: cpfOf(employee), inicio: period.start, fim: period.end, novoFim: nextDate,
            justificativa: justificativaDoTipo(period.kind, period.label), motivo: period.reason,
          });
        }
        await saveEmployeePeriods(employee, readLeavePeriods(employee).map((item) => (
          item.id === entry.periodId ? { ...item, end: nextDate, updatedAt: now } : item
        )));
      } else {
        // Afastamento antigo lançado em Processos (um campo por tipo no cadastro).
        const registrationData = { ...(employee.registrationData || {}) };
        if (entry.kind === "suspension") registrationData.suspensionEndDate = nextDate;
        if (entry.kind === "leave") registrationData.leaveEndDate = nextDate;
        if (entry.kind === "license") registrationData.licenseEndDate = nextDate;
        await data.upsertEmployee({ ...employee, registrationData, updatedAt: new Date().toISOString() });
      }
      setClosingLeaveByKey((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } catch (error) {
      setPageError(`Não foi possível encerrar: ${errorText(error)}`);
    } finally {
      setClosingBusyByKey((current) => ({ ...current, [key]: false }));
    }
  }

  async function deletePeriod() {
    if (!deleting?.entry.periodId) return;
    const { employee, entry } = deleting;
    setDeleting(null);
    setPageError("");
    try {
      const period = readLeavePeriods(employee).find((item) => item.id === entry.periodId);
      if (period?.secullum === "lancado") {
        await sincronizarAfastamentoSecullum(user?.id, {
          acao: "apagar", cpf: cpfOf(employee), inicio: period.start, fim: period.end,
          justificativa: justificativaDoTipo(period.kind, period.label),
        });
      }
      await saveEmployeePeriods(employee, readLeavePeriods(employee).filter((item) => item.id !== entry.periodId));
    } catch (error) {
      setPageError(`Não foi possível excluir: ${errorText(error)}`);
    }
  }

  // Período que ficou só no DP (ex.: o Secullum recusou na hora e o DP salvou depois).
  async function sendPeriod(employee: Employee, entry: LeaveEntry) {
    const period = readLeavePeriods(employee).find((item) => item.id === entry.periodId);
    if (!period || sendingId) return;
    setSendingId(period.id);
    setPageError("");
    try {
      await sincronizarAfastamentoSecullum(user?.id, {
        acao: "lancar", cpf: cpfOf(employee), inicio: period.start, fim: period.end,
        justificativa: justificativaDoTipo(period.kind, period.label), motivo: period.reason,
      });
      await saveEmployeePeriods(employee, readLeavePeriods(employee).map((item) => (
        item.id === period.id ? { ...item, secullum: "lancado" as const, updatedAt: new Date().toISOString() } : item
      )));
    } catch (error) {
      setPageError(`Não foi possível enviar ao Secullum: ${errorText(error)}`);
    } finally {
      setSendingId("");
    }
  }

  function pickEmployee(text: string) {
    const match = activeEmployees.find((employee) => employeeOptionLabel(employee) === text);
    setForm((current) => current && { ...current, employeeSearch: text, employeeId: match?.id || "" });
  }

  function employeeOptionLabel(employee: Employee) {
    return `${employee.name} · ${employee.role || employee.position || "sem função"}`;
  }

  // Mesmas regras para o cadastro manual e para o que vem do Secullum.
  async function addPeriod(employee: Employee, type: (typeof periodTypes)[number], start: string, end: string, reason: string, cid = "", origin?: "secullum") {
    if (!start || !end || end < start) throw new Error("Informe um período válido (o fim não pode ser antes do início).");
    if (employee.admissionDate && start < employee.admissionDate) throw new Error("O período não pode começar antes da admissão.");
    const overlap = employeeLeaveEntries(employee).find((entry) => entry.start <= end && start <= entry.end);
    if (overlap) throw new Error(`${employee.name} já tem ${overlap.label} de ${formatDate(overlap.start)} a ${formatDate(overlap.end)}, que cruza com esse período.`);
    // O Secullum vem antes: se recusar, nada é gravado no DP. O que veio de lá
    // (Importar) já está lançado; funcionário sem CPF não existe no Secullum.
    const cpf = cpfOf(employee);
    if (cpf && origin !== "secullum") {
      await sincronizarAfastamentoSecullum(user?.id, {
        acao: "lancar", cpf, inicio: start, fim: end,
        justificativa: justificativaDoTipo(type.kind, type.label), motivo: reason.trim(),
      });
    }
    const now = new Date().toISOString();
    const period: LeavePeriod = {
      id: createId("leave"),
      kind: type.kind,
      label: type.label,
      start,
      end,
      reason: reason.trim(),
      ...(type.kind === "certificate" && cid.trim() ? { cid: cid.trim().toUpperCase() } : {}),
      ...(origin ? { origin } : {}),
      secullum: cpf ? "lancado" : "sem-cpf",
      createdAt: now,
      createdBy: user?.name || user?.username || "",
      updatedAt: now,
    };
    await saveEmployeePeriods(employee, [...readLeavePeriods(employee), period].sort((a, b) => a.start.localeCompare(b.start)));
  }

  async function submitPeriod() {
    if (!form || saving) return;
    const employee = activeEmployees.find((item) => item.id === form.employeeId);
    const type = periodTypes.find((item) => item.label === form.label);
    if (!employee) return setFormError("Escolha o funcionário na lista.");
    if (!type) return setFormError("Escolha o tipo.");
    setSaving(true);
    setFormError("");
    try {
      await addPeriod(employee, type, form.start, form.end, form.reason, form.cid);
      setForm(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar o afastamento.");
    } finally {
      setSaving(false);
    }
  }

  const formType = form ? periodTypes.find((item) => item.label === form.label) : undefined;

  return (
    <section className="page afastados-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Afastados</h1>
          <p className="page-subtitle">INSS, atestados de vários dias, licenças e suspensões. Os dias do período entram sozinhos no Controle de ponto.</p>
        </div>
        {canEdit ? (
          <button className="btn btn-primary" type="button" onClick={() => { setForm(emptyForm(today)); setFormError(""); }}>
            <Plus size={16} /> Novo afastamento
          </button>
        ) : null}
      </div>

      <AfastadosSecullum
        userId={user?.id}
        employees={data.employees}
        periodTypes={periodTypes}
        canEdit={canEdit}
        onImport={(employee, type, item) => addPeriod(employee, type, item.inicio, item.fim, [item.justificativa, item.motivo].filter(Boolean).join(" · "), "", "secullum")}
      />

      <div className="afastados-filters">
        <input type="search" placeholder="Buscar funcionário" value={search} onChange={(event) => setSearch(event.target.value)} />
        <label>Situação
          <select value={situation} onChange={(event) => setSituation(event.target.value as Situation)}>
            {situationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>Empresa
          <select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}>
            {groups.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
          </select>
        </label>
      </div>

      {pageError ? <p className="afastados-error">{pageError}</p> : null}

      {employeesWithLeaves.length === 0 ? (
        <div className="afastados-empty">Nenhum afastamento encontrado com esses filtros.</div>
      ) : (
        <div className="afastados-list">
          {employeesWithLeaves.map(({ employee, entries }) => (
            <div className="afastados-card" key={employee.id}>
              <div className="afastados-card-header">
                <div>
                  <strong>{employee.name}</strong>
                  <small>{employee.role || "—"} · {companyName.get(employee.companyId) || "Empresa"}{employee.status === "terminated" ? " · desligado" : ""}</small>
                </div>
                <span className="afastados-count">{entries.length} registro(s)</span>
              </div>
              {entries.map((entry) => {
                const key = `${employee.id}:${entry.periodId || entry.kind}:${entry.start}`;
                const closingDate = closingLeaveByKey[key];
                const busy = closingBusyByKey[key];
                const ongoing = entry.start <= today && today <= entry.end;
                const period = entry.periodId ? readLeavePeriods(employee).find((item) => item.id === entry.periodId) : undefined;
                const cid = period?.cid;
                return (
                  <div className={`afastados-entry is-${entry.kind}`} key={key}>
                    <div className="afastados-entry-title">
                      <strong>{entry.label}</strong>
                      <span className={`afastados-kind is-${entry.kind}`}>{kindLabels[entry.kind]}</span>
                      {ongoing ? <span className="afastados-kind is-ongoing">Em andamento</span> : null}
                      {period ? (
                        <span className={`afastados-sync ${period.secullum === "lancado" ? "is-ok" : "is-pending"}`}>
                          {period.secullum === "lancado" ? "No Secullum" : period.secullum === "sem-cpf" ? "Sem CPF (fora do Secullum)" : "Só no DP"}
                        </span>
                      ) : null}
                    </div>
                    <div className="afastados-entry-dates">{formatDate(entry.start)} até {formatDate(entry.end)}</div>
                    <div className="afastados-entry-reason">Motivo: {entry.reason || "—"}{cid ? ` · CID ${cid}` : ""}</div>
                    {canEdit ? (
                      <div className="afastados-entry-actions">
                        {closingDate !== undefined ? (
                          <>
                            <input type="date" value={closingDate} min={entry.start} max={entry.end} onChange={(event) => setClosingLeaveByKey((current) => ({ ...current, [key]: event.target.value }))} />
                            <button className="btn btn-primary" type="button" disabled={busy || closingDate < entry.start || closingDate > entry.end} onClick={() => void closeLeave(employee, entry)}>
                              {busy ? "Salvando..." : "Salvar"}
                            </button>
                            <button className="btn btn-secondary" type="button" onClick={() => setClosingLeaveByKey((current) => {
                              const next = { ...current };
                              delete next[key];
                              return next;
                            })}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            {entry.end >= today ? (
                              <button className="btn btn-secondary" type="button" onClick={() => setClosingLeaveByKey((current) => ({ ...current, [key]: today < entry.start ? entry.start : today }))}>
                                Encerrar antes
                              </button>
                            ) : null}
                            {period && !period.secullum && cpfOf(employee) ? (
                              <button className="btn btn-secondary" type="button" disabled={Boolean(sendingId)} onClick={() => void sendPeriod(employee, entry)}>
                                {sendingId === period.id ? "Enviando..." : "Enviar ao Secullum"}
                              </button>
                            ) : null}
                            {entry.periodId ? (
                              <button className="btn btn-secondary afastados-delete" type="button" title="Excluir este período" onClick={() => setDeleting({ employee, entry })}>
                                <Trash2 size={15} /> Excluir
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {form ? (
        <ModalPortal className="modal-backdrop">
          <div className="modal-panel afastados-modal" role="dialog" aria-modal="true" aria-labelledby="afastados-modal-title">
            <div className="modal-header">
              <div>
                <h2 id="afastados-modal-title">Novo afastamento</h2>
                <p className="panel-subtitle">Os dias do período passam a aparecer como {formType?.kind === "certificate" ? "Atestado" : "Afastado"} no Controle de ponto.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setForm(null)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="afastados-form">
              <label className="field is-wide">Funcionário
                <input list="afastados-employees" value={form.employeeSearch} placeholder="Digite o nome" onChange={(event) => pickEmployee(event.target.value)} />
                <datalist id="afastados-employees">
                  {activeEmployees.map((employee) => <option key={employee.id} value={employeeOptionLabel(employee)} />)}
                </datalist>
              </label>
              <label className="field is-wide">Tipo
                <select value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })}>
                  {["INSS", "Atestado", "Licença", "Outros"].map((group) => (
                    <optgroup key={group} label={group}>
                      {periodTypes.filter((item) => item.group === group).map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="field">Início<input type="date" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value, end: form.end < event.target.value ? event.target.value : form.end })} /></label>
              <label className="field">Fim<input type="date" value={form.end} min={form.start} onChange={(event) => setForm({ ...form, end: event.target.value })} /></label>
              {formType?.kind === "certificate" ? (
                <label className="field">CID (opcional)<input value={form.cid} onChange={(event) => setForm({ ...form, cid: event.target.value })} placeholder="Ex.: M54" /></label>
              ) : null}
              <label className="field is-wide">Motivo / observação<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
            </div>
            {formError ? <p className="afastados-error">{formError}</p> : null}
            <div className="form-actions">
              <button className="btn btn-secondary" type="button" disabled={saving} onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void submitPeriod()}><Check size={16} /> {saving ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {deleting ? (
        <ConfirmModal
          title="Excluir afastamento"
          description={`Excluir ${deleting.entry.label} de ${deleting.employee.name} (${formatDate(deleting.entry.start)} a ${formatDate(deleting.entry.end)})? Os dias já salvos no Controle de ponto não mudam sozinhos.`}
          confirmLabel="Excluir"
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={() => void deletePeriod()}
        />
      ) : null}
    </section>
  );
}
