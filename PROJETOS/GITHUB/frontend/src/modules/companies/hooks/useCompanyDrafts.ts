import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type CompanyDraft<T> = { id: string; key?: string; title: string; updatedAt: string; payload: T };
type Active<T> = { key: string; title: string; payload: T };

export function useCompanyDrafts<T>(userId: string, active: Active<T> | null) {
  const storageKey = `companies.modal-drafts.v1:${userId}`;
  const read = (key = storageKey): CompanyDraft<T>[] => {
    try { const parsed = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(parsed) ? parsed.filter(d => d.id && d.payload && d.updatedAt) : []; }
    catch { return []; }
  };
  const [drafts, setDrafts] = useState<CompanyDraft<T>[]>(() => read());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const session = useRef<{key:string; scope:string; id:string; baseline:string; latest:Active<T>; serialized:string} | null>(null);
  const completed = useRef(false);
  const serialized = active ? JSON.stringify(active.payload) : '';
  const write = (items: CompanyDraft<T>[], key = storageKey) => {
    try { localStorage.setItem(key, JSON.stringify(items)); if (key === storageKey) setDrafts(items); setError(''); return true; }
    catch { setError('Nao foi possivel salvar o rascunho neste navegador. Verifique o espaco de armazenamento.'); return false; }
  };
  const save = (explicit = false) => {
    const current = session.current;
    if (!current || completed.current || (!explicit && current.serialized === current.baseline)) return;
    const entry = {id:current.id,key:current.key,title:current.latest.title,updatedAt:new Date().toISOString(),payload:current.latest.payload};
    if (write([entry,...read(current.scope).filter(d=>d.id!==entry.id)], current.scope)) {
      current.baseline = current.serialized;
      if (explicit) setNotice('Rascunho salvo neste navegador.');
    }
  };
  const latestSave = useRef(save);
  latestSave.current = save;
  useLayoutEffect(() => {
    const current = session.current;
    if (!active) { latestSave.current(); session.current=null; completed.current=false; return; }
    if (!current || current.key !== active.key || current.scope !== storageKey) {
      latestSave.current(); completed.current=false;
      session.current={key:active.key,scope:storageKey,id:(!active.key.endsWith(':new') && active.key !== 'structure' ? read().find(draft => draft.key === active.key)?.id : undefined) || crypto.randomUUID(),baseline:serialized,serialized,latest:active};
      setNotice('');
    } else { current.latest=active; current.serialized=serialized; }
    const timer = window.setTimeout(()=>latestSave.current(),250);
    return ()=>clearTimeout(timer);
  }, [serialized, active?.key, storageKey]);
  useEffect(()=>{
    const flush=()=>latestSave.current();
    window.addEventListener('beforeunload',flush); window.addEventListener('pagehide',flush);
    return ()=>{flush();window.removeEventListener('beforeunload',flush);window.removeEventListener('pagehide',flush);};
  }, [storageKey]);
  useEffect(()=>{setDrafts(read());},[storageKey]);
  return {
    drafts,error,notice,save:()=>save(true),
    remove:(id:string)=>write(read().filter(d=>d.id!==id)),
    resume:(draft:CompanyDraft<T>,key:string)=>{
      save();completed.current=false;setNotice('');
      session.current={key,scope:storageKey,id:draft.id,baseline:JSON.stringify(draft.payload),serialized:JSON.stringify(draft.payload),latest:{key,title:draft.title,payload:draft.payload}};
    },
    complete:()=>{
      const id=session.current?.id;
      if(id) write(read().filter(d=>d.id!==id));
      completed.current=true;
    },
  };
}
