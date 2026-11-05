import { X } from "lucide-react";
import { useState, type FormEvent } from "react";
import ModalPortal from "@/modules/shared/ModalPortal";
import { trocarMinhaSenhaServidor } from "@/services/firebaseSession";

// "Trocar minha senha" (05/11/2026): vale para qualquer login, inclusive os
// que não têm funcionário vinculado (TI/administrador).
export default function TrocarSenhaModal({ onClose }: { onClose: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (salvando) return;
    if (nova.trim().length < 6) return setErro("A senha nova precisa ter pelo menos 6 caracteres.");
    if (nova !== confirmacao) return setErro("A confirmação não é igual à senha nova.");
    if (nova === atual) return setErro("A senha nova precisa ser diferente da atual.");
    setSalvando(true);
    setErro("");
    try {
      await trocarMinhaSenhaServidor(atual, nova);
      setPronto(true);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível trocar a senha.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalPortal className="modal-backdrop" role="presentation">
      <form className="confirm-modal protected-password-modal" role="dialog" aria-modal="true" aria-labelledby="trocar-senha-titulo" onSubmit={salvar}>
        <div className="modal-header">
          <h2 id="trocar-senha-titulo">Trocar minha senha</h2>
          <button className="icon-button" type="button" disabled={salvando} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        {pronto ? (
          <>
            <p>Senha trocada. Use a senha nova no próximo login (e atualize a senha salva no navegador, se tiver).</p>
            <div className="form-actions"><button className="btn btn-primary" type="button" onClick={onClose}>Fechar</button></div>
          </>
        ) : (
          <>
            <label className="field">Senha atual
              <input type="password" autoComplete="current-password" autoFocus disabled={salvando} value={atual} onChange={(e) => { setAtual(e.target.value); setErro(""); }} />
            </label>
            <label className="field">Senha nova (mínimo 6 caracteres)
              <input type="password" autoComplete="new-password" disabled={salvando} value={nova} onChange={(e) => { setNova(e.target.value); setErro(""); }} />
            </label>
            <label className="field">Repita a senha nova
              <input type="password" autoComplete="new-password" disabled={salvando} value={confirmacao} onChange={(e) => { setConfirmacao(e.target.value); setErro(""); }} />
            </label>
            {erro ? <p className="form-error" role="alert">{erro}</p> : null}
            <div className="form-actions">
              <button className="btn btn-ghost" type="button" disabled={salvando} onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={salvando || !atual || !nova || !confirmacao}>{salvando ? "Salvando..." : "Trocar senha"}</button>
            </div>
          </>
        )}
      </form>
    </ModalPortal>
  );
}
