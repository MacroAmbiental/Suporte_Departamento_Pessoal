// Processo de abandono de emprego (Controle RH > Monitoramento).
// Quem chega a ABANDONMENT_TRIGGER_DAYS faltas confirmadas seguidas aparece em "Sinalizado";
// o caso só é gravado quando alguém do DP o assume. O histórico (events) é só de inclusão:
// a tela não edita nem apaga registros — um erro vira um novo registro de correção.
import type { Employee, TimeRecord } from "@/types/domain";

export const ABANDONMENT_TRIGGER_DAYS = 3;
// Janela de dias de ponto salvos usada para medir a sequência atual de faltas.
export const ABANDONMENT_LOOKBACK_DAYS = 75;

export const ABANDONMENT_CASES_COLLECTION = "abandonmentCases";
export const ABANDONMENT_EVENTS_SUBCOLLECTION = "events";

export type AbandonmentStage = "contact" | "family" | "summons" | "waiting" | "closed";

export const abandonmentStages: Array<{ id: AbandonmentStage; label: string; hint: string }> = [
  { id: "contact", label: "Contato direto", hint: "Ligações e mensagens para o funcionário" },
  { id: "family", label: "Família / encarregado", hint: "Contato de emergência, encarregado, visita" },
  { id: "summons", label: "Convocação formal", hint: "Telegrama, carta com AR ou e-mail com prazo" },
  { id: "waiting", label: "Aguardando prazo", hint: "Prazo da convocação correndo" },
  { id: "closed", label: "Encerrado", hint: "Retornou, pediu demissão ou desligado" },
];

export type AbandonmentOutcome = "returned" | "returned_justified" | "resigned" | "dismissed_abandonment";

export const abandonmentOutcomeLabels: Record<AbandonmentOutcome, string> = {
  returned: "Retornou sem justificativa",
  returned_justified: "Retornou com justificativa / atestado",
  resigned: "Pediu demissão",
  dismissed_abandonment: "Desligado por abandono de emprego",
};

export type AbandonmentChannel = "call" | "whatsapp" | "email" | "visit" | "family" | "telegram" | "registered_letter" | "other";

export const abandonmentChannelLabels: Record<AbandonmentChannel, string> = {
  call: "Ligação",
  whatsapp: "WhatsApp",
  email: "E-mail",
  visit: "Visita",
  family: "Contato com família",
  telegram: "Telegrama",
  registered_letter: "Carta com AR",
  other: "Outro",
};

export const abandonmentResultOptions = [
  "Atendeu",
  "Não atendeu",
  "Caixa postal / recado deixado",
  "Número inexistente / errado",
  "Mensagem enviada",
  "Mensagem respondida",
  "AR entregue",
  "AR devolvido",
  "Outro",
];

export type AbandonmentPerson = { id: string; name: string };

export type AbandonmentCase = {
  id: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  companyName: string;
  stage: AbandonmentStage;
  status: "open" | "closed";
  firstAbsenceDate: string;
  absenceDaysAtOpen: number;
  openedAt: string;
  openedBy: AbandonmentPerson;
  stageChangedAt: string;
  updatedAt: string;
  outcome?: AbandonmentOutcome;
  closedAt?: string;
  closedBy?: AbandonmentPerson;
};

export type AbandonmentEventKind = "system" | "contact" | "message" | "stage" | "note" | "correction" | "closed";

export type AbandonmentEvent = {
  id: string;
  kind: AbandonmentEventKind;
  createdAt: string;
  createdBy: AbandonmentPerson;
  channel?: AbandonmentChannel;
  result?: string;
  notes?: string;
  stageFrom?: AbandonmentStage;
  stageTo?: AbandonmentStage;
  correctsEventId?: string;
};

export type AbsenceStreak = {
  employeeId: string;
  days: number;
  firstDate: string;
  lastDate: string;
  // Faltas ainda não confirmadas pelo DP dentro da sequência: não somam nem interrompem.
  pendingDates: string[];
};

// Dia "completo": salvo com pelo menos metade dos registros do maior dia da janela. Dias salvos só
// com parte do quadro (ex.: o dia de hoje com 3 registros) não contam nem interrompem a sequência.
export function completeSavedDates(tables: Array<{ date: string; recordCount?: number }>) {
  const countByDate = new Map<string, number>();
  tables.forEach((table) => countByDate.set(table.date, (countByDate.get(table.date) || 0) + Number(table.recordCount || 0)));
  const max = Math.max(0, ...countByDate.values());
  return [...countByDate.entries()]
    .filter(([, count]) => count >= max * 0.5)
    .map(([date]) => date)
    .sort((left, right) => right.localeCompare(left));
}

