import type { AppScreen } from "@/types/domain";

const routeSalt = "macro-dp-secure-route-v1";

const screenSlugs: Record<AppScreen, string> = {
  dashboard: "painel",
  companies: "empresas",
  records: "registros",
  employees: "funcionarios",
  benefits: "beneficios",
  timekeeping: "controle-ponto",
  hrControl: "controle-rh",
  talentBank: "banco-talentos",
  notifications: "notificacoes",
  monitoring: "monitoramento",
  permissions: "permissoes",
};

function base64UrlEncode(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  return decodeURIComponent(escape(atob(padded.replace(/-/g, "+").replace(/_/g, "/"))));
}

export function secureRouteToken(screen: AppScreen) {
  return base64UrlEncode(`${routeSalt}:${screen}:${screenSlugs[screen]}`);
}

export function securePath(screen: AppScreen) {
  return screen === "dashboard" ? "/app" : `/app/s/${secureRouteToken(screen)}`;
}

export function screenFromSecureToken(token?: string): AppScreen | null {
  if (!token) return null;

  try {
    const [salt, screen, slug] = base64UrlDecode(token).split(":");
    if (salt !== routeSalt) return null;
    if (screenSlugs[screen as AppScreen] !== slug) return null;
    return screen as AppScreen;
  } catch {
    return null;
  }
}
