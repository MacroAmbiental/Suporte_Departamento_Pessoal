// Comparação de nomes e CPF usada pelas ferramentas (mesmas regras dos programas em Python).

export function semAcentos(texto: string) {
  return (texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizarNome(texto: string) {
  return semAcentos(texto).toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Só os 11 dígitos; vazio se não for um CPF completo. */
export function normalizarCpf(texto: string) {
  const numeros = (texto || "").replace(/\D/g, "");
  return numeros.length === 11 ? numeros : "";
}

export function formatarCpf(cpf: string) {
  const n = normalizarCpf(cpf);
  return n ? `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}` : "";
}

// Mesmo cálculo do difflib.SequenceMatcher.ratio() do Python: 2 * letras em comum / total.
export function semelhanca(a: string, b: string) {
  if (!a.length && !b.length) return 1;
  function comuns(aIni: number, aFim: number, bIni: number, bFim: number): number {
    let melhor = 0;
    let melhorA = aIni;
    let melhorB = bIni;
    let anterior = new Map<number, number>();
    for (let i = aIni; i < aFim; i += 1) {
      const atual = new Map<number, number>();
      for (let j = bIni; j < bFim; j += 1) {
        if (a[i] !== b[j]) continue;
        const tamanho = (anterior.get(j - 1) || 0) + 1;
        atual.set(j, tamanho);
        if (tamanho > melhor) {
          melhor = tamanho;
          melhorA = i - tamanho + 1;
          melhorB = j - tamanho + 1;
        }
      }
      anterior = atual;
    }
    if (!melhor) return 0;
    return melhor + comuns(aIni, melhorA, bIni, melhorB) + comuns(melhorA + melhor, aFim, melhorB + melhor, bFim);
  }
  return (2 * comuns(0, a.length, 0, b.length)) / (a.length + b.length);
}
