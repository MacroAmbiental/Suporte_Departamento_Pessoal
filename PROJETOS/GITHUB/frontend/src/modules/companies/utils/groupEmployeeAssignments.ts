type UnitType = 'department' | 'sector' | 'subsector' | 'team';
type Unit = { id: string; type: UnitType; links: {companyId: string; sourceId: string}[] };
type Assignment = {employeeId:string; departmentUnitId?:string; sectorUnitId?:string; subsectorUnitId?:string; teamUnitId?:string};
type Employee = {id:string; companyId:string; groupId?:string; departmentId?:string; sectorId?:string; subsectorId?:string; teamId?:string};

/** Index a group's resolved structure once, rather than rebuilding it per employee/field. */
export function buildIndexedGroupAssignments(units: Unit[], companyIds: string[], employees: Employee[], previous: Assignment[], groupId?: string) {
  const companies = new Set(companyIds);
  const existing = new Map(previous.map(item => [item.employeeId,item]));
  const unitTypes = new Map(units.map(unit => [unit.id,unit.type]));
  const sources = new Map<string,string>();
  const key = (type: UnitType, companyId: string, sourceId: string) => JSON.stringify([type,companyId,sourceId]);
  for (const unit of units) for (const link of unit.links) {
    const sourceKey = key(unit.type,link.companyId,link.sourceId);
    if (!sources.has(sourceKey)) sources.set(sourceKey,unit.id);
  }
  return employees.filter(employee=>(companies.has(employee.companyId) || Boolean(groupId && employee.groupId === groupId))).map(employee=>{
    const assignment = existing.get(employee.id);
    const resolve = (type:UnitType, explicit?:string, sourceId?:string) => explicit && unitTypes.get(explicit) === type ? explicit : sourceId ? sources.get(key(type,employee.companyId,sourceId)) || '' : '';
    return {
      employeeId:employee.id,
      departmentUnitId:resolve('department',assignment?.departmentUnitId,employee.departmentId),
      sectorUnitId:resolve('sector',assignment?.sectorUnitId,employee.sectorId),
      subsectorUnitId:resolve('subsector',assignment?.subsectorUnitId,employee.subsectorId),
      teamUnitId:resolve('team',assignment?.teamUnitId,employee.teamId),
    };
  });
}