// Sequência atual de faltas confirmadas: anda dos dias completos mais recentes para trás, só nos
// dias úteis do funcionário (fim de semana e feriado ficam de fora), e para no primeiro dia sem falta.
// Falta pendente de confirmação é pulada: não soma nem corta a sequência.
export function currentAbsenceStreak(
  employee: Employee,
  completeDatesDesc: string[],
  absentDates: Set<string>,
  pendingDates: Set<string>,
  isUsefulDay: (employee: Employee, date: string) => boolean,
): AbsenceStreak | null {
  const dates: string[] = [];
  const pending: string[] = [];
  for (const date of completeDatesDesc) {
    if (employee.admissionDate && date < employee.admissionDate) break;
    if (!isUsefulDay(employee, date)) continue;
    if (pendingDates.has(date)) { pending.push(date); continue; }
    if (!absentDates.has(date)) break;
    dates.push(date);
  }
  if (!dates.length) return null;
  return {
    employeeId: employee.id,
    days: dates.length,
    firstDate: dates[dates.length - 1],
    lastDate: dates[0],
    pendingDates: pending.filter((date) => date > dates[dates.length - 1]).reverse(),
  };
}

export function calendarDaysSince(date: string, today: string) {
  if (!date || !today) return 0;
  const start = new Date(`${date}T12:00:00`).getTime();
  const end = new Date(`${today}T12:00:00`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000) + 1);
}

export function isAbsenceConfirmed(record: Pick<TimeRecord, "status">) {
  return record.status === "absence_confirmed";
}

// ---- Contatos e mensagens (mesma abordagem do RH: o sistema só abre o WhatsApp/Gmail com o texto pronto).

export type AbandonmentContact = { label: string; phone?: string; email?: string; raw?: string };

export function normalizeWhatsappPhone(value: string): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length >= 12) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return null;
}

export function whatsappLink(phone: string, message: string) {
  const number = normalizeWhatsappPhone(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

// Link de composição do Gmail: funciona sem programa de e-mail padrão no Windows (mailto não funcionava no RH).
export function gmailLink(email: string, subject: string, message: string) {
  const params = new URLSearchParams({ view: "cm", fs: "1", to: email, su: subject, body: message });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function employeeContacts(employee: Employee | undefined): AbandonmentContact[] {
  if (!employee) return [];
  const data = employee.registrationData || {};
  const contacts: AbandonmentContact[] = [];
  const seen = new Set<string>();
  const addPhone = (label: string, value?: string) => {
    const number = normalizeWhatsappPhone(value || "");
    if (!number || seen.has(number)) return;
    seen.add(number);
    contacts.push({ label, phone: String(value).trim() });
  };
  addPhone("Celular do funcionário", data.mobilePhone);
  addPhone("Telefone do funcionário", employee.phone);
  addPhone("Telefone residencial", data.homePhone);
  const emergency = String(employee.complement?.emergencyContact || data.emergencyContact || "").trim();
  if (emergency) {
    const phone = emergency.match(/(\+?\d[\d\s().-]{8,}\d)/)?.[1];
    if (phone && normalizeWhatsappPhone(phone) && !seen.has(normalizeWhatsappPhone(phone)!)) {
      seen.add(normalizeWhatsappPhone(phone)!);
      contacts.push({ label: "Contato de emergência", phone, raw: emergency });
    } else {
      contacts.push({ label: "Contato de emergência", raw: emergency });
    }
  }
  const email = String(employee.complement?.email || data.email || "").trim();
  if (email.includes("@")) contacts.push({ label: "E-mail do funcionário", email });
  return contacts;
}

export type AbandonmentTemplate = "first_contact" | "family" | "summons";

export const abandonmentTemplateLabels: Record<AbandonmentTemplate, string> = {
  first_contact: "Contato com o funcionário",
  family: "Contato com a família",
  summons: "Convocação formal (com prazo)",
};

function firstName(name: string) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "";
}

function brDate(date: string) {
  return date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : "";
}

// Textos-base editáveis na tela antes de enviar. A convocação formal deve ser validada pelo jurídico.
export function abandonmentMessage(template: AbandonmentTemplate, params: {
  employeeName: string;
  companyName: string;
  firstAbsenceDate: string;
  absenceDays: number;
}) {
  const company = params.companyName || "a empresa";
  const since = brDate(params.firstAbsenceDate);
  if (template === "family") {
    return `Olá! Aqui é do Departamento Pessoal da ${company}. Estamos tentando falar com ${params.employeeName}, que não comparece ao trabalho desde ${since}. `
      + `Você poderia pedir para ${firstName(params.employeeName)} entrar em contato conosco, ou nos avisar se está tudo bem? Obrigado.`;
  }
  if (template === "summons") {
    return `Prezado(a) ${params.employeeName},\n\n`
      + `Constatamos que V.Sa. não comparece ao trabalho desde ${since}, sem apresentar justificativa até o momento. `
      + `Pela presente, CONVOCAMOS V.Sa. a retornar às atividades ou justificar as ausências no prazo de 48 (quarenta e oito) horas a contar do recebimento desta comunicação, `
      + `sob pena de caracterização de abandono de emprego, nos termos do art. 482, alínea "i", da CLT.\n\n`
      + `Departamento Pessoal — ${company}`;
  }
  return `Olá, ${firstName(params.employeeName)}! Aqui é do Departamento Pessoal da ${company}. `
    + `Notamos que você não compareceu ao trabalho desde ${since} (${params.absenceDays} dia(s) de falta). Está tudo bem? `
    + `Por favor, entre em contato conosco para nos contar o que aconteceu e combinarmos o seu retorno.`;
}
