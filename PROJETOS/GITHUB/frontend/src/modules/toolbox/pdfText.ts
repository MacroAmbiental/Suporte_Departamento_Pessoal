// Monta o texto de uma página do PDF a partir dos pedaços que o pdf.js devolve.
// Separado de pdfTools para poder ser testado fora do navegador.

export type TextItem = { str: string; x: number; y: number; width: number; height: number };

/** Linha visual com a caixa em coordenadas de cima para baixo (como o PyMuPDF): y0 = topo, y1 = base. */
export type PositionedLine = { text: string; x0: number; y0: number; x1: number; y1: number };

// Junta os pedaços de texto em linhas de cima para baixo, como o PyMuPDF com
// sort=True dos programas antigos. Distância grande entre pedaços vira 3 espaços,
// para as regras que separam colunas por "2 ou mais espaços" continuarem valendo.
function groupLines(items: TextItem[]) {
  const sorted = items.filter((item) => item.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(2, Math.min(item.height, line?.[0].height || item.height) * 0.5);
    if (line && Math.abs(line[0].y - item.y) <= tolerance) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    let text = "";
    let end = 0;
    for (const item of line) {
      if (text) {
        const charWidth = item.width / Math.max(1, item.str.length) || 4;
        const gap = item.x - end;
        text += gap > charWidth * 1.8 ? "   " : gap > charWidth * 0.25 && !text.endsWith(" ") && !item.str.startsWith(" ") ? " " : "";
      }
      text += item.str;
      end = item.x + item.width;
    }
    return { text: text.replace(/\s+$/, ""), items: line };
  });
}

export function linesFromItems(items: TextItem[]) {
  return groupLines(items).map((line) => line.text).join("\n");
}

/**
 * Mesmas linhas de linesFromItems, com a posição na página. pdf.js usa y de baixo
 * para cima (linha de base); aqui vira y de cima para baixo, relativo à página.
 */
export function positionedLinesFromItems(items: TextItem[], page: { left: number; top: number }): PositionedLine[] {
  return groupLines(items).map(({ text, items: parts }) => ({
    text,
    x0: Math.min(...parts.map((p) => p.x)) - page.left,
    x1: Math.max(...parts.map((p) => p.x + p.width)) - page.left,
    y0: page.top - Math.max(...parts.map((p) => p.y + p.height)),
    y1: page.top - Math.min(...parts.map((p) => p.y)),
  }));
}
