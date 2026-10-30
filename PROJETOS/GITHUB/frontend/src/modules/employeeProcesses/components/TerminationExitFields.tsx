import { AlertTriangle } from "lucide-react";
import { addDays } from "../utils/experience";
import { formatDate } from "@/utils/format";

export default function TerminationExitFields({ date, workedOnDate, onWorkedOnDateChange, compact = false, calculationDate }: {
  date: string; workedOnDate: string; onWorkedOnDateChange: (value: string) => void; compact?: boolean; calculationDate?: string;
}) {
  const dueDate = date ? addDays(date, 10) : "";
  const presentOnDismissalDate = workedOnDate === "true";
  return <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, padding: compact ? 12 : 16, borderRadius: 12, background: "var(--surface-muted)" }}>
    <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
      <span style={{ fontWeight: 600, color: "color-mix(in srgb, #24465f var(--ink-keep), #e5e7eb)" }}>Presença na data do desligamento</span>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid color-mix(in srgb, #cfe0ee var(--tint-line), var(--surface))", borderRadius: 10, background: "var(--surface)" }}>
        <span style={{ color: "color-mix(in srgb, #43627a var(--ink-keep), #e5e7eb)", fontSize: 13 }}>{presentOnDismissalDate ? "Presente no dia do desligamento" : "Deve comparecer no dia do desligamento"}</span>
        <button
          type="button"
          role="switch"
          aria-checked={presentOnDismissalDate}
          aria-label="Alternar presença na data do desligamento"
          onClick={() => onWorkedOnDateChange(presentOnDismissalDate ? "false" : "true")}
          style={{
            width: 46,
            height: 26,
            borderRadius: 999,
            border: "1px solid color-mix(in srgb, #b6ccdd var(--tint-line), var(--surface))",
            background: presentOnDismissalDate ? "#1d83aa" : "var(--surface-muted)",
            display: "inline-flex",
            alignItems: "center",
            padding: 2,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--surface)",
              transform: presentOnDismissalDate ? "translateX(20px)" : "translateX(0)",
              transition: "transform .18s ease",
            }}
          />
        </button>
      </label>
    </div>
    {calculationDate !== undefined && <div role="status" style={{ display: "grid", gap: 8, padding: 12, border: "1px solid #9acdbd", borderRadius: 10, background: "color-mix(in srgb, #eefaf5 var(--tint-keep), var(--surface))", color: "color-mix(in srgb, #185942 var(--ink-keep), #e5e7eb)" }}>
      <strong>Data-base da rescisão</strong>
      <span>{calculationDate ? formatDate(calculationDate) : "Informe a data do desligamento."}</span>
      <small>A rescisão tem como data-base o dia do desligamento efetivo do funcionário.</small>
    </div>}
    <div role="alert" style={{ display: "grid", gap: 8, padding: compact ? 12 : 14, border: "1px solid #f1c56a", borderRadius: 10, background: "color-mix(in srgb, #fff8e8 var(--tint-keep), var(--surface))", color: "color-mix(in srgb, #76510c var(--ink-keep), #e5e7eb)" }}>
      <strong style={{ display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={20} />Pagamento das verbas rescisórias</strong>
      <span>{dueDate ? <>O prazo é de 10 dias corridos após o desligamento: <strong>até {formatDate(dueDate)}</strong>.</> : "Informe a data de desligamento para calcular o prazo de 10 dias corridos."}</span>
      {!compact && <small>A confirmação de pagamento ficará disponível em “Alerta / Continuidade” três dias antes do vencimento.</small>}
    </div>
  </div>;
}
