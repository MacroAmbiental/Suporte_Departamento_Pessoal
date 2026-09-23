import ModalPortal from "@/modules/shared/ModalPortal";
import { AlertTriangle, Link2, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type DeleteImpactLink = {
  label: string;
  count: number;
  description?: string;
};

export type DeleteImpact = {
  entityType?: string;
  entityLabel: string;
  reasons?: string[];
  links?: DeleteImpactLink[];
  consequences?: string[];
  note?: string;
};

type DeleteImpactModalProps = {
  title?: string;
  impact: DeleteImpact;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function plural(value: number, singular: string, pluralText?: string) {
  return `${value} ${value === 1 ? singular : pluralText || `${singular}s`}`;
}

export default function DeleteImpactModal({
  title,
  impact,
  confirmLabel = "Excluir mesmo assim",
  cancelLabel = "Cancelar",
  busy = false,
  secondaryLabel,
  onSecondary,
  onCancel,
  onConfirm,
}: DeleteImpactModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const links = useMemo(() => (impact.links || []).filter((item) => item.count > 0), [impact.links]);
  const totalLinks = useMemo(() => links.reduce((total, item) => total + item.count, 0), [links]);

  useEffect(() => {
    setAcknowledged(false);
  }, [impact, title]);

  return (
    <ModalPortal className="modal-backdrop" role="presentation">
      <div className="confirm-modal delete-impact-modal" role="dialog" aria-modal="true" aria-labelledby="delete-impact-title">
        <div className="delete-impact-heading">
          <span className="delete-impact-icon" aria-hidden="true"><Trash2 size={20} /></span>
          <div>
            <h2 id="delete-impact-title">{title || `Excluir ${impact.entityType || "registro"}`}</h2>
            <p className="delete-impact-entity">{impact.entityLabel}</p>
          </div>
        </div>

        <div className="delete-impact-alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Esta exclusão exige atenção.</strong>
            <span>
              {totalLinks > 0
                ? ` Foram encontrados ${plural(totalLinks, "vínculo")}. O sistema permitirá continuar depois que você revisar os impactos.`
                : " Nenhum vínculo direto foi encontrado, mas a exclusão ainda removerá este registro do sistema."}
            </span>
          </div>
        </div>

        <section className="delete-impact-section">
          <div className="delete-impact-section-title"><ShieldAlert size={17} /> Por que pode não ser seguro excluir</div>
          <ul>
            {(impact.reasons?.length ? impact.reasons : [
              totalLinks > 0
                ? "O registro ainda é utilizado em outras partes do sistema."
                : "A exclusão é permanente depois que o prazo de desfazer terminar.",
            ]).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </section>

        <section className="delete-impact-section">
          <div className="delete-impact-section-title"><Link2 size={17} /> Vínculos encontrados</div>
          {links.length ? (
            <div className="delete-impact-links">
              {links.map((item) => (
                <div className="delete-impact-link" key={`${item.label}-${item.count}`}>
                  <div>
                    <strong>{item.label}</strong>
                    {item.description ? <span>{item.description}</span> : null}
                  </div>
                  <b>{item.count}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="delete-impact-empty">Nenhum vínculo direto encontrado.</p>
          )}
        </section>

        <section className="delete-impact-section delete-impact-consequences">
          <div className="delete-impact-section-title"><AlertTriangle size={17} /> O que acontecerá se excluir</div>
          <ul>
            {(impact.consequences?.length ? impact.consequences : ["O registro deixará de aparecer nas telas e consultas relacionadas."]).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {impact.note ? <p className="delete-impact-note">{impact.note}</p> : null}

        <label className="delete-impact-acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={busy}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>Li os vínculos e entendo o que acontecerá depois da exclusão.</span>
        </label>

        <div className="form-actions confirm-actions delete-impact-actions">
          {secondaryLabel && onSecondary ? (
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={onSecondary}>{secondaryLabel}</button>
          ) : null}
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button className="btn btn-danger" type="button" disabled={busy || !acknowledged} onClick={onConfirm}>
            {busy ? "Excluindo..." : confirmLabel}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
