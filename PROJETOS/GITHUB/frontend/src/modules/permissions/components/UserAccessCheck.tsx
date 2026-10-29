import { useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, TriangleAlert, UserSearch } from "lucide-react";
import { useDomainData } from "@/hooks/useDomainData";
import { permissionActions, systemScreens } from "@/services/accessControl";
import { effectivePermissions, profilesForUser } from "@/services/permissionProfiles";
import type { PermissionAction } from "@/types/domain";

// "Perdi acesso": mostra quais acessos salvos valem para a pessoa, o que ela tem
// gravado hoje e o que deveria ter (a soma dos acessos). Se estiver diferente,
// "Reaplicar acessos" grava a soma.
const actionOrder = permissionActions.map((item) => item.key);
const sortActions = (actions: Iterable<PermissionAction>) => Array.from(new Set(actions)).sort((a, b) => actionOrder.indexOf(a) - actionOrder.indexOf(b));
const actionLabel = (action: PermissionAction) => permissionActions.find((item) => item.key === action)?.label || action;

function ActionChips({ actions, tone }: { actions: PermissionAction[]; tone?: "missing" | "extra" }) {
  if (!actions.length) return <span className="muted">—</span>;
  return <span className="access-chips">{actions.map((action) => <span key={action} className={`access-chip${tone ? ` is-${tone}` : ""}`}>{actionLabel(action)}</span>)}</span>;
}

export default function UserAccessCheck({ canManage }: { canManage: boolean }) {
  const data = useDomainData();
  const [text, setText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const users = useMemo(() => data.systemUsers
    .filter((systemUser) => !systemUser.isAdmin)
    .sort((left, right) => (left.name || left.username).localeCompare(right.name || right.username, "pt-BR")), [data.systemUsers]);
  const label = (systemUser: (typeof users)[number]) => `${systemUser.name || systemUser.username} (${systemUser.username})`;
  const selected = users.find((systemUser) => label(systemUser) === text);
  const employee = selected ? data.employees.find((item) => item.id === selected.employeeId) : undefined;
  const applied = selected ? profilesForUser(selected, employee, data.permissionProfiles) : [];
  const expected = selected ? effectivePermissions(selected, employee, data.permissionProfiles) : {};
  const current = useMemo(() => {
    const map = new Map<string, PermissionAction[]>();
    if (selected) data.systemPermissions.filter((permission) => permission.userId === selected.id).forEach((permission) => map.set(permission.screen, permission.actions));
    return map;
  }, [data.systemPermissions, selected]);

  const rows = systemScreens.map((screen) => {
    const has = sortActions(current.get(screen.key) || []);
    const should = sortActions(expected[screen.key] || []);
    return {
      screen,
      has,
      missing: should.filter((action) => !has.includes(action)),
      extra: has.filter((action) => !should.includes(action)),
    };
  }).filter((row) => row.has.length || row.missing.length);
  const different = rows.filter((row) => row.missing.length || row.extra.length);
  const visibleRows = showAll ? rows : different;

  async function reapply() {
    if (!selected) return;
    setBusy(true); setMessage("");
    try {
      await data.replaceUserPermissions(selected.id, expected);
      setMessage("Acessos reaplicados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível reaplicar os acessos.");
    } finally { setBusy(false); }
  }

  return (
    <article className="panel user-access-check">
      <div className="user-access-head">
        <div>
          <h2 className="panel-title"><UserSearch size={18} /> Conferir acesso de uma pessoa</h2>
          <p className="muted">Para quando alguém disser "perdi acesso": os acessos salvos que valem para a pessoa e o que ela tem hoje.</p>
        </div>
        <input list="user-access-check-users" value={text} onChange={(event) => { setText(event.target.value); setMessage(""); setShowAll(false); }} placeholder="Digite o nome ou o login e escolha na lista" />
        <datalist id="user-access-check-users">{users.map((systemUser) => <option key={systemUser.id} value={label(systemUser)} />)}</datalist>
      </div>

      {selected ? (
        <div className="user-access-body">
          <div className="user-access-profiles">
            <span className="user-access-label">Acessos que valem ({applied.length})</span>
            {applied.length ? applied.map((item) => (
              <span key={item.profile.id} className={`access-profile${item.reason === "login" ? " is-login" : ""}`} title={item.reason === "login" ? "Acesso salvo do login" : "Vale pelo público do acesso (empresa, setor, cargo...)"}>
                {item.profile.name}{item.reason === "login" ? " · login" : ""}
              </span>
            )) : <span className="muted">Nenhum acesso salvo ativo vale para esta pessoa.</span>}
          </div>

          {different.length ? (
            <div className="user-access-status is-warning">
              <TriangleAlert size={18} />
              <span>{different.length} tela(s) diferente(s) da soma dos acessos.</span>
              {canManage ? <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void reapply()}><RefreshCw size={15} /> {busy ? "Reaplicando..." : "Reaplicar acessos"}</button> : null}
            </div>
          ) : (
            <div className="user-access-status is-ok"><CheckCircle2 size={18} /><span>As permissões gravadas batem com os acessos salvos.</span></div>
          )}
          {message ? <p role="status" className="user-access-message">{message}</p> : null}

          {visibleRows.length ? (
            <table className="user-access-table">
              <thead><tr><th>Tela</th><th>Tem hoje</th><th>Falta</th><th>A mais</th></tr></thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.screen.key} className={row.missing.length || row.extra.length ? "is-different" : ""}>
                    <td>{row.screen.label}</td>
                    <td><ActionChips actions={row.has} /></td>
                    <td><ActionChips actions={row.missing} tone="missing" /></td>
                    <td><ActionChips actions={row.extra} tone="extra" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <button className="btn btn-soft user-access-toggle" type="button" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Mostrar só as diferenças" : `Ver todas as telas (${rows.length})`}
          </button>
        </div>
      ) : null}
    </article>
  );
}
