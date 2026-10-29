import { useState } from "react";
import { createPortal } from "react-dom";
import { FileUp, X } from "lucide-react";
import { doc, writeBatch } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import { useAuth } from "@/hooks/useAuth";
import { extractPositionedTextFromPdf } from "@/utils/pdfEmployeeImport";
import { formatDate } from "@/utils/format";
import type { Company, Employee } from "@/types/domain";
import { parseVacationReport, type ReportEmployee, type VacationReport } from "@/modules/vacation/data/vacationReportParser";
import { VACATION_BASELINES_COLLECTION } from "@/modules/vacation/data/vacationsRepository";

// Importa o relatório "Programação de Férias" do Domínio (contabilidade): um PDF por
// empresa. Liga cada linha a um funcionário pelo nome + admissão (o código do
// Domínio não é a nossa matrícula) e mostra uma prévia antes de gravar.

type Match = {
  report: VacationReport;
  row: ReportEmployee;
  employee?: Employee;
  how: "nome e admissão" | "nome" | "aproximado" | "outra empresa" | "manual" | "";
};

const nameKey = (value: string) => value.normalize("NFD").replace(/[^A-Za-z ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const tokens = (value: string) => nameKey(value).split(" ").filter((token) => token.length > 2);

function matchEmployee(row: ReportEmployee, candidates: Employee[]): Pick<Match, "employee" | "how"> {
  const key = nameKey(row.name);
  const sameName = candidates.filter((employee) => nameKey(employee.name) === key);
  const exact = sameName.find((employee) => employee.admissionDate === row.admissionISO);
  if (exact) return { employee: exact, how: "nome e admissão" };
  if (sameName.length === 1) return { employee: sameName[0], how: "nome" };
  // Mesmo dia de admissão e nome quase igual (grafia ou acento diferente).
  const rowTokens = tokens(row.name);
  const close = candidates.filter((employee) => employee.admissionDate === row.admissionISO).map((employee) => {
    const employeeTokens = tokens(employee.name);
    const common = rowTokens.filter((token) => employeeTokens.includes(token)).length;
    return { employee, score: common / Math.max(rowTokens.length, employeeTokens.length, 1) };
  }).filter((item) => item.score >= 0.75).sort((a, b) => b.score - a.score);
  if (close.length === 1 || (close.length > 1 && close[0].score > close[1].score)) return { employee: close[0].employee, how: "aproximado" };
  return { employee: undefined, how: "" };
}

export default function VacationReportImport({ employees, companies, onClose, onImported }: {
  employees: Employee[];
  companies: Company[];
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [reports, setReports] = useState<VacationReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function readFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(""); setDone("");
    try {
      const parsed: VacationReport[] = [];
      for (const file of Array.from(files)) {
        const { lines } = await extractPositionedTextFromPdf(file);
        const report = parseVacationReport(lines.map((line) => line.text));
        if (!report.employees.length) throw new Error(`Não reconheci o relatório "${file.name}". Use o PDF "Programação de Férias" do Domínio.`);
        parsed.push(report);
      }
      const result: Match[] = [];
      parsed.forEach((report) => {
        const company = companies.find((item) => (item.document || "").replace(/\D/g, "") === report.cnpj);
        const candidates = company ? employees.filter((employee) => employee.companyId === company.id) : employees;
        report.employees.forEach((row) => {
          const inCompany = matchEmployee(row, candidates);
          // Não achou na empresa do relatório: pode estar cadastrado em outra empresa do
          // grupo, mas só vale com nome E admissão iguais (admissão diferente = outro
          // contrato, e as férias do contrato antigo não se aplicam). O resto fica à mão.
          const elsewhere = !inCompany.employee && company ? matchEmployee(row, employees) : inCompany;
          const sameContract = elsewhere.employee && elsewhere.how === "nome e admissão";
          result.push({ report, row, ...(inCompany.employee ? inCompany : sameContract ? { ...elsewhere, how: "outra empresa" } : { employee: undefined, how: "" }) });
        });
      });
      setReports(parsed);
      setMatches(result);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Não foi possível ler o PDF.");
    } finally { setBusy(false); }
  }

  async function save() {
    if (!firestore || !matches) return;
    // A mesma pessoa em dois relatórios: vale o de data base mais recente.
    const latest = new Map<string, Match>();
    matches.filter((item) => item.employee).forEach((item) => {
      const previous = latest.get(item.employee!.id);
      if (!previous || item.report.baseDateISO > previous.report.baseDateISO) latest.set(item.employee!.id, item);
    });
    const found = Array.from(latest.values());
    setBusy(true); setError("");
    try {
      const now = new Date().toISOString();
      for (let index = 0; index < found.length; index += 400) {
        const batch = writeBatch(firestore);
        found.slice(index, index + 400).forEach(({ report, row, employee }) => {
          batch.set(doc(firestore!, VACATION_BASELINES_COLLECTION, employee!.id), {
            employeeId: employee!.id,
            companyId: employee!.companyId,
            baseDateISO: report.baseDateISO,
            reportCompany: report.companyName,
            reportCode: row.code,
            reportName: row.name,
            periods: row.periods,
            importedAt: now,
            importedBy: user?.name || user?.username || "",
          });
        });
        await batch.commit();
      }
      setDone(`${found.length} funcionário(s) atualizados com o relatório da contabilidade.`);
      setMatches(null);
      await onImported();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível gravar.");
    } finally { setBusy(false); }
  }

  // Ligação à mão na prévia (nome diferente no cadastro, ex.: nome social).
  function linkManually(target: Match, label: string) {
    const employee = employees.find((item) => employeeLabel(item) === label);
    if (!employee) return;
    setMatches((current) => current?.map((item) => (item === target ? { ...item, employee, how: "manual" } : item)) || null);
  }
  const companyName = (id: string) => companies.find((company) => company.id === id)?.name || "";
  const employeeLabel = (employee: Employee) => `${employee.name} — adm. ${formatDate(employee.admissionDate)} — ${companyName(employee.companyId)}`;

  const found = matches?.filter((item) => item.employee) || [];
  const missing = matches?.filter((item) => !item.employee) || [];
  const approximate = found.filter((item) => item.how !== "nome e admissão");
  const withPending = found.filter(({ report, row }) => row.periods.some((period) => period.endISO < report.baseDateISO && period.daysRemaining > 0));

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="vacation-import-title">
      <div className="modal-panel vacation-import-modal">
        <div className="modal-header">
          <div>
            <h2 id="vacation-import-title">Importar relatório da contabilidade</h2>
            <p className="panel-subtitle">PDF "Programação de Férias" do Domínio, um por empresa. Até a data base vale o que a contabilidade diz; depois dela o sistema calcula.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <label className="document-file-field">
          <input type="file" accept=".pdf" multiple disabled={busy} onChange={(event) => { void readFiles(event.target.files); event.currentTarget.value = ""; }} />
          <span><FileUp size={16} /> {busy && !matches ? "Lendo os PDFs..." : "Escolha um ou mais PDFs do relatório"}</span>
        </label>
        {error ? <p className="vacation-import-error">{error}</p> : null}
        {done ? <p className="vacation-import-done">{done}</p> : null}

        {matches ? (
          <>
            <table className="vacation-import-summary">
              <thead><tr><th>Empresa</th><th>Data base</th><th>No relatório</th><th>Encontrados</th></tr></thead>
              <tbody>
                {reports.map((report) => {
                  const ofReport = matches.filter((item) => item.report === report);
                  return (
                    <tr key={report.cnpj + report.baseDateISO}>
                      <td>{report.companyName}</td>
                      <td>{formatDate(report.baseDateISO)}</td>
                      <td>{report.employees.length}{report.declaredTotal !== null && report.declaredTotal !== report.employees.length ? ` (o PDF diz ${report.declaredTotal})` : ""}</td>
                      <td>{ofReport.filter((item) => item.employee).length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p><strong>{found.length}</strong> funcionário(s) serão atualizados: <strong>{withPending.length}</strong> com férias vencidas pendentes na contabilidade e <strong>{found.length - withPending.length}</strong> em dia até a data base.</p>

            {approximate.length ? (
              <details>
                <summary>{approximate.length} ligado(s) por nome parecido, só pelo nome, em outra empresa ou à mão. Confira</summary>
                <ul className="vacation-import-list">{approximate.map((item) => <li key={item.report.cnpj + item.row.code}>{item.row.name} (relatório, adm. {formatDate(item.row.admissionISO)}) → {item.employee!.name} (sistema, adm. {formatDate(item.employee!.admissionDate)}{item.how === "outra empresa" ? `, cadastrado em ${companyName(item.employee!.companyId)}` : ""}{item.how === "manual" ? ", ligado à mão" : ""})</li>)}</ul>
              </details>
            ) : null}
            {missing.length ? (
              <details open>
                <summary>{missing.length} não encontrado(s) no sistema (não mudam)</summary>
                <ul className="vacation-import-list">{missing.map((item) => (
                  <li key={item.report.cnpj + item.row.code} className="vacation-import-missing">
                    <span>{item.row.name}, adm. {formatDate(item.row.admissionISO)} ({item.report.companyName})</span>
                    <input list="vacation-import-employees" placeholder="Ligar a... (digite o nome)" onChange={(event) => linkManually(item, event.target.value)} />
                  </li>
                ))}</ul>
                <datalist id="vacation-import-employees">{employees.filter((employee) => employee.status !== "terminated").map((employee) => <option key={employee.id} value={employeeLabel(employee)} />)}</datalist>
              </details>
            ) : null}

            <div className="form-actions">
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setMatches(null)}>Cancelar</button>
              <button className="btn btn-primary" type="button" disabled={busy || !found.length} onClick={() => void save()}>{busy ? "Gravando..." : `Confirmar e gravar ${found.length}`}</button>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
