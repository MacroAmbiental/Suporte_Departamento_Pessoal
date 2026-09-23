export const justCauseReasons = [
  { value: "improbity", label: "Ato de improbidade." },

  {
    value: "misconduct",
    label: "Incontinência de conduta ou mau procedimento.",
  },

  {
    value: "unauthorized_business",
    label: "Negociação habitual sem permissão da empresa ou prejudicial ao serviço.",
  },

  {
    value: "criminal_conviction",
    label: "Condenação criminal transitada em julgado, sem suspensão da execução da pena.",
  },

  {
    value: "negligence",
    label: "Desídia no desempenho das respectivas funções.",
  },

  {
    value: "intoxication",
    label: "Embriaguez habitual ou em serviço.",
  },

  {
    value: "trade_secret",
    label: "Violação de segredo da empresa.",
  },

  {
    value: "indiscipline",
    label: "Ato de indisciplina ou de insubordinação.",
  },

  {
    value: "abandonment",
    label: "Abandono de emprego.",
  },

  {
    value: "offense_at_work",
    label: "Ato lesivo à honra ou ofensa física no serviço, salvo legítima defesa.",
  },

  {
    value: "offense_to_employer",
    label: "Ato lesivo à honra ou ofensa física contra empregador ou superiores, salvo legítima defesa.",
  },

  {
    value: "gambling",
    label: "Prática constante de jogos de azar.",
  },

  {
    value: "loss_of_qualification",
    label: "Perda de habilitação ou requisito legal por conduta dolosa do empregado.",
  },

  {
    value: "national_security",
    label: "Ato atentatório à segurança nacional comprovado em inquérito administrativo.",
  },
] as const;

const justCauseReasonValues = new Set<string>(
  justCauseReasons.map((reason) => reason.value)
);

export function parseJustCauseReasons(value?: string) {
  try {
    const parsed = JSON.parse(value || "[]");

    return Array.isArray(parsed)
      ? parsed.filter(
          (reason): reason is string =>
            typeof reason === "string" &&
            justCauseReasonValues.has(reason)
        )
      : [];
  } catch {
    return [];
  }
}