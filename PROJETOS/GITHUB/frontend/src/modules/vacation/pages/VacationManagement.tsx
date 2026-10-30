import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, FileUp, Pencil, Plane, Search, Trash2, X } from "lucide-react";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";
import VacationReportImport from "@/modules/vacation/components/VacationReportImport";
import type { Employee } from "@/types/domain";
import { formatDate, todayISO } from "@/utils/format";
import {
  buildAcquisitionPeriods,
  bucketMeta,
  cltRightForAbsences,
  deleteVacation,
  deleteVacationBaseline,
  hasScheduledVacation,
  isOnVacation,
  loadVacationBaselines,
  loadVacations,
  monthsBetween,
  reportPeriodPending,
  saveVacation,
  vacationReferenceDate,
  vacationsForPeriod,
  vacationStatus,
  type Vacation,
  type VacationBaseline,
  type VacationBucket,
  type VacationLeaveData,
} from "@/modules/vacation/data/vacationsRepository";
import { employeeVacationLeaveData, loadPointLeaveDays, type PointLeaveDays } from "@/modules/vacation/data/vacationLeaveData";
import { loadConfirmedAbsencesForEmployee } from "@/modules/timekeeping/data/timeRecordsRepository";
import { sincronizarAfastamentoSecullum } from "@/modules/afastados/data/afastamentosSecullum";
import { INICIO_JUSTIFICATIVAS_SECULLUM } from "@/modules/timekeeping/services/secullumTechnicalAuth";

// Gozo das férias vai para o Secullum como afastamento FÉRIAS (o DP é a fonte da verdade).
const cpfDigits = (cpf?: string) => {
  const digits = (cpf || "").replace(/\D/g, "");
  return digits.length === 11 ? digits : "";
};

// Só férias com gozo a partir da entrada da integração: meses já fechados não são mexidos.
const goesToSecullum = (v: { startDate?: string; endDate?: string; days?: number }) =>
  Boolean(v.startDate && v.endDate && (v.days || 0) > 0 && v.endDate >= INICIO_JUSTIFICATIVAS_SECULLUM);

type CardKey = "todos" | VacationBucket | "programadas" | "feriasnow";

const cardOrder: {
  key: CardKey;
  label: string;
  sub?: string;
  color: string;
  bg: string;
  border: string;
}[] = [
    { key: "proximo", ...bucketMeta.proximo },
    { key: "iniciado", ...bucketMeta.iniciado },
    { key: "vencido", ...bucketMeta.vencido },
    { key: "afastado", ...bucketMeta.afastado, label: "Afastados" },
    { key: "emdia", ...bucketMeta.emdia, label: "Férias em dia" },
    { key: "todos", label: "Todos os funcionários", color: "var(--text)", bg: "var(--surface-muted)", border: "var(--border)" },
    { key: "feriasnow", label: "Funcionários de férias", sub: "De férias atualmente", color: "color-mix(in srgb, #7c3aed var(--ink-keep), #e5e7eb)", bg: "var(--surface-muted)", border: "color-mix(in srgb, #ddd6fe var(--tint-line), var(--surface))" },
    { key: "programadas", label: "Férias programadas", sub: "Início futuro", color: "color-mix(in srgb, #0891b2 var(--ink-keep), #e5e7eb)", bg: "var(--surface-muted)", border: "color-mix(in srgb, #a5f3fc var(--tint-line), var(--surface))" },
  ];

