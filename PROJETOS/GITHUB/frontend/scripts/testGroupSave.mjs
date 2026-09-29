import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = source => ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {buildIndexedGroupAssignments} = await import('data:text/javascript;base64,'+Buffer.from(compile(fs.readFileSync('src/modules/companies/utils/groupEmployeeAssignments.ts','utf8'))).toString('base64'));
const units = Array.from({length:1500},(_,i)=>({id:`u${i}`,type:['department','sector','subsector','team'][i%4],links:[{companyId:'new',sourceId:`s${i}`},{companyId:'old',sourceId:`s${i}`}]}));
const employees = Array.from({length:5000},(_,i)=>({id:`e${i}`,companyId:i%2?'new':'old',departmentId:'s0',sectorId:'s1',subsectorId:'s2',teamId:`s${(i%375)*4+3}`}));
const previous=[{employeeId:'e0',departmentUnitId:'u4',teamUnitId:'deleted'},{employeeId:'e1',teamUnitId:'u7'}];
const expected=employees.map(e=>{
 const old=previous.find(a=>a.employeeId===e.id);
 const pick=type=>old?.[`${type}UnitId`]&&units.some(u=>u.id===old[`${type}UnitId`]&&u.type===type)?old[`${type}UnitId`]:units.find(u=>u.type===type&&u.links.some(l=>l.companyId===e.companyId&&l.sourceId===e[`${type}Id`]))?.id||'';
 return {employeeId:e.id,departmentUnitId:pick('department'),sectorUnitId:pick('sector'),subsectorUnitId:pick('subsector'),teamUnitId:pick('team')};
});
const started=performance.now();const actual=buildIndexedGroupAssignments(units,['old','new'],employees,previous);const elapsed=performance.now()-started;
assert.deepEqual(actual,expected);assert.equal(buildIndexedGroupAssignments(units,['old'],employees,previous).length,2500);
console.log(`PASS: 5000 employees / 1500 units in ${elapsed.toFixed(1)} ms; existing selections and new-company links preserved.`);
const explicitMembers = [{id:'explicit',companyId:'unlisted',groupId:'macro'}, {id:'outside',companyId:'unlisted',groupId:'other'}];
assert.deepEqual(buildIndexedGroupAssignments(units,['old'],explicitMembers,[{employeeId:'explicit',teamUnitId:'u7'}],'macro'),[{employeeId:'explicit',departmentUnitId:'',sectorUnitId:'',subsectorUnitId:'',teamUnitId:'u7'}]);
console.log('PASS: explicit group members retain their team even when company membership is missing; other groups are excluded.');
const page=fs.readFileSync('src/modules/companies/pages/Companies.tsx','utf8');
const tree=ts.createSourceFile('Companies.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let declaration;
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='saveGroupWizard')declaration=node;ts.forEachChild(node,visit)}visit(tree);
const saver=compile(declaration.getText(tree));
function fixture(fails=false){
 let release;const wait=new Promise(resolve=>{release=resolve});const state={closed:0,calls:0,saving:false,error:''};
 const mocks={modalDrafts:{complete:()=>{}},groupWizardSavingRef:{current:false},groupWizardDraft:{id:'g',name:'Macro',companyIds:['old','new'],units:[],employeeAssignments:[],leadershipAssignments:[]},companyGroups:[],normalizeStructureName:s=>s,setGroupWizardSaving:v=>state.saving=v,setGroupWizardError:v=>state.error=v,window:{setTimeout},buildReferenceVirtualUnits:()=>[],mergeGroupUnits:x=>x,data:{employees:[]},buildGroupEmployeeAssignments:()=>[],normalizeCompanyGroups:x=>x,groupMutationQueueRef:{current:Promise.resolve()},persistNormalizedGroups:async()=>{state.calls++;await wait;if(fails)throw new Error('network failed')},setActiveTab:()=>{},closeGroupWizard:()=>state.closed++,alert:()=>{}};
 const save=new Function(...Object.keys(mocks),saver+';return saveGroupWizard;')(...Object.values(mocks));return {save,state,release};
}
for(const fails of [false,true]){const f=fixture(fails);const pending=f.save();await f.save();await new Promise(r=>setTimeout(r,20));assert.equal(f.state.calls,1);assert.equal(f.state.closed,0);assert.equal(f.state.saving,true);f.release();await pending;assert.equal(f.state.saving,false);assert.equal(f.state.closed,fails?0:1);assert.equal(f.state.error,fails?'network failed':'');}
console.log('PASS: save awaits persistence, blocks double submit, keeps draft open on failure, closes only after success.');
