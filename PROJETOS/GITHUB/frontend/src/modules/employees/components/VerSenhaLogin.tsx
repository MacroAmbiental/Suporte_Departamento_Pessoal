import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { podeVerSenhas, verSenhaServidor } from "@/services/firebaseSession";

// "Ver senha" do login de um funcionário (05/11/2026, F3). Só aparece para o
// login liberado no servidor (DP_VER_SENHAS); o servidor confere de novo e
// registra cada consulta.
export default function VerSenhaLogin({ userId }: { userId: string }) {
  const [liberado, setLiberado] = useState(false);
  const [senha, setSenha] = useState<string | null | undefined>(undefined);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    void podeVerSenhas().then((pode) => { if (ativo) setLiberado(pode); }).catch(() => undefined);
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    setSenha(undefined);
    setErro("");
  }, [userId]);

  if (!liberado) return null;

  async function alternar() {
    if (senha !== undefined) {
      setSenha(undefined);
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      setSenha(await verSenhaServidor(userId));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível ver a senha.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="field">
      <span>Senha atual</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
        <button className="btn btn-secondary" type="button" disabled={carregando} onClick={() => void alternar()}>
          {senha !== undefined ? <EyeOff size={16} /> : <Eye size={16} />}
          {carregando ? "Buscando..." : senha !== undefined ? "Esconder" : "Ver senha"}
        </button>
        {senha ? <code style={{ userSelect: "all" }}>{senha}</code> : null}
        {senha === null ? <span className="muted">Sem senha guardada (só será possível ver depois da próxima troca ou do próximo login da pessoa).</span> : null}
        {erro ? <span className="form-error">{erro}</span> : null}
      </div>
    </div>
  );
}
