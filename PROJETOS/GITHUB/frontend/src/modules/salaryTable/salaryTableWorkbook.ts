import * as XLSX from "xlsx";
import { salaryRoleId, type SalaryTableRoleDraft } from "./salaryTableModel";

// Lê a planilha "TABELA SALARIAL" (Excel com senha) direto no navegador: a senha
// só é usada aqui para abrir o arquivo e não é gravada. Usa as abas por categoria
// (ADMINISTRATIVO, ENCARREGADOS, ...); a aba antiga "Tabela Salarial" e as ocultas
// (que têm dados pessoais) ficam de fora.

const IGNORED_SHEETS = new Set(["TABELA SALARIAL"]);
type Bytes = Uint8Array<ArrayBuffer>;

const BLOCK_KEY = new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);

const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach((part) => { out.set(part, offset); offset += part.length; });
  return out;
}

const uint32LE = (value: number) => { const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value, true); return out; };
const base64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

async function hash(algorithm: string, data: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest(algorithm, data));
}

function fitKey(key: Bytes, length: number): Bytes {
  if (key.length >= length) return key.slice(0, length);
  return concat(key, new Uint8Array(length - key.length).fill(0x36));
}

// AES-CBC sem padding (o WebCrypto exige PKCS#7): acrescenta um bloco de padding
// válido cifrado com o último bloco como IV, e o navegador o remove ao decifrar.
async function aesCbcDecryptRaw(keyBytes: Bytes, iv: Bytes, data: Bytes): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["encrypt", "decrypt"]);
  const lastBlock = data.slice(data.length - 16);
  const padBlock = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: lastBlock }, key, new Uint8Array(16).fill(16))).slice(0, 16);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, concat(data, padBlock)));
}

