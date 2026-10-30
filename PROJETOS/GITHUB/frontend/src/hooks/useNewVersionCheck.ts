import { useEffect, useState } from "react";

// Aba aberta há dias continua com o código antigo depois de uma publicação
// (foi assim que o envio de justificativas ao Secullum ficou sem rodar). Compara
// o script principal publicado com o que está rodando e avisa; não recarrega
// sozinho porque a pessoa pode ter edição não salva.

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const ENTRY_SCRIPT = /\/assets\/index-[\w-]+\.js/;

function runningEntryScript() {
  const script = Array.from(document.querySelectorAll<HTMLScriptElement>("script[type='module'][src]"))
    .find((item) => ENTRY_SCRIPT.test(item.src));
  return script ? new URL(script.src).pathname : "";
}

export function useNewVersionCheck() {
  const [hasNewVersion, setHasNewVersion] = useState(false);

  useEffect(() => {
    const running = runningEntryScript();
    if (!import.meta.env.PROD || !running) return;
    let stopped = false;

    async function check() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        // Parâmetro novo a cada vez: passa por cima de qualquer cache (inclusive service worker antigo).
        const response = await fetch(`/index.html?versao=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const published = (await response.text()).match(ENTRY_SCRIPT)?.[0] || "";
        if (published && published !== running && !stopped) setHasNewVersion(true);
      } catch {
        // Sem internet ou servidor fora: tenta na próxima.
      }
    }

    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return hasNewVersion;
}
