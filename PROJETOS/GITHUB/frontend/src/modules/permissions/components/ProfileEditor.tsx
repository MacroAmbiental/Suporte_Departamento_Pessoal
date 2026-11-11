import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { screenGroups, systemScreens } from "@/services/accessControl";
import type { AppScreen, Employee, PermissionAction, PermissionProfileTarget, PermissionProfileTargetType } from "@/types/domain";
import { currentLevel, levelActions, levelHints, levelLabels, screenLevels, type AccessLevel } from "../profileLevels";

export type ProfileDraft = {
  id?: string;
  name: string;
  description: string;
  active: boolean;
  targets: PermissionProfileTarget[];
  permissions: Partial<Record<AppScreen, PermissionAction[]>>;
};

export type TargetOption = { value: string; label: string };

export const targetTypeLabels: Record<PermissionProfileTargetType, string> = {
  company: "Empresa",
  department: "Departamento",
  sector: "Setor",
  subsector: "Subsetor",
  position: "Cargo",
  role: "Função",
  employee: "Funcionário",
  group: "Grupo",
};

const pickerTypes: PermissionProfileTargetType[] = ["company", "department", "sector", "subsector", "position", "role", "employee"];

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Props = {
  draft: ProfileDraft;
  onChange: (draft: ProfileDraft) => void;
  disabled: boolean;
  canGrant: (screen: AppScreen, action: PermissionAction) => boolean;
  targetOptions: Record<PermissionProfileTargetType, TargetOption[]>;
  describeTarget: (target: PermissionProfileTarget) => string;
  matchedEmployees: Employee[];
  loginEmployeeIds: Set<string>;
  loginLinkedCount: number;
  requireCompany: boolean;
};

