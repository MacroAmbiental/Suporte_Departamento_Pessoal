import type { DiaristsModel } from "../hooks/useDiarists";
import { formatCurrency } from "@/utils/format";
export default function DiaristsSummary({ model }: { model: DiaristsModel }) {
 const { summary } = model;
 return (<>
      <div className="diarist-summary-grid">
        <div className="diarist-card"><span>Diaristas ativas</span><strong>{summary.activeCount}</strong></div>
        <div className="diarist-card"><span>Dias trabalhados no mês</span><strong>{summary.monthDays}</strong></div>
        <div className="diarist-card"><span>Valor pendente</span><strong>{formatCurrency(summary.pendingTotal)}</strong></div>
        <div className="diarist-card"><span>Valor pago</span><strong>{formatCurrency(summary.paidTotal)}</strong></div>
      </div>
</>);
}
