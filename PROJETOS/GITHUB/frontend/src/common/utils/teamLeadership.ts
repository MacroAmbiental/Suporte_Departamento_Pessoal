import type { CompanyGroupEmployeeAssignment, CompanyGroupUnit, DomainSnapshot, Employee } from '@/types/domain';
import type { EntityBatchMutation } from '@/services/domainRepository';

export type EmployeeStructureSelection = Pick<CompanyGroupEmployeeAssignment, 'groupId' | 'departmentUnitId' | 'sectorUnitId' | 'subsectorUnitId' | 'teamUnitId'>;

export function employeeTeamUnitId(data: Pick<DomainSnapshot, 'companyGroupEmployeeAssignments' | 'companyGroupUnitLinks' | 'companyGroupUnits'>, employee: Employee) {
  const assignment = data.companyGroupEmployeeAssignments.find(a => a.employeeId === employee.id && (!employee.groupId || a.groupId === employee.groupId));
  const linked = data.companyGroupUnitLinks.filter(l => l.sourceType === 'team' && l.sourceId === employee.teamId && l.companyId === employee.companyId);
  return assignment?.teamUnitId || linked.find(l => data.companyGroupUnits.some(u => u.id === l.groupUnitId && u.active !== false))?.groupUnitId || '';
}

export function employeeLeadershipChanges(data: DomainSnapshot, employee: Employee, selection?: EmployeeStructureSelection) {
  const previous = data.employees.find(e => e.id === employee.id);
  const teamChanged = previous && (previous.teamId !== employee.teamId || previous.companyId !== employee.companyId || previous.groupId !== employee.groupId);
  const lookup = teamChanged ? { ...data, companyGroupEmployeeAssignments: data.companyGroupEmployeeAssignments.filter(a => a.employeeId !== employee.id) } : data;
  const teamId = selection ? selection.teamUnitId || '' : employeeTeamUnitId(lookup, employee);
  const target = data.companyGroupUnits.find(u => u.id === teamId && u.type === 'team' && u.active !== false);
  const units = data.companyGroupUnits.filter(u => u.type === 'team' && (u.id === target?.id || u.coordinatorEmployeeId === employee.id));
  if (units.some(unit => unit.active !== false && unit.coordinatorEmployeeId === employee.id && unit.id !== target?.id)) {
    throw new Error('Antes de mudar a equipe deste funcionario, remova ou substitua seu responsavel na etapa 4 do grupo.');
  }
  // Employee editing only reflects the owner chosen in the group management screen.
  const savedEmployee = { ...employee, isTeamLead: Boolean(target && target.coordinatorEmployeeId === employee.id) };
  const mutations: EntityBatchMutation[] = [{ type: 'set', collection: 'employees', item: savedEmployee }];
  if (!selection && teamChanged) {
    const old = data.companyGroupEmployeeAssignments.find(a => a.employeeId === employee.id && a.groupId === employee.groupId);
    if (old || target) selection = { groupId: target?.groupId || old!.groupId, departmentUnitId: old?.departmentUnitId || '', sectorUnitId: old?.sectorUnitId || '', subsectorUnitId: old?.subsectorUnitId || '', teamUnitId: target?.id || '' };
  }
  if (selection) {
    const old = data.companyGroupEmployeeAssignments.find(a => a.employeeId === employee.id && a.groupId === selection.groupId);
    mutations.push({type:'set',collection:'companyGroupEmployeeAssignments',item:{...old,...selection,id:old?.id || `${selection.groupId}-${employee.id}`,employeeId:employee.id,createdAt:old?.createdAt || employee.updatedAt,updatedAt:employee.updatedAt} as CompanyGroupEmployeeAssignment});
  }
  return {employee: savedEmployee, mutations, expectedOwners:Object.fromEntries(units.map(u=>[u.id,u.coordinatorEmployeeId || '']))};
}

export function groupLeadershipEmployees(data: DomainSnapshot, groupId: string, units: CompanyGroupUnit[], assignments: CompanyGroupEmployeeAssignment[], now: string) {
  const teams = units.filter(u => u.type === 'team');
  const oldTeams = data.companyGroupUnits.filter(u => u.groupId === groupId && u.type === 'team');
  const owners = new Map<string,string>();
  for (const team of teams) {
    if (!team.coordinatorEmployeeId) continue;
    if (owners.has(team.coordinatorEmployeeId)) throw new Error('Um funcionario so pode ser encarregado da equipe a que esta vinculado.');
    const employee = data.employees.find(e => e.id === team.coordinatorEmployeeId);
    const memberTeam = assignments.find(a=>a.employeeId === employee?.id)?.teamUnitId || (employee && employeeTeamUnitId(data,employee));
    if (!employee || memberTeam !== team.id) throw new Error(`O responsavel de ${team.name} deve ser um funcionario vinculado a essa equipe.`);
    owners.set(employee.id,team.id);
  }
  const affectedIds = new Set([...assignments.map(a=>a.employeeId),...oldTeams.map(u=>u.coordinatorEmployeeId || ''),...owners.keys()]);
  return data.employees.filter(e=>affectedIds.has(e.id) && Boolean(e.isTeamLead) !== owners.has(e.id)).map(e=>({...e,isTeamLead:owners.has(e.id),updatedAt:now}));
}
