import type { Employee } from "@/types/domain";
import { formatDate, formatDateTime } from "@/utils/format";
import {
  abandonmentChannelLabels,
  abandonmentOutcomeLabels,
  abandonmentStages,
  calendarDaysSince,
  employeeContacts,
  type AbandonmentCase,
  type AbandonmentEvent,
  type AbandonmentOutcome,
  type AbsenceStreak,
} from "./abandonmentModel";

// Relatório do processo de abandono (05/11/2026): tudo o que o DP fez para
// falar com o funcionário, em ordem, com os detalhes de cada registro. Abre
// numa janela para salvar em PDF (mesmo jeito do Parecer de Classificação).

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] || char));

export const abandonmentEventKindLabels: Record<AbandonmentEvent["kind"], string> = {
  system: "Sistema",
  contact: "Contato",
  message: "Mensagem",
  stage: "Mudança de etapa",
  note: "Anotação",
  correction: "Correção",
  closed: "Encerramento",
};

const stageLabel = (stage?: string) => abandonmentStages.find((item) => item.id === stage)?.label || stage || "";

type Input = {
  item: AbandonmentCase;
  employee?: Employee;
  events: AbandonmentEvent[];
  team: string;
  streak?: AbsenceStreak;
  dismissedOn?: string;
  today: string;
  generatedBy: string;
};

function situation({ item, dismissedOn }: Input) {
  if (dismissedOn !== undefined) return `Encerrado — desligado em ${formatDate(dismissedOn)} (estava em ${stageLabel(item.stage)})`;
  if (item.status === "closed") return `Encerrado — ${item.outcome ? abandonmentOutcomeLabels[item.outcome] : ""}`;
  return `Em andamento — ${stageLabel(item.stage)}`;
}

function eventDescription(event: AbandonmentEvent) {
  const parts: string[] = [];
  if (event.channel) parts.push(abandonmentChannelLabels[event.channel] || event.channel);
  if (event.kind === "closed" && event.result) parts.push(abandonmentOutcomeLabels[event.result as AbandonmentOutcome] || event.result);
  else if (event.result) parts.push(event.result);
  if (event.kind === "stage") parts.push(`${stageLabel(event.stageFrom)} → ${stageLabel(event.stageTo)}`);
  return parts.join(" · ");
}

