import parseExcelFile, { type RowObject } from "@/utils/xlsxImport";

const PYTHON_BACKEND_URL = (import.meta.env.VITE_PYTHON_BACKEND_URL || (import.meta.env.PROD ? "https://documentacao-dp.onrender.com" : "http://127.0.0.1:8000")).replace(/\/$/, "");

export interface BenefitExcelImportResult {
  rows: RowObject[];
  matchedColumns: string[];
  ignoredModelColumns: string[];
  ignoredExcelColumns: string[];
  headerRow?: number;
  source: "python" | "browser";
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getRowValue(row: RowObject, column: string) {
  if (row[column] != null) return row[column];
  const normalizedColumn = normalizeKey(column);
  const matchingKey = Object.keys(row).find((key) => normalizeKey(key) === normalizedColumn);
  return matchingKey ? row[matchingKey] : "";
}

function filterRowsInBrowser(rows: RowObject[], modelColumns: string[]): BenefitExcelImportResult {
  const firstRow = rows[0] || {};
  const excelKeys = Object.keys(firstRow);
  const matchedColumns = modelColumns.filter((column) => excelKeys.some((key) => normalizeKey(key) === normalizeKey(column)));
  const ignoredModelColumns = modelColumns.filter((column) => !matchedColumns.some((matched) => normalizeKey(matched) === normalizeKey(column)));
  const ignoredExcelColumns = excelKeys.filter((key) => !modelColumns.some((column) => normalizeKey(column) === normalizeKey(key)));
  const filteredRows = rows
    .map((row) => matchedColumns.reduce<RowObject>((acc, column) => {
      acc[column] = getRowValue(row, column);
      return acc;
    }, {}))
    .filter((row) => Object.values(row).some((value) => String(value || "").trim()));

  return { rows: filteredRows, matchedColumns, ignoredModelColumns, ignoredExcelColumns, source: "browser" };
}

export async function parseBenefitExcelFile(file: File, modelColumns: string[]): Promise<BenefitExcelImportResult> {
  const columns = modelColumns.map((column) => column.trim()).filter(Boolean);
  if (!columns.length) throw new Error("Cadastre as colunas da tabela modelo antes de importar o Excel.");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("columns", JSON.stringify(columns));

  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/beneficios/importar-excel`, {
      method: "POST",
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.detail || "Falha ao ler a planilha no backend Python.");
    return {
      rows: Array.isArray(payload.rows) ? payload.rows : [],
      matchedColumns: Array.isArray(payload.matchedColumns) ? payload.matchedColumns : [],
      ignoredModelColumns: Array.isArray(payload.ignoredModelColumns) ? payload.ignoredModelColumns : [],
      ignoredExcelColumns: Array.isArray(payload.ignoredExcelColumns) ? payload.ignoredExcelColumns : [],
      headerRow: payload.headerRow,
      source: "python",
    };
  } catch (error) {
    console.warn("Backend Python de benefícios indisponível. Usando leitura local como contingência.", error);
    const rows = await parseExcelFile(file);
    return filterRowsInBrowser(rows, columns);
  }
}
