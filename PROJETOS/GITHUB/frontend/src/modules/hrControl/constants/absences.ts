export const absenceStatuses = new Set(["absence_confirmed"]);
export const settingsColumnKey = "__timekeeping_calculation_settings";
export const defaultUsefulMinutesByWeekday: Record<string, number> = {
  "1": 600,
  "2": 600,
  "3": 600,
  "4": 600,
  "5": 539,
  "6": 0,
  "0": 0,
};

export const absenceTypeLabels: Record<string, string> = {
  confirmed: "Falta Confirmada",
  certificate: "Atestado",
  leave: "Afastado",
  vacation: "Férias",
  dayOff: "Folga",
  license: "Licença",
};

export const absenceTypeColors: Record<string, string> = {
  confirmed: "#d94f5c",
  certificate: "#ec6b35",
  leave: "#b86843",
  vacation: "#8a66be",
  dayOff: "#718497",
  license: "#089677",
};

export const absenceLabels: Record<string, string> = {
  leave: "Afastado",
  certificate: "Atestado",
  confirmed: "Falta",
  vacation: "Férias",
  dayOff: "Folga",
  license: "Licença",
};

export const leaveReasons = [
  "Incapacidade Temporária",
  "Incapacidade Temporária acidentário",
  "Afastamento por invalidez",
];

export const licenseReasons = [
  "Licença-maternidade",
  "Licença-paternidade",
  "Licença-gala (casamento)",
  "Licença-luto (nojo)",
  "Licença para doação de sangue",
  "Licença para alistamento eleitoral",
  "Licença para serviço militar",
  "Licença para convocação judicial (jurado / mesário)",
  "Licença para acompanhamento médico de filho (até 6 anos)",
  "Licença para acompanhamento médico de esposa/companheira gestante",
  "Licença para realização de exames preventivos de câncer",
  "Licença por incapacidade temporária (doença ou acidente de trabalho - primeiros 15 dias)",
  "Licença por aborto não criminoso",
];

export const monitoringPageSize = 10;
