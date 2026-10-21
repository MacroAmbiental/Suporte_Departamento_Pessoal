import type { Company, Employee } from "@/types/domain";
import { providerColumns, type BenefitOrderLayout } from "./benefitCalculation";

// Colunas da aba "Realizar Pedido" da planilha do fornecedor, na mesma ordem.
const orderHeaders = [
  "CNPJ/CPF",
  "Número do contrato",
  "Nome completo do colaborador",
  "CPF do colaborador",
  "Matrícula do colaborador",
  "Data de nascimento do colaborador",
  "E-mail do colaborador",
  "Telefone do colaborador",
  "Departamento",
  "CEP de entrega",
  "Cidade",
  "Estado",
  "Bairro",
  "Logradouro",
  "Número",
  "Complemento",
  "Ponto de referência",
  "Nome do interlocutor",
  "Telefone do interlocutor",
  "Nome da unidade de entrega",
  "Data de crédito",
  ...providerColumns,
];

export type OrderExportRow = { employee: Employee; value: number };

const digits = (value?: string) => String(value || "").replace(/\D/g, "");

function excelDate(isoDate?: string) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  return { t: "n", v: (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000, z: "dd/mm/yyyy" };
}

const text = (value: string) => ({ t: "s", v: value });

export async function exportBenefitOrder(params: {
  fileName: string;
  company?: Company;
  layout: BenefitOrderLayout;
  creditDate: string;
  rows: OrderExportRow[];
}) {
  const { fileName, company, layout, creditDate, rows } = params;
  const XLSX = await import("xlsx-js-style");
  const valueColumnIndex = orderHeaders.indexOf(layout.providerColumn || "Alimentação");

  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "0B9369" } },
    alignment: { vertical: "center", wrapText: true },
  };
  const titleStyle = { font: { bold: true, sz: 14 }, alignment: { horizontal: "center" } };

  const sheetRows: unknown[][] = [
    ["", "", { v: "PLANILHA DE PEDIDOS", t: "s", s: titleStyle }],
    orderHeaders.map((header) => ({ v: header, t: "s", s: headerStyle })),
    ...rows.map(({ employee, value }) => {
      const cpf = digits(employee.cpf).padStart(11, "0");
      const line: unknown[] = [
        text(digits(company?.document)),
        text(digits(layout.contractNumber)),
        text(employee.name.toUpperCase()),
        text(cpf),
        // A planilha do DP usa o CPF como matrícula; manter evita gerar cartão novo.
        text(cpf),
        excelDate(employee.registrationData?.birthDate),
        text(employee.registrationData?.email || ""),
        text(digits(employee.phone || employee.registrationData?.mobilePhone)),
        text(layout.departmentLabel),
        text(digits(layout.deliveryZipCode)),
        text(layout.deliveryCity),
        text(layout.deliveryState),
        text(layout.deliveryDistrict),
        text(layout.deliveryStreet),
        text(layout.deliveryNumber),
        text(layout.deliveryComplement),
        text(layout.deliveryReference),
        text(layout.contactName),
        text(digits(layout.contactPhone)),
        text(layout.deliveryUnitName),
        excelDate(creditDate),
        ...providerColumns.map(() => ""),
      ];
      line[valueColumnIndex] = { t: "n", v: value, z: "#,##0.00" };
      return line;
    }),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 0, c: orderHeaders.length - 1 } },
  ];
  worksheet["!cols"] = orderHeaders.map((header) => ({ wch: Math.max(12, Math.min(34, header.length + 2)) }));
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: Math.max(1, rows.length + 1), c: orderHeaders.length - 1 } }) };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Realizar Pedido");
  XLSX.writeFile(workbook, fileName);
}
