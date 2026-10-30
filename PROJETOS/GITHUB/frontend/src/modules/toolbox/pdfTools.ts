import { PDFDocument } from "pdf-lib";

// Leitura e montagem de PDF no navegador, usadas pelas ferramentas da Caixa.

export interface PdfFile {
  name: string;
  bytes: Uint8Array;
  /** Texto de cada página, uma linha por linha visual (colunas separadas por 3 espaços). */
  pages: string[];
}

type TextItem = { str: string; x: number; y: number; width: number; height: number };

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

// Junta os pedaços de texto em linhas de cima para baixo, como o PyMuPDF com
// sort=True dos programas antigos. Distância grande entre pedaços vira 3 espaços,
// para as regras que separam colunas por "2 ou mais espaços" continuarem valendo.
function linesFromItems(items: TextItem[]) {
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
    return text.replace(/\s+$/, "");
  }).join("\n");
}

export async function readPdf(file: File, onProgress?: (message: string) => void): Promise<PdfFile> {
  const pdfjs = await loadPdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  // pdf.js fica com o buffer que recebe; a cópia guarda os bytes para montar o PDF final.
  const document = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(linesFromItems(content.items.flatMap((item) => ("str" in item
        ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height || Math.abs(item.transform[3]) }]
        : []))));
      page.cleanup();
      onProgress?.(`${file.name}: página ${number} de ${document.numPages}`);
    }
  } finally {
    await document.destroy();
  }
  return { name: file.name, bytes, pages };
}

/** Monta um PDF novo com as páginas pedidas (índice começando em 0), na ordem dada. */
export async function buildPdf(parts: { source: PdfFile; pages: number[] }[]) {
  const output = await PDFDocument.create();
  const loaded = new Map<PdfFile, PDFDocument>();
  for (const part of parts) {
    if (!part.pages.length) continue;
    let source = loaded.get(part.source);
    if (!source) {
      source = await PDFDocument.load(part.source.bytes, { ignoreEncryption: true });
      loaded.set(part.source, source);
    }
    const copied = await output.copyPages(source, part.pages);
    copied.forEach((page) => output.addPage(page));
  }
  if (!output.getPageCount()) throw new Error("Nenhuma página válida foi selecionada.");
  const saved = await output.save();
  return new Blob([saved.slice().buffer as ArrayBuffer], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Abre o PDF numa aba nova, onde dá para imprimir. */
export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
}

export function safeFileName(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "arquivo";
}
