import { UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { canNavigateAway } from "../../navGuard";
import { useNewHiresRh } from "@/modules/employees/data/newHiresRh";
import { securePath } from "@/services/secureRoutes";
import { formatDate } from "@/utils/format";

// "Novos contratados": contratações homologadas no RH aguardando cadastro no DP.
export default function NewHiresMenu() {
  const navigate = useNavigate();
  const hires = useNewHiresRh(true);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function proceed(id: string) {
    if (!canNavigateAway()) return;
    setOpen(false);
    navigate(`${securePath("employees")}?novoContratadoRH=${encodeURIComponent(id)}`);
  }

  return (
    <div className="new-hires" ref={containerRef}>
      <button
        type="button"
        className={`new-hires-button${hires.length ? " has-items" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <UserPlus size={17} />
        Novos contratados
        {hires.length ? <span className="new-hires-count">{hires.length > 9 ? "9+" : hires.length}</span> : null}
      </button>
      {open ? (
        <div className="new-hires-panel" role="dialog" aria-label="Novos contratados">
          <header>
            <strong>Novos contratados</strong>
            <small>Homologados no RH, aguardando cadastro</small>
          </header>
          {hires.length ? (
            <ul>
              {hires.map((hire) => (
                <li key={hire.id}>
                  <div>
                    <strong>{hire.nome}</strong>
                    <span>{hire.cargo || "Função não informada"}</span>
                    <small>Contratado em {formatDate(hire.dataHomologacao)}{hire.empresa ? ` · ${hire.empresa}` : ""}</small>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => proceed(hire.id)}>
                    Prosseguir com cadastro
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="new-hires-empty">Nenhum contratado aguardando cadastro.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
