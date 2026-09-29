type HierarchyUnit = {
  id: string;
  type: "department" | "sector" | "subsector" | "team";
  parentUnitId?: string;
  links: { companyId: string; sourceId: string }[];
};

/** Resolve imported units through their source relationships, preserving explicit parents. */
export function resolveTeamHierarchy<T extends HierarchyUnit>(
  units: T[],
  sectors: { id: string; departmentId: string }[],
  subsectors: { id: string; sectorId: string }[],
): T[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const sectorParents = new Map(sectors.map((sector) => [sector.id, sector.departmentId]));
  const subsectorParents = new Map(subsectors.map((subsector) => [subsector.id, subsector.sectorId]));
  return units.map((unit) => {
    const parentType = unit.type === "sector" ? "department" : unit.type === "subsector" ? "sector" : null;
    if (!parentType || byId.get(unit.parentUnitId || "")?.type === parentType) return unit;
    const candidates = new Set<string>();
    for (const link of unit.links) {
      const sourceParent = (unit.type === "sector" ? sectorParents : subsectorParents).get(link.sourceId);
      if (!sourceParent) continue;
      for (const parent of units) {
        if (parent.type === parentType && parent.links.some((parentLink) => parentLink.companyId === link.companyId && parentLink.sourceId === sourceParent)) candidates.add(parent.id);
      }
    }
    // Do not guess if merged source units disagree about their parent.
    return candidates.size === 1 ? { ...unit, parentUnitId: [...candidates][0] } : unit;
  });
}

/** List teams belonging to this department, including its sectors/subsectors. */
export function teamsForDepartment<T extends { id: string; type: string; parentUnitId?: string }>(units: T[], departmentId: string): T[] {
  if (!departmentId) return [];
  const byId = new Map(units.map(unit => [unit.id, unit]));
  if (byId.get(departmentId)?.type !== 'department') return [];
  return units.filter(unit => {
    if (unit.type !== 'team') return false;
    let parentId = unit.parentUnitId || '';
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      if (parentId === departmentId) return true;
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (parent?.type === 'department') return false;
      parentId = parent?.parentUnitId || '';
    }
    return false;
  });
}
