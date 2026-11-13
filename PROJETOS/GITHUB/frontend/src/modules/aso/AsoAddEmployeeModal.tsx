import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import ModalPortal from "@/modules/shared/ModalPortal";
import { asoManualReasonLabels, type AsoManualReason } from "@/modules/aso/asoModel";
import { formatDate } from "@/utils/format";

// Funcionário que pode entrar no processo à mão (ativo e sem caso aberto).
export type AsoAddOption = {
  id: string;
  name: string;
  companyName: string;
  teamName: string;
  // Vencimento do ASO vigente em Registros ("" = não tem ASO lá).
  dueDate: string;
};

type Props = {
  options: AsoAddOption[];
  onClose: () => void;
  onSave: (employeeId: string, reason: AsoManualReason, notes: string) => Promise<void>;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MAX_RESULTS = 8;

export default function AsoAddEmployeeModal({ options, onClose, onSave }: Props) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState<AsoManualReason>("function_change");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = options.find((option) => option.id === selectedId);
  const results = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return [];
    return options
      .filter((option) => normalize(`${option.name} ${option.teamName} ${option.companyName}`).includes(term))
      .slice(0, MAX_RESULTS);
  }, [options, search]);

  async function submit() {
    if (!selected) return;
    if (reason === "other" && !notes.trim()) {
      setError("Descreva o motivo na observação.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(selected.id, reason, notes);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível adicionar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal className="modal-backdrop">
      <div className="modal-panel aso-case-modal" role="dialog" aria-modal="true" aria-labelledby="aso-add-title">
        <div className="modal-header">
          <div>
            <h2 id="aso-add-title">Adicionar funcionário ao processo</h2>
            <p className="panel-subtitle">Para correção, mudança de função ou outro motivo fora do vencimento. Ele entra em "Avisado".</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {selected ? (
          <div className="aso-case-step">
            <h3>{selected.name}</h3>
            <p className="abandonment-muted">
              {selected.companyName} · Equipe: {selected.teamName || "sem equipe"} ·{" "}
              {selected.dueDate ? `ASO atual vence em ${formatDate(selected.dueDate)}` : "Sem ASO em Registros (o ASO novo será criado lá ao receber)"}
            </p>
            <div className="form-actions">
              <button className="btn btn-soft" type="button" onClick={() => { setSelectedId(""); setSearch(""); }}>Trocar funcionário</button>
            </div>
          </div>
        ) : (
          <div className="aso-case-step">
            <label className="field">
              Funcionário
              <span className="aso-add-search">
                <Search size={16} />
                <input
                  type="search"
                  autoFocus
                  value={search}
                  placeholder="Digite o nome, equipe ou empresa"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </span>
            </label>
            {search.trim() && !results.length ? (
              <p className="abandonment-muted">Ninguém encontrado. Desligados e quem já está no processo não aparecem.</p>
            ) : null}
            {results.length ? (
              <ul className="aso-add-results">
                {results.map((option) => (
                  <li key={option.id}>
                    <button type="button" onClick={() => setSelectedId(option.id)}>
                      <strong>{option.name}</strong>
                      <small>{option.teamName || "sem equipe"} · {option.companyName}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <div className="aso-case-row">
          <label className="field">
            Motivo
            <select value={reason} onChange={(event) => setReason(event.target.value as AsoManualReason)}>
              {Object.entries(asoManualReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          Observação {reason === "other" ? "(obrigatória)" : "(opcional)"}
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: passou de ajudante para operador de retro" />
        </label>

        {error ? <p className="abandonment-error">{error}</p> : null}
        <div className="form-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="button" disabled={busy || !selected} onClick={() => void submit()}>
            <Check size={16} /> {busy ? "Salvando..." : "Adicionar ao processo"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
