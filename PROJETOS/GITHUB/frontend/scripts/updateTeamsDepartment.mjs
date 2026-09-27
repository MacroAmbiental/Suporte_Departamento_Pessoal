import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore, doc, writeBatch } from "firebase/firestore";

const BATCH_LIMIT = 400;
const DRY_RUN = process.argv.includes("--dry-run");

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
      const value = trimmed.slice(separator + 1).trim().replace(/^['\"]|['\"]$/g, "");
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
  throw new Error(`Configure as variaveis Firebase antes de executar: ${missingConfig.join(", ")}`);
}

function normalize(value) {
  return String(value || "").trim();
}

function findDepartmentIdByName(departments, name) {
  if (!name) return "";
  const norm = normalize(name).toLowerCase();
  const found = departments.find((d) => normalize(d.name).toLowerCase() === norm);
  return found ? found.id : "";
}

async function commitBatch(db, mutations) {
  if (DRY_RUN) {
    console.log(`[dry-run] ${mutations.length} atualizacoes preparadas.`);
    mutations.forEach((m) => console.log(`-> Team ${m.id} -> departmentId: ${m.departmentId || ""}`));
    return;
  }

  for (let offset = 0; offset < mutations.length; offset += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = mutations.slice(offset, offset + BATCH_LIMIT);
    chunk.forEach((m) => {
      batch.set(doc(db, "teams", m.id), { departmentId: m.departmentId, updatedAt: new Date().toISOString() }, { merge: true });
    });
    await batch.commit();
    console.log(`Gravadas ${Math.min(offset + chunk.length, mutations.length)} de ${mutations.length} atualizacoes.`);
  }
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const [departmentsSnapshot, teamsSnapshot] = await Promise.all([
    getDocs(collection(db, "departments")),
    getDocs(collection(db, "teams")),
  ]);

  const departments = departmentsSnapshot.docs
    .filter((d) => d.id !== "__schema" && d.data().__systemMeta !== true)
    .map((d) => ({ id: d.id, ...d.data() }));

  const teams = teamsSnapshot.docs
    .filter((d) => d.id !== "__schema" && d.data().__systemMeta !== true)
    .map((d) => ({ id: d.id, ...d.data() }));

  // Mapping provided by user: team name -> department name
  const mapping = {
    // Produção
    "Acleston Ricardo Pereira dos Santos": "Produção",
    "Alecsandro do Nascimento Barbosa": "Produção",
    "Anival Bento da Silva": "Produção",
    "Apoio": "Produção",
    "Arlindo Custodio da Anunciação": "Produção",
    "Asfalto II": "Produção",
    "Canteiro ETE": "Produção",
    "Canteiro Serra": "Produção",
    "Canteiro Vila Velha": "Produção",
    "Cisaro Mendes Gonçalves": "Produção",
    "Cleverton Almeida Santos": "Produção",
    "Fabio Alvarenga da Silva": "Produção",
    "Gilson Raimundo Ferreira": "Produção",
    "Guilherme de Jesus Santos": "Produção",
    "Jocimar Pereira Correa": "Produção",
    "Juvenil Galdino Batista": "Produção",
    "Limpeza": "Produção",
    "Loteamento": "Produção",
    "Marconi Modesto da Silva": "Produção",
    "Missinio dos Santos": "Produção",
    "Olivan Silva Nascimento": "Produção",
    "Paulo Cesar Goncalves": "Produção",
    "Pavimentação": "Produção",
    "Reinaldo Andre dos Santos": "Produção",
    "Reparos": "Produção",
    "Sidenilson Santos Vieira": "Produção",
    "Thiago Luis Silva Lima": "Produção",
    "Uanderson Soares de Souza": "Produção",
    "Wesley Soares Torres": "Produção",
    "Wilson Nogueira da Silva": "Produção",

    // Suporte Operacional
    "Aguimaraes Souza dos Santos": "Suporte Operacional",
    // "Alecsandro do Nascimento Barbosa": "Suporte Operacional", // also exists in Produção per mapping; keep Produção mapping
    // "Anival Bento da Silva": "Suporte Operacional", // also exists in Produção
    "Apoio - SO": "Suporte Operacional",
    "Arlindo Custodio da Anunciação - SO": "Suporte Operacional",
    "Asfalto II - SO": "Suporte Operacional",
    "Caixas": "Suporte Operacional",
    "Canteiro Cariacica": "Suporte Operacional",
    "Canteiro ETE - SO": "Suporte Operacional",
    "Canteiro Serra - SO": "Suporte Operacional",
    "Canteiro Vila Velha - SO": "Suporte Operacional",
    "Fabio Alvarenga da Silva - SO": "Suporte Operacional",
    "Gilson Raimundo Ferreira - SO": "Suporte Operacional",
    "Jocimar Pereira Correa - SO": "Suporte Operacional",
    "Limpeza - SO": "Suporte Operacional",
    "Marconi Modesto da Silva - SO": "Suporte Operacional",
    "Missinio dos Santos": "Suporte Operacional",
    "Munck": "Suporte Operacional",
    "Olivan Silva Nascimento - SO": "Suporte Operacional",
    "Reinaldo Andre dos Santos - SO": "Suporte Operacional",
    "Reparos - SO": "Suporte Operacional",
    "Sidenilson Santos Vieira - SO": "Suporte Operacional",
    "Thiago Luis Silva Lima - SO": "Suporte Operacional",
    "Vistoria": "Suporte Operacional",
    "Wilson Nogueira da Silva - SO": "Suporte Operacional",
  };

  // Normalize mapping by trying to match teams by exact name first, then by normalized name
  const departmentNameToIdCache = new Map();
  const teamNameIndex = new Map();
  teams.forEach((t) => teamNameIndex.set(normalize(t.name).toLowerCase(), t.id));

  // Populate department cache
  departments.forEach((d) => departmentNameToIdCache.set(normalize(d.name).toLowerCase(), d.id));

  const mutations = [];

  Object.entries(mapping).forEach(([teamName, departmentName]) => {
    const normTeam = normalize(teamName).toLowerCase();
    const teamId = teamNameIndex.get(normTeam);
    if (!teamId) {
      // try to find partial matches (team names that contain the provided string)
      const candidate = teams.find((t) => normalize(t.name).toLowerCase().includes(normTeam) || normTeam.includes(normalize(t.name).toLowerCase()));
      if (candidate) {
        console.log(`Found approximate match: "${teamName}" -> "${candidate.name}"`);
        const deptId = departmentNameToIdCache.get(normalize(departmentName).toLowerCase()) || findDepartmentIdByName(departments, departmentName);
        if (!deptId) {
          console.warn(`Departamento não encontrado para "${departmentName}"`);
          return;
        }
        mutations.push({ id: candidate.id, departmentId: deptId });
      } else {
        console.warn(`Equipe não encontrada: "${teamName}"`);
      }
      return;
    }

    const deptId = departmentNameToIdCache.get(normalize(departmentName).toLowerCase()) || findDepartmentIdByName(departments, departmentName);
    if (!deptId) {
      console.warn(`Departamento não encontrado para "${departmentName}"`);
      return;
    }
    mutations.push({ id: teamId, departmentId: deptId });
  });

  console.log(`Prepared ${mutations.length} updates.`);
  await commitBatch(db, mutations);

  console.log("Concluido.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
