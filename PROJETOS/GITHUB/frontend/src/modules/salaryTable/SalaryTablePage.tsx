import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Lock, Pencil, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { formatCurrency } from "@/utils/format";
import { computeLevels, formatPercent, type SalaryTableRole } from "./salaryTableModel";
import { useSalaryTable } from "./useSalaryTable";
import SalaryRoleEditor from "./SalaryRoleEditor";
import SalaryTableImport from "./SalaryTableImport";
import "./salaryTable.css";

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Tabela Salarial (Funcionários > Tabela Salarial). Entrar exige a chave de acesso
// do DP; a tela vale até sair dela.
export default function SalaryTablePage() {
  const data = useDomainData();
  const { user, can } = useAuth();
  const canEdit = can("employees", "edit");
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const askedOnOpen = useRef(false);
  const { roles, ready, loadError, saveRole, importRoles } = useSalaryTable(unlocked, user?.name || user?.username || "");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<SalaryTableRole | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function unlock() {
    if (checking) return;
    setChecking(true);
    try {
      const ok = await data.confirmAccessKey({
        title: "Tabela Salarial",
        description: "Informe a chave de acesso para ver a tabela salarial.",
        confirmLabel: "Entrar",
      });
      if (ok) setUnlocked(true);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (askedOnOpen.current) return;
    askedOnOpen.current = true;
    void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(() => {
    const term = normalize(search.trim());
    const visible = roles
      .filter((role) => showInactive || role.active)
      .filter((role) => !term || normalize(`${role.name} ${role.category}`).includes(term))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const groups = new Map<string, SalaryTableRole[]>();
    visible.forEach((role) => groups.set(role.category, [...(groups.get(role.category) || []), role]));
    return Array.from(groups.entries());
  }, [roles, search, showInactive]);

  const inactiveCount = roles.filter((role) => !role.active).length;

  if (!unlocked) {
    return (
      <section className="page salary-table-page">
        <div className="salary-table-locked">
          <Lock size={28} />
          <h1>Tabela Salarial</h1>
          <p className="muted">Esta tela é protegida pela chave de acesso do DP.</p>
          <button className="btn btn-primary" type="button" disabled={checking} onClick={unlock}>
            {checking ? "Aguardando chave..." : "Informar chave de acesso"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page salary-table-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tabela Salarial</h1>
          <p className="page-subtitle">Salário por função e nível. Cada nível é o anterior + o percentual da função; valores marcados com • foram digitados e não seguem o percentual.</p>
        </div>
        {canEdit ? (
          <div className="salary-table-actions">
            <button className="btn btn-secondary" type="button" onClick={() => setImportOpen(true)}><FileUp size={16} /> Importar planilha</button>
            <button className="btn btn-primary" type="button" onClick={() => setEditing("new")}><Plus size={16} /> Nova função</button>
          </div>
        ) : null}
      </div>

      <div className="salary-table-toolbar">
        <input type="search" name="salary-table-search" autoComplete="off" placeholder="Buscar função ou categoria" value={search} onChange={(event) => setSearch(event.target.value)} />
        {inactiveCount ? (
          <label className="salary-table-check">
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            Mostrar inativas ({inactiveCount})
          </label>
        ) : null}
      </div>

      {loadError ? <p className="salary-table-error">Não foi possível carregar a tabela. Recarregue a página.</p> : null}
      {ready && !roles.length ? (
        <div className="salary-table-empty">
          <p>Nenhuma função cadastrada ainda.</p>
          {canEdit ? <button className="btn btn-primary" type="button" onClick={() => setImportOpen(true)}><FileUp size={16} /> Importar a planilha da tabela salarial</button> : null}
        </div>
      ) : null}
      {ready && roles.length > 0 && !categories.length ? <p className="muted">Nenhuma função encontrada.</p> : null}

      {categories.map(([category, items]) => {
        const levelCount = Math.max(...items.map((role) => role.levelLabels.length));
        // Se todas as funções da categoria usam os mesmos níveis, o nome do nível vai
        // no cabeçalho; senão (ex.: Auxiliares mistura I–IV e A–D) vai em cada célula.
        const longest = items.find((role) => role.levelLabels.length === levelCount)!.levelLabels;
        const sharedLabels = items.every((role) => role.levelLabels.every((label, index) => label === longest[index]));
        return (
          <section className="salary-table-group" key={category}>
            <h2>{category} <small>{items.length} função(ões)</small></h2>
            <div className="salary-table-scroll">
              <table className="data-table salary-table">
                <colgroup>
                  <col className="salary-col-name" />
                  <col className="salary-col-percent" />
                  {Array.from({ length: levelCount }, (_, index) => <col className="salary-col-level" key={index} />)}
                  {canEdit ? <col className="salary-col-actions" /> : null}
                </colgroup>
                <thead>
                  <tr>
                    <th>Função</th>
                    <th className="is-number">%</th>
                    {Array.from({ length: levelCount }, (_, index) => <th className="is-number" key={index}>{sharedLabels ? `Nível ${longest[index]}` : `${index + 1}º nível`}</th>)}
                    {canEdit ? <th aria-label="Ações" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {items.map((role) => {
                    const levels = computeLevels(role);
                    return (
                      <tr key={role.id} className={role.active ? "" : "is-inactive"}>
                        <td><strong>{role.name}</strong>{role.active ? null : <span className="salary-table-badge">Inativa</span>}</td>
                        <td className="is-number">{formatPercent(role.percent)}</td>
                        {Array.from({ length: levelCount }, (_, index) => (
                          <td className="is-number" key={index}>
                            {index < levels.length ? (
                              <span className="salary-level" title={role.fixedLevels?.[String(index)] !== undefined ? "Valor digitado (não segue o percentual)" : undefined}>
                                {sharedLabels ? null : <small>{role.levelLabels[index]}</small>}
                                {formatCurrency(levels[index])}
                                {role.fixedLevels?.[String(index)] !== undefined ? <b aria-label="valor digitado">•</b> : null}
                              </span>
                            ) : "—"}
                          </td>
                        ))}
                        {canEdit ? (
                          <td className="salary-table-row-actions">
                            <button className="icon-button" type="button" aria-label={`Editar ${role.name}`} onClick={() => setEditing(role)}><Pencil size={15} /></button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {editing ? (
        <SalaryRoleEditor
          role={editing === "new" ? null : editing}
          categories={Array.from(new Set(roles.map((role) => role.category)))}
          existingIds={new Set(roles.map((role) => role.id))}
          nextOrder={roles.reduce((max, role) => Math.max(max, role.order), -1) + 1}
          onClose={() => setEditing(null)}
          onSave={saveRole}
        />
      ) : null}

      {importOpen ? <SalaryTableImport roles={roles} onClose={() => setImportOpen(false)} onImport={importRoles} /> : null}
    </section>
  );
}
