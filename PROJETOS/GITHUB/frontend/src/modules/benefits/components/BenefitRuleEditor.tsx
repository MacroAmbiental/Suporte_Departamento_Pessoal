import { Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import "./benefitCalculation.css";
import { useDomainData } from "@/hooks/useDomainData";
import type { BenefitContract } from "@/types/domain";
import { createId, formatCurrency } from "@/utils/format";
import {
  defaultDayComponents,
  pointSettingsForCompany,
  providerColumns,
  type BenefitCalcRule,
  type BenefitDayComponent,
  type BenefitOrderLayout,
} from "../calculation/benefitCalculation";

const percentOptions: Array<{ value: string; label: string }> = [
  { value: "", label: "Qualquer dia" },
  { value: "50", label: "Dia útil (HE 50%)" },
  { value: "75", label: "Sábado (HE 75%)" },
  { value: "120", label: "Domingo/feriado (HE 120%)" },
];

const orderFields: Array<{ key: keyof BenefitOrderLayout; label: string; placeholder?: string }> = [
  { key: "contractNumber", label: "Número do contrato", placeholder: "Somente números" },
  { key: "departmentLabel", label: "Departamento padrão no pedido", placeholder: "Ex.: OPERACIONAL" },
  { key: "deliveryUnitName", label: "Nome da unidade de entrega" },
  { key: "deliveryZipCode", label: "CEP de entrega" },
  { key: "deliveryStreet", label: "Logradouro" },
  { key: "deliveryNumber", label: "Número" },
  { key: "deliveryComplement", label: "Complemento" },
  { key: "deliveryDistrict", label: "Bairro" },
  { key: "deliveryCity", label: "Cidade" },
  { key: "deliveryState", label: "Estado (UF)", placeholder: "ES" },
  { key: "deliveryReference", label: "Ponto de referência" },
  { key: "contactName", label: "Nome do interlocutor" },
  { key: "contactPhone", label: "Telefone do interlocutor" },
];

export default function BenefitRuleEditor({
  benefit,
  rule,
  ruleSaved,
  onSaveRule,
}: {
  benefit: BenefitContract;
  rule: BenefitCalcRule;
  ruleSaved: boolean;
  onSaveRule: (rule: BenefitCalcRule) => Promise<void>;
}) {
  const data = useDomainData();
  const [form, setForm] = useState<BenefitCalcRule>(rule);
  const [dailyValueText, setDailyValueText] = useState(String(rule.dailyValue).replace(".", ","));
  const [saving, setSaving] = useState(false);
  const statusOptions = useMemo(
    () => pointSettingsForCompany(data.timekeepingColumns, benefit.companyId).statusOptions,
    [benefit.companyId, data.timekeepingColumns],
  );

  useEffect(() => {
    setForm(rule);
    setDailyValueText(String(rule.dailyValue).replace(".", ","));
  }, [rule]);

  const dirty = !ruleSaved || JSON.stringify(form) !== JSON.stringify(rule);

  function updateComponent(id: string, patch: Partial<BenefitDayComponent>) {
    setForm((current) => ({
      ...current,
      components: current.components.map((component) => (component.id === id ? { ...component, ...patch } : component)),
    }));
  }

  function toggleStatus(component: BenefitDayComponent, status: string) {
    const statuses = component.statuses.includes(status)
      ? component.statuses.filter((item) => item !== status)
      : [...component.statuses, status];
    updateComponent(component.id, { statuses });
  }

  function addComponent() {
    setForm((current) => ({
      ...current,
      components: [...current.components, { id: createId("comp"), label: "Nova coluna", statuses: [], overtimePercent: null, sign: -1 }],
    }));
  }

  function removeComponent(id: string) {
    setForm((current) => ({ ...current, components: current.components.filter((component) => component.id !== id) }));
  }

  function restoreDefaultComponents() {
    setForm((current) => ({
      ...current,
      components: defaultDayComponents.map((component) => ({ ...component, statuses: [...component.statuses] })),
    }));
  }

  function updateOrder(key: keyof BenefitOrderLayout, value: string) {
    setForm((current) => ({ ...current, order: { ...current.order, [key]: value } }));
  }

  function changeDailyValue(text: string) {
    setDailyValueText(text);
    const parsed = Number(text.replace(/\./g, "").replace(",", "."));
    setForm((current) => ({ ...current, dailyValue: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSaveRule(form);
    } finally {
      setSaving(false);
    }
  }

  const statusLabel = (value: string) => statusOptions.find((option) => option.value === value)?.label || value;
  const unusedStatuses = statusOptions.filter((option) => !form.components.some((component) => component.statuses.includes(option.value)));

  return (
    <form className="benefit-rule" onSubmit={submit}>
      <section className="benefit-rule-card">
        <header>
          <h3>Como o valor é calculado</h3>
          <p>
            <strong>Valor = Valor por dia × Dias a pagar.</strong> Dias a pagar = dias úteis do mês, somando ou descontando os dias do ponto abaixo.
            O período padrão abaixo é o que a apuração abre; lá dá pra trocar entre mês inteiro e quinzenas.
          </p>
        </header>
        <div className="form-grid">
          <label className="field">
            Valor por dia (R$)
            <input inputMode="decimal" value={dailyValueText} disabled={saving} onChange={(event) => changeDailyValue(event.target.value)} />
            <small>{formatCurrency(form.dailyValue)} por dia</small>
          </label>
          <label className="field">
            Período padrão
            <select value={form.period} disabled={saving} onChange={(event) => setForm((current) => ({ ...current, period: event.target.value === "biweekly" ? "biweekly" : "month" }))}>
              <option value="month">Mensal (mês fechado)</option>
              <option value="biweekly">Quinzenal (1 a 15 e 16 ao fim)</option>
            </select>
          </label>
        </div>
      </section>

      <section className="benefit-rule-card">
        <header className="benefit-rule-card-header">
          <div>
            <h3>Dias do ponto que somam ou descontam</h3>
            <p>Cada linha vira uma coluna na apuração. O dia conta quando o status do ponto está marcado e o tipo de dia bate.</p>
          </div>
          <div className="benefit-rule-card-actions">
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={restoreDefaultComponents}><RotateCcw size={15} /> Padrão da planilha</button>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={addComponent}><Plus size={15} /> Adicionar coluna</button>
          </div>
        </header>

        <div className="benefit-rule-components">
          {form.components.map((component) => (
            <div className="benefit-rule-component" key={component.id}>
              <div className="benefit-rule-component-main">
                <label className="field">
                  Nome da coluna
                  <input value={component.label} disabled={saving} onChange={(event) => updateComponent(component.id, { label: event.target.value })} />
                </label>
                <label className="field">
                  Efeito
                  <select value={component.sign} disabled={saving} onChange={(event) => updateComponent(component.id, { sign: Number(event.target.value) === 1 ? 1 : -1 })}>
                    <option value={1}>Soma dias</option>
                    <option value={-1}>Desconta dias</option>
                  </select>
                </label>
                <label className="field">
                  Tipo de dia
                  <select
                    value={component.overtimePercent === null ? "" : String(component.overtimePercent)}
                    disabled={saving}
                    onChange={(event) => updateComponent(component.id, { overtimePercent: event.target.value ? Number(event.target.value) : null })}
                  >
                    {percentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <button type="button" className="icon-button benefit-rule-remove" disabled={saving} aria-label={`Remover ${component.label}`} onClick={() => removeComponent(component.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="benefit-rule-statuses" role="group" aria-label={`Status que contam em ${component.label}`}>
                <span>Status do ponto:</span>
                {statusOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    disabled={saving}
                    className={component.statuses.includes(option.value) ? "is-on" : ""}
                    aria-pressed={component.statuses.includes(option.value)}
                    onClick={() => toggleStatus(component, option.value)}
                  >
                    {component.statuses.includes(option.value) ? <Check size={13} /> : null} {option.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!form.components.length ? <p className="benefit-rule-empty">Nenhuma coluna: todo mundo recebe os dias úteis cheios.</p> : null}
        </div>
        {unusedStatuses.length ? (
          <p className="benefit-rule-hint">Não mexem no valor: {unusedStatuses.map((option) => statusLabel(option.value)).join(", ")}.</p>
        ) : null}
      </section>

      <section className="benefit-rule-card">
        <header>
          <h3>Pedido do fornecedor</h3>
          <p>Dados fixos que vão em todas as linhas da planilha “Realizar Pedido”. O CNPJ vem do cadastro da empresa.</p>
        </header>
        <div className="form-grid">
          <label className="field">
            Coluna do valor no pedido
            <select value={form.order.providerColumn} disabled={saving} onChange={(event) => updateOrder("providerColumn", event.target.value)}>
              {providerColumns.map((column) => <option key={column} value={column}>{column}</option>)}
            </select>
          </label>
          {orderFields.map((field) => (
            <label className="field" key={field.key}>
              {field.label}
              <input value={form.order[field.key]} placeholder={field.placeholder} disabled={saving} onChange={(event) => updateOrder(field.key, event.target.value)} />
            </label>
          ))}
        </div>
      </section>

      <div className="benefit-rule-footer">
        {dirty ? <span>{ruleSaved ? "Alterações não salvas." : "Regra sugerida — ainda não salva."}</span> : <span>Regra salva.</span>}
        <button type="button" className="btn btn-ghost" disabled={saving || !dirty || !ruleSaved} onClick={() => { setForm(rule); setDailyValueText(String(rule.dailyValue).replace(".", ",")); }}>Descartar</button>
        <button type="submit" className="btn btn-primary" disabled={saving || !dirty}><Check size={16} /> {saving ? "Salvando..." : "Salvar regra"}</button>
      </div>
    </form>
  );
}
