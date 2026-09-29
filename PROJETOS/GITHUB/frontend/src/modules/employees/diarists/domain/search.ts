import type { Diarist, DiaristStatus } from "../types";

export function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function filterDiarists(diarists: Diarist[], search: string, status: "all" | DiaristStatus): Diarist[] {
  const query = normalize(search);
  return diarists.filter(item => status === "all" || item.status === status)
    .filter(item => !query || normalize(`${item.name} ${item.cpf} ${item.phone} ${item.role} ${item.pixKey}`).includes(query))
    .sort((a,b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}
