import { AlertTriangle } from "lucide-react";
import { addDays } from "../experience";
import { formatDate } from "@/utils/format";

export default function TerminationExitFields({ date, workedOnDate, onWorkedOnDateChange, compact = false }: {
  date: string; workedOnDate: string; onWorkedOnDateChange: (value: string) => void; compact?: boolean;
}) {
  const dueDate = date ? addDays(date, 10) : "";
  const presentOnDismissalDate = workedOnDate === "true";
  return <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, padding: compact ? 12 : 16, borderRadius: 12, background: "#f3f8fc" }}>
    <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
      <span style={{ fontWeight: 600, color: "#24465f" }}>Presença na data do desligamento</span>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid #cfe0ee", borderRadius: 10, background: "#fff" }}>
        <span style={{ color: "#43627a", fontSize: 13 }}>{presentOnDismissalDate ? "Presente no dia do desligamento" : "Deve comparecer no dia do desligamento"}</span>
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
            border: "1px solid #b6ccdd",
            background: presentOnDismissalDate ? "#1d83aa" : "#d8e5ef",
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
              background: "#fff",
              transform: presentOnDismissalDate ? "translateX(20px)" : "translateX(0)",
              transition: "transform .18s ease",
            }}
          />
        </button>
      </label>
    </div>
    <div role="alert" style={{ display: "grid", gap: 8, padding: compact ? 12 : 14, border: "1px solid #f1c56a", borderRadius: 10, background: "#fff8e8", color: "#76510c" }}>
      <strong style={{ display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={20} />Pagamento das verbas rescisórias</strong>
      <span>{dueDate ? <>O prazo é de 10 dias corridos após o desligamento: <strong>até {formatDate(dueDate)}</strong>.</> : "Informe a data de desligamento para calcular o prazo de 10 dias corridos."}</span>
      {!compact && <small>A confirmação de pagamento ficará disponível em “Alerta / Continuidade” três dias antes do vencimento.</small>}
    </div>
  </div>;
}
