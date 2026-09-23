import ModalPortal from "@/modules/shared/ModalPortal";
import DeleteImpactModal, { type DeleteImpact } from "@/common/components/DeleteImpactModal";

type ConfirmModalProps = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  disabled?: boolean;
  impact?: DeleteImpact;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  destructive = true,
  disabled = false,
  impact,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  if (destructive && impact) {
    return (
      <DeleteImpactModal
        title={title}
        impact={impact}
        confirmLabel={confirmLabel === "Excluir" || confirmLabel === "Apagar" ? "Excluir mesmo assim" : confirmLabel}
        cancelLabel={cancelLabel}
        busy={disabled}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <ModalPortal className="modal-backdrop" role="presentation">
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <h2 id="confirm-modal-title">{title}</h2>
        <p>{description}</p>
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" disabled={disabled} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn ${destructive ? "btn-danger" : "btn-primary"}`} type="button" disabled={disabled} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