export function openAbandonmentDossier(input: Input) {
  const { item, employee, team, streak, today, generatedBy } = input;
  // Ordem cronológica (o modal mostra do mais novo para o mais antigo).
  const events = [...input.events].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const numberById = new Map(events.map((event, index) => [event.id, index + 1]));
  const correctedBy = new Map(events.filter((event) => event.correctsEventId).map((event) => [event.correctsEventId as string, event]));
  const contacts = employeeContacts(employee);
  const attempts = events.filter((event) => event.kind === "contact" || event.kind === "message").length;

  const rows = events.map((event, index) => {
    const correction = correctedBy.get(event.id);
    const notes = [
      event.notes ? `<div class="notes">${escape(event.notes)}</div>` : "",
      event.correctsEventId ? `<div class="ref">Corrige o registro nº ${numberById.get(event.correctsEventId) ?? "?"}.</div>` : "",
      correction ? `<div class="ref">Corrigido pelo registro nº ${numberById.get(correction.id)} em ${escape(formatDateTime(correction.createdAt))}.</div>` : "",
    ].join("");
    return `<tr class="${correction ? "corrected" : ""}">
      <td class="num">${index + 1}</td>
      <td class="when">${escape(formatDateTime(event.createdAt))}</td>
      <td>${escape(abandonmentEventKindLabels[event.kind] || event.kind)}</td>
      <td>${escape(eventDescription(event))}</td>
      <td>${escape(event.createdBy?.name || "-")}</td>
      <td class="detail">${notes || "—"}</td>
    </tr>`;
  }).join("");

  const field = (label: string, value: unknown) => `<div><span>${escape(label)}</span><b>${escape(value || "—")}</b></div>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Processo de Abandono - ${escape(item.employeeName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: #111; margin: 28px 36px; font-size: 12.5px; }
  .top { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1f3864; padding-bottom: 8px; }
  .top img { height: 48px; }
  h1 { color: #1f3864; font-size: 20px; margin: 0; }
  h2 { color: #1f3864; font-size: 14px; margin: 18px 0 6px; text-transform: uppercase; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 16px; }
  .grid div { display: flex; flex-direction: column; }
  .grid span { color: #555; font-size: 11px; }
  ul { margin: 4px 0; padding-left: 18px; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  th { background: #1f3864; color: #fff; text-align: left; padding: 5px 6px; font-size: 11.5px; }
  td { border: 1px solid #c8cfd8; padding: 5px 6px; vertical-align: top; }
  tr:nth-child(even) td { background: #f3f6fa; }
  tr { page-break-inside: avoid; }
  td.num { width: 28px; text-align: center; }
  td.when { white-space: nowrap; }
  td.detail { width: 38%; }
  .notes { white-space: pre-wrap; }
  .ref { color: #555; font-style: italic; margin-top: 3px; }
  tr.corrected td { color: #666; }
  .note { color: #555; font-size: 11px; margin-top: 8px; }
  .sign { display: flex; gap: 48px; margin-top: 48px; }
  .sign div { flex: 1; border-top: 1px solid #333; padding-top: 4px; text-align: center; font-size: 11.5px; }
  .actions { margin-top: 20px; }
  @media print { body { margin: 12mm 14mm; } .actions { display: none; } }
</style></head><body>
<div class="top">
  <div><h1>Processo de Abandono de Emprego</h1><div>Registro das tentativas de contato — Departamento Pessoal</div></div>
  <img src="${window.location.origin}/logo.png" alt="Macro Ambiental">
</div>

<h2>Funcionário</h2>
<div class="grid">
  ${field("Nome", item.employeeName)}
  ${field("CPF", employee?.cpf)}
  ${field("Matrícula", employee?.registration)}
  ${field("Empresa", item.companyName)}
  ${field("Equipe", team)}
  ${field("Função", [employee?.role, employee?.position].filter(Boolean).join(" / "))}
  ${field("Admissão", formatDate(employee?.admissionDate || ""))}
</div>

<h2>Processo</h2>
<div class="grid">
  ${field("Situação", situation(input))}
  ${field("1ª falta da sequência", formatDate(item.firstAbsenceDate))}
  ${field("Dias corridos desde a 1ª falta", calendarDaysSince(item.firstAbsenceDate, item.closedAt?.slice(0, 10) || today))}
  ${field("Faltas seguidas ao abrir", item.absenceDaysAtOpen)}
  ${field("Faltas seguidas hoje", streak ? streak.days : 0)}
  ${field("Tentativas de contato registradas", attempts)}
  ${field("Aberto por", `${item.openedBy?.name || "-"} em ${formatDateTime(item.openedAt)}`)}
  ${item.closedAt ? field("Encerrado por", `${item.closedBy?.name || "-"} em ${formatDateTime(item.closedAt)}`) : ""}
</div>

<h2>Contatos do cadastro</h2>
${contacts.length ? `<ul>${contacts.map((contact) => `<li><b>${escape(contact.label)}:</b> ${escape(contact.phone || contact.email || contact.raw)}${contact.raw && contact.phone ? ` (${escape(contact.raw)})` : ""}</li>`).join("")}</ul>` : "<p>Nenhum telefone ou e-mail no cadastro.</p>"}

<h2>Histórico de ações (${events.length})</h2>
<table>
  <thead><tr><th>Nº</th><th>Data e hora</th><th>Tipo</th><th>Canal / resultado</th><th>Responsável</th><th>Detalhes</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="6">Nenhum registro.</td></tr>`}</tbody>
</table>
<p class="note">Os registros do sistema não podem ser editados nem apagados; correções aparecem como novos registros ligados ao original.
Gerado em ${escape(formatDateTime(new Date().toISOString()))} por ${escape(generatedBy || "-")}.</p>

<div class="sign"><div>Responsável — Departamento Pessoal</div><div>Gestor / Testemunha</div></div>

<p class="actions"><button onclick="window.print()">Salvar em PDF / imprimir</button></p>
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) throw new Error("O navegador bloqueou a janela do relatório. Libere pop-ups para este site.");
  win.document.open();
  win.document.write(html);
  win.document.close();
}
