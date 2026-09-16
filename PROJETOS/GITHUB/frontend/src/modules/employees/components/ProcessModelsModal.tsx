import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Archive, ChevronDown, FileText, Upload, X } from "lucide-react";
import type { EmployeeDocument } from "@/types/domain";
import "./processModelsModal.css";
export const modelModalities = ["Aviso prévio indenizado", "Aviso prévio do empregado", "Contrato de Experiência", "Desativação rápida"] as const;
export default function ProcessModelsModal({ documents, busy, editable, error, onClose, onUpload, onOpen }: {
  documents: EmployeeDocument[]; busy: boolean; editable: boolean; error: string;
  onClose: () => void; onUpload: (event: React.ChangeEvent<HTMLInputElement>, modality: string) => void;
  onOpen: (document: EmployeeDocument) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return createPortal(<div className="models-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="models-modal" ref={panel} role="dialog" aria-modal="true" aria-labelledby="models-modal-title" onKeyDown={(event) => {
      if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary') || []).filter((item) => item.getClientRects().length);
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    }}>
      <header><span className="models-modal-icon"><Archive size={25} /></span><div><h2 id="models-modal-title">Modelos utilizados</h2><p>Organize seus modelos por modalidade.</p></div><button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Fechar modelos"><X size={20} /></button></header>
      <div className="models-modal-body">
        <p className="models-modal-description">Abra uma gaveta para consultar ou anexar modelos compartilhados.</p>
        <div className="models-drawers">{modelModalities.map((modality, index) => {
          const files = documents.filter((document) => document.folderPath.replace(/^Modelos utilizados\s*\/\s*/i, "").toLocaleLowerCase("pt-BR") === modality.toLocaleLowerCase("pt-BR"));
          return <details key={modality} className={`models-drawer models-tone-${index}`}>
            <summary><span className="models-drawer-icon"><Archive size={23} /></span><span className="models-drawer-heading"><strong>{modality}</strong><small>{files.length} {files.length === 1 ? "modelo disponível" : "modelos disponíveis"}</small></span><ChevronDown size={18} className="models-chevron" /></summary>
            <div className="models-drawer-content">
              {files.length ? <ul>{files.map((document) => <li key={document.id}><button type="button" onClick={() => onOpen(document)}><FileText size={18} /><span>{document.name}<small>{document.size}</small></span></button></li>)}</ul> : <p className="models-empty">Esta gaveta ainda está vazia.</p>}
              {editable && <label className="models-upload"><Upload size={16} /><span>{busy ? "Enviando..." : "Anexar modelos"}</span><input aria-label={`Anexar modelos de ${modality}`} disabled={busy} type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(event) => onUpload(event, modality)} /></label>}
            </div>
          </details>;
        })}</div>
        {error && <p role="alert" className="models-error">{error}</p>}
      </div>
      <footer><span>PDF, Word e imagens · Vários arquivos por modalidade</span><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Fechar</button></footer>
    </div>
  </div>, document.body);
}
