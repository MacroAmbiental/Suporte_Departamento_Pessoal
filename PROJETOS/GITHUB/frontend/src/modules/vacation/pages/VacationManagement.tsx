import ModalPortal from "@/modules/shared/ModalPortal";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Pencil, Plane, Search, Trash2, X } from "lucide-react";
import { useDomainData } from "@/hooks/useDomainData";
import type { Employee } from "@/types/domain";
import { formatDate, todayISO } from "@/utils/format";
import {
  buildAcquisitionPeriods,
  bucketMeta,
  cltRightForAbsences,
  deleteVacation,
  hasScheduledVacation,
  isOnVacation,
  loadVacations,
  monthsBetween,
  saveVacation,
  vacationBucket,
  vacationReferenceDate,
  type Vacation,
  type VacationBucket,
} from "@/modules/vacation/data/vacationsRepository";
import { loadConfirmedAbsencesForEmployee } from "@/modules/timekeeping/data/timeRecordsRepository";

type CardKey = "todos" | VacationBucket | "programadas" | "feriasnow";

const cardOrder: {
  key: CardKey;
  label: string;
  sub?: string;
  color: string;
  bg: string;
  border: string;
}[] = [
  { key: "critico", ...bucketMeta.critico },
  { key: "limite", ...bucketMeta.limite },
  { key: "vencidas", ...bucketMeta.vencidas },
  { key: "emdia", ...bucketMeta.emdia, label: "Férias em dia" },
  { key: "todos", label: "Todos os funcionários", color: "#334155", bg: "#f1f5f9", border: "#cbd5e1" },
  { key: "feriasnow", label: "Funcionários de férias", sub: "De férias atualmente", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  { key: "programadas", label: "Férias programadas", sub: "Início futuro", color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
];

function daysBetweenInclusive(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const s = new Date(`${startISO}T00:00:00`);
  const e = new Date(`${endISO}T00:00:00`);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

type EmployeeKind = "contract" | "company" | "diarist";
const employeeKindLabels: Record<EmployeeKind, string> = {
  company: "Funcionário da empresa",
  contract: "Funcionário de contrato",
  diarist: "Diarista",
};

function employeeKindOf(employee: Employee): EmployeeKind {
  const kind = employee.registrationData?.employeeKind;
  if (kind === "company" || kind === "diarist") return kind;
  return "contract";
}

export default function VacationManagement() {
  const { employees: allEmployees } = useDomainData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<EmployeeKind | "todos">("todos");
  const [activeCard, setActiveCard] = useState<CardKey>((searchParams.get("card") as CardKey) || "todos");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const today = todayISO();

  async function refresh() {
    setLoading(true);
    try {
      setVacations(await loadVacations());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const vacationsByEmployee = useMemo(() => {
    const map = new Map<string, Vacation[]>();
    vacations.forEach((vacation) => {
      const list = map.get(vacation.employeeId) || [];
      list.push(vacation);
      map.set(vacation.employeeId, list);
    });
    return map;
  }, [vacations]);

  const rows = useMemo(() => {
    return allEmployees
      .filter((employee) => employee.status !== "terminated")
      .map((employee) => {
        const empVacations = vacationsByEmployee.get(employee.id) || [];
        const onVacationNow = isOnVacation(today, empVacations);
        const hasScheduled = hasScheduledVacation(today, empVacations);
        const reference = vacationReferenceDate(employee.admissionDate, empVacations, today);
        const months = reference ? monthsBetween(reference, today) : 0;
        const bucket: VacationBucket = onVacationNow ? "emdia" : vacationBucket(months);
        const lastVacation = [...empVacations].sort((left, right) =>
          (right.endDate || "").localeCompare(left.endDate || ""),
        )[0];
        const limiteEmCurso = buildAcquisitionPeriods(employee.admissionDate, today)[0]?.limitISO || "";
        return {
          employee,
          kind: employeeKindOf(employee),
          empVacations,
          reference,
          months,
          bucket,
          onVacationNow,
          hasScheduled,
          lastVacation,
          limiteEmCurso,
        };
      })
      .sort((left, right) => right.months - left.months);
  }, [allEmployees, vacationsByEmployee, today]);

  const counts = useMemo(() => {
    const scoped = rows.filter((row) => kindFilter === "todos" || row.kind === kindFilter);
    const result = {
      critico: 0,
      limite: 0,
      vencidas: 0,
      emdia: 0,
      todos: scoped.length,
      programadas: 0,
      feriasnow: 0,
    } as Record<CardKey, number>;
    scoped.forEach((row) => {
      if (row.bucket === "critico") result.critico += 1;
      else if (row.bucket === "limite") result.limite += 1;
      else if (row.bucket === "vencidas") result.vencidas += 1;
      else if (row.bucket === "emdia") result.emdia += 1;
      if (row.onVacationNow) result.feriasnow += 1;
      if (row.hasScheduled) result.programadas += 1;
    });
    return result;
  }, [rows, kindFilter]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (kindFilter !== "todos" && row.kind !== kindFilter) return false;
      if (activeCard === "programadas") {
        if (!row.hasScheduled) return false;
      } else if (activeCard === "feriasnow") {
        if (!row.onVacationNow) return false;
      } else if (activeCard !== "todos" && row.bucket !== activeCard) {
        return false;
      }
      if (term && !row.employee.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, activeCard, search, kindFilter]);

  const reportRows = useMemo(() => {
    if (!reportFrom || !reportTo) return [];
    const employeesById = new Map(allEmployees.map((employee) => [employee.id, employee]));
    return vacations
      .filter(
        (vacation) =>
          (vacation.startDate >= reportFrom && vacation.startDate <= reportTo) ||
          (vacation.endDate >= reportFrom && vacation.endDate <= reportTo),
      )
      .map((vacation) => ({
        vacation,
        employee: employeesById.get(vacation.employeeId),
        entrou: vacation.startDate >= reportFrom && vacation.startDate <= reportTo,
        voltou: vacation.endDate >= reportFrom && vacation.endDate <= reportTo,
      }))
      .sort((left, right) => left.vacation.startDate.localeCompare(right.vacation.startDate));
  }, [vacations, reportFrom, reportTo, allEmployees]);

  function selectCard(key: CardKey) {
    setActiveCard(key);
    const next = new URLSearchParams(searchParams);
    if (key === "todos") next.delete("card");
    else next.set("card", key);
    setSearchParams(next, { replace: true });
  }

  function printProgramacao() {
    const empById = new Map(allEmployees.map((employee) => [employee.id, employee]));
    const rowsHtml = [...vacations]
      .sort((left, right) =>
        (empById.get(left.employeeId)?.name || "").localeCompare(empById.get(right.employeeId)?.name || ""),
      )
      .map((vacation) => {
        const name = empById.get(vacation.employeeId)?.name || "—";
        return `<tr><td>${name}</td><td>${vacation.acquisitionYear || "—"}</td><td>${vacation.startDate ? formatDate(vacation.startDate) : "—"}</td><td>${vacation.endDate ? formatDate(vacation.endDate) : "—"}</td><td style="text-align:center">${vacation.days || 0}</td><td style="text-align:center">${vacation.daysSold || 0}</td><td>${vacation.motivo || vacation.notes || ""}</td></tr>`;
      })
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Programação de Férias — Macro Ambiental</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:24px}h1{font-size:16px;margin:0}.muted{color:#64748b;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}th{background:#f1f5f9}.foot{margin-top:24px;font-size:11px;color:#64748b;border-top:1px solid #cbd5e1;padding-top:8px}</style></head>
<body><div style="display:flex;justify-content:space-between;align-items:flex-start">
<div><h1>MACRO AMBIENTAL</h1><div class="muted">PROGRAMAÇÃO DE FÉRIAS</div></div>
<div class="muted" style="text-align:right">Data base: ${formatDate(today)}<br/>Emissão: ${new Date().toLocaleString("pt-BR")}</div></div>
<table><thead><tr><th>Funcionário</th><th>Período aquisitivo</th><th>Início gozo</th><th>Fim gozo</th><th>Dias</th><th>Vendidos</th><th>Motivo/Obs.</th></tr></thead>
<tbody>${rowsHtml || '<tr><td colspan="7">Nenhuma férias registrada.</td></tr>'}</tbody></table>
<div class="foot">Relatório gerado pelo sistema de Gestão da Macro Ambiental.</div></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) {
      window.alert("Permita pop-ups para gerar o relatório de programação.");
      return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <section className="page" data-testid="vacation-page">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plane size={22} /> Gerenciamento de Férias
          </h1>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>
            Registre férias, acompanhe vencimentos e sincronize com o Controle de Ponto.
          </p>
        </div>
        <button className="btn btn-secondary" data-testid="vacation-report-btn" onClick={() => setReportOpen(true)}>
          <CalendarDays size={16} /> Relatório de férias
        </button>
      </header>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "18px 0 6px" }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 360 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            type="text"
            data-testid="vacation-search"
            placeholder="Pesquisar por nome…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14 }}
          />
        </div>
        <label style={{ fontSize: 13, color: "#475569", display: "flex", alignItems: "center", gap: 8 }}>
          Tipo de contrato
          <select
            data-testid="vacation-kind-filter"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as EmployeeKind | "todos")}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14, background: "#fff" }}
          >
            <option value="todos">Todos</option>
            <option value="company">{employeeKindLabels.company}</option>
            <option value="contract">{employeeKindLabels.contract}</option>
            <option value="diarist">{employeeKindLabels.diarist}</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, margin: "6px 0 18px" }}>
        {cardOrder.map((card) => {
          const active = activeCard === card.key;
          return (
            <button
              key={card.key}
              type="button"
              data-testid={`vacation-card-${card.key}`}
              onClick={() => selectCard(card.key)}
              style={{
                textAlign: "left",
                cursor: "pointer",
                borderRadius: 14,
                padding: "14px 16px",
                background: card.bg,
                border: `2px solid ${active ? card.color : card.border}`,
                boxShadow: active ? `0 6px 18px ${card.border}` : "none",
                transition: "border-color .15s, box-shadow .15s",
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 800, color: card.color, lineHeight: 1 }}>
                {counts[card.key] ?? 0}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: card.color, marginTop: 6 }}>{card.label}</div>
              {card.sub ? (
                <div style={{ fontSize: 11, color: card.color, opacity: 0.85, marginTop: 2 }}>{card.sub}</div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="panel" style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #e2e8f0" }}>
        {loading ? (
          <div style={{ padding: 24, color: "#64748b" }}>Carregando férias…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: 24, color: "#64748b" }} data-testid="vacation-empty">Nenhum funcionário encontrado para este filtro.</div>
        ) : (
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left", fontSize: 12, color: "#475569" }}>
                <th style={{ padding: "10px 12px" }}>Funcionário</th>
                <th style={{ padding: "10px 12px" }}>Tipo de contrato</th>
                <th style={{ padding: "10px 12px" }}>Situação</th>
                <th style={{ padding: "10px 12px" }}>Meses</th>
                <th style={{ padding: "10px 12px" }}>Referência</th>
                <th style={{ padding: "10px 12px" }}>Limite de gozo</th>
                <th style={{ padding: "10px 12px" }}>Últimas férias</th>
                <th style={{ padding: "10px 12px" }} />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const meta = bucketMeta[row.bucket];
                return (
                  <tr
                    key={row.employee.id}
                    className="vacation-list-row"
                    data-testid={`vacation-row-${row.employee.id}`}
                    onClick={() => setEditing(row.employee)}
                    style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer" }}
                  >
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#0f172a" }}>
                      {row.employee.name}
                      {row.onVacationNow ? (
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 999, padding: "2px 8px" }}>
                          Em férias hoje
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#475569", fontSize: 12 }}>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: row.kind === "company" ? "#eef2ff" : row.kind === "diarist" ? "#fef9c3" : "#f1f5f9", border: "1px solid #e2e8f0", fontWeight: 600 }}>
                        {employeeKindLabels[row.kind]}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 999, padding: "2px 10px" }}>
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#334155" }}>{row.reference ? `${row.months} meses` : "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#334155" }}>{row.reference ? formatDate(row.reference) : "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#334155" }}>
                      {row.limiteEmCurso ? (
                        <span>
                          {formatDate(row.limiteEmCurso)}
                          <span style={{ marginLeft: 6, fontSize: 10, color: "#0891b2", fontWeight: 700 }}>(em curso)</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#334155" }}>
                      {row.lastVacation ? `${formatDate(row.lastVacation.startDate)} a ${formatDate(row.lastVacation.endDate)}` : "Nunca registrado"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "#2563eb", fontSize: 13, fontWeight: 600 }}>
                      Lançar/editar
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing ? (
        <VacationEditorModal
          employee={editing}
          vacations={vacationsByEmployee.get(editing.id) || []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await refresh();
          }}
        />
      ) : null}

      {reportOpen ? (
        <ModalPortal className="modal-overlay" data-testid="vacation-report-modal" style={overlayStyle} onClick={() => setReportOpen(false)}>
          <div role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()} style={{ ...dialogStyle, maxWidth: 720 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 18, color: "#0f172a" }}>Relatório de férias por período</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: "#475569" }}>
                De<br />
                <input type="date" data-testid="vacation-report-from" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: 13, color: "#475569" }}>
                Até<br />
                <input type="date" data-testid="vacation-report-to" value={reportTo} onChange={(event) => setReportTo(event.target.value)} style={inputStyle} />
              </label>
            </div>
            <div style={{ maxHeight: "50vh", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
              {!reportFrom || !reportTo ? (
                <div style={{ padding: 16, color: "#64748b" }}>Selecione o período para ver os funcionários que entraram/voltaram de férias.</div>
              ) : reportRows.length === 0 ? (
                <div style={{ padding: 16, color: "#64748b" }}>Nenhuma férias no período selecionado.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", textAlign: "left", color: "#475569" }}>
                      <th style={{ padding: "8px 10px" }}>Funcionário</th>
                      <th style={{ padding: "8px 10px" }}>Início</th>
                      <th style={{ padding: "8px 10px" }}>Retorno</th>
                      <th style={{ padding: "8px 10px" }}>Evento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map((row) => (
                      <tr key={row.vacation.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>{row.employee?.name || "—"}</td>
                        <td style={{ padding: "8px 10px" }}>{formatDate(row.vacation.startDate)}</td>
                        <td style={{ padding: "8px 10px" }}>{formatDate(row.vacation.endDate)}</td>
                        <td style={{ padding: "8px 10px" }}>
                          {row.entrou ? "Entrou" : ""}{row.entrou && row.voltou ? " / " : ""}{row.voltou ? "Voltou" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button className="btn btn-primary" data-testid="vacation-print-programacao" onClick={() => printProgramacao()}>
                Imprimir programação (PDF)
              </button>
              <button className="btn btn-secondary" onClick={() => setReportOpen(false)}>Fechar</button>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </section>
  );
}

const overlayStyle = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};

const dialogStyle = {
  background: "#fff",
  borderRadius: 14,
  padding: 24,
  width: "100%",
  maxWidth: 520,
  maxHeight: "88vh",
  overflowY: "auto" as const,
  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
};

const inputStyle = { padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, marginTop: 4 };

function VacationEditorModal({
  employee,
  vacations,
  onClose,
  onSaved,
}: {
  employee: Employee;
  vacations: Vacation[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [acqYear, setAcqYear] = useState<string>(String(new Date().getFullYear()));
  const [soldStart, setSoldStart] = useState("");
  const [soldEnd, setSoldEnd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const days = daysBetweenInclusive(start, end);
  const soldDays = daysBetweenInclusive(soldStart, soldEnd);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setStart("");
    setEnd("");
    setSoldStart("");
    setSoldEnd("");
    setMotivo("");
    setNotes("");
    setError("");
  }

  function launchForPeriod(year: number) {
    resetForm();
    setAcqYear(String(year));
    setShowForm(true);
  }

  function editVacation(vacation: Vacation) {
    setEditingId(vacation.id);
    setStart(vacation.startDate || "");
    setEnd(vacation.endDate || "");
    setAcqYear(vacation.acquisitionYear ? String(vacation.acquisitionYear) : "");
    setSoldStart(vacation.soldStartDate || "");
    setSoldEnd(vacation.soldEndDate || "");
    setMotivo(vacation.motivo || "");
    setNotes(vacation.notes || "");
    setError("");
    setShowForm(true);
  }

  const today = todayISO();
  const admission = employee.admissionDate || "";
  const admYear = admission ? new Date(`${admission}T00:00:00`).getFullYear() : 0;
  const folgaWeekdays = useMemo(() => {
    const map: Record<string, number> = {
      domingo: 0, segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, sabado: 6,
    };
    const set = new Set<number>();
    (employee.workScheduleDays || []).forEach((day) => {
      if (!day.enabled) {
        const weekDay = map[day.day.trim().toLowerCase()];
        if (weekDay !== undefined) set.add(weekDay);
      }
    });
    return set;
  }, [employee.workScheduleDays]);
  const periods = useMemo(
    () => buildAcquisitionPeriods(employee.admissionDate, today),
    [employee.admissionDate, today],
  );
  const [absences, setAbsences] = useState<string[]>([]);
  const [loadingAbsences, setLoadingAbsences] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!employee.admissionDate) {
        setLoadingAbsences(false);
        return;
      }
      setLoadingAbsences(true);
      try {
        const records = await loadConfirmedAbsencesForEmployee(employee.id, employee.admissionDate, today);
        if (!cancelled) setAbsences(records.map((record) => record.date));
      } catch {
        if (!cancelled) setAbsences([]);
      } finally {
        if (!cancelled) setLoadingAbsences(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [employee.id, employee.admissionDate, today]);

  const periodRows = useMemo(
    () =>
      periods.map((period) => {
        const count = absences.filter((date) => date >= period.startISO && date <= period.endISO).length;
        const right = cltRightForAbsences(count);
        const periodVacations = vacations.filter(
          (vacation) =>
            vacation.acquisitionYear === period.year ||
            (!vacation.acquisitionYear && vacation.startDate && vacation.startDate >= period.startISO && vacation.startDate <= period.limitISO),
        );
        const gozados = periodVacations.reduce((sum, vacation) => sum + (vacation.days || 0), 0);
        const vendidos = periodVacations.reduce((sum, vacation) => sum + (vacation.daysSold || 0), 0);
        const pendentes = right.lost ? 0 : Math.max(0, right.days - gozados - vendidos);
        return { period, count, right, periodVacations, gozados, vendidos, pendentes };
      }),
    [periods, absences, vacations],
  );

  function printEmployee() {
    const rowsHtml = periodRows
      .map(({ period, count, right, gozados, vendidos, pendentes, periodVacations }) => {
        const feriasTxt =
          periodVacations
            .filter((vacation) => vacation.startDate && vacation.endDate)
            .map((vacation) => `${formatDate(vacation.startDate)} a ${formatDate(vacation.endDate)}`)
            .join("; ") || "—";
        const vendidasTxt =
          periodVacations
            .filter((vacation) => vacation.soldStartDate && vacation.soldEndDate)
            .map((vacation) => `${formatDate(vacation.soldStartDate!)} a ${formatDate(vacation.soldEndDate!)}`)
            .join("; ") || (vendidos ? `${vendidos} dias` : "—");
        const direito = right.lost ? "0 — Direito perdido" : `${right.days} dias`;
        const tdStyle = right.lost ? ' style="color:#b91c1c;font-weight:700"' : "";
        return `<tr><td>${formatDate(period.startISO)} a ${formatDate(period.endISO)}</td><td>${formatDate(period.limitISO)}</td><td style="text-align:center">${count}</td><td${tdStyle}>${direito}</td><td style="text-align:center">${gozados || 0}</td><td>${vendidasTxt}</td><td style="text-align:center">${pendentes}</td><td>${feriasTxt}</td></tr>`;
      })
      .join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha de Férias — ${employee.name}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:24px}h1{font-size:16px;margin:0}.muted{color:#64748b;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}th{background:#f1f5f9}.foot{margin-top:24px;font-size:11px;color:#64748b;border-top:1px solid #cbd5e1;padding-top:8px}</style></head>
<body><div style="display:flex;justify-content:space-between;align-items:flex-start">
<div><h1>MACRO AMBIENTAL</h1><div class="muted">FICHA DE FÉRIAS — ${employee.name}</div><div class="muted">Admissão: ${employee.admissionDate ? formatDate(employee.admissionDate) : "—"}</div></div>
<div class="muted" style="text-align:right">Data base: ${formatDate(today)}<br/>Emissão: ${new Date().toLocaleString("pt-BR")}</div></div>
<table><thead><tr><th>Período aquisitivo</th><th>Limite de gozo</th><th>Faltas</th><th>Dias de direito</th><th>Gozados</th><th>Vendidas (período)</th><th>Pendentes</th><th>Férias lançadas</th></tr></thead>
<tbody>${rowsHtml || '<tr><td colspan="8">Sem períodos aquisitivos.</td></tr>'}</tbody></table>
<div class="foot">Dias de direito conforme art. 130 da CLT (faltas injustificadas no período aquisitivo). Pendentes = dias de direito − gozados − vendidos. Relatório gerado pelo sistema de Gestão da Macro Ambiental.</div></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) {
      window.alert("Permita pop-ups para gerar a ficha de férias.");
      return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  async function handleSave() {
    const hasGozo = Boolean(start || end);
    const hasVenda = Boolean(soldStart || soldEnd);
    if (!hasGozo && !hasVenda && !motivo.trim()) {
      setError("Informe o período de gozo, o período vendido ou um motivo.");
      return;
    }
    if (start && end && end < start) {
      setError("O retorno não pode ser antes do início.");
      return;
    }
    if (soldStart && soldEnd && soldEnd < soldStart) {
      setError("O fim do período vendido não pode ser antes do início.");
      return;
    }
    if (admission) {
      if (acqYear && Number(acqYear) < admYear) {
        setError(`Não é possível lançar/vender férias de anos anteriores à admissão (${admYear}).`);
        return;
      }
      if (start && start < admission) {
        setError("O início das férias não pode ser anterior à data de admissão.");
        return;
      }
      if (soldStart && soldStart < admission) {
        setError("O período vendido não pode ser anterior à data de admissão.");
        return;
      }
    }
    if (!editingId) {
      const period = periods.find((item) => item.year === Number(acqYear));
      if (period && !period.complete) {
        setError("Este período aquisitivo ainda não venceu (menos de 1 ano). Só é possível lançar férias de períodos vencidos.");
        return;
      }
    }
    if (start && folgaWeekdays.size > 0) {
      const startDate = new Date(`${start}T00:00:00`);
      for (const offset of [1, 2]) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + offset);
        if (folgaWeekdays.has(date.getDay())) {
          setError("Pela CLT (art. 134, §3º), as férias não podem iniciar nos 2 dias que antecedem a folga/repouso semanal do funcionário. Escolha outra data de início.");
          return;
        }
      }
    }
    setBusy(true);
    setError("");
    try {
      const existing = editingId ? vacations.find((vacation) => vacation.id === editingId) : undefined;
      await saveVacation({
        id: editingId || undefined,
        createdAt: existing?.createdAt,
        employeeId: employee.id,
        startDate: start,
        endDate: end,
        days,
        acquisitionYear: acqYear ? Number(acqYear) : undefined,
        daysSold: soldDays,
        soldStartDate: soldStart,
        soldEndDate: soldEnd,
        motivo: motivo.trim(),
        notes,
      });
      const wasEditing = Boolean(editingId);
      resetForm();
      await onSaved();
      window.alert(wasEditing ? "Alterações salvas com sucesso!" : "Férias registradas com sucesso!");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Falha ao salvar as férias.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir este registro de férias?")) return;
    setBusy(true);
    try {
      await deleteVacation(id);
      await onSaved();
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...vacations].sort((left, right) => right.startDate.localeCompare(left.startDate));

  return (
    <ModalPortal className="modal-overlay" data-testid="vacation-editor-modal" style={overlayStyle}>
      <div role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()} style={{ ...dialogStyle, maxWidth: 940, maxHeight: "92vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>Férias — {employee.name}</h3>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
          Admissão: {employee.admissionDate ? formatDate(employee.admissionDate) : "—"}
        </p>

        {showForm ? (
          <>
            {editingId ? (
              <div data-testid="vacation-mode" style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
                Editando lançamento — período aquisitivo {acqYear || "—"}
              </div>
            ) : (
              <div data-testid="vacation-mode" style={{ fontSize: 12, fontWeight: 700, color: "#047857", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
                Novo lançamento — período aquisitivo {acqYear || "—"}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ fontSize: 13, color: "#475569" }}>
                Início das férias
                <input type="date" data-testid="vacation-start" value={start} min={admission || undefined} onChange={(event) => setStart(event.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
              <label style={{ fontSize: 13, color: "#475569" }}>
                Retorno (último dia)
                <input type="date" data-testid="vacation-end" value={end} min={start || admission || undefined} onChange={(event) => setEnd(event.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
              <label style={{ fontSize: 13, color: "#475569" }}>
                Período aquisitivo (ano)
                <input type="number" data-testid="vacation-acqyear" value={acqYear} readOnly title="Definido automaticamente pelo período selecionado" placeholder="—" style={{ ...inputStyle, width: "100%", background: "#f1f5f9", color: "#475569", cursor: "not-allowed" }} />
              </label>
            </div>
            <p style={{ fontSize: 13, color: "#334155", margin: "8px 0 0" }}>
              Dias gozados: <strong>{days || "—"}</strong>
            </p>
            {folgaWeekdays.size > 0 ? (
              <p style={{ fontSize: 12, color: "#b45309", margin: "6px 0 0" }} data-testid="vacation-clt-hint">
                CLT art. 134, §3º: as férias não podem iniciar nos 2 dias que antecedem a folga/repouso semanal do funcionário.
              </p>
            ) : null}

            <div style={{ marginTop: 12, padding: "10px 12px", border: "1px dashed #cbd5e1", borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>Férias vendidas (abono) — período</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 13, color: "#475569" }}>
                  Início da venda
                  <input type="date" data-testid="vacation-sold-start" value={soldStart} min={admission || undefined} onChange={(event) => setSoldStart(event.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
                <label style={{ fontSize: 13, color: "#475569" }}>
                  Fim da venda
                  <input type="date" data-testid="vacation-sold-end" value={soldEnd} min={soldStart || admission || undefined} onChange={(event) => setSoldEnd(event.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
              </div>
              <p style={{ fontSize: 12, color: "#334155", margin: "8px 0 0" }}>
                Dias vendidos: <strong>{soldDays || "—"}</strong>
              </p>
            </div>

            <label style={{ fontSize: 13, color: "#475569", display: "block", marginTop: 10 }}>
              Motivo {!start && !end && !soldStart && !soldEnd ? <strong style={{ color: "#b45309" }}>(obrigatório sem gozo/venda)</strong> : "(opcional)"}
              <input type="text" data-testid="vacation-motivo" value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="ex.: sem histórico, afastamento, etc." style={{ ...inputStyle, width: "100%" }} />
            </label>
            <label style={{ fontSize: 13, color: "#475569", display: "block", marginTop: 10 }}>
              Observações
              <input type="text" data-testid="vacation-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="opcional" style={{ ...inputStyle, width: "100%" }} />
            </label>

            {error ? <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 10 }}>{error}</div> : null}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16 }}>
              <div>
                <button className="btn btn-secondary" data-testid="vacation-cancel-edit" onClick={resetForm} disabled={busy}>
                  {editingId ? "Cancelar edição" : "Cancelar"}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Fechar</button>
                <button className="btn btn-primary" data-testid="vacation-save" onClick={() => void handleSave()} disabled={busy}>
                  {busy ? "Salvando…" : editingId ? "Salvar alterações" : "Registrar férias"}
                </button>
              </div>
            </div>
          </>
        ) : null}

        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
            <h4 style={{ fontSize: 14, color: "#0f172a", margin: 0 }}>Períodos aquisitivos (CLT — art. 130)</h4>
            <button
              className="btn btn-secondary"
              data-testid="vacation-print-employee"
              onClick={printEmployee}
              disabled={loadingAbsences || periodRows.length === 0}
            >
              Imprimir ficha (PDF)
            </button>
          </div>
          {!employee.admissionDate ? (
            <div style={{ padding: 12, color: "#b45309", fontSize: 13 }}>
              Sem data de admissão cadastrada — não é possível calcular os períodos aquisitivos.
            </div>
          ) : (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", color: "#475569" }}>
                    <th style={{ padding: "8px 10px" }}>Período aquisitivo</th>
                    <th style={{ padding: "8px 10px" }}>Limite de gozo</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Faltas</th>
                    <th style={{ padding: "8px 10px" }}>Dias de direito</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Gozados</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Vendidos</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>Pendentes</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {periodRows.map(({ period, count, right, gozados, vendidos, pendentes, periodVacations }) => (
                    <tr key={period.index} data-testid={`vacation-period-${period.year}`} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 10px" }}>
                        {formatDate(period.startISO)} a {formatDate(period.endISO)}
                        {!period.complete ? (
                          <span style={{ marginLeft: 6, fontSize: 10, color: "#0891b2", fontWeight: 700 }}>(em curso)</span>
                        ) : null}
                      </td>
                      <td style={{ padding: "8px 10px" }}>{formatDate(period.limitISO)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>{loadingAbsences ? "…" : count}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: right.lost ? "#b91c1c" : "#0f172a" }}>
                        {loadingAbsences ? "…" : right.lost ? "0 · Direito perdido" : `${right.days} dias`}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>{gozados || 0}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>{vendidos || 0}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: right.lost ? "#b91c1c" : pendentes > 0 ? "#b45309" : "#047857" }}>
                        {loadingAbsences ? "…" : right.lost ? "—" : pendentes}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {periodVacations.length > 0 ? (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            data-testid={`vacation-edit-${period.year}`}
                            onClick={() => editVacation(periodVacations[0])}
                          >
                            Editar
                          </button>
                        ) : period.complete ? (
                          <button
                            className="btn btn-primary"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            data-testid={`vacation-launch-${period.year}`}
                            onClick={() => launchForPeriod(period.year)}
                          >
                            Lançar férias
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Não vencido</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loadingAbsences ? (
                <div style={{ padding: "8px 10px", fontSize: 12, color: "#64748b" }}>Carregando faltas confirmadas…</div>
              ) : null}
            </div>
          )}
        </div>

        {sorted.length > 0 ? (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ fontSize: 14, color: "#0f172a", margin: "0 0 8px" }}>Histórico</h4>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
              {sorted.map((vacation) => (
                <div key={vacation.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderTop: "1px solid #f1f5f9", fontSize: 13 }}>
                  <span>
                    <strong>{vacation.acquisitionYear ? `Férias ${vacation.acquisitionYear}` : "Férias"}</strong>{" — "}
                    {vacation.startDate && vacation.endDate
                      ? `${formatDate(vacation.startDate)} a ${formatDate(vacation.endDate)} (${vacation.days} dias)`
                      : (vacation.motivo || "sem período informado")}
                    {vacation.daysSold
                      ? ` · vendidas: ${vacation.soldStartDate && vacation.soldEndDate ? `${formatDate(vacation.soldStartDate)} a ${formatDate(vacation.soldEndDate)} (${vacation.daysSold} dias)` : `${vacation.daysSold} dias`}`
                      : ""}
                    {vacation.notes ? ` · ${vacation.notes}` : ""}
                  </span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button className="icon-button" data-testid={`vacation-edit-hist-${vacation.id}`} onClick={() => editVacation(vacation)} aria-label="Editar" disabled={busy}>
                      <Pencil size={14} color="#2563eb" />
                    </button>
                    <button className="icon-button" data-testid={`vacation-delete-${vacation.id}`} onClick={() => void handleDelete(vacation.id)} aria-label="Excluir" disabled={busy}>
                      <Trash2 size={14} color="#b91c1c" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </ModalPortal>
  );
}
