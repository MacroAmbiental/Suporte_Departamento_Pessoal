import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, RefreshCw } from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/services/firebase";
import { exigirSessaoServidor } from "@/services/firebaseSession";
import { useAuth } from "@/hooks/useAuth";

// Código do link público de solicitação de mudança de função: muda a cada 15
// minutos e é calculado no servidor. O RH/DP passa o número para quem vai pedir.
export default function ClassificationCodeBox() {
  const { user } = useAuth();
  const [codigo, setCodigo] = useState("");
  const [mudaEm, setMudaEm] = useState("");
  const [agora, setAgora] = useState(Date.now());
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const link = `${window.location.origin}/solicitacao-classificacao`;

  const carregar = useCallback(async () => {
    if (!firebaseApp) return;
    setErro("");
    try {
      await exigirSessaoServidor(user?.id);
      const { data } = await httpsCallable<void, { codigo: string; mudaEm: string }>(getFunctions(firebaseApp, "southamerica-east1"), "codigoClassificacao")();
      setCodigo(data.codigo);
      setMudaEm(data.mudaEm);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível obter o código.");
    }
  }, [user?.id]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Virou a janela: busca o código novo.
  useEffect(() => {
    if (mudaEm && agora >= Date.parse(mudaEm)) void carregar();
  }, [agora, mudaEm, carregar]);

  const restante = mudaEm ? Math.max(0, Math.round((Date.parse(mudaEm) - agora) / 1000)) : 0;
  const minutos = String(Math.floor(restante / 60)).padStart(2, "0");
  const segundos = String(restante % 60).padStart(2, "0");

  return (
    <div className="classification-code-box">
      <KeyRound size={20} />
      <div>
        <small>Código do link de solicitação</small>
        {erro ? <span className="classification-code-error">{erro}</span> : <strong>{codigo || "····"}</strong>}
        {codigo && !erro ? <small>muda em {minutos}:{segundos}</small> : null}
      </div>
      <button type="button" className="btn btn-secondary" onClick={() => {
        navigator.clipboard.writeText(link).then(() => setCopiado(true)).catch(() => setErro("Não foi possível copiar o link."));
      }}><Copy size={14} /> {copiado ? "Link copiado" : "Copiar link"}</button>
      {erro ? <button type="button" className="btn btn-secondary" onClick={() => void carregar()}><RefreshCw size={14} /> Tentar de novo</button> : null}
    </div>
  );
}
