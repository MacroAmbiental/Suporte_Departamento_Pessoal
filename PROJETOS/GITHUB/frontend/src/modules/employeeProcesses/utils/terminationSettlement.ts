export function isLateTerminationSettlementPayment(paymentDate: string, dueDate: string) {
  if (!paymentDate || !dueDate) return false;
  return Date.parse(`${paymentDate}T12:00:00Z`) > Date.parse(`${dueDate}T12:00:00Z`);
}

export function terminationSettlementLateMessage() {
  return "Pagamento após o prazo de 10 dias corridos. Conforme o Art. 477, § 8º, da CLT, o atraso gera multa de 40% sobre o valor das verbas rescisórias não quitadas.";
}
