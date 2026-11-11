import { useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Search, TriangleAlert, UserRound } from "lucide-react";
import { useDomainData } from "@/hooks/useDomainData";
import { screenGroups, storedScreenActions, systemScreens, withInheritedScreens } from "@/services/accessControl";
import { effectivePermissions, employeeMatchesProfile, profilesForUser } from "@/services/permissionProfiles";
import type { PermissionAction, PermissionProfileTarget, SystemUser } from "@/types/domain";
import { currentLevel, levelLabels, type AccessLevel } from "../profileLevels";

// Aba Pessoas (11/11/2026): "o que essa pessoa pode fazer e por quê". Substitui o
// "Conferir acesso": mostra os perfis que valem (e por qual vínculo), o nível em cada
// tela com o perfil de onde vem, e corrige o gravado quando está diferente da soma.

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const sameActions = (a: PermissionAction[], b: PermissionAction[]) => a.length === b.length && a.every((item) => b.includes(item));
const levelText = (level: AccessLevel | "custom") => (level === "custom" ? "Personalizado" : levelLabels[level]);

type Props = {
  canManage: boolean;
  describeTarget: (target: PermissionProfileTarget) => string;
  onOpenProfile: (profileId: string) => void;
  initialUserId?: string;
};

export default function PeopleTab({ canManage, describeTarget, onOpenProfile, initialUserId = "" }: Props) {
  const data = useDomainData();
  const [search, setSearch] = useState("");
  const [onlyDifferent, setOnlyDifferent] = useState(false);
  const [selectedId, setSelectedId] = useState(initialUserId);
  const [showNone, setShowNone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  const employeeById = useMemo(() => new Map(data.employees.map((employee) => [employee.id, employee])), [data.employees]);

  // Para cada login: o que deveria ter (soma dos perfis) e se o gravado bate.
  const people = useMemo(() => data.systemUsers.map((systemUser) => {
    const employee = systemUser.employeeId ? employeeById.get(systemUser.employeeId) : undefined;
    const own = data.systemPermissions.filter((permission) => permission.userId === systemUser.id);
    const expected = systemUser.isAdmin ? {} : effectivePermissions(systemUser, employee, data.permissionProfiles);
    const different = systemUser.isAdmin ? [] : systemScreens.filter((screen) => !sameActions(
      (storedScreenActions(own, screen.key) || []).filter((action) => screen.actions.includes(action)),
      (expected[screen.key] || []).filter((action) => screen.actions.includes(action)),
    ));
    return { systemUser, employee, own, expected, different };
  }).sort((a, b) => (a.systemUser.name || a.systemUser.username).localeCompare(b.systemUser.name || b.systemUser.username, "pt-BR")),
  [data.systemUsers, data.systemPermissions, data.permissionProfiles, employeeById]);

  const term = normalize(search);
  const listed = people.filter((person) => (!onlyDifferent || person.different.length)
    && (!term || normalize(`${person.systemUser.name} ${person.systemUser.username} ${person.employee?.role || ""}`).includes(term)));
  const differentCount = people.filter((person) => person.different.length).length;
  const selected = people.find((person) => person.systemUser.id === selectedId);

  async function fix(systemUser: SystemUser, expected: ReturnType<typeof effectivePermissions>) {
    setBusy(true); setMessage(null);
    try {
      await data.replaceUserPermissions(systemUser.id, expected);
      setMessage({ text: "Acessos corrigidos.", kind: "ok" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Não foi possível corrigir os acessos.", kind: "error" });
    } finally { setBusy(false); }
  }

  return (
    <div className="permissions-layout permissions-simple-layout">
      <aside className="panel permission-users">
        <div className="panel-header">
          <h2 className="panel-title"><UserRound size={18} /> Pessoas com login</h2>
        </div>
        <label className="profile-target-search people-search">
          <Search size={15} />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, login ou função" aria-label="Buscar pessoa" />
        </label>
        {differentCount ? (
          <label className="people-only-different">
            <input type="checkbox" checked={onlyDifferent} onChange={(event) => setOnlyDifferent(event.target.checked)} /> Só com acesso diferente do perfil ({differentCount})
          </label>
        ) : null}
        <div className="permission-user-list people-list">
          {listed.map((person) => (
            <button
              type="button"
              key={person.systemUser.id}
              className={`people-item${person.systemUser.id === selectedId ? " is-selected" : ""}${person.systemUser.active === false ? " is-inactive" : ""}`}
              onClick={() => { setSelectedId(person.systemUser.id); setMessage(null); setShowNone(false); }}
            >
              <strong>{person.systemUser.name || person.systemUser.username}</strong>
              <small>
                {person.systemUser.username}
                {person.systemUser.isAdmin ? " · TI" : ""}
                {person.systemUser.active === false ? " · inativo" : ""}
              </small>
              {person.different.length ? <TriangleAlert className="people-warning" size={15} aria-label="Acesso diferente do perfil" /> : null}
            </button>
          ))}
          {!listed.length ? <p className="muted padded">Ninguém encontrado.</p> : null}
        </div>
      </aside>

      <article className="panel permission-viewer">
        {selected ? (() => {
          const { systemUser, employee, own, expected, different } = selected;
          const applied = systemUser.isAdmin ? [] : profilesForUser(systemUser, employee, data.permissionProfiles);
          const reasonOf = (profileTargets: PermissionProfileTarget[], reason: "login" | "target") => {
            if (reason === "login") return "pelo cadastro do login";
            if (!employee) return "pelo vínculo";
            const matched = profileTargets.filter((target) => target.type !== "company" && employeeMatchesProfile(employee, [target]));
            return matched.length ? `por ${matched.map(describeTarget).join(", ")}` : "pela empresa";
          };
          return (
            <>
              <div className="panel-header">
                <div>
                  <h2 className="panel-title"><UserRound size={18} /> {systemUser.name || systemUser.username}</h2>
                  <p className="panel-subtitle">
                    Login {systemUser.username}
                    {employee ? ` · ${[employee.role, employee.position].filter(Boolean).join(" / ") || "sem função"}` : " · sem funcionário vinculado"}
                    {systemUser.active === false ? " · login inativo" : ""}
                  </p>
                </div>
              </div>

              {systemUser.isAdmin ? (
                <p className="permission-message">Administrador (TI): tem acesso total, sem depender de perfis.</p>
              ) : (
                <div className="profile-editor">
                  <section className="profile-section">
                    <header><h3>Perfis que valem ({applied.length})</h3><small>A pessoa fica com a soma deles. Clique para abrir o perfil.</small></header>
                    <div className="profile-target-chips">
                      {applied.map((item) => (
                        <button type="button" key={item.profile.id} className="people-profile-chip" onClick={() => onOpenProfile(item.profile.id)}>
                          <strong>{item.profile.name}</strong>
                          <small>{reasonOf(item.profile.targets || [], item.reason)}</small>
                        </button>
                      ))}
                      {!applied.length ? <span className="muted">Nenhum perfil ativo vale para esta pessoa: ela não vê nenhuma tela.</span> : null}
                    </div>
                  </section>

                  {different.length ? (
                    <div className="user-access-status is-warning">
                      <TriangleAlert size={18} />
                      <span>{different.length} tela(s) com acesso gravado diferente do que os perfis dão. Vale o gravado até corrigir.</span>
                      {canManage ? <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void fix(systemUser, expected)}><RefreshCw size={15} /> {busy ? "Corrigindo..." : "Corrigir agora"}</button> : null}
                    </div>
                  ) : (
                    <div className="user-access-status is-ok"><CheckCircle2 size={18} /><span>O acesso gravado bate com os perfis.</span></div>
                  )}
                  {message ? <p className={message.kind === "error" ? "permission-message is-error" : "permission-message"}>{message.text}</p> : null}

                  <section className="profile-section">
                    <header>
                      <h3>O que pode fazer hoje</h3>
                      <label className="people-show-none"><input type="checkbox" checked={showNone} onChange={(event) => setShowNone(event.target.checked)} /> Mostrar telas sem acesso</label>
                    </header>
                    {screenGroups.map((group) => {
                      const rows = systemScreens.filter((screen) => screen.group === group).map((screen) => {
                        const has = currentLevel(screen, storedScreenActions(own, screen.key));
                        const should = currentLevel(screen, expected[screen.key]);
                        const sources = applied
                          .map((item) => ({ profile: item.profile, level: currentLevel(screen, withInheritedScreens(item.profile.permissions)[screen.key]) }))
                          .filter((item) => item.level !== "none");
                        return { screen, has, should, sources, isDifferent: different.includes(screen) };
                      }).filter((row) => showNone || row.has !== "none" || row.isDifferent);
                      if (!rows.length) return null;
                      return (
                        <div className="profile-level-group" key={group}>
                          <div className="profile-level-group-title"><span>{group}</span></div>
                          {rows.map((row) => (
                            <div className={`profile-level-row people-row${row.isDifferent ? " is-different" : ""}`} key={row.screen.key}>
                              <div className="profile-level-name">
                                <strong>{row.screen.label}</strong>
                                <small>
                                  {row.sources.length ? `Vem de: ${row.sources.map((item) => `${item.profile.name} (${levelText(item.level)})`).join(", ")}` : "Nenhum perfil dá acesso."}
                                </small>
                                {row.isDifferent ? <small className="profile-custom">Os perfis dão {levelText(row.should)}, mas está gravado {levelText(row.has)}.</small> : null}
                              </div>
                              <span className={`people-level is-${row.has}`}>{levelText(row.has)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </section>
                </div>
              )}
            </>
          );
        })() : (
          <div className="permission-viewer-empty">
            <UserRound size={34} />
            <strong>Escolha uma pessoa</strong>
            <span>Veja os perfis que valem para ela, o que pode fazer em cada tela e de onde vem.</span>
          </div>
        )}
      </article>
    </div>
  );
}
