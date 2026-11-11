import type { SystemScreen } from "@/services/accessControl";
import type { PermissionAction } from "@/types/domain";

// Níveis da aba Perfis (11/11/2026). É só uma forma mais simples de escolher: por baixo
// o perfil continua gravando as mesmas ações de antes (view/create/edit/delete/manage).
export type AccessLevel = "none" | "view" | "edit" | "full";

export const levelLabels: Record<AccessLevel, string> = {
  none: "Sem acesso",
  view: "Ver",
  edit: "Editar",
  full: "Total",
};

export const levelHints: Record<AccessLevel, string> = {
  none: "Não vê a tela.",
  view: "Só consulta.",
  edit: "Consulta, cria e altera.",
  full: "Tudo, inclusive excluir e gerenciar.",
};

// Ações de cada nível naquela tela (só as que a tela usa).
export function levelActions(screen: SystemScreen, level: AccessLevel): PermissionAction[] {
  if (level === "none") return [];
  if (level === "view") return screen.actions.filter((action) => action === "view");
  if (level === "edit") return screen.actions.filter((action) => action === "view" || action === "create" || action === "edit");
  return [...screen.actions];
}

// Níveis que a tela oferece: "Editar" só se ela tem edição; "Total" só se tem algo além.
export function screenLevels(screen: SystemScreen): AccessLevel[] {
  const levels: AccessLevel[] = ["none", "view"];
  if (screen.actions.includes("edit")) levels.push("edit");
  if (screen.actions.includes("delete") || screen.actions.includes("manage")) levels.push("full");
  return levels;
}

const sameSet = (a: PermissionAction[], b: PermissionAction[]) => a.length === b.length && a.every((item) => b.includes(item));

// Nível atual. Combinação que não bate com nenhum nível (perfil antigo) = "custom",
// e fica como está até alguém escolher um nível.
export function currentLevel(screen: SystemScreen, actions: PermissionAction[] | undefined): AccessLevel | "custom" {
  const own = (actions || []).filter((action) => screen.actions.includes(action));
  if (!own.length) return "none";
  if (own.includes("manage")) return screen.actions.includes("manage") ? "full" : "custom";
  const match = screenLevels(screen).find((level) => sameSet(levelActions(screen, level), own));
  return match || "custom";
}
