import { useMemo, useState } from "react";
import { LayoutGrid, Search, TriangleAlert } from "lucide-react";
import { useDomainData } from "@/hooks/useDomainData";
import { screenGroups, storedScreenActions, systemScreens, withInheritedScreens, type SystemScreen } from "@/services/accessControl";
import { effectivePermissions, profilesForUser } from "@/services/permissionProfiles";
import type { AppScreen } from "@/types/domain";
import { currentLevel, levelHints, levelLabels, type AccessLevel } from "../profileLevels";

// Aba Por tela (11/11/2026): "quem pode mexer aqui?". Escolhe a tela e vê quem tem
// acesso, em que nível (o que está gravado, que é o que vale) e por qual perfil.

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const levelOrder: Array<AccessLevel | "custom"> = ["full", "edit", "custom", "view"];
const levelTitle = (level: AccessLevel | "custom") => (level === "custom" ? "Personalizado" : levelLabels[level]);

type Props = { onOpenPerson: (userId: string) => void };

export default function ScreenTab({ onOpenPerson }: Props) {
  const data = useDomainData();
  const [screenKey, setScreenKey] = useState<AppScreen>("employees");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const employeeById = useMemo(() => new Map(data.employees.map((employee) => [employee.id, employee])), [data.employees]);

  // Nível de cada login em cada tela (gravado) e o que os perfis dão.
  const access = useMemo(() => data.systemUsers.filter((systemUser) => !systemUser.isAdmin).map((systemUser) => {
    const employee = systemUser.employeeId ? employeeById.get(systemUser.employeeId) : undefined;
    const own = data.systemPermissions.filter((permission) => permission.userId === systemUser.id);
    const expected = effectivePermissions(systemUser, employee, data.permissionProfiles);
    const applied = profilesForUser(systemUser, employee, data.permissionProfiles);
    return { systemUser, employee, own, expected, applied };
  }), [data.systemUsers, data.systemPermissions, data.permissionProfiles, employeeById]);

  const countFor = (screen: SystemScreen) => access.filter((item) => item.systemUser.active !== false && currentLevel(screen, storedScreenActions(item.own, screen.key)) !== "none").length;
  const admins = data.systemUsers.filter((systemUser) => systemUser.isAdmin && systemUser.active !== false);
  const screen = systemScreens.find((item) => item.key === screenKey) || systemScreens[0];
  const term = normalize(search);

  const rows = access
    .filter((item) => showInactive || item.systemUser.active !== false)
    .map((item) => {
      const level = currentLevel(screen, storedScreenActions(item.own, screen.key));
      const should = currentLevel(screen, item.expected[screen.key]);
      const sources = item.applied.filter((applied) => currentLevel(screen, withInheritedScreens(applied.profile.permissions)[screen.key]) !== "none").map((applied) => applied.profile.name);
      return { ...item, level, should, sources };
    })
    .filter((row) => row.level !== "none" || row.should !== "none")
    .filter((row) => !term || normalize(`${row.systemUser.name} ${row.systemUser.username} ${row.employee?.role || ""} ${row.sources.join(" ")}`).includes(term))
    .sort((a, b) => (a.systemUser.name || a.systemUser.username).localeCompare(b.systemUser.name || b.systemUser.username, "pt-BR"));
  const withoutAccessButShould = rows.filter((row) => row.level === "none");

  return (
    <div className="permissions-layout permissions-simple-layout">
      <aside className="panel permission-users">
        <div className="panel-header">
          <h2 className="panel-title"><LayoutGrid size={18} /> Telas</h2>
        </div>
        <div className="permission-user-list people-list">
          {screenGroups.map((group) => (
            <div key={group} className="screen-list-group">
              <span className="screen-list-group-title">{group}</span>
              {systemScreens.filter((item) => item.group === group).map((item) => (
                <button type="button" key={item.key} className={`people-item${item.key === screen.key ? " is-selected" : ""}`} onClick={() => setScreenKey(item.key)}>
                  <strong>{item.label}</strong>
                  <small>{countFor(item)} pessoa(s)</small>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <article className="panel permission-viewer">
        <div className="panel-header">
          <div>
            <h2 className="panel-title"><LayoutGrid size={18} /> {screen.label}</h2>
            <p className="panel-subtitle">{screen.hint || "Quem tem acesso a esta tela e em que nível."}</p>
          </div>
        </div>
        <div className="profile-editor">
          <div className="screen-tab-filters">
            <label className="profile-target-search">
              <Search size={15} />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar por nome, função ou perfil" aria-label="Filtrar pessoas" />
            </label>
            <label className="people-show-none"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Incluir logins inativos</label>
          </div>

          {admins.length ? (
            <p className="muted screen-tab-admins">Além destes, {admins.length} administrador(es) de TI têm acesso total: {admins.map((admin) => admin.name || admin.username).join(", ")}.</p>
          ) : null}

          {levelOrder.map((level) => {
            const group = rows.filter((row) => row.level === level);
            if (!group.length) return null;
            return (
              <section className="profile-level-group" key={level}>
                <div className="profile-level-group-title">
                  <span>{levelTitle(level)} · {group.length}</span>
                  <small className="muted">{level === "custom" ? "Combinação fora dos níveis." : levelHints[level as AccessLevel]}</small>
                </div>
                {group.map((row) => (
                  <button type="button" className={`profile-level-row screen-person-row${row.level !== row.should ? " is-different" : ""}`} key={row.systemUser.id} onClick={() => onOpenPerson(row.systemUser.id)}>
                    <div className="profile-level-name">
                      <strong>{row.systemUser.name || row.systemUser.username}{row.systemUser.active === false ? " (inativo)" : ""}</strong>
                      <small>{[row.employee?.role, row.sources.length ? `via ${row.sources.join(", ")}` : "sem perfil que dê acesso"].filter(Boolean).join(" · ")}</small>
                      {row.level !== row.should ? <small className="profile-custom"><TriangleAlert size={12} /> Os perfis dão {levelTitle(row.should)}; está gravado {levelTitle(row.level)}.</small> : null}
                    </div>
                    <span className={`people-level is-${row.level}`}>{levelTitle(row.level)}</span>
                  </button>
                ))}
              </section>
            );
          })}

          {withoutAccessButShould.length ? (
            <section className="profile-level-group">
              <div className="profile-level-group-title"><span>Deveriam ter acesso · {withoutAccessButShould.length}</span><small className="muted">Os perfis dão acesso, mas não está gravado. Corrija pela aba Pessoas.</small></div>
              {withoutAccessButShould.map((row) => (
                <button type="button" className="profile-level-row screen-person-row is-different" key={row.systemUser.id} onClick={() => onOpenPerson(row.systemUser.id)}>
                  <div className="profile-level-name">
                    <strong>{row.systemUser.name || row.systemUser.username}</strong>
                    <small>via {row.sources.join(", ")} · deveria ter {levelTitle(row.should)}</small>
                  </div>
                  <span className="people-level is-none">Sem acesso</span>
                </button>
              ))}
            </section>
          ) : null}

          {!rows.length ? <p className="muted">Ninguém (fora o TI) tem acesso a esta tela.</p> : null}
        </div>
      </article>
    </div>
  );
}
