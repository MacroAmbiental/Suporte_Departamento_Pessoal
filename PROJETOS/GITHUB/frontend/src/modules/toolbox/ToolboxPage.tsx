import { ArrowLeft, Combine, FileStack, Scale, Toolbox, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useSearchParams } from "react-router-dom";
import JuntarRecibos from "./recibos/JuntarRecibos";
import "./toolbox.css";

// Caixa de ferramentas: automações do dia a dia do DP que antes eram programas
// .exe separados. Tudo roda no navegador, com os arquivos escolhidos no
// computador; nada é enviado para o servidor.

type ToolKey = "conferencia-folha-ponto" | "juntar-recibos" | "contracheques-comprovantes";

const tools: { key: ToolKey; title: string; description: string; icon: LucideIcon; component?: ComponentType }[] = [
  {
    key: "conferencia-folha-ponto",
    title: "Conferência de folha e ponto",
    description: "Compara o Extrato Mensal com o Cartão-Ponto: horas extras, faltas, insalubridade e relação de pagamentos.",
    icon: Scale,
  },
  {
    key: "juntar-recibos",
    title: "Juntar recibos",
    description: "Junta pagamento + adiantamento por funcionário e separa o Cartão-Ponto por equipe.",
    icon: FileStack,
    component: JuntarRecibos,
  },
  {
    key: "contracheques-comprovantes",
    title: "Contracheques e comprovantes",
    description: "Junta cada contracheque com o comprovante de transferência do mesmo funcionário.",
    icon: Combine,
  },
];

export default function ToolboxPage() {
  const [params, setParams] = useSearchParams();
  const selected = tools.find((tool) => tool.key === params.get("ferramenta"));

  if (selected) {
    const Icon = selected.icon;
    const Tool = selected.component;
    return (
      <section className="page toolbox-page">
        <button className="btn btn-secondary toolbox-back" type="button" onClick={() => setParams({})}>
          <ArrowLeft size={16} /> Caixa de ferramentas
        </button>
        <div className="page-header">
          <div className="toolbox-tool-title">
            <span className="toolbox-icon"><Icon size={22} /></span>
            <div>
              <h1 className="page-title">{selected.title}</h1>
              <p className="page-subtitle">{selected.description}</p>
            </div>
          </div>
        </div>
        {Tool ? <Tool /> : <div className="toolbox-soon">Em construção.</div>}
      </section>
    );
  }

  return (
    <section className="page toolbox-page">
      <div className="page-header">
        <div className="toolbox-tool-title">
          <span className="toolbox-icon"><Toolbox size={22} /></span>
          <div>
            <h1 className="page-title">Caixa de ferramentas</h1>
            <p className="page-subtitle">Escolha a ferramenta. Os arquivos ficam no seu computador e não são enviados para o sistema.</p>
          </div>
        </div>
      </div>
      <div className="toolbox-grid">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button className="toolbox-card" type="button" key={tool.key} onClick={() => setParams({ ferramenta: tool.key })}>
              <span className="toolbox-icon is-large"><Icon size={30} /></span>
              <strong>{tool.title}</strong>
              <small>{tool.description}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
