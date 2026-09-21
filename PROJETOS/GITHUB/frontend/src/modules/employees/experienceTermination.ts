export function experienceTerminationAction(desligamentoDate: string, milestoneEndDate: string, includeDetail = false) {
  if (!desligamentoDate || !milestoneEndDate) return "";
  const dismissal = Date.parse(`${desligamentoDate}T12:00:00Z`);
  const milestone = Date.parse(`${milestoneEndDate}T12:00:00Z`);

  if (dismissal === milestone) return includeDetail ? "quick" : "quick";
  if (dismissal < milestone) {
    const message = "Desligamento antecipado antes do fim do marco. Isso pode gerar multa, conforme o Art. 477, § 8º, da CLT.";
    return includeDetail ? message : "warning";
  }
  return includeDetail ? "Desligamento após o fim do marco." : "normal";
}
