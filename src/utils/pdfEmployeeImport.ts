export interface ParsedWorkScheduleDay {
  day: string;
  enabled: boolean;
  start: string;
  breakStart: string;
  breakEnd: string;
  end: string;
}

export interface ParsedEmployeePdf {
  [key: string]: string | ParsedWorkScheduleDay[] | undefined;
  company?: string;
  department?: string;
  sector?: string;
  subsector?: string;
  registration?: string;
  name?: string;
  cpf?: string;
  phone?: string;
  role?: string;
  position?: string;
  admissionDate?: string;
  email?: string;
  emergencyContact?: string;
  employeeNumber?: string;
  companyLegalName?: string;
  companyDocument?: string;
  companyAddress?: string;
  residence?: string;
  beneficiaries?: string;
  birthDate?: string;
  birthPlace?: string;
  nationality?: string;
  maritalStatus?: string;
  fatherName?: string;
  motherName?: string;
  rg?: string;
  rgIssueDate?: string;
  rgIssuer?: string;
  voterTitle?: string;
  voterZone?: string;
  voterSection?: string;
  professionalCouncil?: string;
  ctpsNumber?: string;
  ctpsSeries?: string;
  ctpsIssueDate?: string;
  ctpsUf?: string;
  driversLicense?: string;
  employeeCategory?: string;
  militaryDocument?: string;
  militaryCategory?: string;
  contractCategory?: string;
  color?: string;
  sex?: string;
  educationLevel?: string;
  disability?: string;
  homePhone?: string;
  mobilePhone?: string;
  cbo?: string;
  salary?: string;
  salaryPeriod?: string;
  workHours?: string;
  breakHours?: string;
  fgts?: string;
  fgtsDate?: string;
  bankAccount?: string;
  rectificationDate?: string;
  pisRegisteredAt?: string;
  pisNumber?: string;
  bankDomicile?: string;
  bankNumber?: string;
  bankAgencyCode?: string;
  bankAgencyAddress?: string;
  salaryRoleChanges?: string;
  vacationHistory?: string;
  annotations?: string;
  workAccidents?: string;
  termination?: string;
  unionContribution?: string;
  resignationDate?: string;
  noticeDate?: string;
  projectionDate?: string;
  terminationType?: string;
  notes?: string;
  workScheduleDetails?: string;
  scheduleDays?: ParsedWorkScheduleDay[];
}

type PdfObjectInfo = {
  id: number;
  header: string;
  streamBytes?: Uint8Array;
  decodedStream?: string;
};

type FontMap = Record<number, string>;

type PositionedText = {
  pageIndex: number;
  order: number;
  x: number;
  y: number;
  fontSize: number;
  text: string;
};

type PdfLine = {
  pageIndex: number;
  y: number;
  items: PositionedText[];
  text: string;
};

const scheduleTemplate: ParsedWorkScheduleDay[] = [
  { day: "Segunda", enabled: true, start: "07:00", breakStart: "12:00", breakEnd: "13:00", end: "17:00" },
  { day: "Terça", enabled: true, start: "07:00", breakStart: "12:00", breakEnd: "13:00", end: "17:00" },
  { day: "Quarta", enabled: true, start: "07:00", breakStart: "12:00", breakEnd: "13:00", end: "17:00" },
  { day: "Quinta", enabled: true, start: "07:00", breakStart: "12:00", breakEnd: "13:00", end: "17:00" },
  { day: "Sexta", enabled: true, start: "07:00", breakStart: "12:00", breakEnd: "13:00", end: "17:00" },
  { day: "Sábado", enabled: false, start: "", breakStart: "", breakEnd: "", end: "" },
  { day: "Domingo", enabled: false, start: "", breakStart: "", breakEnd: "", end: "" },
];

const scheduleDayAliases: Record<string, string> = {
  dom: "Domingo",
  domingo: "Domingo",
  seg: "Segunda",
  segunda: "Segunda",
  ter: "Terça",
  terca: "Terça",
  terça: "Terça",
  qua: "Quarta",
  quarta: "Quarta",
  qui: "Quinta",
  quinta: "Quinta",
  sex: "Sexta",
  sexta: "Sexta",
  sab: "Sábado",
  sáb: "Sábado",
  sabado: "Sábado",
  sábado: "Sábado",
};

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function bytesToBinaryString(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let output = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    output += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return output;
}

function stringToBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}

function decodeBytes(bytes: Uint8Array) {
  return bytesToBinaryString(bytes);
}

