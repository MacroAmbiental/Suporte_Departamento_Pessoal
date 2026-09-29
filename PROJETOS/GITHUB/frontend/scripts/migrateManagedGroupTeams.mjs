import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, getDocsFromServer, doc, runTransaction, getDocFromServer } from 'firebase/firestore';
import { teamCatalog } from './groupTeamsCatalog.mjs';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const slug = value => normalize(value).replace(/[^a-z0-9]+/g, '-');
const collections = ['companyGroups','companyGroupCompanies','companyGroupUnits','companyGroupUnitLinks','companyGroupEmployeeAssignments','companyGroupLeadershipAssignments','departments','sectors','subsectors','teams','employees'];

export function planMigration(data, overrides = {}) {
  const groups = data.companyGroups.filter(g => normalize(g.name) === 'grupo macro' && g.active !== false);
  if (groups.length !== 1) throw new Error('Esperado exatamente um Grupo Macro ativo.');
  const group = groups[0];
  const linked = new Set(data.companyGroupCompanies.filter(c => c.groupId === group.id).map(c => c.companyId));
  const employees = data.employees.filter(e => e.groupId === group.id || (!e.groupId && linked.has(e.companyId)));
  const companyIds = [...new Set([...linked, ...employees.map(e => e.companyId).filter(Boolean)])];
  const units = data.companyGroupUnits.filter(u => u.groupId === group.id && u.active !== false);
  const assignments = data.companyGroupEmployeeAssignments.filter(a => a.groupId === group.id);
  const now = new Date().toISOString();
  const changes = new Map();
  const pending = [];
  const targets = [];
  function set(name, id, fields) {
    const old = data[name].find(d => d.id === id);
    const prior = changes.get(`${name}/${id}`)?.after || old;
    const after = { ...prior, ...fields, id, createdAt: prior?.createdAt || now };
    if (Object.entries(fields).every(([key,value]) => isDeepStrictEqual(old?.[key],value))) return;
    after.updatedAt = now;
    changes.set(`${name}/${id}`, {collection:name,id,before:old || null,after});
  }
  const departments = new Map();
  for (const department of Object.keys(teamCatalog)) {
    const matches = units.filter(u => u.type === 'department' && normalize(u.name) === normalize(department));
    if (matches.length !== 1) throw new Error(`Departamento ambiguo: ${department}`);
    departments.set(department,matches[0]);
    for (const companyId of companyIds) {
      const sources = data.departments.filter(d => d.companyId === companyId && normalize(d.name) === normalize(department) && d.active !== false);
      if (sources.length !== 1) throw new Error(`Departamento de origem ambiguo: ${department} / ${companyId}`);
      const links = data.companyGroupUnitLinks.filter(l => l.groupId === group.id && l.groupUnitId === matches[0].id && l.companyId === companyId);
      for (const id of links.length ? links.map(l => l.id) : [`migration-link-${matches[0].id}-${companyId}`]) {
        set('companyGroupUnitLinks',id,{groupId:group.id,groupUnitId:matches[0].id,companyId,sourceId:sources[0].id,sourceType:'department'});
      }
    }
    for (const [name,leaderName] of teamCatalog[department]) {
      const leaders = leaderName ? employees.filter(e => normalize(e.name) === normalize(leaderName) && e.status !== 'terminated') : [];
      if (leaderName && leaders.length !== 1) throw new Error(`Encarregado ausente ou ambiguo: ${leaderName}`);
      const id = `managed-team-${group.id}-${slug(department)}-${slug(name)}`;
      const sourceId = `source-${id}`;
      const leaderId = leaders[0]?.id || '';
      set('companyGroupUnits',id,{groupId:group.id,type:'team',name,parentUnitId:matches[0].id,coordinatorEmployeeId:leaderId,active:true});
      const departmentId = data.departments.find(d => d.companyId === group.divergenceSourceCompanyId && normalize(d.name) === normalize(department))?.id;
      if (!departmentId) throw new Error(`Sem departamento de referencia: ${department}`);
      set('teams',sourceId,{name,groupId:group.id,companyId:group.divergenceSourceCompanyId,departmentId,active:true});
      for (const companyId of companyIds) set('companyGroupUnitLinks',`migration-link-${id}-${companyId}`,{groupId:group.id,groupUnitId:id,companyId,sourceId,sourceType:'team'});
      if (leaderId) set('companyGroupLeadershipAssignments',`group-unit-responsible-${id}-lider`,{groupId:group.id,unitId:id,employeeId:leaderId,role:'lider'});
      targets.push({id,sourceId,name,department,departmentUnitId:matches[0].id,leaderId});
    }
  }
  const aliases = new Map([['sidenilson','sidenilson santos vieira'],['guilherme','guilherme de jesus santos']]);
  let migratedEmployees = 0;
  const mappedEmployeeIds = new Set();
  for (const employee of employees) {
    const existing = assignments.filter(a => a.employeeId === employee.id);
    if (existing.length > 1) throw new Error(`Vinculos duplicados do funcionario ${employee.id}`);
    const assignment = existing[0];
    // User explicitly requested these two obsolete Oziel assignments be cleared.
    if (['employee-mr26mm5c-80u7c5c', 'employee-mr3hxri2-9mf7opb'].includes(employee.id) && !employee.teamId) {
      if (assignment?.teamUnitId) set('companyGroupEmployeeAssignments',assignment.id,{teamUnitId:''});
      continue;
    }
    const sourceTeam = data.teams.find(t => t.id === employee.teamId);
    const assignedTeam = data.companyGroupUnits.find(u => u.id === assignment?.teamUnitId);
    const teamName = sourceTeam?.name || assignedTeam?.name || '';
    if (!teamName) continue;
    const departmentName = overrides[employee.id] || data.departments.find(d => d.id === employee.departmentId)?.name || data.companyGroupUnits.find(u => u.id === assignment?.departmentUnitId)?.name || '';
    const normalizedTeam = aliases.get(normalize(teamName)) || normalize(teamName);
    const candidates = targets.filter(t => normalize(t.name) === normalizedTeam && (!departmentName || normalize(t.department) === normalize(departmentName)));
    if (candidates.length !== 1) {
      pending.push({id:employee.id,name:employee.name,department:departmentName,team:teamName,reason:candidates.length ? 'Departamento ausente' : 'Equipe fora da lista'});
      continue;
    }
    const target = candidates[0];
    const departmentId = data.departments.find(d => d.companyId === employee.companyId && normalize(d.name) === normalize(target.department))?.id;
    if (!departmentId) throw new Error(`Departamento ausente na empresa de ${employee.id}`);
    set('employees',employee.id,{groupId:group.id,teamId:target.sourceId,departmentId,isTeamLead:employee.id === target.leaderId});
    set('companyGroupEmployeeAssignments',assignment?.id || `${group.id}-${employee.id}`,{groupId:group.id,employeeId:employee.id,departmentUnitId:target.departmentUnitId,teamUnitId:target.id,sectorUnitId:assignment?.sectorUnitId || '',subsectorUnitId:assignment?.subsectorUnitId || ''});
    mappedEmployeeIds.add(employee.id);
    migratedEmployees++;
  }
  for (const target of targets) {
    if (target.leaderId && !mappedEmployeeIds.has(target.leaderId)) throw new Error(`Encarregado nao migrado: ${target.name}`);
  }
  // Retire replaced units only when no unresolved employee still depends on them.
  const targetIds = new Set(targets.map(t => t.id));
  for (const unit of units.filter(u => u.type === 'team' && !targetIds.has(u.id))) {
    const matched = targets.some(t => normalize(t.name) === (aliases.get(normalize(unit.name)) || normalize(unit.name)));
    if (!matched) continue;
    const unresolved = assignments.some(a => a.teamUnitId === unit.id && !mappedEmployeeIds.has(a.employeeId));
    if (!unresolved) set('companyGroupUnits',unit.id,{active:false});
  }
  return {changes:[...changes.values()],pending,summary:{group:group.name,teams:targets.length,leaders:targets.filter(t=>t.leaderId).length,mappedEmployees:migratedEmployees,pending:pending.length},targets};
}

