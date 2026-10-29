import { useMemo, useState } from "react";
import { FileUp, X } from "lucide-react";
import ModalPortal from "@/modules/shared/ModalPortal";
import { formatCurrency } from "@/utils/format";
import { computeLevels, formatPercent, type SalaryTableRole, type SalaryTableRoleDraft } from "./salaryTableModel";
import { parseSalaryTableWorkbook, type ParsedSalaryTable } from "./salaryTableWorkbook";

type Row = { parsed: ParsedSalaryTable["roles"][number]; existing?: SalaryTableRole; status: "new" | "changed" | "same" };

const statusLabels: Record<Row["status"], string> = { new: "Nova", changed: "Alterada", same: "Igual" };

function sameValues(a: Pick<SalaryTableRole, "name" | "category" | "levelLabels" | "baseSalary" | "percent" | "fixedLevels">, b: typeof a) {
  return a.name === b.name && a.category === b.category && a.percent === b.percent
    && a.levelLabels.join("|") === b.levelLabels.join("|")
    && computeLevels(a).join("|") === computeLevels(b).join("|");
}

// Importa as abas por categoria da planilha. Função que já existe mantém se está
// ativa/inativa e a ordem; funções que não estão na planilha não são tocadas.
export default function SalaryTableImport({ roles, onClose, onImport }: {
  roles: SalaryTableRole[];
  onClose: () => void;
  onImport: (items: { id: string; role: SalaryTableRoleDraft; createdAt?: string }[]) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [parsed, setParsed] = useState<ParsedSalaryTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo<Row[]>(() => (parsed?.roles || []).map((role) => {
    const existing = roles.find((item) => item.id === role.id);
    return { parsed: role, existing, status: !existing ? "new" : sameValues(existing, role) ? "same" : "changed" };
  }), [parsed, roles]);
  const pending = rows.filter((row) => row.status !== "same");

  async function read() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setParsed(null);
    try {
      setParsed(await parseSalaryTableWorkbook(await file.arrayBuffer(), password));
    } catch (readError) {
      console.error(readError);
      setError(readError instanceof Error ? readError.message : "Não foi possível ler a planilha.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!pending.length || busy || !file) return;
    setBusy(true);
    setError("");
    try {
      const nextOrder = roles.reduce((max, role) => Math.max(max, role.order), -1) + 1;
      await onImport(pending.map(({ parsed: role, existing }, index) => ({
        id: role.id,
        createdAt: existing?.createdAt,
        role: {
          ...role,
          fixedLevels: role.fixedLevels || {},
          active: existing ? existing.active : role.active,
          order: existing ? existing.order : nextOrder + index,
          source: file.name,
        },
      })));
      onClose();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : "Não foi possível importar.");
      setBusy(false);
    }
  }

  return (
    <ModalPortal className="modal-backdrop">
      <div className="modal-panel salary-import-modal" role="dialog" aria-modal="true" aria-labelledby="salary-import-title">
        <div className="modal-header">
          <div>
            <h2 id="salary-import-title">Importar tabela salarial</h2>
            <p className="panel-subtitle">Lê as abas por categoria (Administrativo, Encarregados, Máquinas, Profissionais, Auxiliares, Inativos). A senha só abre o arquivo e não é guardada.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="salary-import-form">
          <label className="field">Planilha (.xlsx)
            <input type="file" accept=".xlsx" onChange={(event) => { setFile(event.target.files?.[0] || null); setParsed(null); }} />
          </label>
          <label className="field">Senha do arquivo (se tiver)
            <input type="password" name="salary-file-password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void read(); }} />
          </label>
          <button className="btn btn-secondary" type="button" disabled={!file || busy} onClick={read}><FileUp size={16} /> {busy && !parsed ? "Lendo..." : "Ler planilha"}</button>
        </div>

        {parsed ? (
          <>
            <p className="salary-import-summary">
              {rows.length} funções em {parsed.sheets.length} abas · <b>{rows.filter((row) => row.status === "new").length} novas</b> · <b>{rows.filter((row) => row.status === "changed").length} alteradas</b> · {rows.filter((row) => row.status === "same").length} iguais
            </p>
            <div className="salary-import-preview">
              <table className="data-table salary-import-table">
                <thead><tr><th>Situação</th><th>Categoria</th><th>Função</th><th className="is-number">%</th><th>Níveis</th></tr></thead>
                <tbody>
                  {rows.map(({ parsed: role, existing, status }) => {
                    const levels = computeLevels(role);
                    return (
                      <tr key={role.id}>
                        <td><span className={`salary-import-status is-${status}`}>{statusLabels[status]}</span></td>
                        <td>{role.category}</td>
                        <td>{role.name}{existing && !existing.active ? <span className="salary-table-badge">Inativa</span> : null}</td>
                        <td className="is-number">{formatPercent(role.percent)}</td>
                        <td className="salary-import-levels">{role.levelLabels.map((label, index) => `${label} ${formatCurrency(levels[index])}`).join(" · ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {error ? <p className="salary-table-error">{error}</p> : null}

        <div className="form-actions">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="button" disabled={!pending.length || busy} onClick={save}>
            {busy && parsed ? "Importando..." : pending.length ? `Importar ${pending.length} função(ões)` : "Nada para importar"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