function normalizeText(value: string) {
  return value
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForSearch(value: string) {
  return stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function cleanValue(value?: string) {
  if (!value) return "";
  return value
    .replace(/\s+/g, " ")
    .replace(/\bREGISTR\s+O\b/gi, "REGISTRO")
    .replace(/\bROBER\s+TO\b/gi, "ROBERTO")
    .replace(/\bAL\s+VES\b/gi, "ALVES")
    .replace(/\bALV\s+ES\b/gi, "ALVES")
    .replace(/\bA\s+LV\s+ES\b/gi, "ALVES")
    .replace(/\bMARINAL\s+VA\b/gi, "MARINALVA")
    .replace(/\bEV\s+ANGELIST\s*A\b/gi, "EVANGELISTA")
    .replace(/\bAV\s+ENIDA\b/gi, "AVENIDA")
    .replace(/\bAMBIENT\s+AL\b/gi, "AMBIENTAL")
    .replace(/\bSANEAMENTO\s+L\s*TDA\b/gi, "SANEAMENTO LTDA")
    .replace(/\bL\s*TDA\b/g, "LTDA")
    .replace(/\bMA\s+TA\b/gi, "MATA")
    .replace(/\bPOR\s+TO\b/gi, "PORTO")
    .replace(/\bTe\s*r\b/gi, "Ter")
    .replace(/\bTe\s*lefone\b/g, "Telefone")
    .replace(/\bTi\s*po\b/gi, "Tipo")
    .replace(/\bT\s*rabalho\b/gi, "Trabalho")
    .replace(/\bAL\s+TERAÇÕES\b/gi, "ALTERAÇÕES")
    .replace(/\bCONTRA\s+TO\b/gi, "CONTRATO")
    .replace(/\bOBSER\s*VA\s*ÇÕES\b/gi, "OBSERVAÇÕES")
    .replace(/\b(\d)\s+(\d:\d{2})\b/g, "$1$2")
    .replace(/\b(\d{3,})\s+(\d{1,})\b/g, "$1$2")
    .replace(/\b(\d{3}\.\d)\s+(\d{4}\.\d{2}-\d)\b/g, "$1$2")
    .replace(/\s+([,.:;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const registrationCellLabels = [
  "Autenticar", "Matrícula eSocial", "Nº", "Empregador", "CNPJ", "Endereço", "Empregado", "Residência",
  "Beneficiários", "Data de nascimento", "Local do nascimento", "País da nacionalidade", "Estado civil", "FILIAÇÃO",
  "Pai", "Mãe", "Cédula de Identidade", "Data de emissão", "Órgão/UF emissor", "Título Eleitoral", "Título Eleitor",
  "Zona", "Seção", "Inscr. Órgão de Classe", "CTPS", "Série", "Data de expedição da CTPS", "UF CTPS", "CPF",
  "Cart. Nac. Habilitação", "Doc. militar", "Categoria", "Cor", "Sexo", "Grau de instrução", "Telefone Residencial",
  "Telefone Celular", "Deficiência", "Cargo", "Função", "C.B.O.", "C.B.O", "Data de Admissão", "Salário", "Por",
  "Horário de Trabalho", "Horário de Intervalo", "FGTS", "Opção em", "Conta vinculada no banco", "Data da Retificação",
  "Cadastrado em", "Sob nº", "Domicílio bancário", "Nº banco", "Agência código", "End. da agência",
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripRegistrationCellLabels(value: string) {
  let next = cleanValue(value);
  for (const label of [...registrationCellLabels].sort((left, right) => right.length - left.length)) {
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(label)}(?=\\s|$|[:.])`, "gi");
    next = next.replace(pattern, " ");
  }
  return cleanValue(next);
}

function normalizeDate(value?: string) {
  if (!value) return "";
  const match = value.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!match) return value;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function normalizeTime(value?: string) {
  if (!value) return "";
  const match = value.match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizeDayName(value: string) {
  return scheduleDayAliases[normalizeForSearch(value)] || value;
}

function isZeroTime(value: string) {
  return !value || value === "00:00" || value === "0:00";
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim())?.trim() || "";
}

function moneyToNumberText(value: string) {
  return value.replace(/R\$\s*/i, "").trim();
}

function pick(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return cleanValue(value.replace(/[|;]+$/g, ""));
  }
  return "";
}

function pickBetween(text: string, label: string, nextLabels: string[]) {
  const labelPattern = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const next = nextLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return pick(text, [new RegExp(`${labelPattern}\\s*[:\\-]?\\s*(.+?)(?=\\s+(?:${next})\\s*[:\\-]?|$)`, "i")]);
}

function hexToUtf16Text(value: string) {
  const clean = value.replace(/\s+/g, "");
  if (!clean || clean.length % 4 !== 0) return "";
  let output = "";
  for (let index = 0; index < clean.length; index += 4) {
    const code = parseInt(clean.slice(index, index + 4), 16);
    if (Number.isFinite(code) && code > 0) output += String.fromCharCode(code);
  }
  return output;
}

function parsePdfObjects(bytes: Uint8Array) {
  const binary = bytesToBinaryString(bytes);
  const starts = Array.from(binary.matchAll(/(\d+)\s+(\d+)\s+obj\b/g)).map((match) => ({
    id: Number(match[1]),
    start: match.index || 0,
    afterHeader: (match.index || 0) + match[0].length,
  }));

  return starts.map((entry, index): PdfObjectInfo => {
    const nextStart = starts[index + 1]?.start ?? binary.length;
    const chunk = binary.slice(entry.afterHeader, nextStart);
    const streamMatch = chunk.match(/stream\r?\n/);
    if (!streamMatch || streamMatch.index == null) return { id: entry.id, header: chunk };

    const header = chunk.slice(0, streamMatch.index);
    const lengthMatch = header.match(/\/Length\s+(\d+)/);
    const streamStart = entry.afterHeader + streamMatch.index + streamMatch[0].length;
    const streamEnd = lengthMatch
      ? streamStart + Number(lengthMatch[1])
      : binary.indexOf("endstream", streamStart);

    return {
      id: entry.id,
      header,
      streamBytes: bytes.slice(streamStart, Math.max(streamStart, streamEnd)),
    };
  });
}

async function inflatePdfStream(bytes: Uint8Array) {
  const DecompressionStreamConstructor = globalThis.DecompressionStream as (new (format: string) => DecompressionStream) | undefined;
  if (!DecompressionStreamConstructor) return bytes;

  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStreamConstructor("deflate"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function decodeObjectStreams(objects: PdfObjectInfo[]) {
  await Promise.all(objects.map(async (object) => {
    if (!object.streamBytes) return;
    try {
      const decoded = /\/FlateDecode\b/.test(object.header)
        ? await inflatePdfStream(object.streamBytes)
        : object.streamBytes;
      object.decodedStream = decodeBytes(decoded);
    } catch {
      object.decodedStream = decodeBytes(object.streamBytes);
    }
  }));
}

function decodeUnicodeHex(hex: string) {
  const text = hexToUtf16Text(hex);
  if (text) return text;
  const clean = hex.replace(/\s+/g, "");
  try {
    return decodeURIComponent(clean.match(/.{1,2}/g)?.map((byte) => `%${byte}`).join("") || "");
  } catch {
    return "";
  }
}

function parseCMap(text: string): FontMap {
  const map: FontMap = {};

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const source = parseInt(pair[1], 16);
      const target = decodeUnicodeHex(pair[2]);
      if (Number.isFinite(source) && target) map[source] = target;
    }
  }

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const arrayRange of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const start = parseInt(arrayRange[1], 16);
      const end = parseInt(arrayRange[2], 16);
      const values = Array.from(arrayRange[3].matchAll(/<([0-9A-Fa-f]+)>/g)).map((item) => decodeUnicodeHex(item[1]));
      for (let code = start; code <= end && code - start < values.length; code += 1) {
        if (values[code - start]) map[code] = values[code - start];
      }
    }

    for (const range of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const start = parseInt(range[1], 16);
      const end = parseInt(range[2], 16);
      const base = parseInt(range[3], 16);
      if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(base) || end - start > 4096) continue;
      for (let code = start; code <= end; code += 1) map[code] = String.fromCharCode(base + code - start);
    }
  }

  return map;
}

function buildFontMaps(objects: PdfObjectInfo[]) {
  const cmaps = new Map<number, FontMap>();
  for (const object of objects) {
    if (object.decodedStream?.includes("begincmap")) cmaps.set(object.id, parseCMap(object.decodedStream));
  }

  const fontMaps: Record<string, FontMap> = {};
  for (const object of objects) {
    const name = object.header.match(/\/Name\s*\/([^\s/<>[\]]+)/)?.[1];
    const toUnicodeId = Number(object.header.match(/\/ToUnicode\s+(\d+)\s+0\s+R/)?.[1] || 0);
    if (name && cmaps.has(toUnicodeId)) fontMaps[name] = cmaps.get(toUnicodeId) || {};
  }

  return fontMaps;
}

function decodeHexWithFont(hex: string, fontMap: FontMap | undefined) {
  const clean = hex.replace(/\s+/g, "");
  if (!clean) return "";

  if (fontMap && Object.keys(fontMap).length) {
    const step = clean.length % 4 === 0 ? 4 : 2;
    let output = "";
    for (let index = 0; index + step <= clean.length; index += step) {
      const code = parseInt(clean.slice(index, index + step), 16);
      output += fontMap[code] || "";
    }
    if (output.trim()) return output;
  }

  return decodeUnicodeHex(clean);
}

function extractTextFromContentStream(stream: string, pageIndex: number, fontMaps: Record<string, FontMap>) {
  const positioned: PositionedText[] = [];
  let currentFont: FontMap | undefined;
  let currentFontSize = 8;
  let x = 0;
  let y = 0;
  let order = 0;

  const number = "[-+]?\\d*\\.?\\d+";
  const tokenRegex = new RegExp([
    "BT",
    "ET",
    `\\/([^\\s/<>[\\]]+)\\s+(${number})\\s+Tf`,
    `(${number})\\s+(${number})\\s+Td`,
    `(${number})\\s+(${number})\\s+TD`,
    `${number}\\s+${number}\\s+${number}\\s+${number}\\s+(${number})\\s+(${number})\\s+Tm`,
    "<([0-9A-Fa-f\\s]{4,})>\\s*Tj",
    "\\((?:\\\\.|[^\\\\)])*\\)\\s*Tj",
    "\\[([\\s\\S]*?)\\]\\s*TJ",
  ].join("|"), "g");

  for (const match of stream.matchAll(tokenRegex)) {
    if (match[1]) {
      currentFont = fontMaps[match[1]] || currentFont;
      currentFontSize = Number(match[2]) || currentFontSize;
      continue;
    }

    if (match[3] && match[4]) {
      x += Number(match[3]);
      y += Number(match[4]);
      continue;
    }

    if (match[5] && match[6]) {
      x += Number(match[5]);
      y += Number(match[6]);
      continue;
    }

    if (match[7] && match[8]) {
      x = Number(match[7]);
      y = Number(match[8]);
      continue;
    }

    const addText = (value: string) => {
      const text = value.replace(/[\u0000-\u001f]+/g, " ");
      if (!text.trim()) return;
      positioned.push({ pageIndex, order, x, y, fontSize: currentFontSize, text });
      order += 1;
    };

    if (match[9]) addText(decodeHexWithFont(match[9], currentFont));

    if (match[0].startsWith("(")) addText(decodePdfLiteral(match[0].replace(/\s*Tj$/, "").slice(1, -1)));

    if (match[10]) {
      for (const hex of match[10].matchAll(/<([0-9A-Fa-f\s]{4,})>/g)) addText(decodeHexWithFont(hex[1], currentFont));
      for (const literal of match[10].matchAll(/\((?:\\.|[^\\)])*\)/g)) addText(decodePdfLiteral(literal[0].slice(1, -1)));
    }
  }

  return positioned;
}

function estimateTextWidth(item: PositionedText) {
  const cleaned = item.text.replace(/\s+/g, " ");
  return cleaned.length * item.fontSize * 0.42;
}

function joinLineItems(items: PositionedText[]) {
  const sorted = [...items].sort((left, right) => left.x - right.x || left.order - right.order);
  let output = "";
  let previous: PositionedText | undefined;

  for (const item of sorted) {
    if (previous) {
      const previousEnd = previous.x + estimateTextWidth(previous);
      const gap = item.x - previousEnd;
      if (gap > Math.max(1.5, item.fontSize * 0.22) && !/\s$/.test(output)) output += " ";
    }
    output += item.text;
    previous = item;
  }

  return cleanValue(output);
}

function groupPositionedText(items: PositionedText[]) {
  const lines: PdfLine[] = [];
  const sorted = [...items].sort((left, right) => left.pageIndex - right.pageIndex || right.y - left.y || left.x - right.x || left.order - right.order);

  for (const item of sorted) {
    let line = lines.find((candidate) => candidate.pageIndex === item.pageIndex && Math.abs(candidate.y - item.y) < 2);
    if (!line) {
      line = { pageIndex: item.pageIndex, y: item.y, items: [], text: "" };
      lines.push(line);
    }
    line.items.push(item);
  }

  return lines
    .map((line) => ({ ...line, items: [...line.items].sort((left, right) => left.x - right.x || left.order - right.order), text: joinLineItems(line.items) }))
    .sort((left, right) => left.pageIndex - right.pageIndex || right.y - left.y);
}

function textByX(line: PdfLine | undefined, minX: number, maxX: number) {
  if (!line) return "";
  return stripRegistrationCellLabels(joinLineItems(line.items.filter((item) => item.x >= minX && item.x < maxX)));
}

function lineIncludes(line: PdfLine, label: string) {
  return normalizeForSearch(line.text).includes(normalizeForSearch(label));
}

function findLine(lines: PdfLine[], label: string, predicate?: (line: PdfLine) => boolean) {
  return lines.find((line) => lineIncludes(line, label) && (!predicate || predicate(line)));
}

function findExactLine(lines: PdfLine[], label: string) {
  const target = normalizeForSearch(label);
  return lines.find((line) => normalizeForSearch(line.text) === target);
}

function nextLineBelow(lines: PdfLine[], line: PdfLine | undefined, minDelta = 3, maxDelta = 20) {
  if (!line) return undefined;
  return lines.find((candidate) => (
    candidate.pageIndex === line.pageIndex
    && candidate.y < line.y - minDelta
    && candidate.y > line.y - maxDelta
  ));
}

function linesBetween(lines: PdfLine[], pageIndex: number, topY: number, bottomY: number, minX: number, maxX: number) {
  return lines
    .filter((line) => line.pageIndex === pageIndex && line.y < topY && line.y > bottomY)
    .map((line) => textByX(line, minX, maxX))
    .filter(Boolean)
    .join(" ");
}

function cleanExtractedDocumentNumber(value: string) {
  const document = value.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0];
  return document || cleanValue(value);
}

function parsePositionedRegistration(lines: PdfLine[]): ParsedEmployeePdf {
  const page1 = lines.filter((line) => line.pageIndex === 0);
  const parsed: ParsedEmployeePdf = {};

  const matriculaLabel = findLine(page1, "Matrícula eSocial");
  const matriculaValue = nextLineBelow(page1, matriculaLabel, 3, 16);
  parsed.registration = textByX(matriculaValue, 120, 480);
  parsed.employeeNumber = firstNonEmpty(textByX(matriculaValue, 480, 590), parsed.registration);

  const employerLabel = findLine(page1, "Empregador", (line) => lineIncludes(line, "CNPJ"));
  const employerValue = nextLineBelow(page1, employerLabel, 3, 18);
  parsed.company = textByX(employerValue, 120, 455);
  parsed.companyLegalName = parsed.company;
  parsed.companyDocument = cleanExtractedDocumentNumber(textByX(employerValue, 455, 590));

  const addressLabel = findLine(page1, "Endereço");
  const addressValue = nextLineBelow(page1, addressLabel, 3, 18);
  parsed.companyAddress = textByX(addressValue, 120, 590);

  const employeeLabel = findLine(page1, "Empregado", (line) => lineIncludes(line, "Beneficiários"));
  const employeeValue = nextLineBelow(page1, employeeLabel, 3, 16);
  parsed.name = textByX(employeeValue, 0, 285);
  parsed.beneficiaries = textByX(employeeValue, 285, 590);

  const residenceLabel = findLine(page1, "Residência");
  parsed.residence = linesBetween(page1, 0, residenceLabel?.y || 720, 686, 0, 285);

  const birthLabel = findLine(page1, "Data de nascimento");
  const birthValue = nextLineBelow(page1, birthLabel, 3, 16);
  parsed.birthDate = normalizeDate(textByX(birthValue, 90, 190));
  parsed.birthPlace = textByX(birthValue, 190, 400);
  parsed.nationality = textByX(birthValue, 400, 490);
  parsed.maritalStatus = textByX(birthValue, 490, 590);

  const fatherLabel = findExactLine(page1, "Pai");
  parsed.fatherName = textByX(nextLineBelow(page1, fatherLabel, 3, 16), 135, 590);
  const motherLabel = findExactLine(page1, "Mãe");
  parsed.motherName = textByX(nextLineBelow(page1, motherLabel, 3, 16), 135, 590);

  const rgLabel = findLine(page1, "Cédula de Identidade");
  const rgValue = nextLineBelow(page1, rgLabel, 3, 16);
  parsed.rg = textByX(rgValue, 90, 190);
  parsed.rgIssueDate = normalizeDate(textByX(rgValue, 190, 250));
  parsed.rgIssuer = textByX(rgValue, 250, 323);
  parsed.voterTitle = textByX(rgValue, 323, 425);
  parsed.voterZone = textByX(rgValue, 425, 458);
  parsed.voterSection = textByX(rgValue, 458, 493);
  parsed.professionalCouncil = textByX(rgValue, 493, 590);

  const ctpsLabel = findLine(page1, "CTPS");
  const ctpsValue = nextLineBelow(page1, ctpsLabel, 3, 16);
  parsed.ctpsNumber = textByX(ctpsValue, 90, 145);
  parsed.ctpsSeries = textByX(ctpsValue, 145, 200);
  parsed.ctpsIssueDate = normalizeDate(textByX(ctpsValue, 200, 280));
  parsed.ctpsUf = textByX(ctpsValue, 280, 323);
  parsed.cpf = textByX(ctpsValue, 323, 416).match(/\d{3}\.\d{3}\.\d{3}-\d{2}/)?.[0] || textByX(ctpsValue, 323, 416);
  parsed.driversLicense = textByX(ctpsValue, 416, 525);
  parsed.employeeCategory = textByX(ctpsValue, 525, 590);

  const militaryLabel = findLine(page1, "Doc. militar");
  const militaryValue = nextLineBelow(page1, militaryLabel, 3, 16);
  parsed.militaryDocument = textByX(militaryValue, 90, 173);
  parsed.militaryCategory = textByX(militaryValue, 173, 238);
  parsed.color = textByX(militaryValue, 238, 337);
  parsed.sex = textByX(militaryValue, 337, 405);
  parsed.educationLevel = textByX(militaryValue, 405, 590);
  parsed.contractCategory = parsed.militaryCategory;

  const disabilityLabel = findLine(page1, "Deficiência");
  const disabilityValue = nextLineBelow(page1, disabilityLabel, 3, 16);
  parsed.disability = textByX(disabilityValue, 90, 290);
  parsed.homePhone = textByX(disabilityValue, 290, 431);
  parsed.mobilePhone = textByX(disabilityValue, 431, 590);
  parsed.phone = firstNonEmpty(parsed.mobilePhone, parsed.homePhone);

  const cargoLabel = findLine(page1, "Cargo", (line) => lineIncludes(line, "C.B.O"));
  const cargoValue = nextLineBelow(page1, cargoLabel, 3, 16);
  parsed.position = textByX(cargoValue, 90, 313);
  parsed.role = firstNonEmpty(textByX(cargoValue, 313, 514), parsed.position);
  parsed.cbo = textByX(cargoValue, 514, 590);

  const admissionLabel = findLine(page1, "Data de Admissão") || page1.find((line) => lineIncludes(line, "Data de") && lineIncludes(line, "Admissão"));
  const admissionValue = nextLineBelow(page1, admissionLabel, 3, 16);
  parsed.admissionDate = normalizeDate(textByX(admissionValue, 0, 96));
  parsed.salary = moneyToNumberText(textByX(admissionValue, 96, 200));
  parsed.salaryPeriod = textByX(admissionValue, 200, 266);
  parsed.workHours = textByX(admissionValue, 266, 428);
  parsed.breakHours = textByX(admissionValue, 428, 590);

  const fgtsLine = findExactLine(page1, "FGTS") || page1.find((line) => lineIncludes(line, "FGTS") && line.y < 535 && line.y > 515);
  const fgtsValue = fgtsLine ? nextLineBelow(page1, fgtsLine, 2, 14) : undefined;
  parsed.fgts = fgtsLine ? "FGTS" : "";
  parsed.fgtsDate = normalizeDate(textByX(fgtsValue, 45, 145));
  parsed.bankAccount = textByX(fgtsValue, 145, 460);
  parsed.rectificationDate = normalizeDate(textByX(fgtsValue, 460, 590));

  const pisLabel = findLine(page1, "Cadastrado em");
  const pisValue = nextLineBelow(page1, pisLabel, 3, 16);
  parsed.pisRegisteredAt = normalizeDate(textByX(pisValue, 0, 74));
  parsed.pisNumber = textByX(pisValue, 74, 181);
  parsed.bankDomicile = textByX(pisValue, 181, 590);

  const bankLine = findLine(page1, "Nº banco");
  const bankValue = nextLineBelow(page1, bankLine, 3, 20);
  parsed.bankNumber = textByX(bankValue, 0, 74);
  parsed.bankAgencyCode = textByX(bankValue, 74, 155);
  parsed.bankAgencyAddress = textByX(bankValue, 155, 590);

  parsed.salaryRoleChanges = "";
  parsed.vacationHistory = "";
  parsed.annotations = "";
  parsed.workAccidents = "";
  parsed.termination = "";
  parsed.unionContribution = "";
  parsed.resignationDate = "";
  parsed.noticeDate = "";
  parsed.projectionDate = "";
  parsed.terminationType = "";
  parsed.notes = "";

  return parsed;
}

function applyScheduleRow(schedule: Record<string, ParsedWorkScheduleDay>, dayInput: string, typeInput: string, timesInput: string[]) {
  const day = normalizeDayName(dayInput);
  if (!day) return;

  const type = normalizeForSearch(typeInput || "trabalhado");
  const times = timesInput.map((item) => normalizeTime(item)).filter(Boolean);
  const start = times[0] || "";
  const end = times[times.length - 1] || "";
  const breakStart = times.length >= 4 ? times[1] : "";
  const breakEnd = times.length >= 4 ? times[2] : "";
  const enabled = !type.includes("folga") && !isZeroTime(start) && !isZeroTime(end);

  schedule[day] = {
    day,
    enabled,
    start: enabled ? start : "",
    breakStart: enabled ? breakStart : "",
    breakEnd: enabled ? breakEnd : "",
    end: enabled ? end : "",
  };
}

function orderedSchedule(schedule: Record<string, ParsedWorkScheduleDay>) {
  const ordered = scheduleTemplate.map((day) => schedule[day.day] || { ...day, enabled: false, start: "", breakStart: "", breakEnd: "", end: "" });
  return Object.keys(schedule).length ? ordered : undefined;
}

function scoreSchedule(days?: ParsedWorkScheduleDay[]) {
  if (!days?.length) return 0;
  return days.reduce((score, day) => {
    if (!day.enabled) return score;
    return score + 10 + (day.start ? 1 : 0) + (day.end ? 1 : 0) + (day.breakStart && day.breakEnd ? 3 : 0);
  }, 0);
}

function pickBestSchedule(...candidates: Array<ParsedWorkScheduleDay[] | undefined>) {
  return candidates.reduce<ParsedWorkScheduleDay[] | undefined>((best, candidate) => (
    scoreSchedule(candidate) > scoreSchedule(best) ? candidate : best
  ), undefined);
}

function parseScheduleDaysFromLines(lines: PdfLine[]) {
  const schedule: Record<string, ParsedWorkScheduleDay> = {};
  const dayPattern = /^(Dom(?:ingo)?|Seg(?:unda)?|Ter(?:[çc]a)?|Qua(?:rta)?|Qui(?:nta)?|Sex(?:ta)?|S[áa]b(?:ado)?)/i;

  for (const line of lines) {
    const text = cleanValue(line.text.replace(/Tr\s*abalhado/gi, "Trabalhado").replace(/Te\s*r/g, "Ter"));
    const dayMatch = text.match(dayPattern);
    if (!dayMatch) continue;

    const timeItems = line.items
      .map((item) => ({ x: item.x, value: normalizeTime(item.text) }))
      .filter((item) => item.value)
      .sort((left, right) => left.x - right.x)
      .map((item) => item.value);
    const textTimes = Array.from(text.matchAll(/\d{1,2}\s*[:hH]\s*\d{2}/g)).map((item) => normalizeTime(item[0])).filter(Boolean);
    const times = textTimes.length >= timeItems.length ? textTimes : timeItems;
    const type = /folga/i.test(text) ? "folga" : /compensado/i.test(text) ? "compensado" : "trabalhado";
    applyScheduleRow(schedule, dayMatch[1], type, times);
  }

  return orderedSchedule(schedule);
}

async function extractPositionedTextFromPdf(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const objects = parsePdfObjects(bytes);
  await decodeObjectStreams(objects);
  const fontMaps = buildFontMaps(objects);

  let pageIndex = 0;
  const positioned: PositionedText[] = [];
  for (const object of objects) {
    if (!object.decodedStream || !/\bBT\b/.test(object.decodedStream) || !/\bET\b/.test(object.decodedStream)) continue;
    if (!/\bTj\b|\bTJ\b/.test(object.decodedStream)) continue;
    const pieces = extractTextFromContentStream(object.decodedStream, pageIndex, fontMaps);
    if (pieces.length) {
      positioned.push(...pieces);
      pageIndex += 1;
    }
  }

  const lines = groupPositionedText(positioned);
  const text = lines.map((line) => line.text).join(" ");
  return { lines, text: normalizeText(text) };
}

function parseScheduleDays(text: string): ParsedWorkScheduleDay[] | undefined {
  const compact = normalizeText(text.replace(/Tr\s*abalhado/gi, "Trabalhado").replace(/Te\s*r/g, "Ter"));
  const schedule: Record<string, ParsedWorkScheduleDay> = {};
  const dayName = "Dom(?:ingo)?|Seg(?:unda)?|Ter(?:[çc]a)?|Qua(?:rta)?|Qui(?:nta)?|Sex(?:ta)?|S[áa]b(?:ado)?";
  const rowPattern = new RegExp(`\b(${dayName})\b\s+(Folga|Trabalhado|Compensado)\s+([\s\S]*?)(?=\b(?:${dayName})\b\s+(?:Folga|Trabalhado|Compensado)\b|$)`, "gi");
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(compact))) {
    const times = Array.from(match[3].matchAll(/\d{1,2}\s*[:hH]\s*\d{2}/g)).map((item) => normalizeTime(item[0])).filter(Boolean);
    if (times.length >= 2) applyScheduleRow(schedule, match[1], match[2], times.slice(0, 4));
  }

  return orderedSchedule(schedule);
}

const commonStops = [
  "Autenticar", "Matrícula eSocial", "Nº", "Empregador", "CNPJ", "Endereço", "Empregado", "Residência",
  "Beneficiários", "Data de nascimento", "Local do nascimento", "País da nacionalidade", "Estado civil", "FILIAÇÃO",
  "Pai", "Mãe", "Cédula de Identidade", "Data de emissão", "Órgão/UF emissor", "Título Eleitoral", "Zona",
  "Seção", "Inscr. Órgão de Classe", "CTPS", "Série", "Categoria", "Data de expedição da CTPS", "UF CTPS",
  "CPF", "Cart. Nac. Habilitação", "Doc. militar", "CDI", "Cor", "Sexo", "Grau de instrução", "Deficiência",
  "Telefone Residencial", "Telefone Celular", "Cargo", "Função", "C.B.O", "Data de Admissão", "Salário", "Por",
  "Horário de Trabalho", "Horário de Intervalo", "FGTS", "Opção em", "Conta vinculada no banco", "Data da Retificação",
  "Cadastrado em", "Sob nº", "Domicílio bancário", "Nº banco", "Agência código", "End. da agência", "OBSERVAÇÕES",
  "ALTERAÇÕES DE SALÁRIO", "FÉRIAS", "FERIAS", "ANOTAÇÕES", "ACIDENTES DE TRABALHO", "RESCISÃO", "CONTRIBUIÇÃO SINDICAL",
  "DISCRIMINAÇÃO DO HORÁRIO DE TRABALHO", "Dia", "Tipo", "Entrada", "Saída",
];

export async function extractTextFromPdf(file: File) {
  try {
    const structured = await extractPositionedTextFromPdf(file);
    if (structured.text.length > 20) return structured.text;
  } catch {
    // Mantém a compatibilidade com PDFs mais simples caso o navegador não consiga descompactar os streams.
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const raw = bytesToBinaryString(bytes);
  const literalStrings = Array.from(raw.matchAll(/\((?:\\.|[^\\)]){2,}\)/g)).map((match) => decodePdfLiteral(match[0].slice(1, -1)));
  const hexStrings = Array.from(raw.matchAll(/<([0-9a-fA-F\s]{8,})>/g)).map((match) => hexToUtf16Text(match[1]));
  return normalizeText([...literalStrings, ...hexStrings].join(" "));
}

export function parseEmployeePdfText(text: string): ParsedEmployeePdf {
  const compact = normalizeText(text);
  const stop = "(?=\\s+(?:CPF|RG|CTPS|PIS|PASEP|Matr[ií]cula|Admiss[aã]o|Cargo|Fun[cç][aã]o|Empresa|Empregador|Departamento|Setor|Subsetor|Telefone|E-mail|Email|Contato|Endere[cç]o|CNPJ)\\b|$)";

  const employeeName = firstNonEmpty(
    pickBetween(compact, "Empregado", commonStops),
    pick(compact, [new RegExp(`(?:Nome(?: do empregado| completo)?)\\s*[:\\-]?\\s*([A-Za-zÀ-ÿ' .-]{4,120})${stop}`, "i")]),
  );
  const companyLegalName = firstNonEmpty(
    pickBetween(compact, "Empregador", commonStops),
    pick(compact, [new RegExp(`Empresa\\s*[:\\-]?\\s*([A-Za-zÀ-ÿ0-9 .&/-]{2,100})${stop}`, "i")]),
  );
  const role = pickBetween(compact, "Função", commonStops);
  const position = pickBetween(compact, "Cargo", commonStops);
  const mobilePhone = pickBetween(compact, "Telefone Celular", commonStops);
  const homePhone = pickBetween(compact, "Telefone Residencial", commonStops);
  const scheduleDays = parseScheduleDays(compact);

  return {
    employeeNumber: firstNonEmpty(
      pick(compact, [/REGISTRO DE EMPREGADO\s*N[ºo.]?\s*:?\s*(\d{1,20})/i]),
      pickBetween(compact, "Nº", commonStops),
    ),
    registration: firstNonEmpty(
      pickBetween(compact, "Matrícula eSocial", commonStops),
      pick(compact, [/Matr[ií]cula\s*[:\-]?\s*([A-Za-z0-9./\-]{2,30})/i, /Registro\s*[:\-]?\s*([A-Za-z0-9./\-]{2,30})/i]),
    ),
    company: companyLegalName,
    companyLegalName,
    companyDocument: firstNonEmpty(
      pickBetween(compact, "CNPJ", commonStops),
      pick(compact, [/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/]),
    ),
    companyAddress: pickBetween(compact, "Endereço", commonStops),
    department: pick(compact, [new RegExp(`Departamento\\s*[:\\-]?\\s*([A-Za-zÀ-ÿ0-9 .&/-]{2,80})${stop}`, "i")]),
    sector: pick(compact, [new RegExp(`Setor\\s*[:\\-]?\\s*([A-Za-zÀ-ÿ0-9 .&/-]{2,80})${stop}`, "i")]),
    subsector: pick(compact, [new RegExp(`Subsetor\\s*[:\\-]?\\s*([A-Za-zÀ-ÿ0-9 .&/-]{2,80})${stop}`, "i")]),
    name: employeeName,
    residence: pickBetween(compact, "Residência", commonStops),
    beneficiaries: pickBetween(compact, "Beneficiários", commonStops),
    birthDate: normalizeDate(pickBetween(compact, "Data de nascimento", commonStops)),
    birthPlace: pickBetween(compact, "Local do nascimento", commonStops),
    nationality: pickBetween(compact, "País da nacionalidade", commonStops),
    maritalStatus: pickBetween(compact, "Estado civil", commonStops),
    fatherName: pickBetween(compact, "Pai", commonStops),
    motherName: pickBetween(compact, "Mãe", commonStops),
    rg: pickBetween(compact, "Cédula de Identidade", commonStops),
    rgIssueDate: normalizeDate(pickBetween(compact, "Data de emissão", commonStops)),
    rgIssuer: pickBetween(compact, "Órgão/UF emissor", commonStops),
    voterTitle: pickBetween(compact, "Título Eleitoral", commonStops),
    voterZone: pickBetween(compact, "Zona", commonStops),
    voterSection: pickBetween(compact, "Seção", commonStops),
    professionalCouncil: pickBetween(compact, "Inscr. Órgão de Classe", commonStops),
    ctpsNumber: pickBetween(compact, "CTPS", commonStops),
    ctpsSeries: pickBetween(compact, "Série", commonStops),
    employeeCategory: pickBetween(compact, "Categoria", commonStops),
    ctpsIssueDate: normalizeDate(pickBetween(compact, "Data de expedição da CTPS", commonStops)),
    ctpsUf: pickBetween(compact, "UF CTPS", commonStops),
    cpf: firstNonEmpty(pickBetween(compact, "CPF", commonStops), pick(compact, [/(\d{3}\.\d{3}\.\d{3}-\d{2})/])),
    driversLicense: pickBetween(compact, "Cart. Nac. Habilitação", commonStops),
    militaryDocument: pickBetween(compact, "Doc. militar", commonStops),
    militaryCategory: pickBetween(compact, "Categoria", commonStops),
    contractCategory: pickBetween(compact, "CDI", commonStops),
    color: pickBetween(compact, "Cor", commonStops),
    sex: pickBetween(compact, "Sexo", commonStops),
    educationLevel: pickBetween(compact, "Grau de instrução", commonStops),
    disability: pickBetween(compact, "Deficiência", commonStops),
    homePhone,
    mobilePhone,
    phone: firstNonEmpty(mobilePhone, homePhone, pick(compact, [/(?:Telefone|Celular)\s*[:\-]?\s*(\(?\d{2}\)?\s?\d{4,5}-?\d{4})/i])),
    role: firstNonEmpty(role, position),
    position,
    cbo: firstNonEmpty(pickBetween(compact, "C.B.O", commonStops), pickBetween(compact, "CBO", commonStops)),
    admissionDate: normalizeDate(firstNonEmpty(pickBetween(compact, "Data de Admissão", commonStops), pick(compact, [/(?:Admiss[aã]o|Data de admiss[aã]o)\s*[:\-]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i]))),
    salary: moneyToNumberText(firstNonEmpty(pick(compact, [/Sal[áa]rio\s*R?\$?\s*[:\-]?\s*(R?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2})/i]), pickBetween(compact, "Salário", commonStops))),
    salaryPeriod: pickBetween(compact, "Por", commonStops),
    workHours: pickBetween(compact, "Horário de Trabalho", commonStops),
    breakHours: pickBetween(compact, "Horário de Intervalo", commonStops),
    fgts: pickBetween(compact, "FGTS", commonStops),
    fgtsDate: normalizeDate(firstNonEmpty(pickBetween(compact, "Opção em", commonStops), pickBetween(compact, "FGTS Opção em", commonStops))),
    bankAccount: pickBetween(compact, "Conta vinculada no banco", commonStops),
    rectificationDate: normalizeDate(pickBetween(compact, "Data da Retificação", commonStops)),
    pisRegisteredAt: normalizeDate(pickBetween(compact, "Cadastrado em", commonStops)),
    pisNumber: pickBetween(compact, "Sob nº", commonStops),
    bankDomicile: pickBetween(compact, "Domicílio bancário", commonStops),
    bankNumber: pickBetween(compact, "Nº banco", commonStops),
    bankAgencyCode: pickBetween(compact, "Agência código", commonStops),
    bankAgencyAddress: pickBetween(compact, "End. da agência", commonStops),
    salaryRoleChanges: pickBetween(compact, "ALTERAÇÕES DE SALÁRIO, CARGO E/OU FUNÇÃO", commonStops),
    vacationHistory: pick(compact, [/F[ÉE]RIAS\s*-\s*PER[IÍ]ODO.*?(.+?)(?=\s+ACIDENTES DE TRABALHO|\s+RESCIS[AÃ]O|\s+CONTRIBUIÇÃO SINDICAL|\s+OBSERVAÇÕES|$)/i]),
    annotations: firstNonEmpty(pickBetween(compact, "Obs.", commonStops), pickBetween(compact, "Anotações", commonStops)),
    workAccidents: pickBetween(compact, "ACIDENTES DE TRABALHO, DOENÇAS OU DOENÇAS PROFISSIONAIS", commonStops),
    termination: pickBetween(compact, "RESCISÃO DE CONTRATO DE TRABALHO", commonStops),
    unionContribution: pickBetween(compact, "CONTRIBUIÇÃO SINDICAL", commonStops),
    resignationDate: normalizeDate(pickBetween(compact, "Data da saída", commonStops)),
    noticeDate: normalizeDate(pickBetween(compact, "Data aviso ind.", commonStops)),
    projectionDate: normalizeDate(pickBetween(compact, "Data projeção", commonStops)),
    terminationType: pickBetween(compact, "Tipo do desligamento", commonStops),
    notes: pickBetween(compact, "OBSERVAÇÕES", commonStops),
    workScheduleDetails: pick(compact, [/DISCRIMINAÇÃO DO HORÁRIO DE TRABALHO\s*(.+?)\s*$/i]),
    scheduleDays,
    email: pick(compact, [/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i]),
    emergencyContact: pick(compact, [new RegExp(`Contato(?: de emerg[êe]ncia| emergencial)?\\s*[:\\-]?\\s*([A-Za-zÀ-ÿ0-9 ()+.-]{4,100})${stop}`, "i")]),
  };
}

function mergeParsedEmployeeData(base: ParsedEmployeePdf, patch: ParsedEmployeePdf) {
  const merged: ParsedEmployeePdf = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (Array.isArray(value)) {
      if (value.length) merged[key] = value;
    } else if (typeof value === "string" && value.trim()) {
      merged[key] = value;
    }
  }
  return merged;
}


async function parseEmployeePdfWithPython(file: File): Promise<ParsedEmployeePdf | undefined> {
  const formData = new FormData();
  formData.append("file", file);
  const productionBackend = import.meta.env.PROD ? "https://documentacao-dp.onrender.com" : "";
  const envBase = (import.meta.env.VITE_PYTHON_IMPORT_API || import.meta.env.VITE_PYTHON_BACKEND_URL || productionBackend).replace(/\/$/, "");
  const endpoints = envBase ? [`${envBase}/api/importar-registro`, "/api/importar-registro"] : ["/api/importar-registro", "http://127.0.0.1:8000/api/importar-registro"];

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const parsed = await response.json() as ParsedEmployeePdf;
      const hasUsefulData = Boolean(parsed.name || parsed.cpf || parsed.company || parsed.companyDocument || parsed.admissionDate);
      if (hasUsefulData) return parsed;
    } catch {
      // Se o backend Python não estiver aberto, o importador antigo em JS continua como fallback.
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return undefined;
}

function hasUsefulEmployeeData(parsed: ParsedEmployeePdf) {
  return Boolean(parsed.name || parsed.cpf || parsed.company || parsed.companyDocument || parsed.admissionDate || parsed.employeeNumber || parsed.registration);
}

export async function parseEmployeePdf(file: File) {
  const pythonParsed = await parseEmployeePdfWithPython(file);
  if (pythonParsed) return pythonParsed;

  try {
    const structured = await extractPositionedTextFromPdf(file);
    const fromText = parseEmployeePdfText(structured.text);
    const fromPosition = parsePositionedRegistration(structured.lines);
    const scheduleDays = pickBestSchedule(parseScheduleDaysFromLines(structured.lines), fromText.scheduleDays);
    const isRegistrationModel = Boolean(fromPosition.companyDocument || fromPosition.cpf || fromPosition.admissionDate || fromPosition.name);
    const parsed = isRegistrationModel ? { ...fromText, ...fromPosition, scheduleDays } : mergeParsedEmployeeData(fromText, { ...fromPosition, scheduleDays });
    if (hasUsefulEmployeeData(parsed)) return parsed;
    throw new Error("Nenhum dado útil encontrado no PDF.");
  } catch {
    const text = await extractTextFromPdf(file);
    const parsed = parseEmployeePdfText(text);
    if (hasUsefulEmployeeData(parsed)) return parsed;
    throw new Error("O backend Python não está ativo ou o PDF não possui texto legível pelo importador.");
  }
}
