import type { TeamNameEntry } from '@/types/domain';

// Histórico de nomes da equipe (Estrutura da empresa). Renomear não muda o passado:
// cada data mostra o nome que valia nela. validFrom vazio = desde sempre.

type NamedUnit = { name: string; nameHistory?: TeamNameEntry[] };

const SOURCE_PREFIX = 'source-';

function sortHistory(history: TeamNameEntry[]) {
  return [...history].sort((first, second) => first.validFrom.localeCompare(second.validFrom));
}

/** Nome da equipe na data (YYYY-MM-DD). Sem histórico, vale o nome atual. */
export function teamNameOn(unit: NamedUnit, date: string): string {
  const history = unit.nameHistory || [];
  if (!history.length || !date) return unit.name;
  let found = '';
  for (const entry of sortHistory(history)) {
    if (entry.validFrom <= date.slice(0, 10)) found = entry.name;
  }
  return found || sortHistory(history)[0].name;
}

/**
 * Registra a troca de nome. A primeira troca guarda o nome anterior como "desde sempre".
 * Nomes que começariam na data nova ou depois dela são substituídos pelo novo.
 */
export function registerTeamRename(
  history: TeamNameEntry[] | undefined,
  previousName: string,
  nextName: string,
  validFrom: string,
): TeamNameEntry[] {
  const base: TeamNameEntry[] = history?.length ? history : [{ name: previousName, validFrom: '' }];
  const kept = base.filter((entry) => entry.validFrom < validFrom || entry.validFrom === '');
  if (!validFrom) return [{ name: nextName, validFrom: '' }];
  return sortHistory([...kept, { name: nextName, validFrom }]);
}

/**
 * Resolve o nome pelo id usado no ponto/funcionário (id da equipe da Estrutura ou "source-" + id).
 * Só usa o histórico quando existe; senão devolve o fallback (comportamento anterior).
 */
export function resolveTeamNameOn(
  teamId: string,
  date: string,
  unitsById: Map<string, NamedUnit>,
  fallback: string,
): string {
  if (!teamId) return fallback;
  const unit = unitsById.get(teamId)
    || (teamId.startsWith(SOURCE_PREFIX) ? unitsById.get(teamId.slice(SOURCE_PREFIX.length)) : undefined);
  if (!unit?.nameHistory?.length) return fallback;
  return teamNameOn(unit, date);
}

/** Lista de equipes com o nome que valia na data (só muda as que têm histórico). */
export function teamsNamedOn<T extends { id: string; name: string }>(
  teams: T[],
  units: Array<{ id: string; type?: string } & NamedUnit>,
  date: string,
): T[] {
  const unitsById = new Map(units.filter((unit) => unit.nameHistory?.length).map((unit) => [unit.id, unit] as const));
  if (!unitsById.size) return teams;
  return teams.map((team) => {
    const name = resolveTeamNameOn(team.id, date, unitsById, team.name);
    return name === team.name ? team : { ...team, name };
  });
}