// Atributos da primeira tag com esse nome (ignora o prefixo, ex. "p:encryptedKey").
function xmlAttributes(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*)>`));
  if (!match) return null;
  return Object.fromEntries(Array.from(match[1].matchAll(/([\w:]+)="([^"]*)"/g), (entry) => [entry[1], entry[2]])) as Record<string, string>;
}

const hashName = (value: string) => ({ SHA512: "SHA-512", SHA384: "SHA-384", SHA256: "SHA-256", SHA1: "SHA-1" } as Record<string, string>)[value.replace("-", "").toUpperCase()] || "SHA-512";

// Excel com "Criptografar com senha" (ECMA-376 Agile Encryption).
async function decryptAgile(bytes: Bytes, password: string): Promise<Bytes> {
  const cfb = XLSX.CFB.read(bytes, { type: "array" });
  const infoEntry = XLSX.CFB.find(cfb, "EncryptionInfo");
  const packageEntry = XLSX.CFB.find(cfb, "EncryptedPackage");
  if (!infoEntry || !packageEntry) throw new Error("Arquivo protegido em formato não reconhecido.");

  const xml = new TextDecoder().decode(new Uint8Array(infoEntry.content).slice(8));
  const keyData = xmlAttributes(xml, "keyData");
  const encryptedKey = xmlAttributes(xml, "encryptedKey");
  if (!keyData || !encryptedKey?.spinCount) throw new Error("Este tipo de proteção do Excel não é suportado. Salve uma cópia sem senha e importe.");

  const keyAlgorithm = hashName(encryptedKey.hashAlgorithm || "SHA512");
  const keyBytes = Number(encryptedKey.keyBits || 256) / 8;
  const spinCount = Number(encryptedKey.spinCount);
  const passwordBytes = new Uint8Array(password.length * 2);
  for (let index = 0; index < password.length; index++) new DataView(passwordBytes.buffer).setUint16(index * 2, password.charCodeAt(index), true);

  let digest = await hash(keyAlgorithm, concat(base64(encryptedKey.saltValue || ""), passwordBytes));
  for (let index = 0; index < spinCount; index++) digest = await hash(keyAlgorithm, concat(uint32LE(index), digest));
  const unlockKey = fitKey(await hash(keyAlgorithm, concat(digest, BLOCK_KEY)), keyBytes);
  const secretKey = (await aesCbcDecryptRaw(unlockKey, base64(encryptedKey.saltValue || ""), base64(encryptedKey.encryptedKeyValue || ""))).slice(0, keyBytes);

  const encrypted: Bytes = new Uint8Array(packageEntry.content);
  const size = Number(new DataView(encrypted.buffer, encrypted.byteOffset, 8).getBigUint64(0, true));
  const dataAlgorithm = hashName(keyData.hashAlgorithm || "SHA512");
  const dataSalt = base64(keyData.saltValue || "");
  const blockSize = Number(keyData.blockSize || 16);
  const segments: Bytes[] = [];
  for (let offset = 8, index = 0; offset < encrypted.length; offset += 4096, index++) {
    const segment = encrypted.slice(offset, Math.min(offset + 4096, encrypted.length));
    const iv = (await hash(dataAlgorithm, concat(dataSalt, uint32LE(index)))).slice(0, blockSize);
    segments.push(await aesCbcDecryptRaw(secretKey, iv, segment));
  }
  const decrypted = concat(...segments).slice(0, size);
  // Senha errada não dá erro no AES: o resultado só não é um .xlsx (zip "PK").
  if (decrypted[0] !== 0x50 || decrypted[1] !== 0x4b) throw new Error("Senha incorreta.");
  return decrypted;
}

const isEncrypted = (bytes: Bytes) => bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
const isRoman = (value: string) => /^[IVX]+$/.test(value);

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

// Uma aba de categoria tem 1 ou mais blocos "FUNÇÃO | níveis... | PERCENTUAL",
// cada um seguido das funções até a primeira linha com a coluna A vazia.
function parseSheet(sheetName: string, rows: unknown[][], startOrder: number): SalaryTableRoleDraft[] {
  const roles: SalaryTableRoleDraft[] = [];
  const category = sheetName.trim();
  const inactive = normalize(category) === "INATIVOS";

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const header = rows[rowIndex] || [];
    if (normalize(header[0]) !== "FUNCAO") continue;

    const percentColumn = header.findIndex((cell) => normalize(cell) === "PERCENTUAL");
    const lastColumn = percentColumn > 0 ? percentColumn - 1 : header.reduce<number>((last, cell, index) => (normalize(cell) ? index : last), 0);
    const rawLabels = header.slice(1, lastColumn + 1).map((cell) => normalize(cell));
    const romanLabels = rawLabels.filter((label) => label && label !== "-").every(isRoman);
    const labels = rawLabels.map((label, index) => (label && label !== "-" ? label : index === 0 ? (romanLabels ? "I" : "A") : String(index + 1)));

    for (rowIndex += 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || [];
      const name = String(row[0] ?? "").replace(/\s+/g, " ").trim();
      if (!name) break;

      const values = labels.map((_, index) => toNumber(row[index + 1]));
      if (values[0] === null) continue;
      const levelCount = values.reduce<number>((count, value, index) => (value !== null ? index + 1 : count), 0);
      const multiplier = percentColumn > 0 ? toNumber(row[percentColumn]) : null;
      const percent = multiplier ? Math.round((multiplier - 1) * 100 * 1e6) / 1e6 : 0;

      const fixedLevels: Record<string, number> = {};
      let previous = values[0];
      for (let index = 1; index < levelCount; index++) {
        const actual = values[index];
        const expected = previous * (1 + percent / 100);
        if (actual === null) { previous = expected; continue; }
        if (Math.abs(actual - expected) > 0.005) fixedLevels[String(index)] = actual;
        previous = actual;
      }

      roles.push({
        category,
        name,
        levelLabels: labels.slice(0, levelCount),
        baseSalary: values[0],
        percent,
        ...(Object.keys(fixedLevels).length ? { fixedLevels } : {}),
        active: !inactive,
        order: startOrder + roles.length,
      });
    }
    rowIndex -= 1;
  }
  return roles;
}

export type ParsedSalaryTable = { roles: (SalaryTableRoleDraft & { id: string })[]; sheets: string[] };

export async function parseSalaryTableWorkbook(buffer: ArrayBuffer, password: string): Promise<ParsedSalaryTable> {
  let bytes: Bytes = new Uint8Array(buffer);
  if (isEncrypted(bytes)) {
    if (!password) throw new Error("Este arquivo tem senha. Informe a senha para abrir.");
    bytes = await decryptAgile(bytes, password);
  }

  const workbook = XLSX.read(bytes, { type: "array" });
  const hidden = new Set((workbook.Workbook?.Sheets || []).filter((sheet) => sheet.Hidden).map((sheet) => sheet.name));
  const roles: (SalaryTableRoleDraft & { id: string })[] = [];
  const sheets: string[] = [];
  const usedIds = new Set<string>();

  workbook.SheetNames.forEach((sheetName) => {
    if (hidden.has(sheetName) || IGNORED_SHEETS.has(normalize(sheetName))) return;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: true });
    const parsed = parseSheet(sheetName, rows, roles.length);
    if (!parsed.length) return;
    sheets.push(sheetName.trim());
    parsed.forEach((role) => {
      let id = salaryRoleId(role.name);
      if (usedIds.has(id)) id = `${id}-${salaryRoleId(role.category)}`;
      usedIds.add(id);
      roles.push({ ...role, id });
    });
  });

  if (!roles.length) throw new Error("Nenhuma função encontrada. Confira se é a planilha da tabela salarial (abas com a coluna FUNÇÃO).");
  return { roles, sheets };
}

