import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import ModalPortal from "@/modules/shared/ModalPortal";
import { formatCurrency } from "@/utils/format";
import { computeLevels, salaryRoleId, type SalaryTableRole, type SalaryTableRoleDraft } from "./salaryTableModel";

// Aceita "1.927,00", "1.927", "1927,5" ou "1927.5". Ponto seguido de grupos de
// 3 dígitos é milhar ("1.718" = mil setecentos e dezoito, não 1,718).
function parseNumber(value: string) {
  const clean = value.replace(/R\$|\s|%/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(clean)
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

const moneyField = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const percentField = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 6, useGrouping: false });
const DEFAULT_LEVELS = "I, II, III, IV";

export default function SalaryRoleEditor({ role, categories, existingIds, nextOrder, onClose, onSave }: {
  role: SalaryTableRole | null;
  categories: string[];
  existingIds: Set<string>;
  nextOrder: number;
  onClose: () => void;
  onSave: (id: string, role: SalaryTableRoleDraft, createdAt?: string) => Promise<void>;
}) {
  const [name, setName] = useState(role?.name || "");
  const [category, setCategory] = useState(role?.category || "");
  const [levelsText, setLevelsText] = useState(role ? role.levelLabels.join(", ") : DEFAULT_LEVELS);
  const [base, setBase] = useState(role ? moneyField(role.baseSalary) : "");
  const [percent, setPercent] = useState(role ? percentField(role.percent) : "");
  const [fixed, setFixed] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(role?.fixedLevels || {}).map(([key, value]) => [key, moneyField(value)])));
  const [active, setActive] = useState(role?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const labels = levelsText.split(",").map((label) => label.trim()).filter(Boolean);
  const baseValue = parseNumber(base);
  const percentValue = parseNumber(percent);
  const fixedLevels = useMemo(() => Object.fromEntries(
    Object.entries(fixed)
      .filter(([key]) => Number(key) > 0 && Number(key) < labels.length)
      .map(([key, value]) => [key, parseNumber(value)] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] !== null && entry[1] > 0),
  ), [fixed, labels.length]);
  const preview = baseValue && percentValue !== null && labels.length
    ? computeLevels({ levelLabels: labels, baseSalary: baseValue, percent: percentValue, fixedLevels })
    : [];

  async function submit() {
    if (saving) return;
    if (!name.trim() || !category.trim()) return setError("Informe a função e a categoria.");
    if (!labels.length) return setError("Informe ao menos um nível.");
    if (!baseValue || baseValue <= 0) return setError("Informe o salário do primeiro nível.");
    if (percentValue === null || percentValue < 0) return setError("Informe o percentual entre níveis (pode ser 0).");
    const id = role?.id || salaryRoleId(name);
    if (!id) return setError("Nome de função inválido.");
    if (!role && existingIds.has(id)) return setError("Já existe uma função com esse nome.");

    setSaving(true);
    setError("");
    try {
      await onSave(id, {
        category: category.trim(),
        name: name.trim().toUpperCase(),
        levelLabels: labels.map((label) => label.toUpperCase()),
        baseSalary: baseValue,
        percent: percentValue,
        fixedLevels,
        active,
        order: role?.order ?? nextOrder,
        source: role?.source || "",
      }, role?.createdAt);
      onClose();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar.");
      setSaving(false);
    }
  }

  return (
    <ModalPortal className="modal-backdrop">
      <div className="modal-panel salary-role-modal" role="dialog" aria-modal="true" aria-labelledby="salary-role-title">
        <div className="modal-header">
          <div>
            <h2 id="salary-role-title">{role ? "Editar função" : "Nova função"}</h2>
            <p className="panel-subtitle">Cada nível é o anterior + o percentual. Preencha um nível abaixo só se ele tiver valor próprio.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="salary-role-grid">
          <label className="field is-wide">Função<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: MOTORISTA" /></label>
          <label className="field">Categoria
            <input list="salary-role-categories" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ex.: AUXILIARES" />
            <datalist id="salary-role-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist>
          </label>
          <label className="field">Níveis (separados por vírgula)<input value={levelsText} onChange={(event) => setLevelsText(event.target.value)} /></label>
          <label className="field">Salário do 1º nível (R$)<input inputMode="decimal" value={base} onChange={(event) => setBase(event.target.value)} /></label>
          <label className="field">Percentual entre níveis (%)<input inputMode="decimal" value={percent} onChange={(event) => setPercent(event.target.value)} /></label>
        </div>

        {preview.length ? (
          <table className="data-table salary-role-levels">
            <thead><tr><th>Nível</th><th className="is-number">Calculado</th><th>Valor próprio (opcional)</th></tr></thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={`${label}-${index}`}>
                  <td>{label.toUpperCase()}</td>
                  <td className="is-number">{formatCurrency(preview[index])}</td>
                  <td>
                    {index === 0 ? <span className="muted">Salário do 1º nível</span> : (
                      <input
                        inputMode="decimal"
                        placeholder="Usar o calculado"
                        value={fixed[String(index)] || ""}
                        onChange={(event) => setFixed((current) => ({ ...current, [String(index)]: event.target.value }))}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <label className="salary-table-check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Função ativa (inativa não aparece como sugestão)</label>

        {error ? <p className="salary-table-error">{error}</p> : null}

        <div className="form-actions">
          <button className="btn btn-secondary" type="button" disabled={saving} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="button" disabled={saving} onClick={submit}><Check size={16} /> {saving ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </ModalPortal>
  );
}
