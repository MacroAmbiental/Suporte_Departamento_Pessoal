import type { Diarist, DiaristWorkDay } from "../types";
import { formatDate, todayISO } from "@/utils/format";
import { paymentLabel } from "../domain/payment";

export async function exportDiarists(diarists: Diarist[], workDays: DiaristWorkDay[]) {
    const rows = workDays.map((day) => {
      const diarist = diarists.find((item) => item.id === day.diaristId);
      return {
        Diarista: diarist?.name || "",
        CPF: diarist?.cpf || "",
        Telefone: diarist?.phone || "",
        Função: day.role || diarist?.role || "",
        Data: formatDate(day.date),
        "Valor da diária": Number(day.dailyRate || 0),
        Pagamento: paymentLabel(day.paymentStatus),
        "Forma de pagamento": diarist?.paymentMethod || "",
        "Chave PIX": diarist?.pixKey || "",
        Observações: day.notes || "",
      };
    });
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: "Nenhum lançamento de diarista cadastrado." }]);
    worksheet["!cols"] = [
      { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 12 },
      { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Diaristas");
    XLSX.writeFile(workbook, `controle-diaristas-${todayISO()}.xlsx`);
  }

