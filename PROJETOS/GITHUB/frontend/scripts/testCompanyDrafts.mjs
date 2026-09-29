import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
const listeners=new Map();globalThis.window={setTimeout,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type)}};
let engine;
const React={
 useRef:value=>{const i=engine.index++;return engine.slots[i]??=( {current:value} );},
 useState:initial=>{const i=engine.index++;if(!(i in engine.slots))engine.slots[i]=typeof initial==='function'?initial():initial;const owner=engine;return [engine.slots[i],value=>{owner.slots[i]=typeof value==='function'?value(owner.slots[i]):value}]},
 useLayoutEffect:(fn,deps)=>effect(fn,deps,'layout'),useEffect:(fn,deps)=>effect(fn,deps,'effect'),
};
function effect(fn,deps,kind){const i=engine.index++;const prior=engine.slots[i];if(!prior||deps.some((d,n)=>!Object.is(d,prior.deps[n]))){engine.pending.push({i,fn,deps,kind,cleanup:prior?.cleanup})}}
const code=ts.transpileModule(fs.readFileSync('src/modules/companies/hooks/useCompanyDrafts.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exportsObject={};new Function('require','exports',code)(()=>React,exportsObject);
function harness(){const own={slots:[],index:0,pending:[]};return {render(active,user='u1'){engine=own;own.index=0;own.pending=[];const result=exportsObject.useCompanyDrafts(user,active);for(const kind of ['layout','effect'])for(const item of own.pending.filter(x=>x.kind===kind)){item.cleanup?.();own.slots[item.i]={deps:item.deps,cleanup:item.fn()}}return result},unmount(){own.slots.forEach(slot=>slot?.cleanup?.())}}}
const input=name=>({key:'group:g',title:name,payload:{kind:'group',name,step:4,units:[{id:'team',responsible:'employee'}]}});
const stored=user=>JSON.parse(memory.get('companies.modal-drafts.v1:'+user)||'[]');
let h=harness();h.render(input('Original'));h.render(null);assert.equal(stored('u1').length,0,'untouched opening must not create a draft');
h.render(input('Original'));h.render(input('Changed'));h.render(null);assert.equal(stored('u1')[0].payload.name,'Changed');
h.unmount();h=harness();let api=h.render(null);assert.equal(api.drafts.length,1,'reload restores draft card');const draft=api.drafts[0];api.resume(draft,'group:g');api=h.render({key:'group:g',title:draft.title,payload:draft.payload});api.save();assert.equal(stored('u1').length,1,'resume and save reuse same draft');
h.render(input('Reload latest'));listeners.get('beforeunload')();assert.equal(stored('u1')[0].payload.name,'Reload latest');
api=h.render(input('Reload latest'));api.complete();h.render(null);assert.equal(stored('u1').length,0,'successful save removes without recreating');
h.render(input('Original'));h.render(input('Failed submission'));h.unmount();assert.equal(stored('u1')[0].payload.name,'Failed submission','failed save/unmount retains draft');
h=harness();api=h.render(null,'u2');assert.equal(api.drafts.length,0,'user drafts isolated');h.render(input('Other'),'u2');api=h.render(input('Other'),'u2');api.save();assert.equal(stored('u1')[0].payload.name,'Failed submission');assert.equal(stored('u2')[0].payload.name,'Other');
const write=localStorage.setItem;localStorage.setItem=()=>{throw new Error('quota')};h.render(input('Not saved'),'u2');api=h.render(input('Not saved'),'u2');api.save();assert.ok(h.render(input('Not saved'),'u2').error);localStorage.setItem=write;h.unmount();
console.log('PASS: pristine forms, close, reload, resume, explicit save, completion, failed submission, user isolation, storage errors.');
