import type { Employee, EmployeePromotion } from "@/types/domain";
import { formatDate } from "@/utils/format";
import { CRITERIA, monthName, type ClassificationCase } from "./classificationModel";

// Parecer de Classificação no mesmo formato do documento do RH (exemplo: parecer
// do Carlito Catarino). Abre numa janela para imprimir ou salvar em PDF.

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] || char));
const SIGNAL_COLORS: Record<string, string> = { green: "#00b050", yellow: "#ffc000", red: "#e03131" };

type Input = {
  item: ClassificationCase;
  employee?: Employee;
  teamName: string;
  promotions: EmployeePromotion[];
};

export function openOpinionDocument({ item, employee, teamName, promotions }: Input) {
  const opinion = item.opinion || {};
  const survey = item.survey || {};
  const salary = (value?: string | number) => (value === undefined || value === "" ? "" : ` – ${escape(typeof value === "number" ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : value)}`);
  const currentRole = [item.currentRole, item.currentPosition].filter(Boolean).join(" / ");
  const marks = (criterion: string) => {
    const answer = opinion.criteria?.[criterion] || "";
    return ["atende", "parcial", "nao"].map((option) => `<td class="mark">${answer === option ? "x" : ""}</td>`).join("");
  };
  const history = promotions
    .filter((promotion) => promotion.employeeId === item.employeeId)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const historyLines = [
    `Data de admissão: ${escape(formatDate(employee?.admissionDate || ""))}`,
    ...history.map((promotion) => `${escape(promotion.newRole || promotion.newPosition)}: a partir de ${escape(formatDate(promotion.effectiveDate))}`),
    `Função atual (${escape(currentRole || "—")}): ${history.length ? `desde ${escape(formatDate(history[history.length - 1].effectiveDate))}` : `${escape(formatDate(employee?.admissionDate || ""))}`} – atualmente`,
  ];

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Parecer de Classificação - ${escape(item.employeeName)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; color: #000; margin: 32px 48px; font-size: 14px; }
  .logo { text-align: right; } .logo img { height: 56px; }
  h1 { text-align: center; color: #1f3864; margin: 18px 0 4px; font-size: 24px; }
  h2 { text-align: center; color: #1f3864; margin: 0 0 28px; font-size: 17px; }
  p { margin: 4px 0; } b { font-weight: 700; }
  .signal { height: 18px; border: 1px solid #333; margin: 8px 0 22px; }
  h3 { font-size: 14px; margin: 22px 0 6px; }
  table { border-collapse: collapse; width: 82%; }
  th { background: #4472c4; color: #fff; padding: 5px 8px; border: 1px solid #333; }
  td { padding: 4px 8px; border: 1px solid #333; } td.mark { text-align: center; width: 18%; }
  tr:nth-child(even) td { background: #dae3f3; }
  ul { margin: 4px 0; }
  @media print { body { margin: 18mm 20mm; } button { display: none; } }
</style></head><body>
<div class="logo"><img src="${window.location.origin}/logo.png" alt="Macro Ambiental"></div>
<h1>PARECER DE CLASSIFICAÇÃO</h1>
<h2>${escape(item.employeeName.toUpperCase())}</h2>
<p><b>EQUIPE:</b> ${escape(teamName || item.request.equipe || "—")}</p>
<p><b>FUNÇÃO ATUAL:</b> ${escape(currentRole || "—")}${salary(employee?.salary)}</p>
${opinion.nextRole ? `<p><b>FUNÇÃO SEGUINTE:</b> ${escape(opinion.nextRole)}${salary(opinion.nextRoleSalary)}</p>` : ""}
<p><b>FUNÇÃO PRETENDIDA:</b> ${escape(item.request.funcaoSolicitada)}${salary(opinion.targetRoleSalary)}</p>
<p><b>SOLICITANTE:</b> ${escape(item.request.solicitante)}</p>
<h3>SINALIZAÇÃO:</h3>
<div class="signal" style="background:${SIGNAL_COLORS[opinion.signal || ""] || "#fff"}"></div>
<h3>MOTIVOS PARA A SOLICITAÇÃO:</h3>
<ul>${item.request.motivos.map((motivo) => `<li>${escape(motivo)}</li>`).join("")}${item.request.informacaoAdicional ? `<li>${escape(item.request.informacaoAdicional)}</li>` : ""}</ul>
<p>Já desempenha a função: ${escape(item.request.jaDesempenha)} (${escape(item.request.haQuantoTempo)}). Tempo no cargo atual: ${escape(item.request.tempoNoCargo)}.</p>
<h3>DESCRIÇÃO DO CARGO (RECURSOS HUMANOS)</h3>
<table><thead><tr><th>CRITÉRIOS</th><th>ATENDE</th><th>ATENDE PARCIALMENTE</th><th>NÃO ATENDE</th></tr></thead>
<tbody>${CRITERIA.map((criterion) => `<tr><td>${escape(criterion)}</td>${marks(criterion)}</tr>`).join("")}</tbody></table>
${survey.sameRoleInTeam !== undefined ? `<p style="margin-top:8px">Pessoas na equipe que já exercem a função pretendida: ${escape(survey.sameRoleInTeam)}.</p>` : ""}
${opinion.summary ? `<p style="margin-top:8px">${escape(opinion.summary)}</p>` : ""}
<h3>LIDER DIRETO (${escape((survey.leaderName || item.request.solicitante).toUpperCase())})</h3>
<p>“${escape(survey.leaderText || "")}”</p>
<h3>SEGURANÇA DO TRABALHO${survey.safetyBy ? ` (${escape(survey.safetyBy.toUpperCase())})` : ""}</h3>
<p>${escape(survey.safetyText || "")}</p>
<h3>ASSIDUIDADE (DEPARTAMENTO PESSOAL)</h3>
${(survey.attendance || []).map((month) => `<p>${escape(monthName(month.month))}: ${month.absences} FALTAS / ${month.certificates} ATESTADOS</p>`).join("") || "<p>—</p>"}
${survey.rhText ? `<p>${escape(survey.rhText)}</p>` : ""}
<h3>HISTÓRICO FUNCIONAL (DEPARTAMENTO PESSOAL)</h3>
${historyLines.map((line) => `<p>${line}</p>`).join("")}
<p style="margin-top:28px"><button onclick="window.print()">Imprimir / salvar em PDF</button></p>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) throw new Error("O navegador bloqueou a janela do parecer. Libere pop-ups para este site.");
  win.document.open();
  win.document.write(html);
  win.document.close();
}
