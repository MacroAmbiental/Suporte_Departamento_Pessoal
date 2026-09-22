import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  writeBatch,
} from "firebase/firestore";


function loadLocalEnv() {
  [".env", ".env.local", ".env.production"].forEach((fileName) => {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) return;
    readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) return;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    });
  });
}

loadLocalEnv();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const missingConfig = Object.entries(firebaseConfig)
  .filter(([key, value]) => key !== "measurementId" && !value)
  .map(([key]) => key);
if (missingConfig.length) {
  throw new Error(`Configure as variáveis Firebase antes da migração: ${missingConfig.join(", ")}`);
}

const DELETE_LEGACY = process.argv.includes("--delete-legacy");
const BATCH_LIMIT = 400;
const ROOT_COLLECTION = "timeRecords";
const POINTS_SUBCOLLECTION = "employeePoints";

function safeIdPart(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function mapCollection(snapshot) {
  return new Map(snapshot.docs
    .filter((entry) => entry.id !== "__schema" && entry.data().__systemMeta !== true)
    .map((entry) => [entry.id, { id: entry.id, ...entry.data() }]));
}

async function commitMutations(db, mutations) {
  for (let offset = 0; offset < mutations.length; offset += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = mutations.slice(offset, offset + BATCH_LIMIT);
    chunk.forEach((mutation) => {
      if (mutation.type === "set") batch.set(mutation.ref, mutation.value, { merge: true });
      else batch.delete(mutation.ref);
    });
    await batch.commit();
    console.log(`Gravadas ${Math.min(offset + chunk.length, mutations.length)} de ${mutations.length} operações.`);
  }
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const [
    companiesSnapshot,
    departmentsSnapshot,
    sectorsSnapshot,
    subsectorsSnapshot,
    teamsSnapshot,
    employeesSnapshot,
    timeRecordsSnapshot,
  ] = await Promise.all([
    getDocs(collection(db, "companies")),
    getDocs(collection(db, "departments")),
    getDocs(collection(db, "sectors")),
    getDocs(collection(db, "subsectors")),
    getDocs(collection(db, "teams")),
    getDocs(collection(db, "employees")),
    getDocs(collection(db, ROOT_COLLECTION)),
  ]);

  const companies = mapCollection(companiesSnapshot);
  const departments = mapCollection(departmentsSnapshot);
  const sectors = mapCollection(sectorsSnapshot);
  const subsectors = mapCollection(subsectorsSnapshot);
  const teams = mapCollection(teamsSnapshot);
  const employees = mapCollection(employeesSnapshot);

  const legacyDocuments = timeRecordsSnapshot.docs.filter((entry) => {
    if (entry.id === "__schema" || entry.data().__systemMeta === true) return false;
    const data = entry.data();
    return Boolean(data.employeeId && data.date);
  });

  if (!legacyDocuments.length) {
    console.log("Nenhum registro plano legado foi encontrado.");
    return;
  }

  const recordsByDate = new Map();
  const mutations = [];

  legacyDocuments.forEach((entry) => {
    const old = entry.data();
    const employee = employees.get(String(old.employeeId || ""));
    const companyId = String(old.companyId || employee?.companyId || "");
    const departmentId = String(old.departmentId || employee?.departmentId || "");
    const sectorId = String(old.sectorId || employee?.sectorId || "");
    const subsectorId = String(old.subsectorId || employee?.subsectorId || "");
    const realTeamId = String(old.realTeamId || employee?.teamId || "");
    const dayTeamId = String(old.dayTeamId || realTeamId || "");
    const date = String(old.date || "");
    const employeeId = String(old.employeeId || "");

    const record = {
      ...old,
      id: String(old.id || entry.id),
      date,
      employeeId,
      employeeName: String(old.employeeName || employee?.name || "").trim(),
      companyId,
      companyName: String(old.companyName || companies.get(companyId)?.name || "").trim(),
      functionName: String(old.functionName || employee?.role || employee?.position || "").trim(),
      departmentId,
      departmentName: String(old.departmentName || departments.get(departmentId)?.name || "").trim(),
      sectorId,
      sectorName: String(old.sectorName || sectors.get(sectorId)?.name || "").trim(),
      subsectorId,
      subsectorName: String(old.subsectorName || subsectors.get(subsectorId)?.name || "").trim(),
      realTeamId,
      realTeamName: String(old.realTeamName || teams.get(realTeamId)?.name || "").trim(),
      dayTeamId,
      dayTeamName: String(old.dayTeamName || teams.get(dayTeamId)?.name || "").trim(),
      updatedAt: String(old.updatedAt || new Date().toISOString()),
    };

    const list = recordsByDate.get(date) || [];
    list.push(record);
    recordsByDate.set(date, list);

    mutations.push({
      type: "set",
      ref: doc(
        db,
        ROOT_COLLECTION,
        safeIdPart(date),
        POINTS_SUBCOLLECTION,
        safeIdPart(employeeId),
      ),
      value: record,
    });

    if (DELETE_LEGACY) {
      mutations.push({ type: "delete", ref: doc(db, ROOT_COLLECTION, entry.id) });
    }
  });

  recordsByDate.forEach((records, date) => {
    const companyIds = [...new Set(records.map((record) => record.companyId).filter(Boolean))].sort();
    const absenceCount = records.filter((record) => [
      "absent",
      "absence_pending",
      "absence_confirmed",
    ].includes(record.status)).length;
    const latestUpdate = records.reduce(
      (latest, record) => String(record.updatedAt || "") > latest ? String(record.updatedAt || "") : latest,
      "",
    );
    const manifest = {
      id: date,
      date,
      documentType: "timekeepingDay",
      companyIds,
      employeeCount: records.length,
      recordCount: records.length,
      absenceCount,
      migratedAt: new Date().toISOString(),
      updatedAt: latestUpdate || new Date().toISOString(),
      version: 1,
    };

    mutations.push({
      type: "set",
      ref: doc(db, ROOT_COLLECTION, safeIdPart(date)),
      value: manifest,
    });
    mutations.push({
      type: "set",
      ref: doc(db, "timekeepingDayTables", safeIdPart(date)),
      value: manifest,
    });
  });

  await commitMutations(db, mutations);

  console.log("Migração concluída.");
  console.log(`Dias migrados: ${recordsByDate.size}`);
  console.log(`Pontos migrados: ${legacyDocuments.length}`);
  console.log(`Registros planos excluídos: ${DELETE_LEGACY ? legacyDocuments.length : 0}`);
  if (!DELETE_LEGACY) {
    console.log("Valide os dados e execute novamente com --delete-legacy para remover o formato antigo.");
  }
}

main().catch((error) => {
  console.error("Falha ao migrar os pontos para a estrutura diária.", error);
  process.exitCode = 1;
});
