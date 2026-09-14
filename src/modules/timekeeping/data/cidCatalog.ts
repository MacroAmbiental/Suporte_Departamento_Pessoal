export type CidCatalogItem = {
  group: string;
  cid: string;
  description: string;
};

export function normalizeCidCode(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function looksLikeCidCode(value: string) {
  const normalized = normalizeCidCode(value);
  return normalized === "SEM CID" || /^[A-Z][0-9A-Z]{1,3}(?:\.[0-9A-Z]{1,2})?$/.test(normalized);
}

function normalizeCidPart(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export const cidCatalog: CidCatalogItem[] = [
  { group: "Respiratório", cid: "J00", description: "Nasofaringite aguda - resfriado comum" },
  { group: "Respiratório", cid: "J01", description: "Sinusite aguda" },
  { group: "Respiratório", cid: "J06.9", description: "Infecção aguda das vias aéreas superiores, não especificada" },
  { group: "Respiratório", cid: "B34.9", description: "Infecção viral não especificada" },
  { group: "Gastrointestinal", cid: "A09", description: "Diarreia e gastroenterite de origem infecciosa presumível" },
  { group: "Gastrointestinal", cid: "K52.9", description: "Gastroenterite e colite não infecciosas" },
  { group: "Gastrointestinal", cid: "R63", description: "Sintomas e sinais relativos à ingestão de alimentos e líquidos" },
  { group: "Gastrointestinal", cid: "K40.9", description: "Hérnia inguinal sem obstrução ou gangrena" },
  { group: "Osteomuscular", cid: "M54.2", description: "Cervicalgia" },
  { group: "Osteomuscular", cid: "M54.4", description: "Lumbago com ciática" },
  { group: "Osteomuscular", cid: "M54.5", description: "Dor lombar baixa" },
  { group: "Osteomuscular", cid: "M25.5", description: "Dor articular" },
  { group: "Osteomuscular", cid: "M79.6", description: "Dor em membro" },
  { group: "Dor e cefaleia", cid: "R51", description: "Cefaleia" },
  { group: "Dor e cefaleia", cid: "G44.2", description: "Cefaleia tensional" },
  { group: "Dor e cefaleia", cid: "R52", description: "Dor não classificada em outra parte" },
  { group: "Dor e cefaleia", cid: "R52.0", description: "Dor aguda" },
  { group: "Traumatismo", cid: "S00.9", description: "Traumatismo superficial da cabeça" },
  { group: "Traumatismo", cid: "S91.3", description: "Ferimento de outras partes do pé" },
  { group: "Traumatismo", cid: "S93.4", description: "Entorse e distensão do tornozelo" },
  { group: "Traumatismo", cid: "T13", description: "Outros traumatismos de membro inferior" },
  { group: "Traumatismo", cid: "W5A", description: "Mordedura ou golpe provocado por cão" },
  { group: "Dermatológico", cid: "B35.6", description: "Tínea crural" },
  { group: "Dermatológico", cid: "L02", description: "Abscesso cutâneo, furúnculo e antraz" },
  { group: "Dermatológico", cid: "L29", description: "Prurido" },
  { group: "Odontológico", cid: "K02.1", description: "Cárie da dentina" },
  { group: "Sintomas gerais", cid: "R50.9", description: "Febre não especificada" },
  { group: "Exames e acompanhamento", cid: "Z01.0", description: "Exame dos olhos e da visão" },
  { group: "Exames e acompanhamento", cid: "Z52.0", description: "Doador de sangue" },
  { group: "Exames e acompanhamento", cid: "Z67.3", description: "Pessoa em boa saúde acompanhando pessoa doente" },
  { group: "Não informado", cid: "SEM CID", description: "Documento sem CID informado" },
];

export const cidCatalogByCode = new Map(
  cidCatalog.map((item) => [normalizeCidCode(item.cid), item]),
);

export function formatCidLabel(item: CidCatalogItem) {
  if (normalizeCidCode(item.cid) === "SEM CID") return `Sem CID - ${item.group}`;
  return `${item.group} - ${normalizeCidCode(item.cid)} - ${item.description}`;
}

export type CidDetails = {
  category: string;
  code: string;
  description: string;
  label: string;
  hasCode: boolean;
};

export function cidDetailsFromValue(value: string): CidDetails {
  const raw = normalizeCidPart(value);

  if (!raw) {
    return {
      category: "Não informado",
      code: "Sem CID",
      description: "Atestado sem CID informado",
      label: "Sem CID - Não informado",
      hasCode: false,
    };
  }

  const directCatalogMatch = cidCatalogByCode.get(normalizeCidCode(raw));
  if (directCatalogMatch) {
    return cidDetailsFromValue(formatCidLabel(directCatalogMatch));
  }

  const catalogLabelMatch = cidCatalog.find((item) => (
    normalizeCidPart(formatCidLabel(item)).toLowerCase() === raw.toLowerCase()
  ));
  if (catalogLabelMatch) {
    const code = normalizeCidCode(catalogLabelMatch.cid);
    const hasCode = code !== "SEM CID";

    return {
      category: catalogLabelMatch.group,
      code: hasCode ? code : "Sem CID",
      description: hasCode ? catalogLabelMatch.description : "Atestado sem CID informado",
      label: formatCidLabel(catalogLabelMatch),
      hasCode,
    };
  }

  const parts = raw.split(/\s*-\s*/).map(normalizeCidPart).filter(Boolean);
  if (normalizeCidCode(parts[0] || raw) === "SEM CID" || /^sem cid$/i.test(parts[0] || raw)) {
    const category = parts.slice(1).join(" - ") || "Não informado";
    return {
      category,
      code: "Sem CID",
      description: "Atestado sem CID informado",
      label: `Sem CID - ${category}`,
      hasCode: false,
    };
  }

  if (parts.length >= 2 && normalizeCidCode(parts[1]) === "SEM CID") {
    const category = parts[0] || "Não informado";
    return {
      category,
      code: "Sem CID",
      description: "Atestado sem CID informado",
      label: `Sem CID - ${category}`,
      hasCode: false,
    };
  }

  if (parts.length >= 3 && looksLikeCidCode(parts[0])) {
    const code = normalizeCidCode(parts[0]);
    const category = parts[parts.length - 1] || "Cadastrados no ponto";
    const description = parts.slice(1, -1).join(" - ") || "CID digitado no ponto";

    return {
      category,
      code,
      description,
      label: `${category} - ${code} - ${description}`,
      hasCode: true,
    };
  }

  if (parts.length >= 3 && looksLikeCidCode(parts[1])) {
    const category = parts[0] || "Cadastrados no ponto";
    const code = normalizeCidCode(parts[1]);
    const description = parts.slice(2).join(" - ") || "CID digitado no ponto";

    return {
      category,
      code,
      description,
      label: `${category} - ${code} - ${description}`,
      hasCode: true,
    };
  }

  if (looksLikeCidCode(raw)) {
    const code = normalizeCidCode(raw);
    return {
      category: "Cadastrados no ponto",
      code,
      description: "CID digitado no ponto",
      label: `Cadastrados no ponto - ${code} - CID digitado no ponto`,
      hasCode: true,
    };
  }

  return {
    category: "Cadastrados no ponto",
    code: raw,
    description: "CID digitado no ponto",
    label: `Cadastrados no ponto - ${raw} - CID digitado no ponto`,
    hasCode: true,
  };
}

export function standardizeCidValue(value: string) {
  return cidDetailsFromValue(value).label;
}

export function buildCidOptions(values: string[] = []) {
  const options = new Map<string, string>();

  cidCatalog.forEach((item) => {
    const label = formatCidLabel(item);
    options.set(label.toLowerCase(), label);
  });

  values
    .map(standardizeCidValue)
    .filter(Boolean)
    .forEach((label) => options.set(label.toLowerCase(), label));

  return Array.from(options.values()).sort((left, right) =>
    left.localeCompare(right, "pt-BR", { sensitivity: "base", numeric: true }),
  );
}
