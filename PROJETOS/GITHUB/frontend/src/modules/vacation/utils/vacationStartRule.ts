// CLT art. 134, §3º: é vedado o início das férias nos 2 dias que antecedem
// feriado ou dia de repouso semanal remunerado (DSR).
// 09/11/2026: o DSR é o domingo. O sábado de quem trabalha de segunda a sexta é
// dia útil não trabalhado (compensado), não DSR — antes o sistema travava quinta
// e sexta para todos. Quem trabalha no domingo tem como DSR a folga da escala.

const weekdayByName: Record<string, number> = {
  domingo: 0, segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, sabado: 6,
};

const weekdayLabel = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export type WorkScheduleDay = { day: string; enabled?: boolean };

/** Dias da semana (0 = domingo) que contam como repouso semanal remunerado. */
export function weeklyRestWeekdays(schedule: WorkScheduleDay[] | undefined): Set<number> {
  const offDays = new Set<number>();
  (schedule || []).forEach((d) => {
    if (d.enabled) return;
    const wd = weekdayByName[String(d.day || "").trim().toLowerCase()];
    if (wd !== undefined) offDays.add(wd);
  });
  const worksSunday = (schedule || []).some(
    (d) => d.enabled && weekdayByName[String(d.day || "").trim().toLowerCase()] === 0,
  );
  // Sem escala, ou domingo de folga: DSR = domingo.
  if (!worksSunday || offDays.size === 0) return new Set([0]);
  return offDays;
}

function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function weekdayOfISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function formatBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Motivo do bloqueio (texto para o usuário) ou null se a data de início é permitida. */
export function vacationStartBlockReason(
  startISO: string,
  restWeekdays: Set<number>,
  holidays: Iterable<string>,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO)) return null;
  const holidaySet = new Set(Array.from(holidays, (h) => String(h).trim()));
  for (const offset of [1, 2]) {
    const day = addDaysISO(startISO, offset);
    if (holidaySet.has(day)) {
      return `Pela CLT (art. 134, §3º), as férias não podem iniciar nos 2 dias que antecedem feriado (${formatBR(day)}). Escolha outra data de início.`;
    }
    const wd = weekdayOfISO(day);
    if (restWeekdays.has(wd)) {
      return `Pela CLT (art. 134, §3º), as férias não podem iniciar nos 2 dias que antecedem o repouso semanal (${weekdayLabel[wd]}, ${formatBR(day)}). Escolha outra data de início.`;
    }
  }
  return null;
}

export function weeklyRestLabel(restWeekdays: Set<number>) {
  return Array.from(restWeekdays).sort().map((wd) => weekdayLabel[wd]).join(", ");
}
