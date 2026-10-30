import { useEffect, useState } from "react";

export type Tema = "claro" | "escuro";

const CHAVE_STORAGE = "sistemaMacroDP:tema";

function temaInicial(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE_STORAGE);
    if (salvo === "claro" || salvo === "escuro") return salvo;
  } catch {
    // localStorage indisponível (ex.: modo privado)
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

export function useTheme() {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema);
    try {
      localStorage.setItem(CHAVE_STORAGE, tema);
    } catch {
      // ignora
    }
  }, [tema]);

  function alternarTema() {
    setTema((t) => (t === "claro" ? "escuro" : "claro"));
  }

  return { tema, alternarTema };
}
