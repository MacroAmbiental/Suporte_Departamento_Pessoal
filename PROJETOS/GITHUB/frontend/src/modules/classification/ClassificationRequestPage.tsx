import { useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/services/firebase";
import "./classificationRequest.css";

// Página pública (sem login) de "Solicitação de Mudança de Função", no lugar do
// Google Forms do POP-RH-06. Primeiro o código de 4 números que o RH passa; só
// depois aparecem o formulário e a lista de colaboradores.

type Colaborador = { id: string; name: string; team: string; role: string; company: string };

const TEMPO_NO_CARGO = ["Menos de 6 meses", "Entre 6 meses e 1 ano", "Entre 1 e 2 anos", "Entre 2 e 3 anos", "Mais de 3 anos"];
const JA_DESEMPENHA = ["Sim, integralmente", "Parcialmente", "Não"];
const HA_QUANTO_TEMPO = ["Não se aplica", "Menos de 3 meses", "Entre 3 e 6 meses", "Entre 6 meses e 1 ano", "Entre 1 e 2 anos", "Mais de 2 anos"];
const MOTIVOS = [
  "Performance acima da média esperada",
  "Atingimento consistente de metas",
  "Entregas com alta qualidade e baixo retrabalho",
  "Geração de resultados financeiros/comerciais relevantes",
  "Superação recorrente de indicadores/KPIs",
  "Ampliação de responsabilidades",
  "Assunção de atividades de maior complexidade",
  "Atuação prática já aderente ao próximo cargo",
  "Liderança técnica ou funcional de projetos/processos",
  "Substituição informal de responsabilidades de nível superior",
  "Desenvolvimento e apoio a outros colaboradores",
  "Atuação como referência técnica para o time",
  "Liderança formal ou informal de equipe",
  "Forte influência positiva na cultura e clima organizacional",
  "Retenção de talento estratégico",
  "Plano de sucessão interna",
  "Reconhecimento de potencial de crescimento",
  "Mitigação de risco de perda do colaborador",
  "Evolução comprovada de competências técnicas",
  "Evolução comprovada de competências comportamentais",
  "Preparação para novo nível de senioridade",
  "Equalização salarial interna",
  "Correção de distorção de enquadramento",
  "Adequação à política de cargos e salários",
];

function callable<I, O>(name: string) {
  if (!firebaseApp) throw new Error("Sistema indisponível no momento.");
  return httpsCallable<I, O>(getFunctions(firebaseApp, "southamerica-east1"), name);
}

function mensagemDeErro(error: unknown) {
  return error instanceof Error ? error.message.replace(/^[a-z-]+\/[a-z-]+:?\s*/i, "") : "Não foi possível concluir. Tente novamente.";
}

export default function ClassificationRequestPage() {
  const [codigo, setCodigo] = useState("");
  const [colaboradores, setColaboradores] = useState<Colaborador[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState<{ protocolo: string; prazo: string } | null>(null);

  const [solicitante, setSolicitante] = useState("");
  const [colaboradorTexto, setColaboradorTexto] = useState("");
  const [equipe, setEquipe] = useState("");
  const [tempoNoCargo, setTempoNoCargo] = useState("");
  const [funcaoSolicitada, setFuncaoSolicitada] = useState("");
  const [jaDesempenha, setJaDesempenha] = useState("");
  const [jaDesempenhaOutro, setJaDesempenhaOutro] = useState("");
  const [haQuantoTempo, setHaQuantoTempo] = useState("");
  const [motivos, setMotivos] = useState<string[]>([]);
  const [motivoOutro, setMotivoOutro] = useState("");
  const [informacaoAdicional, setInformacaoAdicional] = useState("");

  const rotulo = (item: Colaborador) => `${item.name}${item.team ? ` — ${item.team}` : ""}`;
  const colaborador = useMemo(() => colaboradores?.find((item) => rotulo(item) === colaboradorTexto), [colaboradores, colaboradorTexto]);

  async function entrar() {
    setBusy(true); setErro("");
    try {
      const { data } = await callable<{ codigo: string }, { funcionarios: Colaborador[] }>("conferirCodigoClassificacao")({ codigo: codigo.trim() });
      setColaboradores(data.funcionarios);
    } catch (error) { setErro(mensagemDeErro(error)); } finally { setBusy(false); }
  }

  async function enviar() {
    const motivosFinal = [...motivos, ...(motivoOutro.trim() ? [`Outro: ${motivoOutro.trim()}`] : [])];
    const jaDesempenhaFinal = jaDesempenha === "Outro" ? `Outro: ${jaDesempenhaOutro.trim()}` : jaDesempenha;
    if (!solicitante.trim() || !colaborador || !funcaoSolicitada.trim() || !tempoNoCargo || !jaDesempenhaFinal || !haQuantoTempo || !motivosFinal.length) {
      setErro("Preencha todas as perguntas obrigatórias (*). O colaborador precisa ser escolhido na lista.");
      return;
    }
    setBusy(true); setErro("");
    try {
      const { data } = await callable<Record<string, unknown>, { protocolo: string; prazo: string }>("enviarSolicitacaoClassificacao")({
        codigo: codigo.trim(),
        solicitante: solicitante.trim(),
        funcionarioId: colaborador.id,
        equipe: equipe.trim() || colaborador.team,
        tempoNoCargo,
        funcaoSolicitada: funcaoSolicitada.trim(),
        jaDesempenha: jaDesempenhaFinal,
        haQuantoTempo,
        motivos: motivosFinal,
        informacaoAdicional: informacaoAdicional.trim(),
      });
      setEnviado(data);
    } catch (error) { setErro(mensagemDeErro(error)); } finally { setBusy(false); }
  }

  return (
    <main className="classification-request">
      <section className="classification-request-card">
        <header>
          <h1>Solicitação de Mudança de Função</h1>
          <p>Macro Ambiental · Recursos Humanos</p>
        </header>

        {enviado ? (
          <div className="classification-request-done">
            <h2>Solicitação enviada</h2>
            <p>Protocolo <strong>{enviado.protocolo}</strong>. O RH tem até <strong>{enviado.prazo.split("-").reverse().join("/")}</strong> para responder.</p>
          </div>
        ) : !colaboradores ? (
          <div className="classification-request-step">
            <label>
              Código de acesso *
              <input inputMode="numeric" maxLength={4} value={codigo} onChange={(event) => setCodigo(event.target.value.replace(/[^0-9]/g, ""))} placeholder="0000" autoFocus />
            </label>
            <small>Peça o código de 4 números ao RH. Ele muda a cada 15 minutos.</small>
            {erro ? <p className="classification-request-error">{erro}</p> : null}
            <button type="button" disabled={busy || codigo.length !== 4} onClick={() => void entrar()}>{busy ? "Conferindo..." : "Continuar"}</button>
          </div>
        ) : (
          <div className="classification-request-step">
            <label>1. Nome completo do solicitante *<input value={solicitante} onChange={(event) => setSolicitante(event.target.value)} /></label>
            <label>
              2. Colaborador *
              <input list="classification-colaboradores" value={colaboradorTexto} onChange={(event) => {
                setColaboradorTexto(event.target.value);
                const escolhido = colaboradores.find((item) => rotulo(item) === event.target.value);
                if (escolhido) setEquipe(escolhido.team);
              }} placeholder="Digite o nome e escolha na lista" />
              <datalist id="classification-colaboradores">{colaboradores.map((item) => <option key={item.id} value={rotulo(item)} />)}</datalist>
              {colaborador ? <small>Função atual: {colaborador.role || "—"} · {colaborador.company}</small> : null}
            </label>
            <label>3. Equipe atual *<input value={equipe} onChange={(event) => setEquipe(event.target.value)} /></label>
            <fieldset><legend>4. Tempo no cargo atual *</legend>{TEMPO_NO_CARGO.map((opcao) => <label key={opcao} className="choice"><input type="radio" name="tempo" checked={tempoNoCargo === opcao} onChange={() => setTempoNoCargo(opcao)} />{opcao}</label>)}</fieldset>
            <label>5. Função solicitada *<input value={funcaoSolicitada} onChange={(event) => setFuncaoSolicitada(event.target.value)} placeholder="Ex.: BOMBEIRO HIDRÁULICO I" /></label>
            <fieldset>
              <legend>6. O colaborador já desempenha as atividades e responsabilidades da função solicitada? *</legend>
              {[...JA_DESEMPENHA, "Outro"].map((opcao) => <label key={opcao} className="choice"><input type="radio" name="desempenha" checked={jaDesempenha === opcao} onChange={() => setJaDesempenha(opcao)} />{opcao}</label>)}
              {jaDesempenha === "Outro" ? <input value={jaDesempenhaOutro} onChange={(event) => setJaDesempenhaOutro(event.target.value)} placeholder="Explique" /> : null}
            </fieldset>
            <fieldset><legend>7. Se sim, há quanto tempo? *</legend>{HA_QUANTO_TEMPO.map((opcao) => <label key={opcao} className="choice"><input type="radio" name="haquanto" checked={haQuantoTempo === opcao} onChange={() => setHaQuantoTempo(opcao)} />{opcao}</label>)}</fieldset>
            <fieldset>
              <legend>8. Motivo(s) da solicitação *</legend>
              {MOTIVOS.map((opcao) => <label key={opcao} className="choice"><input type="checkbox" checked={motivos.includes(opcao)} onChange={(event) => setMotivos((atual) => event.target.checked ? [...atual, opcao] : atual.filter((item) => item !== opcao))} />{opcao}</label>)}
              <input value={motivoOutro} onChange={(event) => setMotivoOutro(event.target.value)} placeholder="Outro motivo (opcional)" />
            </fieldset>
            <label>9. Alguma informação adicional que possa contribuir para a avaliação?<textarea rows={4} value={informacaoAdicional} onChange={(event) => setInformacaoAdicional(event.target.value)} /></label>
            {erro ? <p className="classification-request-error">{erro}</p> : null}
            <button type="button" disabled={busy} onClick={() => void enviar()}>{busy ? "Enviando..." : "Enviar solicitação"}</button>
            <small>O código vale por até 30 minutos. Se demorar mais, peça um novo ao RH antes de enviar.</small>
          </div>
        )}
      </section>
    </main>
  );
}
