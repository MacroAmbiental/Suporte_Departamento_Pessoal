import { screenFromSecureToken } from "@/services/secureRoutes";
import type { AppScreen } from "@/types/domain";

const legacyScreenPaths: Array<[RegExp, AppScreen]> = [
  [/^\/app\/?$/, "dashboard"],
  [/^\/app\/(companies|empresas)\/?$/, "companies"],
  [/^\/app\/(records|registros)\/?$/, "records"],
  [/^\/app\/(employees|funcionarios)\/?$/, "employees"],
  [/^\/app\/(benefits|beneficios)\/?$/, "benefits"],
  [/^\/app\/(timekeeping|controle-ponto)\/?$/, "timekeeping"],
  [/^\/app\/(hr-control|controle-rh)\/?$/, "hrControl"],
  [/^\/app\/(talent-bank|banco-talentos)\/?$/, "talentBank"],
  [/^\/app\/(notifications|notificacoes)\/?$/, "notifications"],
  [/^\/app\/(monitoring|monitoramento)\/?$/, "monitoring"],
  [/^\/app\/(permissions|permissoes)\/?$/, "permissions"],
];

export function screenFromPathname(pathname: string): AppScreen | null {
  const secureMatch = pathname.match(/^\/app\/s\/([^/]+)/);
  const secureScreen = secureMatch ? screenFromSecureToken(secureMatch[1]) : null;
  if (secureScreen) return secureScreen;

  return legacyScreenPaths.find(([pattern]) => pattern.test(pathname))?.[1] || null;
}
