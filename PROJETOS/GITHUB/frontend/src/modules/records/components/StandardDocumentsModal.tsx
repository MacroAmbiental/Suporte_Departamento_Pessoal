import ModalPortal from "@/modules/shared/ModalPortal";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import type { StandardDocumentRoleOption, StandardDocumentsScopeType } from "@/modules/records/types";

type SelectOption = {
  value: string;
  label: string;
};

type StandardDocumentsModalProps = {
  groupOptions: SelectOption[];
  companyOptions: SelectOption[];
  scopeType: StandardDocumentsScopeType;
  groupId: string;
  companyId: string;
  roleKey: string;
  roles: StandardDocumentRoleOption[];
  text: string;
  saving: boolean;
  onClose: () => void;
  onScopeChange: (scopeType: StandardDocumentsScopeType, scopeId: string) => void;
  onRoleChange: (roleKey: string) => void;
  onTextChange: (text: string) => void;
  onSave: () => void;
};

export default function StandardDocumentsModal({
  groupOptions,
  companyOptions,
  scopeType,
  groupId,
  companyId,
  roleKey,
  roles,
  text,
  saving,
  onClose,
  onScopeChange,
  onRoleChange,
  onTextChange,
  onSave,
}: StandardDocumentsModalProps) {
  const scopeValue = scopeType === "group" ? `group:${groupId}` : `company:${companyId}`;
  const selectedRole = roles.find((role) => role.key === roleKey);
  const missingRoles = roles.filter((role) => !role.isConfigured);
  const scopeSelected = scopeType === "group" ? Boolean(groupId) : Boolean(companyId);

  function handleScopeChange(value: string) {
    if (!value) {
      onScopeChange("company", "");
      return;
    }

    const separatorIndex = value.indexOf(":");
    const nextScopeType = value.slice(0, separatorIndex) as StandardDocumentsScopeType;
    const nextScopeId = value.slice(separatorIndex + 1);
    onScopeChange(nextScopeType, nextScopeId);
  }

  return (
    <ModalPortal className="modal-backdrop" role="presentation">
      <div className="modal-panel wizard-card standard-documents-modal" role="dialog" aria-modal="true" aria-labelledby="standard-documents-title">
        <div className="modal-header">
          <div>
            <h2 id="standard-documents-title">Documentos padrões</h2>
            <p className="muted">Configure os documentos que serão criados automaticamente de acordo com a função cadastrada no funcionário.</p>
          </div>
          <button className="icon-button" type="button" disabled={saving} onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <label className="field is-wide-field">
            Grupo ou empresa
            <select disabled={saving} value={scopeValue} onChange={(event) => handleScopeChange(event.target.value)}>
              <option value="">Selecione um grupo ou empresa</option>
              {groupOptions.length ? (
                <optgroup label="Grupos">
                  {groupOptions.map((group) => <option value={`group:${group.value}`} key={`group-${group.value}`}>{group.label}</option>)}
                </optgroup>
              ) : null}
              <optgroup label="Empresas">
                {companyOptions.map((company) => <option value={`company:${company.value}`} key={`company-${company.value}`}>{company.label}</option>)}
              </optgroup>
            </select>
          </label>

          {scopeSelected && missingRoles.length ? (
            <div className="standard-docs-warning is-wide-field">
              <span><AlertTriangle size={16} /> Funções sem documentos padrões cadastrados</span>
              <div>
                {missingRoles.map((role) => (
                  <small key={role.key} title={role.label}>{role.label}</small>
                ))}
              </div>
            </div>
          ) : null}

          <div className="standard-docs-editor is-wide-field">
            <section className="standard-docs-role-list" aria-label="Funções cadastradas">
              <div className="standard-docs-section-title">
                <strong>Funções cadastradas</strong>
                <span>{roles.length} função(ões)</span>
              </div>

              {roles.map((role) => (
                <button
                  className={`standard-docs-role-button ${role.key === roleKey ? "is-active" : ""} ${role.isConfigured ? "is-configured" : "is-missing"}`}
                  type="button"
                  disabled={saving}
                  key={role.key}
                  onClick={() => onRoleChange(role.key)}
                >
                  <span>
                    <strong>{role.label}</strong>
                    <small>{role.employeeCount} funcionário(s) · {role.companyCount} empresa(s)</small>
                  </span>
                  <em>{role.isConfigured ? `${role.documentCount} docs` : "Sem padrão"}</em>
                </button>
              ))}

              {scopeSelected && !roles.length ? (
                <p className="standard-docs-empty">Nenhuma função cadastrada neste escopo.</p>
              ) : null}
            </section>

            <section className="standard-docs-text-panel">
              <div className="standard-docs-section-title">
                <strong>{selectedRole ? selectedRole.label : "Selecione uma função"}</strong>
                {selectedRole?.isConfigured ? <span><CheckCircle2 size={14} /> configurada</span> : <span>pendente</span>}
              </div>
              <label className="field">
                Documentos padrões da função
                <textarea disabled={saving || !selectedRole} value={text} onChange={(event) => onTextChange(event.target.value)} />
              </label>
              <p className="muted">Informe um documento por linha. Ex.: PGR, PCMSO, Ficha de EPI, ASO, CNH, Contratos e Treinamentos NR.</p>
            </section>
          </div>
        </div>

        <div className="form-actions">
          <button className="btn btn-ghost" disabled={saving} type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving || !selectedRole} type="button" onClick={onSave}>
            {saving ? "Salvando..." : "Salvar documentos padrões"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
