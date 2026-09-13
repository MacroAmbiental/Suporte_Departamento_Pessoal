import * as XLSX from "xlsx";

export type RowObject = Record<string, string>;

export async function parseExcelFile(file: File): Promise<RowObject[]> {
  return new Promise<RowObject[]>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
        const normalized = rows.map((row) => {
          const obj: RowObject = {};
          Object.keys(row).forEach((key) => {
            const value = row[key];
            obj[String(key).trim()] = value == null ? "" : String(value).trim();
          });
          return obj;
        });
        resolve(normalized);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

export default parseExcelFile;
