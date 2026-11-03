import { PDFDocument } from "pdf-lib";
import { linesFromItems, positionedLinesFromItems, type PositionedLine, type TextItem } from "./pdfText";

// Leitura e montagem de PDF no navegador, usadas pelas ferramentas da Caixa.

export interface PdfFile {
  name: string;
  bytes: Uint8Array;
  /** Texto de cada página, uma linha por linha visual (colunas separadas por 3 espaços). */
  pages: string[];
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** Página com as linhas posicionadas (y de cima para baixo) e a caixa visível em coordenadas do PDF. */
export interface LayoutPage {
  width: number;
  height: number;
  /** Canto esquerdo e topo da caixa da página no espaço do PDF (para recortar com o pdf-lib). */
  left: number;
  top: number;
  lines: PositionedLine[];
}

export interface PdfLayoutFile {
  name: string;
  bytes: Uint8Array;
  pages: LayoutPage[];
}

type PdfjsTextItem = { str?: string; transform?: number[]; width?: number; height?: number };

function textItems(items: PdfjsTextItem[]): TextItem[] {
  return items.flatMap((item) => (typeof item.str === "string" && item.transform
    ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width || 0, height: item.height || Math.abs(item.transform[3]) }]
    : []));
}

async function eachPage(file: File, onProgress: ((message: string) => void) | undefined, visit: (items: TextItem[], view: number[]) => void) {
  const pdfjs = await loadPdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  // pdf.js fica com o buffer que recebe; a cópia guarda os bytes para montar o PDF final.
  const document = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      visit(textItems(content.items as PdfjsTextItem[]), page.view);
      page.cleanup();
      onProgress?.(`${file.name}: página ${number} de ${document.numPages}`);
    }
  } finally {
    await document.destroy();
  }
  return bytes;
}

export async function readPdf(file: File, onProgress?: (message: string) => void): Promise<PdfFile> {
  const pages: string[] = [];
  const bytes = await eachPage(file, onProgress, (items) => pages.push(linesFromItems(items)));
  return { name: file.name, bytes, pages };
}

/** Como readPdf, mas guarda a posição de cada linha (necessário para recortar partes da página). */
export async function readPdfLayout(file: File, onProgress?: (message: string) => void): Promise<PdfLayoutFile> {
  const pages: LayoutPage[] = [];
  const bytes = await eachPage(file, onProgress, (items, view) => {
    const [left, bottom, right, top] = view;
    pages.push({ width: right - left, height: top - bottom, left, top, lines: positionedLinesFromItems(items, { left, top }) });
  });
  return { name: file.name, bytes, pages };
}

/** Retângulo de cima para baixo (x0, y0 = canto superior esquerdo). */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Um pedaço de página de origem desenhado numa área da página nova (mantém a proporção, centralizado). */
export type Placement = { source: PdfLayoutFile; page: number; clip: Box; target: Box };

export const A4 = { width: 595.28, height: 841.89 };

/** Monta um PDF A4: cada item da lista é uma página nova com os pedaços indicados. */
export async function composePdf(pages: Placement[][]) {
  const output = await PDFDocument.create();
  const loaded = new Map<PdfLayoutFile, PDFDocument>();
  for (const placements of pages) {
    const target = output.addPage([A4.width, A4.height]);
    for (const placement of placements) {
      let source = loaded.get(placement.source);
      if (!source) {
        source = await PDFDocument.load(placement.source.bytes, { ignoreEncryption: true });
        loaded.set(placement.source, source);
      }
      const info = placement.source.pages[placement.page];
      const { clip, target: area } = placement;
      const [embedded] = await output.embedPages([source.getPage(placement.page)], [{
        left: info.left + clip.x0,
        right: info.left + clip.x1,
        bottom: info.top - clip.y1,
        top: info.top - clip.y0,
      }]);
      const clipWidth = clip.x1 - clip.x0;
      const clipHeight = clip.y1 - clip.y0;
      const areaWidth = area.x1 - area.x0;
      const areaHeight = area.y1 - area.y0;
      const scale = Math.min(areaWidth / clipWidth, areaHeight / clipHeight);
      const width = clipWidth * scale;
      const height = clipHeight * scale;
      target.drawPage(embedded, {
        x: area.x0 + (areaWidth - width) / 2,
        y: A4.height - area.y1 + (areaHeight - height) / 2,
        width,
        height,
      });
    }
  }
  if (!output.getPageCount()) throw new Error("Nenhuma página para montar.");
  const saved = await output.save();
  return new Blob([saved.slice().buffer as ArrayBuffer], { type: "application/pdf" });
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