function TargetPicker({ options, existing, onAdd, onCancel }: {
  options: Record<PermissionProfileTargetType, TargetOption[]>;
  existing: PermissionProfileTarget[];
  onAdd: (target: PermissionProfileTarget) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<PermissionProfileTargetType>("sector");
  const [search, setSearch] = useState("");
  const term = normalize(search);
  const results = options[type]
    .filter((option) => !existing.some((target) => target.type === type && target.value === option.value))
    .filter((option) => !term || normalize(option.label).includes(term))
    .slice(0, 12);

  return (
    <div className="profile-target-picker">
      <div className="profile-target-picker-row">
        <select value={type} onChange={(event) => { setType(event.target.value as PermissionProfileTargetType); setSearch(""); }} aria-label="Tipo de vínculo">
          {pickerTypes.map((item) => <option key={item} value={item}>{targetTypeLabels[item]}</option>)}
        </select>
        <label className="profile-target-search">
          <Search size={15} />
          <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Buscar ${targetTypeLabels[type].toLowerCase()}`} />
        </label>
        <button type="button" className="icon-button" onClick={onCancel} aria-label="Fechar"><X size={16} /></button>
      </div>
      <div className="profile-target-results">
        {results.map((option) => (
          <button key={option.value} type="button" onClick={() => onAdd({ type, value: option.value })}>{option.label}</button>
        ))}
        {!results.length ? <span className="muted">Nada encontrado.</span> : null}
      </div>
    </div>
  );
}

export default function ProfileEditor({ draft, onChange, disabled, canGrant, targetOptions, describeTarget, matchedEmployees, loginEmployeeIds, loginLinkedCount, requireCompany }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [filter, setFilter] = useState("");
  const term = normalize(filter);
  const visibleScreens = systemScreens.filter((screen) => !term || normalize(`${screen.label} ${screen.group} ${screen.hint || ""}`).includes(term));
  const withLogin = useMemo(() => matchedEmployees.filter((employee) => loginEmployeeIds.has(employee.id)), [matchedEmployees, loginEmployeeIds]);
  const hasCompany = draft.targets.some((target) => target.type === "company");
  const hasRelation = draft.targets.some((target) => target.type !== "company");

  function setLevel(screenKey: AppScreen, level: AccessLevel) {
    const screen = systemScreens.find((item) => item.key === screenKey)!;
    onChange({ ...draft, permissions: { ...draft.permissions, [screenKey]: levelActions(screen, level) } });
  }

  function setGroupLevel(group: string, level: AccessLevel) {
    const permissions = { ...draft.permissions };
    systemScreens.filter((screen) => screen.group === group).forEach((screen) => {
      // Tela que não tem o nível pedido fica no maior nível que ela tem abaixo dele.
      const levels = screenLevels(screen);
      const order: AccessLevel[] = ["none", "view", "edit", "full"];
      const target = [...levels].reverse().find((item) => order.indexOf(item) <= order.indexOf(level)) || "none";
      const actions = levelActions(screen, target);
      if (actions.every((action) => canGrant(screen.key, action))) permissions[screen.key] = actions;
    });
    onChange({ ...draft, permissions });
  }

  return (
    <div className="profile-editor">
      <div className="profile-editor-fields">
        <label className="field">
          Nome do perfil
          <input value={draft.name} disabled={disabled} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="Ex.: Analista de DP" />
        </label>
        <label className="field">
          Descrição (opcional)
          <input value={draft.description} disabled={disabled} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="Para que serve este perfil" />
        </label>
      </div>

      <section className="profile-section">
        <header>
          <h3>Quem recebe</h3>
          <small>Quem se encaixa em pelo menos um vínculo recebe o perfil. Se tiver empresa, precisa ser de uma das empresas marcadas.</small>
        </header>
        <div className="profile-target-chips">
          {draft.targets.map((target) => (
            <span className="profile-target-chip" key={`${target.type}-${target.value}`}>
              {describeTarget(target)}
              {!disabled ? (
                <button type="button" aria-label={`Remover ${describeTarget(target)}`} onClick={() => onChange({ ...draft, targets: draft.targets.filter((item) => item !== target) })}><X size={13} /></button>
              ) : null}
            </span>
          ))}
          {!draft.targets.length ? <span className="muted">Nenhum vínculo: o perfil só vale para quem o recebe no cadastro do login (Funcionários).</span> : null}
          {!disabled && !pickerOpen ? (
            <button type="button" className="profile-target-add" onClick={() => setPickerOpen(true)}><Plus size={14} /> Adicionar</button>
          ) : null}
        </div>
        {pickerOpen && !disabled ? (
          <TargetPicker
            options={targetOptions}
            existing={draft.targets}
            onCancel={() => setPickerOpen(false)}
            onAdd={(target) => { onChange({ ...draft, targets: [...draft.targets, target] }); setPickerOpen(false); }}
          />
        ) : null}
        {requireCompany && (!hasCompany || !hasRelation) ? (
          <p className="profile-warning">Para o seu nível de acesso, o perfil precisa de uma empresa e de pelo menos mais um vínculo.</p>
        ) : null}
        <div className="profile-preview">
          {draft.targets.length ? (
            <>
              <strong>{matchedEmployees.length} pessoa(s) se encaixam</strong>
              <span> · {withLogin.length} com login no sistema{loginLinkedCount ? ` · mais ${loginLinkedCount} pelo cadastro do login` : ""}</span>
              {matchedEmployees.length ? (
                <button type="button" className="profile-link" onClick={() => setShowPeople((current) => !current)}>{showPeople ? "esconder" : "ver quem"}</button>
              ) : null}
              {showPeople ? (
                <ul className="profile-people">
                  {matchedEmployees.slice(0, 200).map((employee) => (
                    <li key={employee.id}>{employee.name}{loginEmployeeIds.has(employee.id) ? <em> · tem login</em> : null}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : loginLinkedCount ? <span>{loginLinkedCount} login(s) recebem pelo cadastro.</span> : null}
        </div>
      </section>

      <section className="profile-section">
        <header>
          <h3>O que pode fazer</h3>
          <input className="permission-filter" type="search" placeholder="Buscar tela" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Buscar tela" />
        </header>
        {screenGroups.map((group) => {
          const groupScreens = visibleScreens.filter((screen) => screen.group === group);
          if (!groupScreens.length) return null;
          return (
            <div className="profile-level-group" key={group}>
              <div className="profile-level-group-title">
                <span>{group}</span>
                {!disabled ? (
                  <span className="profile-level-group-actions">
                    Todo o grupo:
                    {(["none", "view", "edit", "full"] as AccessLevel[]).map((level) => (
                      <button key={level} type="button" onClick={() => setGroupLevel(group, level)}>{levelLabels[level]}</button>
                    ))}
                  </span>
                ) : null}
              </div>
              {groupScreens.map((screen) => {
                const level = currentLevel(screen, draft.permissions[screen.key]);
                return (
                  <div className="profile-level-row" key={screen.key}>
                    <div className="profile-level-name">
                      <strong>{screen.label}</strong>
                      {screen.hint ? <small>{screen.hint}</small> : null}
                      {level === "custom" ? <small className="profile-custom">Personalizado: {(draft.permissions[screen.key] || []).join(", ")}. Fica assim até escolher um nível.</small> : null}
                    </div>
                    <div className="profile-level-options" role="radiogroup" aria-label={`Nível em ${screen.label}`}>
                      {screenLevels(screen).map((option) => {
                        const allowed = levelActions(screen, option).every((action) => canGrant(screen.key, action));
                        return (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={level === option}
                            title={allowed ? levelHints[option] : "Você só pode repassar o que você mesmo tem."}
                            className={`profile-level-option is-${option}${level === option ? " is-selected" : ""}`}
                            disabled={disabled || !allowed}
                            onClick={() => setLevel(screen.key, option)}
                          >
                            {levelLabels[option]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {!visibleScreens.length ? <p className="muted">Nenhuma tela encontrada.</p> : null}
      </section>
    </div>
  );
}