async function main() {
  const apply = process.argv.includes('--apply');
  const overridesPath = process.argv.find(a => a.startsWith('--overrides='))?.slice('--overrides='.length);
  const overrides = overridesPath ? JSON.parse(readFileSync(overridesPath,'utf8')) : {};
  let app;
  try {
    let data;
    let db;
    if (apply || process.argv.includes('--live')) {
      for (const file of ['.env','.env.local']) if (existsSync(file)) {
        for (const line of readFileSync(file,'utf8').split(/\r?\n/)) {
          const i = line.indexOf('=');
          if (i > 0 && !line.trim().startsWith('#')) process.env[line.slice(0,i).trim()] ??= line.slice(i+1).trim().replace(/^['"]|['"]$/g,'');
        }
      }
      app = initializeApp({apiKey:process.env.VITE_FIREBASE_API_KEY,projectId:process.env.VITE_FIREBASE_PROJECT_ID,appId:process.env.VITE_FIREBASE_APP_ID});
      db = getFirestore(app);
      data = Object.fromEntries(await Promise.all(collections.map(async name => [name,(await getDocsFromServer(collection(db,name))).docs.filter(d=>d.id!=='__schema').map(d=>({...d.data(),id:d.id}))])));
    } else data = JSON.parse(readFileSync('group-teams-snapshot.local','utf8'));
    const plan = planMigration(data,overrides);
    console.log(JSON.stringify({...plan.summary,operations:plan.changes.length,byCollection:plan.changes.reduce((a,c)=>(a[c.collection]=(a[c.collection]||0)+1,a),{}),pending:plan.pending},null,2));
    if (!apply) return;
    const backup = `group-teams-backup-${Date.now()}.local`;
    writeFileSync(backup,JSON.stringify(plan,null,2),{flag:'wx'});
    console.log(`Backup: ${backup}`);
    for (let offset=0;offset<plan.changes.length;offset+=150) {
      const chunk = plan.changes.slice(offset,offset+150);
      await runTransaction(db,async tx => {
        const current = await Promise.all(chunk.map(c=>tx.get(doc(db,c.collection,c.id))));
        current.forEach((snapshot,i)=>{
          const actual = snapshot.exists() ? {...snapshot.data(),id:snapshot.id} : null;
          if (!isDeepStrictEqual(actual,chunk[i].before)) throw new Error(`Alteracao concorrente: ${chunk[i].collection}/${chunk[i].id}`);
        });
        chunk.forEach(c=>tx.set(doc(db,c.collection,c.id),c.after));
      });
      console.log(`Gravados ${Math.min(offset+chunk.length,plan.changes.length)}/${plan.changes.length}`);
    }
    for (let offset=0;offset<plan.changes.length;offset+=40) {
      await Promise.all(plan.changes.slice(offset,offset+40).map(async c=>{
        const actual = await getDocFromServer(doc(db,c.collection,c.id));
        if (!isDeepStrictEqual(actual.data(),c.after)) throw new Error(`Falha na verificacao: ${c.collection}/${c.id}`);
      }));
    }
    console.log('Verificacao concluida: todos os documentos conferem com o plano.');
  } finally { if(app) await deleteApp(app); }
}
if (process.argv[1]?.replaceAll('\\','/').endsWith('/migrateManagedGroupTeams.mjs')) main().catch(e=>{console.error(e.message);process.exitCode=1;});
