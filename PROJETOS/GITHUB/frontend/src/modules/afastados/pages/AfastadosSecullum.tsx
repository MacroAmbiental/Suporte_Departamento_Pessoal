import { useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { employeeLeaveEntries, type LeavePeriod } from "@/modules/employeeProcesses/utils/leavePeriods";
import type { Employee } from "@/types/domain";
import { addDaysISO, loadVacations, type Vacation } from "@/modules/vacation/data/vacationsRepository";
import { formatDate, todayISO } from "@/utils/format";
import { listarAfastamentosSecullum, tipoSugerido, type AfastamentoSecullum } from "../data/afastamentosSecullum";

// Compara os afastamentos por período do Secullum com os do DP. O DP é a fonte
// da verdade: daqui só se importa o que existe só no Secullum.

type PeriodType = { label: string; kind: LeavePeriod["kind"]; group: string };

type Linha = AfastamentoSecullum & {
  employee?: Employee;
  situacao: "igual" | "diferente" | "so-secullum" | "sem-funcionario" | "ferias" | "ferias-igual" | "ferias-diferente" | "demissao";
  noDp?: string;
};

const situacaoLabel: Record<Linha["situacao"], string> = {
  igual: "Igual no DP",
  diferente: "Datas diferentes no DP",
  "so-secullum": "Só no Secullum",
  "sem-funcionario": "CPF não encontrado no DP",
  ferias: "Férias só no Secullum (lançar no módulo Férias)",
  "ferias-igual": "Férias igual no módulo Férias",
  "ferias-diferente": "Férias com datas diferentes no DP",
  demissao: "Demissão (não é afastamento)",
};

export default function AfastadosSecullum({ userId, employees, periodTypes, canEdit, onImport }: {
  userId?: string;
  employees: Employee[];
  periodTypes: PeriodType[];
  canEdit: boolean;
  onImport: (employee: Employee, type: PeriodType, item: AfastamentoSecullum) => Promise<void>;
}) {
  const hoje = todayISO();
  const [inicio, setInicio] = useState(addDaysISO(hoje, -90));
  const [fim, setFim] = useState(addDaysISO(hoje, 60));
  const [itens, setItens] = useState<AfastamentoSecullum[] | null>(null);
  const [ferias, setFerias] = useState<Vacation[]>([]);
  const [tipoEscolhido, setTipoEscolhido] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [importando, setImportando] = useState("");
  const [erro, setErro] = useState("");

  const porCpf = useMemo(() => {
    const mapa = new Map<string, Employee>();
    // Ativo primeiro quando o mesmo CPF tem cadastro antigo desligado.
    [...employees].sort((a, b) => Number(a.status === "terminated") - Number(b.status === "terminated")).forEach((employee) => {
      const cpf = (employee.cpf || "").replace(/\D/g, "");
      if (cpf.length === 11 && !mapa.has(cpf)) mapa.set(cpf, employee);
    });
    return mapa;
  }, [employees]);

  const linhas = useMemo<Linha[]>(() => (itens || []).map((item): Linha => {
    const employee = porCpf.get(item.cpf);
    if (tipoSugerido(item.justificativa) === "ferias") {
      const doFuncionario = employee ? ferias.filter((v) => v.employeeId === employee.id && v.startDate && v.endDate) : [];
      if (doFuncionario.some((v) => v.startDate === item.inicio && v.endDate === item.fim)) return { ...item, employee, situacao: "ferias-igual" };
      const cruza = doFuncionario.find((v) => v.startDate <= item.fim && item.inicio <= v.endDate);
      if (cruza) return { ...item, employee, situacao: "ferias-diferente", noDp: `${formatDate(cruza.startDate)} a ${formatDate(cruza.endDate)}` };
      return { ...item, employee, situacao: "ferias" };
    }
    if (tipoSugerido(item.justificativa) === "demissao") return { ...item, employee, situacao: "demissao" };
    if (!employee) return { ...item, situacao: "sem-funcionario" };
    const entries = employeeLeaveEntries(employee);
    if (entries.some((entry) => entry.start === item.inicio && entry.end === item.fim)) return { ...item, employee, situacao: "igual" };
    const cruza = entries.find((entry) => entry.start <= item.fim && item.inicio <= entry.end);
    if (cruza) return { ...item, employee, situacao: "diferente", noDp: `${cruza.label}: ${formatDate(cruza.start)} a ${formatDate(cruza.end)}` };
    return { ...item, employee, situacao: "so-secullum" };
  }).sort((a, b) => (a.situacao === "so-secullum" ? 0 : 1) - (b.situacao === "so-secullum" ? 0 : 1) || a.inicio.localeCompare(b.inicio)), [itens, porCpf, ferias]);

  async function buscar() {
    setCarregando(true);
    setErro("");
    try {
      const [resposta, feriasDp] = await Promise.all([listarAfastamentosSecullum(userId, inicio, fim), loadVacations()]);
      setFerias(feriasDp);
      setItens(resposta.afastamentos);
      if (!resposta.afastamentos.length) setErro(`Nenhum afastamento no Secullum entre ${formatDate(inicio)} e ${formatDate(fim)}.`);
      console.info("[Afastados] campos do Secullum:", resposta.campos);
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error));
    } finally {
      setCarregando(false);
    }
  }

  const chaveLinha = (linha: AfastamentoSecullum) => `${linha.cpf}:${linha.inicio}:${linha.fim}`;
  const pendentes = linhas.filter((linha) => linha.situacao === "so-secullum").length;

  return (
    <details className="afastados-secullum">
      <summary>Conferir com o Secullum{itens ? ` · ${pendentes} só no Secullum` : ""}</summary>
      <p className="afastados-secullum-hint">Mostra os afastamentos por período lançados no Secullum e compara com o DP. O que estiver só no Secullum pode ser importado; o DP é quem vale.</p>
      <div className="afastados-secullum-bar">
        <label>De<input type="date" value={inicio} onChange={(event) => setInicio(event.target.value)} /></label>
        <label>Até<input type="date" value={fim} min={inicio} onChange={(event) => setFim(event.target.value)} /></label>
        <button className="btn btn-secondary" type="button" disabled={carregando || !inicio || !fim || fim < inicio} onClick={() => void buscar()}>
          <RefreshCw size={16} /> {carregando ? "Buscando..." : "Buscar no Secullum"}
        </button>
      </div>
      {erro ? <p className="afastados-error">{erro}</p> : null}
      {linhas.length ? (
        <div className="afastados-secullum-table">
          <table>
            <thead>
              <tr><th>Funcionário</th><th>Período</th><th>No Secullum</th><th>Situação</th><th>Importar como</th></tr>
            </thead>
            <tbody>
              {linhas.map((linha) => {
                const key = chaveLinha(linha);
                const tipo = tipoEscolhido[key] ?? tipoSugerido(linha.justificativa);
                const tipoDp = periodTypes.find((item) => item.label === tipo);
                return (
                  <tr key={key} className={`is-${linha.situacao}`}>
                    <td>{linha.employee?.name || linha.nome || linha.cpf}{linha.employee?.status === "terminated" ? <small> · desligado no DP</small> : null}</td>
                    <td>{formatDate(linha.inicio)} a {formatDate(linha.fim)}</td>
                    <td>{linha.justificativa || "—"}{linha.motivo ? <small> · {linha.motivo}</small> : null}</td>
                    <td>{situacaoLabel[linha.situacao]}{linha.noDp ? <small> ({linha.noDp})</small> : null}</td>
                    <td>
                      {linha.situacao === "so-secullum" && canEdit && linha.employee ? (
                        <div className="afastados-secullum-import">
                          <select value={tipo} onChange={(event) => setTipoEscolhido((atual) => ({ ...atual, [key]: event.target.value }))}>
                            <option value="">Escolha o tipo</option>
                            {periodTypes.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}
                          </select>
                          <button className="btn btn-primary" type="button" disabled={!tipoDp || Boolean(importando)} onClick={async () => {
                            if (!tipoDp || !linha.employee) return;
                            setImportando(key);
                            setErro("");
                            try {
                              await onImport(linha.employee, tipoDp, linha);
                            } catch (error) {
                              setErro(error instanceof Error ? error.message : String(error));
                            } finally {
                              setImportando("");
                            }
                          }}>
                            <Download size={15} /> {importando === key ? "Importando..." : "Importar"}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </details>
  );
}
