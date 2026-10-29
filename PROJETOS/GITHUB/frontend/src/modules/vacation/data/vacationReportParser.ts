// Leitura do relatório "PROGRAMAÇÃO DE FÉRIAS" do Domínio (contabilidade Impacto),
// um PDF por empresa. O texto sai do leitor de PDF com algumas colunas grudadas
// ("26/04/202125/04/2022"); as datas têm tamanho fixo, então dá para separar.

export type ReportPeriod = {
  startISO: string;
  endISO: string;
  daysRight: number;
  daysTaken: number;
  daysRemaining: number;
  limitISO: string;
  absences: number;
};

export type ReportEmployee = {
  code: string;
  name: string;
  admissionISO: string;
  periods: ReportPeriod[];
};

export type VacationReport = {
  companyName: string;
  cnpj: string;
  baseDateISO: string;
  declaredTotal: number | null;
  employees: ReportEmployee[];
};

const D = "(\\d{2}/\\d{2}/\\d{4})";
const toISO = (br: string) => `${br.slice(6, 10)}-${br.slice(3, 5)}-${br.slice(0, 2)}`;
const toNumber = (value: string) => {
  const number = Number(value.replace(".", "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
};
// Fim de cada linha de período: dias dir., goz., rest., limite p/ gozo, afast., faltas
// (os dias de afastamento vêm grudados na data limite: "08/03/202540").
const TAIL = `\\s+([\\d.,]+)\\s+([\\d.,]+)\\s+([\\d.,]+)\\s+${D}\\s*(\\S+)\\s+(\\S+)\\s*$`;
// Nome longo também gruda na data de admissão ("...SERPA16/02/2026").
const EMPLOYEE_LINE = new RegExp(`^(\\d+)\\s+(.+?)\\s*${D}\\s*${D}\\s*(\\d+)\\s+(\\d{2}/\\d{2})\\s+${D}\\s*${D}(.*?)${TAIL}`);
const PERIOD_LINE = new RegExp(`^${D}\\s*${D}(.*?)${TAIL}`);

function period(match: RegExpMatchArray, offset: number): ReportPeriod {
  return {
    startISO: toISO(match[offset]),
    endISO: toISO(match[offset + 1]),
    daysRight: toNumber(match[offset + 3]),
    daysTaken: toNumber(match[offset + 4]),
    daysRemaining: toNumber(match[offset + 5]),
    limitISO: toISO(match[offset + 6]),
    absences: /^\d+$/.test(match[offset + 8]) ? Number(match[offset + 8]) : 0,
  };
}

export function parseVacationReport(lines: string[]): VacationReport {
  const all = lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const header = all.slice(0, 6).join(" ");
  const report: VacationReport = {
    companyName: (all[0] || "").replace(/\s*Página:.*$/i, "").trim(),
    cnpj: (header.match(/CNPJ:\s*([\d./-]+)/i)?.[1] || "").replace(/\D/g, ""),
    baseDateISO: (() => { const date = header.match(new RegExp(`Data base:\\s*${D}`, "i"))?.[1]; return date ? toISO(date) : ""; })(),
    declaredTotal: null,
    employees: [],
  };
  let current: ReportEmployee | null = null;
  for (const line of all) {
    const total = line.match(/Total de empregados:\s*(\d+)/i);
    if (total) { report.declaredTotal = Number(total[1]); continue; }
    const employee = line.match(EMPLOYEE_LINE);
    if (employee) {
      current = { code: employee[1], name: employee[2].trim(), admissionISO: toISO(employee[3]), periods: [period(employee, 7)] };
      report.employees.push(current);
      continue;
    }
    const continuation = line.match(PERIOD_LINE);
    if (continuation && current) current.periods.push(period(continuation, 1));
  }
  return report;
}
