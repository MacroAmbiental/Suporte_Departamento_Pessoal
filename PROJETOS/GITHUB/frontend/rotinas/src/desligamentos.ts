// Regra da efetivação automática de desligamentos (sem dependência do Firebase,
// para poder ser testada isoladamente).

export type EmployeeDoc = {
  id: string;
  name?: string;
  status?: string;
  registrationData?: Record<string, string | undefined>;
  [key: string]: unknown;
};

// Só avisos/desligamentos que terminam a partir desta data são efetivados.
// Os vencidos antes dela ficam para o DP acertar à mão (decisão de 21/10/2026).
export const EFETIVACAO_A_PARTIR_DE = "2026-10-21";

// Data em que o processo termina. Usa só campos gravados pelo processo de
// desligamento: "noticeDate" também é o campo "Data aviso ind." do cadastro
// e não pode disparar desligamento sozinho.
export function dataFimDoProcesso(employee: EmployeeDoc) {
  const r = employee.registrationData || {};
  return String(r.scheduledDeactivationDate || r.deactivationEffectiveDate || r.noticeEndDate || "");
}

// Retorna a data de desligamento a efetivar, ou "" se não houver nada a fazer.
// "hoje" é a data local (America/Sao_Paulo): desliga no dia seguinte ao fim.
export function desligamentoAEfetivar(employee: EmployeeDoc, hoje: string, aPartirDe = EFETIVACAO_A_PARTIR_DE) {
  if (employee.status === "terminated") return "";
  const r = employee.registrationData || {};
  const fim = dataFimDoProcesso(employee);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fim)) return "";
  if (fim >= hoje || fim < aPartirDe) return "";
  // Reativação agendada depois do fim cancela o desligamento.
  const reativacao = String(r.scheduledReactivationDate || r.reactivationEffectiveDate || "");
  if (reativacao && reativacao > fim) return "";
  return fim;
}

export function hojeEmSaoPaulo(agora = new Date()) {
  // "sv-SE" formata como AAAA-MM-DD.
  return agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
