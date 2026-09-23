import { formatDate } from "@/utils/format";

export default function NoticeEntitlementSummary({ years, total, additional, indemnified, projection, worked }: {
  years: number | null; total: number; additional: number; indemnified: number; projection: string; worked: boolean;
}) {
  return <div role="status" className="suspension-documents-card">
    <strong>Aviso prévio proporcional</strong>
    {years === null || !total ? <p>Confira a admissão e a data do desligamento para calcular o aviso.</p> : <>
      <p>{years} {years === 1 ? "ano completo" : "anos completos"} de empresa na data do desligamento.</p>
      <p>30 dias + {additional} dias proporcionais = <strong>{total} dias de aviso</strong> (limite de 90 dias).</p>
      <p>{worked ? `Período trabalhado de 30 dias, sujeito à redução escolhida, e ${indemnified} dias adicionais indenizados.` : `${indemnified} dias indenizados, sem período trabalhado.`}</p>
      <p>Fim da projeção do aviso: <strong>{formatDate(projection)}</strong>.</p>
    </>}
  </div>;
}
