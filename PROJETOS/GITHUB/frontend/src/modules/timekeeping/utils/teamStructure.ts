import type { DomainSnapshot, Employee, Team } from '@/types/domain';

export function timekeepingTeamStructure(data: Pick<DomainSnapshot, 'teams' | 'companyGroupUnits' | 'companyGroupUnitLinks' | 'companyGroupEmployeeAssignments' | 'companyGroupCompanies'>) {
  const units = data.companyGroupUnits.filter(unit => unit.type === 'team');
  const unitById = new Map(units.map(unit => [unit.id, unit]));
  const teams: Team[] = [...data.teams, ...units.map(unit => ({ ...unit, companyId: '' }))];
  const assignments = new Map(data.companyGroupEmployeeAssignments.map(item => [`${item.groupId}:${item.employeeId}`, item]));
  function employeeTeamId(employee: Employee) {
    const groupId = employee.groupId || data.companyGroupCompanies.find(item => item.companyId === employee.companyId)?.groupId;
    const assignment = assignments.get(`${groupId}:${employee.id}`);
    if (assignment && !assignment.teamUnitId) return '';
    if (assignment?.teamUnitId && unitById.get(assignment.teamUnitId)?.groupId === groupId) return assignment.teamUnitId;
    const link = data.companyGroupUnitLinks.find(item => item.sourceType === 'team' && item.companyId === employee.companyId && item.sourceId === employee.teamId && item.groupId === groupId && unitById.has(item.groupUnitId));
    return link?.groupUnitId || employee.teamId || '';
  }
  function teamsForCompany(companyId: string) {
    const groupIds = new Set(data.companyGroupCompanies.filter(item => item.companyId === companyId).map(item => item.groupId));
    return teams.filter(team => team.active !== false && (team.groupId ? groupIds.has(team.groupId) : team.companyId === companyId));
  }
  return { teams, employeeTeamId, teamsForCompany };
}

/** Counts only people in the current date/company/status scope, before team filters. */
export function timekeepingTeamOptions(teams: Team[], employees: Employee[], teamIdFor: (employee: Employee) => string) {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const employee of employees) {
    if (seen.has(employee.id)) continue;
    seen.add(employee.id);
    const id = teamIdFor(employee);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const byId = new Map(teams.map(team => [team.id, team]));
  const names = new Map<string, number>();
  for (const id of counts.keys()) {
    const name = byId.get(id)?.name || id;
    names.set(name, (names.get(name) || 0) + 1);
  }
  return Array.from(counts, ([id, count]) => {
    const name = byId.get(id)?.name || id;
    return { value: id, label: `${name}${(names.get(name) || 0) > 1 ? ` ? ${id}` : ''} (${count})` };
  });
}
