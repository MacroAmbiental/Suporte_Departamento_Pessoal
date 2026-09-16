import { CalendarCheck } from "lucide-react";
import { addDays } from "../experience";
import { formatDate } from "@/utils/format";
export default function NoticeReductionFields({ value, onChange, end, applies, onAppliesChange }: { applies: boolean; onAppliesChange: (value: boolean) => void; value: string; onChange: (value: string) => void; end: string }) {
  const departure = value === "days" ? addDays(end, -7) : end;
  const lastDayBeforeDeparture = departure ? addDays(departure, -1) : "";
  return <div style={{ display: "grid", gap: 12, padding: 16, borderRadius: 12, background: "#f3f8fc" }}>
    <label className="field">Opção de redução do aviso<select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Selecione a opção do funcionário</option><option value="none">Sem redução de jornada</option><option value="hours">Redução de 2 horas diárias</option><option value="days">Dispensa nos 7 dias corridos finais</option></select></label>
    {value && end && <div role="status" aria-live="polite" style={{ display: "grid", gap: 10, padding: 16, border: "1px solid #9acdbd", borderRadius: 10, background: "#eefaf5", color: "#185942" }}>
      <strong style={{ display: "flex", alignItems: "center", gap: 8 }}><CalendarCheck size={20} />{value === "days" ? "Saída calculada / início da dispensa" : "Data de saída"}</strong>
      <strong style={{ fontSize: 25 }}>{formatDate(departure)}</strong>
      {value === "days" ? <>
        <span>{formatDate(end)} − 7 dias corridos = <strong>{formatDate(departure)}</strong></span>
        <span>Último dia antes da dispensa: <strong>{formatDate(lastDayBeforeDeparture)}</strong>, observada a escala de trabalho.</span>
        <span>Dispensa de {formatDate(departure)} a {formatDate(addDays(end, -1))}. A data de desativação cadastrada permanece em <strong>{formatDate(end)}</strong>.</span>
      </> : value === "hours" ? <span>A jornada será reduzida em <strong>2 horas por dia</strong>. Essa opção não antecipa a data de saída: <strong>{formatDate(end)}</strong>.</span> : <span>Sem antecipação: a saída segue a data de desativação informada.</span>}
      {(value === "days" || value === "hours") && !applies && <small>Prévia da opção escolhida. Para aplicar a redução ao ponto, confirme abaixo que há período trabalhado.</small>}
    </div>}
    {!end && value && <small role="status">Informe a data de desativação para visualizar a data exata de saída.</small>}
    <small>A redução prevista no art. 488 se aplica ao período trabalhado por iniciativa do empregador. No aviso integralmente indenizado não há jornada a reduzir.</small>
    {(value === "hours" || value === "days") && <label><input type="checkbox" checked={applies} onChange={(event) => onAppliesChange(event.target.checked)} /> Aplicar ao ponto: confirmo que este período é trabalhado e o desligamento é por iniciativa do empregador.</label>}
  </div>;
}
