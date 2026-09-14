import {
  collection,
  getAggregateFromServer,
  getCountFromServer,
  query,
  sum,
} from "firebase/firestore";
import { firestore } from "@/services/firebase";

export type DashboardMetrics = {
  companies: number;
  employees: number;
  employeeDocuments: number;
  benefitPlans: number;
  talentCandidates: number;
  absences: number;
};

const emptyMetrics: DashboardMetrics = {
  companies: 0,
  employees: 0,
  employeeDocuments: 0,
  benefitPlans: 0,
  talentCandidates: 0,
  absences: 0,
};

let cachedMetrics: { value: DashboardMetrics; loadedAt: number } | null = null;
let pendingMetrics: Promise<DashboardMetrics> | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function collectionCount(name: string) {
  if (!firestore) return 0;
  const snapshot = await getCountFromServer(query(collection(firestore, name)));
  return snapshot.data().count;
}

async function absenceTotal() {
  if (!firestore) return 0;
  try {
    const snapshot = await getAggregateFromServer(query(collection(firestore, "timekeepingDayTables")), {
      total: sum("absenceCount"),
    });
    return Number(snapshot.data().total || 0);
  } catch (error) {
    console.warn("Não foi possível calcular o total agregado de faltas.", error);
    return 0;
  }
}

export async function loadDashboardMetrics(force = false): Promise<DashboardMetrics> {
  if (!force && cachedMetrics && Date.now() - cachedMetrics.loadedAt < CACHE_TTL_MS) {
    return cachedMetrics.value;
  }
  if (!force && pendingMetrics) return pendingMetrics;

  pendingMetrics = Promise.all([
    collectionCount("companies"),
    collectionCount("employees"),
    collectionCount("employeeDocuments"),
    collectionCount("benefitPlans"),
    collectionCount("talentCandidates"),
    absenceTotal(),
  ]).then(([companies, employees, employeeDocuments, benefitPlans, talentCandidates, absences]) => {
    const value: DashboardMetrics = {
      companies,
      employees,
      employeeDocuments,
      benefitPlans,
      talentCandidates,
      absences,
    };
    cachedMetrics = { value, loadedAt: Date.now() };
    return value;
  }).catch((error) => {
    console.warn("Não foi possível carregar os indicadores do painel.", error);
    return cachedMetrics?.value || emptyMetrics;
  }).finally(() => {
    pendingMetrics = null;
  });

  return pendingMetrics;
}
