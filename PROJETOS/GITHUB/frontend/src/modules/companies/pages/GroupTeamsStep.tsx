import { resolveTeamHierarchy } from "../utils/teamHierarchy";
import { useState, type ReactNode } from "react";
import { Building2, ChevronDown, ChevronRight, Edit2, Folder, Home, Plus, Search, Trash2, Users, Check } from "lucide-react";

type Unit = {
  id: string;
  name: string;
  type: "department" | "sector" | "subsector" | "team";
  parentUnitId?: string;
  links: { companyId: string; sourceId: string }[];
  coordinatorEmployeeId: string;
};
type Props = {
  units: Unit[];
  employees: { id: string; name: string; companyId: string; teamId?: string }[];
  employeeTeamIds: Record<string, string>;
  groupName: string;
  sectors: { id: string; departmentId: string }[];
  subsectors: { id: string; sectorId: string }[];
  onAdd: (parentId: string) => void;
  onUpdate: (id: string, changes: Partial<Unit>) => void;
  onRemove: (id: string) => void;
};
const labels = { department: "Departamento", sector: "Setor", subsector: "Subsetor", team: "Equipe" };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function GroupTeamsStep({ units, employees, employeeTeamIds, groupName, sectors, subsectors, onAdd, onUpdate, onRemove }: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const levels = resolveTeamHierarchy(units, sectors, subsectors).filter((unit) => unit.type !== "team");
  const byId = new Map(levels.map((unit) => [unit.id, unit]));
  const selected = byId.get(selectedId) || levels[0];
  const teams = units.filter((unit) => unit.type === "team" && unit.parentUnitId === selected?.id);
  const visible = new Set<string>();
  const query = normalize(search.trim());
  for (const unit of levels) {
    if (!normalize(unit.name).includes(query)) continue;
    let ancestor: Unit | undefined = unit;
    const visited = new Set<string>();
    while (ancestor && !visited.has(ancestor.id)) {
      visited.add(ancestor.id);
      visible.add(ancestor.id);
      ancestor = byId.get(ancestor.parentUnitId || "");
    }
  }
  const breadcrumbs: Unit[] = [];
  let ancestor = selected;
  while (ancestor && !breadcrumbs.some((item) => item.id === ancestor.id)) {
    breadcrumbs.unshift(ancestor);
    ancestor = byId.get(ancestor.parentUnitId || "")!;
  }
  function renderBranch(unit: Unit, path: string[] = []): ReactNode {
    if (path.includes(unit.id) || !visible.has(unit.id)) return null;
    const children = levels.filter((child) => child.parentUnitId === unit.id);
    const expanded = Boolean(query) || expandedIds.has(unit.id);
    const count = units.filter((item) => item.type === "team" && item.parentUnitId === unit.id).length;
    const Icon = unit.type === "department" ? Building2 : unit.type === "sector" ? Folder : Users;
    return <li key={unit.id}>
      <div className={`team-explorer-node ${selected?.id === unit.id ? "is-selected" : ""}`}>
        {children.length ? <button type="button" className="team-explorer-toggle" aria-label={`${expanded ? "Recolher" : "Expandir"} ${unit.name}`} aria-expanded={expanded} onClick={() => setExpandedIds((current) => {
          const next = new Set(current);
          if (next.has(unit.id)) next.delete(unit.id); else next.add(unit.id);
          return next;
        })}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="team-explorer-spacer" />}
        <button type="button" className="team-explorer-select" aria-current={selected?.id === unit.id ? "true" : undefined} onClick={() => setSelectedId(unit.id)}>
          <Icon size={17} /><span>{unit.name || "Sem nome"}</span><small title="Equipes vinculadas diretamente">{count}</small>
        </button>
      </div>
      {expanded && children.length > 0 && <ul>{children.map((child) => renderBranch(child, [...path, unit.id]))}</ul>}
    </li>;
  }
  return <div className="team-explorer">
    <aside className="team-explorer-sidebar">
      <label className="team-explorer-search"><Search size={17} /><input aria-label="Buscar departamento, setor ou subsetor" placeholder="Buscar departamento, setor ou subsetor..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <nav aria-label="Estrutura das equipes"><ul>{levels.filter((unit) => !byId.has(unit.parentUnitId || "")).map((unit) => renderBranch(unit))}</ul></nav>
      {!visible.size && <p className="team-explorer-muted">{levels.length ? "Nenhum local encontrado." : "Adicione a estrutura na etapa anterior."}</p>}
    </aside>
    <section className="team-explorer-content" aria-label="Equipes do local selecionado">
      {selected ? <>
        <nav className="team-explorer-breadcrumb" aria-label="Local selecionado"><Home size={15} /><span>{groupName || "Grupo"}</span>{breadcrumbs.map((unit) => <span key={unit.id}><ChevronRight size={13} /><button type="button" onClick={() => setSelectedId(unit.id)}>{unit.name || "Sem nome"}</button></span>)}</nav>
        <div className="team-explorer-title"><span className="team-explorer-symbol"><Users size={27} /></span><div><small>{labels[selected.type]}</small><h3>{selected.name || "Sem nome"}</h3><p>Gerencie as equipes vinculadas a este {labels[selected.type].toLowerCase()}.</p></div></div>
        <div className="team-explorer-toolbar"><span className="team-explorer-count"><Users size={17} />{teams.length} {teams.length === 1 ? "equipe" : "equipes"}</span><button type="button" className="btn btn-primary" onClick={() => onAdd(selected.id)}><Plus size={18} /> Nova equipe</button></div>
        <div className="team-explorer-list">
          {!teams.length && <p className="team-explorer-muted">Nenhuma equipe neste local. Clique em “Nova equipe” para começar.</p>}
          {teams.map((team) => {
            const editing = editingId === team.id || !team.name.trim();
            const responsible = employees.find((employee) => employee.id === team.coordinatorEmployeeId);
            const members = employees.filter(employee => employeeTeamIds[employee.id] ? employeeTeamIds[employee.id] === team.id : team.links.some(link => link.companyId === employee.companyId && link.sourceId === employee.teamId));
            return <article className="team-explorer-card" key={team.id}>
              <div className="team-explorer-row"><span className="team-explorer-symbol"><Users size={19} /></span><div className="team-explorer-summary"><strong>{team.name || "Nova equipe"}</strong><p>{responsible ? `Responsável: ${responsible.name}` : "Responsável ainda não definido"}</p></div><div className="team-explorer-actions"><button type="button" className="icon-button" aria-label={`${editing ? "Concluir edição de" : "Editar"} ${team.name || "nova equipe"}`} aria-expanded={editing} disabled={editing && !team.name.trim()} onClick={() => setEditingId(editing ? null : team.id)}>{editing ? <Check size={17} /> : <Edit2 size={17} />}</button><button type="button" className="icon-button team-explorer-delete" aria-label={`Remover ${team.name || "nova equipe"}`} onClick={() => onRemove(team.id)}><Trash2 size={17} /></button></div></div>
              {editing && <div className="group-wizard-team-fields"><label className="field"><span>Nome da equipe</span><input autoFocus value={team.name} onChange={(event) => { setEditingId(team.id); onUpdate(team.id, { name: event.target.value }); }} placeholder="Ex.: Equipe de Montagem A" /></label><label className="field"><span>Responsável</span><select value={team.coordinatorEmployeeId} onChange={(event) => onUpdate(team.id, { coordinatorEmployeeId: event.target.value })}><option value="">Definir depois</option>{members.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label></div>}
            </article>;
          })}
        </div>
      </> : <p className="team-explorer-muted">Cadastre um departamento, setor ou subsetor para organizar as equipes.</p>}
    </section>
  </div>;
}
