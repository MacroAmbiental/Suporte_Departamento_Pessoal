export type DiaristStatus = "active" | "inactive";
export type PaymentStatus = "pending" | "paid" | "canceled";

export type Diarist = {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  role: string;
  dailyRate: number;
  paymentMethod: string;
  pixKey: string;
  status: DiaristStatus;
  companyOrTeam: string;
  workplace: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DiaristWorkDay = {
  id: string;
  diaristId: string;
  date: string;
  role: string;
  dailyRate: number;
  paymentStatus: PaymentStatus;
  paidAt: string;
  hiringType: "single" | "fixed-period" | "open-period";
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DiaristForm = Omit<Diarist, "id" | "createdAt" | "updatedAt">;

export type WorkForm = {
  diaristId: string;
  mode: "single" | "fixed-period" | "open-period";
  startDate: string;
  endDate: string;
  role: string;
  dailyRate: number;
  paymentStatus: PaymentStatus;
  notes: string;
};

