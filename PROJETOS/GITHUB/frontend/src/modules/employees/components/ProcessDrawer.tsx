import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export default function ProcessDrawer({ name, onClose, children, subtitle = "Processo de funcionário" }: { name: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  return createPortal(<div className="process-drawer-backdrop">
    <div className="process-drawer" ref={panel} role="dialog" aria-modal="true" aria-labelledby="process-drawer-title" onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') || []);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><div><small>{subtitle}</small><h2 id="process-drawer-title">{name}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar detalhes"><X size={20} /></button></header>
      <div className="process-drawer-body">{children}</div>
    </div>
  </div>, document.body);
}