const bucketRank: Record<VacationBucket, number> = { vencido: 0, proximo: 1, iniciado: 2, afastado: 3, emdia: 4 };

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
  const { employees: allEmployees, companies } = useDomainData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<EmployeeKind | "todos">("todos");
  const [activeCard, setActiveCard] = useState<CardKey>(
    () => {
      const fromUrl = searchParams.get("card") as CardKey | null;
      return fromUrl && cardOrder.some((card) => card.key === fromUrl) ? fromUrl : "todos";
    },
  );
  const [editing, setEditing] = useState<Employee | null>(null);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [baselines, setBaselines] = useState<Map<string, VacationBaseline>>(() => new Map());
  const { can } = useAuth();

  const today = todayISO();

  async function refresh() {
    setLoading(true);
    try {
      const [loadedVacations, loadedBaselines] = await Promise.all([loadVacations(), loadVacationBaselines()]);
      setVacations(loadedVacations);
      setBaselines(new Map(loadedBaselines.map((baseline) => [baseline.employeeId, baseline])));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  // Faltas confirmadas (art. 130) e afastamentos do ponto (art. 133) de todos, para a situação de cada um.
  const [pointLeave, setPointLeave] = useState<PointLeaveDays | null>(null);
  const [pointLeaveError, setPointLeaveError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadPointLeaveDays()
      .then((result) => { if (!cancelled) setPointLeave(result); })
      .catch((error) => {
        console.warn("Não foi possível carregar faltas e afastamentos do ponto para as férias.", error);
        if (!cancelled) setPointLeaveError(true);
      });
    return () => { cancelled = true; };
  }, []);
  const leaveByEmployee = useMemo(
    () => new Map(allEmployees.map((employee) => [employee.id, employeeVacationLeaveData(employee, pointLeave, today)])),
    [allEmployees, pointLeave, today],
  );

  const vacationsByEmployee = useMemo(() => {
    const map = new Map<string, Vacation[]>();
    vacations.forEach((v) => {
      const list = map.get(v.employeeId) || [];
      list.push(v);
      map.set(v.employeeId, list);
    });
    return map;
  }, [vacations]);

  const rows = useMemo(() => {
    return allEmployees
      .filter((e) => e.status !== "terminated")
      .map((employee) => {
        const empVacations = vacationsByEmployee.get(employee.id) || [];
        const onVacationNow = isOnVacation(today, empVacations);
        const hasScheduled = hasScheduledVacation(today, empVacations);
        const baseline = baselines.get(employee.id);
        // Situação pelo período aquisitivo mais antigo com dias a gozar.
        // De férias agora → não conta como pendente (está resolvendo/gozando); afastado sai do vencimento.
        const leave = leaveByEmployee.get(employee.id);
        const status = vacationStatus(employee.admissionDate, empVacations, today, leave, baseline);
        // Com o relatório da contabilidade, "Meses" conta do início do período pendente
        // mais antigo (antes contava da admissão para quem nunca teve férias lançadas).
        const reference = baseline
          ? status.pendingPeriod?.startISO || buildAcquisitionPeriods(employee.admissionDate, today, leave, baseline)[0]?.startISO || ""
          : vacationReferenceDate(employee.admissionDate, empVacations, today);
        const months = reference ? monthsBetween(reference, today) : 0;
        const bucket: VacationBucket = onVacationNow ? "emdia" : leave?.onLeaveToday ? "afastado" : status.bucket;
        const lastVacation = [...empVacations].sort((a, b) =>
          (b.endDate || "").localeCompare(a.endDate || ""),
        )[0];
        const limiteEmCurso = buildAcquisitionPeriods(employee.admissionDate, today, leave, baseline)[0]?.limitISO || "";
        const pendingLimit = bucket === "emdia" || bucket === "afastado" ? "" : status.pendingPeriod?.limitISO || "";
        return { employee, kind: employeeKindOf(employee), empVacations, reference, months, bucket, onVacationNow, hasScheduled, lastVacation, limiteEmCurso, pendingLimit, baseline };
      })
      // Mais urgente primeiro: vencidos, próximos do limite e com período iniciado, cada grupo pelo limite mais cedo.
      .sort((a, b) =>
        bucketRank[a.bucket] - bucketRank[b.bucket] ||
        (a.pendingLimit || "9999").localeCompare(b.pendingLimit || "9999") ||
        b.months - a.months);
  }, [allEmployees, vacationsByEmployee, leaveByEmployee, today, baselines]);

  const counts = useMemo(() => {
    const scoped = rows.filter((r) => kindFilter === "todos" || r.kind === kindFilter);
    const c = {
      proximo: 0,
      iniciado: 0,
      vencido: 0,
      afastado: 0,
      emdia: 0,
      todos: scoped.length,
      programadas: 0,
      feriasnow: 0,
    } as Record<CardKey, number>;
    scoped.forEach((r) => {
      c[r.bucket] += 1;
      if (r.onVacationNow) c.feriasnow += 1;
      if (r.hasScheduled) c.programadas += 1;
    });
    return c;
  }, [rows, kindFilter]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kindFilter !== "todos" && r.kind !== kindFilter) return false;
      if (activeCard === "programadas") {
        if (!r.hasScheduled) return false;
      } else if (activeCard === "feriasnow") {
        if (!r.onVacationNow) return false;
      } else if (activeCard !== "todos" && r.bucket !== activeCard) {
        return false;
      }
      if (term && !r.employee.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, activeCard, search, kindFilter]);

  const reportRows = useMemo(() => {
    if (!reportFrom || !reportTo) return [];
    const empById = new Map(allEmployees.map((e) => [e.id, e]));
    return vacations
      .filter(
        (v) =>
          (v.startDate >= reportFrom && v.startDate <= reportTo) ||
          (v.endDate >= reportFrom && v.endDate <= reportTo),
      )
      .map((v) => ({
        vacation: v,
        employee: empById.get(v.employeeId),
        entrou: v.startDate >= reportFrom && v.startDate <= reportTo,
        voltou: v.endDate >= reportFrom && v.endDate <= reportTo,
      }))
      .sort((a, b) => a.vacation.startDate.localeCompare(b.vacation.startDate));
  }, [vacations, reportFrom, reportTo, allEmployees]);

  function selectCard(key: CardKey) {
    setActiveCard(key);
    const next = new URLSearchParams(searchParams);
    if (key === "todos") next.delete("card");
    else next.set("card", key);
    setSearchParams(next, { replace: true });
  }

  function printProgramacao() {
    const empById = new Map(allEmployees.map((e) => [e.id, e]));
    const rowsHtml = [...vacations]
      .sort((a, b) =>
        (empById.get(a.employeeId)?.name || "").localeCompare(empById.get(b.employeeId)?.name || ""),
      )
      .map((v) => {
        const name = empById.get(v.employeeId)?.name || "—";
        return `<tr><td>${name}</td><td>${v.acquisitionYear || "—"}</td><td>${v.startDate ? formatDate(v.startDate) : "—"}</td><td>${v.endDate ? formatDate(v.endDate) : "—"}</td><td style="text-align:center">${v.days || 0}</td><td style="text-align:center">${v.daysSold || 0}</td><td>${v.motivo || v.notes || ""}</td></tr>`;
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
    const w = window.open("", "_blank");
    if (!w) {
      window.alert("Permita pop-ups para gerar o relatório de programação.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <section className="page" data-testid="vacation-page">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Plane size={22} /> Gerenciamento de Férias
          </h1>
          <p style={{ color: "var(--text-muted)", margin: "4px 0 0", fontSize: 14 }}>
            Registre férias, acompanhe vencimentos e sincronize com o Controle de Ponto.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", flex: "1 1 520px" }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 380 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            type="text"
            data-testid="vacation-search"
            placeholder="Pesquisar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14 }}
          />
        </div>
        <label style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          Tipo de contrato
          <select
            data-testid="vacation-kind-filter"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as EmployeeKind | "todos")}
            style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)" }}
          >
            <option value="todos">Todos</option>
            <option value="company">{employeeKindLabels.company}</option>
            <option value="contract">{employeeKindLabels.contract}</option>
            <option value="diarist">{employeeKindLabels.diarist}</option>
          </select>
        </label>
        {can("vacation", "edit") ? (
          <button className="btn btn-secondary" type="button" onClick={() => setImportOpen(true)} style={{ whiteSpace: "nowrap" }}>
            <FileUp size={16} /> Importar relatório da contabilidade
          </button>
        ) : null}
        <button className="btn btn-secondary" data-testid="vacation-report-btn" onClick={() => setReportOpen(true)} style={{ whiteSpace: "nowrap" }}>
          <CalendarDays size={16} /> Relatório de férias
        </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, margin: "16px 0 16px" }}>
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

      {!pointLeave ? (
        <p style={{ margin: "-6px 0 12px", fontSize: 12, color: pointLeaveError ? "color-mix(in srgb, #b91c1c var(--ink-keep), #e5e7eb)" : "var(--text-muted)" }}>
          {pointLeaveError
            ? "Não foi possível carregar faltas e afastamentos do ponto — situação calculada sem eles."
            : "Carregando faltas e afastamentos do ponto…"}
        </p>
      ) : null}

      <div className="panel" style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
        {loading ? (
          <div style={{ padding: 24, color: "var(--text-muted)" }}>Carregando férias…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: 24, color: "var(--text-muted)" }} data-testid="vacation-empty">Nenhum funcionário encontrado para este filtro.</div>
        ) : (
          <table className="table" style={{ width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: "var(--surface-muted)", textAlign: "left", fontSize: 12, color: "var(--text-muted)" }}>
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
              {filteredRows.map((r) => {
                const meta = bucketMeta[r.bucket];
                return (
                  <tr
                    key={r.employee.id}
                    className="vacation-list-row"
                    data-testid={`vacation-row-${r.employee.id}`}
                    onClick={() => setEditing(r.employee)}
                    style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
                  >
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text)", whiteSpace: "normal" }}>
                      {r.employee.name}
                      {r.onVacationNow ? (
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "color-mix(in srgb, #7c3aed var(--ink-keep), #e5e7eb)", background: "var(--surface-muted)", border: "1px solid color-mix(in srgb, #ddd6fe var(--tint-line), var(--surface))", borderRadius: 999, padding: "2px 8px" }}>
                          Em férias hoje
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 12 }}>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: r.kind === "company" ? "var(--surface-muted)" : r.kind === "diarist" ? "color-mix(in srgb, #fef9c3 var(--tint-keep), var(--surface))" : "var(--surface-muted)", border: "1px solid var(--border)", fontWeight: 600 }}>
                        {employeeKindLabels[r.kind]}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 999, padding: "2px 10px" }}>
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--text)" }}>{r.reference ? `${r.months} meses` : "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text)" }}>{r.reference ? formatDate(r.reference) : "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--text)" }}>
                      {r.pendingLimit ? (
                        <span style={{ fontWeight: 600, color: meta.color }}>{formatDate(r.pendingLimit)}</span>
                      ) : r.limiteEmCurso ? (
                        <span>
                          {formatDate(r.limiteEmCurso)}
                          <span style={{ marginLeft: 6, fontSize: 10, color: "color-mix(in srgb, #0891b2 var(--ink-keep), #e5e7eb)", fontWeight: 700 }}>(em curso)</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--text)" }}>
                      {r.lastVacation ? `${formatDate(r.lastVacation.startDate)} a ${formatDate(r.lastVacation.endDate)}` : "Nunca registrado"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "color-mix(in srgb, #2563eb var(--ink-keep), #e5e7eb)", fontSize: 13, fontWeight: 600 }}>
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
          leave={leaveByEmployee.get(editing.id)}
          baseline={baselines.get(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await refresh();
          }}
        />
      ) : null}
      {importOpen ? (
        <VacationReportImport
          employees={allEmployees}
          companies={companies}
          onClose={() => setImportOpen(false)}
          onImported={refresh}
        />
      ) : null}

      {reportOpen ? createPortal(
        <div className="modal-overlay" data-testid="vacation-report-modal" style={overlayStyle} onClick={() => setReportOpen(false)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ ...dialogStyle, maxWidth: 720 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 18, color: "var(--text)" }}>Relatório de férias por período</h3>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
                De<br />
                <input type="date" data-testid="vacation-report-from" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Até<br />
                <input type="date" data-testid="vacation-report-to" value={reportTo} onChange={(e) => setReportTo(e.target.value)} style={inputStyle} />
              </label>
            </div>
            <div style={{ maxHeight: "50vh", overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
              {!reportFrom || !reportTo ? (
                <div style={{ padding: 16, color: "var(--text-muted)" }}>Selecione o período para ver os funcionários que entraram/voltaram de férias.</div>
              ) : reportRows.length === 0 ? (
                <div style={{ padding: 16, color: "var(--text-muted)" }}>Nenhuma férias no período selecionado.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-muted)", textAlign: "left", color: "var(--text-muted)" }}>
                      <th style={{ padding: "8px 10px" }}>Funcionário</th>
                      <th style={{ padding: "8px 10px" }}>Início</th>
                      <th style={{ padding: "8px 10px" }}>Retorno</th>
                      <th style={{ padding: "8px 10px" }}>Evento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map((r) => (
                      <tr key={r.vacation.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.employee?.name || "—"}</td>
                        <td style={{ padding: "8px 10px" }}>{formatDate(r.vacation.startDate)}</td>
                        <td style={{ padding: "8px 10px" }}>{formatDate(r.vacation.endDate)}</td>
                        <td style={{ padding: "8px 10px" }}>
                          {r.entrou ? "Entrou" : ""}{r.entrou && r.voltou ? " / " : ""}{r.voltou ? "Voltou" : ""}
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
        </div>,
        document.body,
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
  background: "var(--surface)",
  borderRadius: 14,
  padding: 24,
  width: "100%",
  maxWidth: 520,
  maxHeight: "88vh",
  overflowY: "auto" as const,
  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
};
const inputStyle = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, marginTop: 4 };

function VacationEditorModal({
  employee,
  vacations,
  leave,
  baseline,
  onClose,
  onSaved,
}: {
  employee: Employee;
  vacations: Vacation[];
  leave: VacationLeaveData | undefined;
  baseline?: VacationBaseline;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { confirmAccessKey } = useDomainData();
  const { user } = useAuth();
  const [sendingId, setSendingId] = useState("");
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

  function editVacation(v: Vacation) {
    setEditingId(v.id);
    setStart(v.startDate || "");
    setEnd(v.endDate || "");
    setAcqYear(v.acquisitionYear ? String(v.acquisitionYear) : "");
    setSoldStart(v.soldStartDate || "");
    setSoldEnd(v.soldEndDate || "");
    setMotivo(v.motivo || "");
    setNotes(v.notes || "");
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
    (employee.workScheduleDays || []).forEach((d) => {
      if (!d.enabled) {
        const wd = map[d.day.trim().toLowerCase()];
        if (wd !== undefined) set.add(wd);
      }
    });
    return set;
  }, [employee.workScheduleDays]);
  const periods = useMemo(
    () => buildAcquisitionPeriods(employee.admissionDate, today, leave, baseline),
    [employee.admissionDate, leave, today, baseline],
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
        const recs = await loadConfirmedAbsencesForEmployee(employee.id, employee.admissionDate, today);
        if (!cancelled) setAbsences(recs.map((r) => r.date));
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
      periods.map((p) => {
        // Faltas do ponto + dias de suspensão do cadastro (art. 130); período perdido pelo art. 133 fica sem direito.
        const allAbsences = new Set([...absences, ...(leave?.absenceDates || [])]);
        const count = Array.from(allAbsences).filter((d) => d >= p.startISO && d <= p.endISO).length;
        const periodVacations = vacationsForPeriod(p, vacations);
        // Período do relatório da contabilidade: direito = gozados + restantes na data
        // base; só o que foi lançado no sistema depois dela desconta.
        if (p.report) {
          const after = periodVacations.filter((v) => (v.startDate || "") >= p.report!.baseDateISO);
          return {
            period: p,
            count,
            right: { days: p.report.daysTaken + p.report.daysRemaining, lost: false },
            periodVacations,
            gozados: p.report.daysTaken + after.reduce((s, v) => s + (v.days || 0), 0),
            vendidos: after.reduce((s, v) => s + (v.daysSold || 0), 0),
            pendentes: reportPeriodPending(p, vacations),
          };
        }
        const right = p.lost ? { days: 0, lost: true } : cltRightForAbsences(count);
        const gozados = periodVacations.reduce((s, v) => s + (v.days || 0), 0);
        const vendidos = periodVacations.reduce((s, v) => s + (v.daysSold || 0), 0);
        const pendentes = right.lost ? 0 : Math.max(0, right.days - gozados - vendidos);
        return { period: p, count, right, periodVacations, gozados, vendidos, pendentes };
      }),
    [periods, absences, leave, vacations],
  );

  const selectedPeriodRow = periodRows.find((r) => r.period.year === Number(acqYear));
  const rightDays = selectedPeriodRow?.right.days ?? 0;
  const rightLost = selectedPeriodRow?.right.lost ?? false;
  // Período do relatório da contabilidade: o que foi gozado até a data base já está no
  // relatório (daysTaken); só os lançamentos do sistema depois dela contam de novo.
  const selectedReport = selectedPeriodRow?.period.report;
  const otherYearEntries = (selectedPeriodRow?.periodVacations || []).filter(
    (v) => v.id !== editingId && (!selectedReport || (v.startDate || "") >= selectedReport.baseDateISO),
  );
  const gozadosOutros = (selectedReport?.daysTaken || 0) + otherYearEntries.reduce((s, v) => s + (v.days || 0), 0);
  const vendidosOutros = otherYearEntries.reduce((s, v) => s + (v.daysSold || 0), 0);
  const alocadosOutros = gozadosOutros + vendidosOutros;
  const restante = rightDays - alocadosOutros - days - soldDays;
  const maxVenda = Math.floor(rightDays / 3);

  function printEmployee() {
    const rowsHtml = periodRows
      .map(({ period, count, right, gozados, vendidos, pendentes, periodVacations }) => {
        const feriasTxt =
          periodVacations
            .filter((v) => v.startDate && v.endDate)
            .map((v) => `${formatDate(v.startDate)} a ${formatDate(v.endDate)}`)
            .join("; ") || "—";
        const vendidasTxt =
          periodVacations
            .filter((v) => v.soldStartDate && v.soldEndDate)
            .map((v) => `${formatDate(v.soldStartDate!)} a ${formatDate(v.soldEndDate!)}`)
            .join("; ") || (vendidos ? `${vendidos} dias` : "—");
        const direito = period.lost
          ? `0 — Perdido (art. 133): ${period.lost.reason}; novo período a partir de ${formatDate(period.lost.returnISO)}`
          : right.lost ? "0 — Direito perdido" : `${right.days} dias`;
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
    const w = window.open("", "_blank");
    if (!w) {
      window.alert("Permita pop-ups para gerar a ficha de férias.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
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
      const p = periods.find((x) => x.year === Number(acqYear));
      if (p && !p.complete) {
        setError("Este período aquisitivo ainda não venceu (menos de 1 ano). Só é possível lançar férias de períodos vencidos.");
        return;
      }
    }
    if (start && folgaWeekdays.size > 0) {
      const s = new Date(`${start}T00:00:00`);
      for (const offset of [1, 2]) {
        const d = new Date(s);
        d.setDate(d.getDate() + offset);
        if (folgaWeekdays.has(d.getDay())) {
          setError("Pela CLT (art. 134, §3º), as férias não podem iniciar nos 2 dias que antecedem a folga/repouso semanal do funcionário. Escolha outra data de início.");
          return;
        }
      }
    }
    if (rightLost) {
      setError("O funcionário perdeu o direito às férias deste período (mais de 32 faltas).");
      return;
    }
    if (rightDays > 0) {
      const gozoFractions = otherYearEntries.filter((v) => (v.days || 0) > 0).map((v) => v.days as number);
      if (days > 0) gozoFractions.push(days);
      if (days > 0 && days < 5) {
        setError("Cada período de férias fracionado deve ter no mínimo 5 dias corridos (CLT art. 134, §1º).");
        return;
      }
      if (gozoFractions.length > 3) {
        setError("As férias podem ser fracionadas em no máximo 3 períodos (CLT art. 134, §1º).");
        return;
      }
      if (gozoFractions.length >= 2 && Math.max(...gozoFractions) < 14) {
        setError("Ao fracionar, um dos períodos deve ter no mínimo 14 dias corridos (CLT art. 134, §1º).");
        return;
      }
      if (vendidosOutros + soldDays > maxVenda) {
        setError(`A venda de férias (abono) não pode exceder 1/3 do direito do período (máx. ${maxVenda} dias).`);
        return;
      }
      if (alocadosOutros + days + soldDays > rightDays) {
        setError(`O total de dias gozados + vendidos (${alocadosOutros + days + soldDays}) excede o direito do período (${rightDays} dias).`);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const existing = editingId ? vacations.find((v) => v.id === editingId) : undefined;
      // Secullum antes do DP: se recusar, nada é gravado aqui.
      const cpf = cpfDigits(employee.cpf);
      const hasGozo = goesToSecullum({ startDate: start, endDate: end, days });
      let secullum: Vacation["secullum"] = cpf ? "" : "sem-cpf";
      if (cpf) {
        const wasSent = existing?.secullum === "lancado" && existing.startDate && existing.endDate;
        if (wasSent && !hasGozo) {
          await sincronizarAfastamentoSecullum(user?.id, { acao: "apagar", cpf, inicio: existing.startDate, fim: existing.endDate, justificativa: "FÉRIAS" });
        } else if (wasSent && (existing.startDate !== start || existing.endDate !== end)) {
          await sincronizarAfastamentoSecullum(user?.id, {
            acao: "alterar", cpf, inicio: existing.startDate, fim: existing.endDate, novoInicio: start, novoFim: end,
            justificativa: "FÉRIAS", motivo: motivo.trim(),
          });
          secullum = "lancado";
        } else if (wasSent) {
          secullum = "lancado";
        } else if (hasGozo) {
          await sincronizarAfastamentoSecullum(user?.id, { acao: "lancar", cpf, inicio: start, fim: end, justificativa: "FÉRIAS", motivo: motivo.trim() });
          secullum = "lancado";
        }
      }
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
        secullum,
      });
      const wasEditing = Boolean(editingId);
      resetForm();
      await onSaved();
      window.alert(wasEditing ? "Alterações salvas com sucesso!" : "Férias registradas com sucesso!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar as férias.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir este registro de férias?")) return;
    setBusy(true);
    setError("");
    try {
      const vacation = vacations.find((v) => v.id === id);
      const cpf = cpfDigits(employee.cpf);
      if (vacation?.secullum === "lancado" && cpf && vacation.startDate && vacation.endDate) {
        await sincronizarAfastamentoSecullum(user?.id, { acao: "apagar", cpf, inicio: vacation.startDate, fim: vacation.endDate, justificativa: "FÉRIAS" });
      }
      await deleteVacation(id);
      await onSaved();
    } catch (e) {
      setError(`Não foi possível excluir: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // Férias cadastradas antes da integração (ou quando o Secullum recusou): envia agora.
  async function sendToSecullum(vacation: Vacation) {
    const cpf = cpfDigits(employee.cpf);
    if (!cpf || !vacation.startDate || !vacation.endDate || sendingId) return;
    setSendingId(vacation.id);
    setError("");
    try {
      await sincronizarAfastamentoSecullum(user?.id, {
        acao: "lancar", cpf, inicio: vacation.startDate, fim: vacation.endDate, justificativa: "FÉRIAS", motivo: vacation.motivo || "",
      });
      await saveVacation({ ...vacation, secullum: "lancado" });
      await onSaved();
    } catch (e) {
      setError(`Não foi possível enviar ao Secullum: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSendingId("");
    }
  }

  const sorted = [...vacations].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return createPortal(
    <div className="modal-overlay" data-testid="vacation-editor-modal" style={overlayStyle}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ ...dialogStyle, maxWidth: 940, maxHeight: "92vh" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "var(--text)" }}>Férias — {employee.name}</h3>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 14px" }}>
          Admissão: {employee.admissionDate ? formatDate(employee.admissionDate) : "—"}
        </p>
        {baseline ? (
          <div className="vacation-baseline-note">
            <span>
              Até {formatDate(baseline.baseDateISO)}, conforme o relatório da contabilidade ({baseline.reportCompany}, como {baseline.reportName}). Depois disso, calculado pelo sistema.
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                // Mexe no saldo de férias: só com a chave de acesso (a mesma das exclusões protegidas).
                const allowed = await confirmAccessKey({
                  title: "Remover dados do relatório",
                  description: `Remover os dados do relatório da contabilidade de ${employee.name}? As férias voltam a ser calculadas pelo cadastro. Informe a chave de acesso para continuar.`,
                  confirmLabel: "Remover",
                });
                if (!allowed) return;
                await deleteVacationBaseline(employee.id);
                await onSaved();
                onClose();
              }}
            >
              Remover dados do relatório
            </button>
          </div>
        ) : null}

        {showForm ? (
          <>
            {editingId ? (
              <div data-testid="vacation-mode" style={{ fontSize: 12, fontWeight: 700, color: "color-mix(in srgb, #1d4ed8 var(--ink-keep), #e5e7eb)", background: "var(--surface-muted)", border: "1px solid color-mix(in srgb, #bfdbfe var(--tint-line), var(--surface))", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
                Editando lançamento — período aquisitivo {acqYear || "—"}
              </div>
            ) : (
              <div data-testid="vacation-mode" style={{ fontSize: 12, fontWeight: 700, color: "color-mix(in srgb, #047857 var(--ink-keep), #e5e7eb)", background: "color-mix(in srgb, #ecfdf5 var(--tint-keep), var(--surface))", border: "1px solid color-mix(in srgb, #a7f3d0 var(--tint-line), var(--surface))", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
                Novo lançamento — período aquisitivo {acqYear || "—"}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Início das férias
                <input type="date" data-testid="vacation-start" value={start} min={admission || undefined} onChange={(e) => setStart(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
              <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Retorno (último dia)
                <input type="date" data-testid="vacation-end" value={end} min={start || admission || undefined} onChange={(e) => setEnd(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
              <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Período aquisitivo (ano)
                <input type="number" data-testid="vacation-acqyear" value={acqYear} readOnly title="Definido automaticamente pelo período selecionado" placeholder="—" style={{ ...inputStyle, width: "100%", background: "var(--surface-muted)", color: "var(--text-muted)", cursor: "not-allowed" }} />
              </label>
            </div>
            <p style={{ fontSize: 13, color: "var(--text)", margin: "8px 0 0" }}>
              Dias gozados: <strong>{days || "—"}</strong>
            </p>
            {folgaWeekdays.size > 0 ? (
              <p style={{ fontSize: 12, color: "color-mix(in srgb, #b45309 var(--ink-keep), #e5e7eb)", margin: "6px 0 0" }} data-testid="vacation-clt-hint">
                CLT art. 134, §3º: as férias não podem iniciar nos 2 dias que antecedem a folga/repouso semanal do funcionário.
              </p>
            ) : null}

            {selectedPeriodRow ? (
              <div data-testid="vacation-alloc-summary" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "var(--surface-muted)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
                  <span>Direito: <strong>{rightDays} dias</strong></span>
                  <span>Já alocado: <strong>{alocadosOutros} dias</strong></span>
                  <span>Esta inclusão: <strong>{days + soldDays} dias</strong></span>
                  <span style={{ fontWeight: 700, color: restante < 0 ? "color-mix(in srgb, #b91c1c var(--ink-keep), #e5e7eb)" : restante === 0 ? "color-mix(in srgb, #047857 var(--ink-keep), #e5e7eb)" : "color-mix(in srgb, #b45309 var(--ink-keep), #e5e7eb)" }}>
                    {restante < 0 ? `Excede em ${Math.abs(restante)} dias` : restante === 0 ? "Tudo alocado" : `Restam ${restante} dias`}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                  Fracionamento (CLT art. 134, §1º): até 3 períodos, um com no mínimo 14 dias e os demais com no mínimo 5 dias. Venda (abono) limitada a 1/3 (máx. {maxVenda} dias).
                </div>
              </div>
            ) : null}

            <div style={{ marginTop: 12, padding: "10px 12px", border: "1px dashed var(--border)", borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Férias vendidas (abono) — período</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Início da venda
                  <input type="date" data-testid="vacation-sold-start" value={soldStart} min={admission || undefined} onChange={(e) => setSoldStart(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
                <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Fim da venda
                  <input type="date" data-testid="vacation-sold-end" value={soldEnd} min={soldStart || admission || undefined} onChange={(e) => setSoldEnd(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
              </div>
              <p style={{ fontSize: 12, color: "var(--text)", margin: "8px 0 0" }}>
                Dias vendidos: <strong>{soldDays || "—"}</strong>
              </p>
            </div>

            <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginTop: 10 }}>
              Motivo {!start && !end && !soldStart && !soldEnd ? <strong style={{ color: "color-mix(in srgb, #b45309 var(--ink-keep), #e5e7eb)" }}>(obrigatório sem gozo/venda)</strong> : "(opcional)"}
              <input type="text" data-testid="vacation-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: sem histórico, afastamento, etc." style={{ ...inputStyle, width: "100%" }} />
            </label>
            <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginTop: 10 }}>
              Observações
              <input type="text" data-testid="vacation-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opcional" style={{ ...inputStyle, width: "100%" }} />
            </label>

            {error ? <div style={{ color: "color-mix(in srgb, #b91c1c var(--ink-keep), #e5e7eb)", fontSize: 13, marginTop: 10 }}>{error}</div> : null}

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
            <h4 style={{ fontSize: 14, color: "var(--text)", margin: 0 }}>Períodos aquisitivos (CLT — art. 130)</h4>
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
            <div style={{ padding: 12, color: "color-mix(in srgb, #b45309 var(--ink-keep), #e5e7eb)", fontSize: 13 }}>
              Sem data de admissão cadastrada — não é possível calcular os períodos aquisitivos.
            </div>
          ) : (
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-muted)", textAlign: "left", color: "var(--text-muted)" }}>
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
                    <tr key={period.index} data-testid={`vacation-period-${period.year}`} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 10px" }}>
                        {formatDate(period.startISO)} a {formatDate(period.endISO)}
                        {!period.complete ? (
                          <span style={{ marginLeft: 6, fontSize: 10, color: "color-mix(in srgb, #0891b2 var(--ink-keep), #e5e7eb)", fontWeight: 700 }}>(em curso)</span>
                        ) : null}
                      </td>
                      <td style={{ padding: "8px 10px" }}>{period.limitISO ? formatDate(period.limitISO) : "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>{loadingAbsences ? "…" : count}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: right.lost ? "color-mix(in srgb, #b91c1c var(--ink-keep), #e5e7eb)" : "var(--text)" }}>
                        {period.lost ? (
                          <span title={`${period.lost.reason}. Novo período aquisitivo a partir do retorno (${formatDate(period.lost.returnISO)}).`}>
                            0 · Perdido (art. 133)
                          </span>
                        ) : loadingAbsences ? "…" : right.lost ? "0 · Direito perdido" : `${right.days} dias`}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>{gozados || 0}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>{vendidos || 0}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: right.lost ? "color-mix(in srgb, #b91c1c var(--ink-keep), #e5e7eb)" : pendentes > 0 ? "color-mix(in srgb, #b45309 var(--ink-keep), #e5e7eb)" : "color-mix(in srgb, #047857 var(--ink-keep), #e5e7eb)" }}>
                        {loadingAbsences ? "…" : right.lost ? "—" : pendentes}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {!period.complete ? (
                          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Não vencido</span>
                        ) : right.lost ? (
                          <span style={{ fontSize: 11, color: "color-mix(in srgb, #b91c1c var(--ink-keep), #e5e7eb)", fontWeight: 700 }}>Direito perdido</span>
                        ) : pendentes > 0 ? (
                          <span style={{ display: "inline-flex", gap: 6 }}>
                            {periodVacations.length > 0 ? (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: "4px 10px", fontSize: 12 }}
                                data-testid={`vacation-edit-${period.year}`}
                                onClick={() => editVacation(periodVacations[0])}
                              >
                                Editar
                              </button>
                            ) : null}
                            <button
                              className="btn btn-primary"
                              style={{ padding: "4px 10px", fontSize: 12 }}
                              data-testid={`vacation-launch-${period.year}`}
                              onClick={() => launchForPeriod(period.year)}
                            >
                              {periodVacations.length > 0 ? "Fracionar" : "Lançar férias"}
                            </button>
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "color-mix(in srgb, #047857 var(--ink-keep), #e5e7eb)", fontWeight: 700 }}>Concluído</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loadingAbsences ? (
                <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-muted)" }}>Carregando faltas confirmadas…</div>
              ) : null}
            </div>
          )}
        </div>

        {sorted.length > 0 ? (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ fontSize: 14, color: "var(--text)", margin: "0 0 8px" }}>Histórico</h4>
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              {sorted.map((v) => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                  <span>
                    <strong>{v.acquisitionYear ? `Férias ${v.acquisitionYear}` : "Férias"}</strong>{" — "}
                    {v.startDate && v.endDate
                      ? `${formatDate(v.startDate)} a ${formatDate(v.endDate)} (${v.days} dias)`
                      : (v.motivo || "sem período informado")}
                    {v.daysSold
                      ? ` · vendidas: ${v.soldStartDate && v.soldEndDate ? `${formatDate(v.soldStartDate)} a ${formatDate(v.soldEndDate)} (${v.daysSold} dias)` : `${v.daysSold} dias`}`
                      : ""}
                    {v.notes ? ` · ${v.notes}` : ""}
                    {goesToSecullum(v) ? (
                      <span className={`vacation-sync ${v.secullum === "lancado" ? "is-ok" : "is-pending"}`}>
                        {v.secullum === "lancado" ? "No Secullum" : v.secullum === "sem-cpf" ? "Sem CPF" : "Só no DP"}
                      </span>
                    ) : null}
                  </span>
                  <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {v.secullum !== "lancado" && goesToSecullum(v) && cpfDigits(employee.cpf) ? (
                      <button className="btn btn-secondary vacation-send-btn" type="button" onClick={() => void sendToSecullum(v)} disabled={busy || Boolean(sendingId)}>
                        {sendingId === v.id ? "Enviando..." : "Enviar ao Secullum"}
                      </button>
                    ) : null}
                    <button className="icon-button" data-testid={`vacation-edit-hist-${v.id}`} onClick={() => editVacation(v)} aria-label="Editar" disabled={busy}>
                      <Pencil size={14} color="#2563eb" />
                    </button>
                    <button className="icon-button" data-testid={`vacation-delete-${v.id}`} onClick={() => void handleDelete(v.id)} aria-label="Excluir" disabled={busy}>
                      <Trash2 size={14} color="#b91c1c" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
