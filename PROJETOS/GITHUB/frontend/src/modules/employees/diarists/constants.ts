import { todayISO } from "@/utils/format";
import type { DiaristForm, WorkForm } from "./types";

export const emptyDiaristForm: DiaristForm = {
  name: "",
  cpf: "",
  phone: "",
  role: "",
  dailyRate: 0,
  paymentMethod: "PIX",
  pixKey: "",
  status: "active",
  companyOrTeam: "",
  workplace: "",
  notes: "",
};

export const emptyWorkForm: WorkForm = {
  diaristId: "",
  mode: "single",
  startDate: todayISO(),
  endDate: todayISO(),
  role: "",
  dailyRate: 0,
  paymentStatus: "pending",
  notes: "",
};

