import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp } from "firebase/app";
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  getFirestore,
  writeBatch,
} from "firebase/firestore";

const BATCH_LIMIT = 400;
const DRY_RUN = process.argv.includes("--dry-run");
const KEEP_DUPLICATES_ACTIVE = process.argv.includes("--keep-duplicates-active");

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
  throw new Error(`Configure as variaveis Firebase antes da migracao: ${missingConfig.join(", ")}`);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeIdPart(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function clean(value) {
  return JSON.parse(JSON.stringify(value));
}

function mapCollection(snapshot) {
  return snapshot.docs
    .filter((entry) => entry.id !== "__schema" && entry.data().__systemMeta !== true)
    .map((entry) => ({ id: entry.id, ...entry.data(), ref: entry.ref }));
}

function selectMacroGroup(groups, groupCompanies) {
  const activeGroups = groups.filter((group) => group.active !== false);
  const candidates = activeGroups.length ? activeGroups : groups;
  const macro = candidates.find((group) => normalizeText(group.name).includes("macro"));
  if (macro) return macro;

  return [...candidates].sort((first, second) => {
    const firstCount = groupCompanies.filter((item) => item.groupId === first.id).length;
    const secondCount = groupCompanies.filter((item) => item.groupId === second.id).length;
    return secondCount - firstCount || String(first.name || "").localeCompare(String(second.name || ""), "pt-BR");
  })[0];
}

function leaderCompanyIdForGroup(group, groupCompanies, companies) {
  if (group?.divergenceSourceCompanyId) return group.divergenceSourceCompanyId;
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const linkedCompanyIds = group
    ? groupCompanies.filter((item) => item.groupId === group.id).map((item) => item.companyId)
    : [];
  return linkedCompanyIds.find((companyId) => companyById.get(companyId)?.active !== false)
    || linkedCompanyIds[0]
    || companies.find((company) => company.active !== false)?.id
    || companies[0]?.id
    || "";
}

function mutationKey(mutation) {
  return mutation.ref.path;
}

function pushSet(mutations, ref, value) {
  mutations.set(mutationKey({ ref }), {
    type: "set",
    ref,
    value: clean(value),
  });
}

async function commitMutations(_db, mutationsByPath) {
  const mutations = Array.from(mutationsByPath.values());
  if (DRY_RUN) {
    console.log(`[dry-run] ${mutations.length} operacoes seriam gravadas.`);
    return;
  }

  for (let offset = 0; offset < mutations.length; offset += BATCH_LIMIT) {
    const batch = writeBatch(_db);
    const chunk = mutations.slice(offset, offset + BATCH_LIMIT);
    chunk.forEach((mutation) => {
      batch.set(mutation.ref, mutation.value, { merge: true });
    });
    await batch.commit();
    console.log(`Gravadas ${Math.min(offset + chunk.length, mutations.length)} de ${mutations.length} operacoes.`);
  }
}

function rankCandidate(item, groupId, leaderCompanyId) {
  let score = 0;
  if (item.active !== false) score += 1000;
  if (item.groupId === groupId) score += 300;
  if (item.companyId === leaderCompanyId) score += 200;
  if (!item.groupId && item.companyId === leaderCompanyId) score += 100;
  return score;
}

function buildCanonicalIndex({
  db,
  collectionName,
  items,
  groupId,
  leaderCompanyId,
  keyFor,
  canonicalPatchFor,
  mutations,
  stats,
}) {
  const groups = new Map();
  items.forEach((item) => {
    const key = keyFor(item);
    if (!key) return;
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  });

  const oldToCanonicalId = new Map();
  const canonicalById = new Map();

  groups.forEach((candidates) => {
    const canonical = [...candidates].sort((first, second) => (
      rankCandidate(second, groupId, leaderCompanyId) - rankCandidate(first, groupId, leaderCompanyId)
      || String(first.createdAt || "").localeCompare(String(second.createdAt || ""))
      || String(first.id).localeCompare(String(second.id))
    ))[0];
    if (!canonical) return;

    const canonicalPatch = {
      ...canonicalPatchFor(canonical),
      companyId: leaderCompanyId,
      groupId,
      active: canonical.active === false ? true : canonical.active,
    };
    pushSet(mutations, doc(db, collectionName, canonical.id), canonicalPatch);
    canonicalById.set(canonical.id, { ...canonical, ...canonicalPatch });

    candidates.forEach((item) => {
      oldToCanonicalId.set(item.id, canonical.id);
      if (item.id === canonical.id || KEEP_DUPLICATES_ACTIVE) return;
      pushSet(mutations, doc(db, collectionName, item.id), {
        groupId,
        active: false,
        updatedAt: new Date().toISOString(),
      });
      stats.duplicates += 1;
    });
  });

  return { oldToCanonicalId, canonicalById };
}

function remapId(map, value) {
  return value ? map.get(value) || value : "";
}

function canonicalName(canonicalById, id, fallback) {
  return id ? String(canonicalById.get(id)?.name || fallback || "") : "";
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const now = new Date().toISOString();

  const [
    companiesSnapshot,
    groupsSnapshot,
    groupCompaniesSnapshot,
    departmentsSnapshot,
    sectorsSnapshot,
    subsectorsSnapshot,
    teamsSnapshot,
    employeesSnapshot,
    draftsSnapshot,
    documentsSnapshot,
    timeRecordsSnapshot,
    employeePointsSnapshot,
  ] = await Promise.all([
    getDocs(collection(db, "companies")),
    getDocs(collection(db, "companyGroups")),
    getDocs(collection(db, "companyGroupCompanies")),
    getDocs(collection(db, "departments")),
    getDocs(collection(db, "sectors")),
    getDocs(collection(db, "subsectors")),
    getDocs(collection(db, "teams")),
    getDocs(collection(db, "employees")),
    getDocs(collection(db, "employeeDrafts")),
    getDocs(collection(db, "employeeDocuments")),
    getDocs(collection(db, "timeRecords")),
    getDocs(collectionGroup(db, "employeePoints")),
  ]);

  const companies = mapCollection(companiesSnapshot);
  const groups = mapCollection(groupsSnapshot);
  const groupCompanies = mapCollection(groupCompaniesSnapshot);
  const departments = mapCollection(departmentsSnapshot);
  const sectors = mapCollection(sectorsSnapshot);
  const subsectors = mapCollection(subsectorsSnapshot);
  const teams = mapCollection(teamsSnapshot);
  const employees = mapCollection(employeesSnapshot);
  const drafts = mapCollection(draftsSnapshot);
  const documents = mapCollection(documentsSnapshot);
  const flatTimeRecords = mapCollection(timeRecordsSnapshot).filter((record) => record.employeeId && record.date);
  const nestedTimeRecords = mapCollection(employeePointsSnapshot);
  const mutations = new Map();
  const stats = {
    groupRelations: 0,
    disabledDefaultGroups: 0,
    duplicates: 0,
    employees: 0,
    drafts: 0,
    documents: 0,
    timeRecords: 0,
  };

  let macroGroup = selectMacroGroup(groups, groupCompanies);
  const macroGroupId = macroGroup?.id || "company-group-macro";
  const leaderCompanyId = leaderCompanyIdForGroup(macroGroup, groupCompanies, companies);
  if (!leaderCompanyId) throw new Error("Nenhuma empresa encontrada para servir como lider da estrutura.");

  macroGroup = {
    id: macroGroupId,
    name: macroGroup?.name || "Grupo Macro",
    active: true,
    divergenceSourceCompanyId: leaderCompanyId,
    divergenceMode: macroGroup?.divergenceMode || "use_reference",
    divergenceTypes: macroGroup?.divergenceTypes || [],
    autoSyncStructure: false,
    createdAt: macroGroup?.createdAt || now,
    updatedAt: now,
  };
  pushSet(mutations, doc(db, "companyGroups", macroGroupId), macroGroup);

  const linkedToMacro = new Set(groupCompanies
    .filter((relation) => relation.groupId === macroGroupId)
    .map((relation) => relation.companyId));
  companies.forEach((company) => {
    if (!company.id || linkedToMacro.has(company.id)) return;
    const relationId = `company-group-company-${safeIdPart(macroGroupId)}-${safeIdPart(company.id)}`;
    pushSet(mutations, doc(db, "companyGroupCompanies", relationId), {
      id: relationId,
      groupId: macroGroupId,
      companyId: company.id,
      createdAt: now,
      updatedAt: now,
    });
    stats.groupRelations += 1;
  });

  const relationCountByGroup = new Map();
  groupCompanies.forEach((relation) => {
    relationCountByGroup.set(relation.groupId, (relationCountByGroup.get(relation.groupId) || 0) + 1);
  });
  groups.forEach((group) => {
    if (group.id === macroGroupId) return;
    const looksDefault = group.autoSyncStructure === true && (relationCountByGroup.get(group.id) || 0) <= 1;
    if (!looksDefault || group.active === false) return;
    pushSet(mutations, doc(db, "companyGroups", group.id), {
      active: false,
      autoSyncStructure: false,
      updatedAt: now,
    });
    stats.disabledDefaultGroups += 1;
  });

  const departmentIndex = buildCanonicalIndex({
    db,
    collectionName: "departments",
    items: departments,
    groupId: macroGroupId,
    leaderCompanyId,
    keyFor: (department) => normalizeText(department.name),
    canonicalPatchFor: () => ({}),
    mutations,
    stats,
  });

  const sectorIndex = buildCanonicalIndex({
    db,
    collectionName: "sectors",
    items: sectors,
    groupId: macroGroupId,
    leaderCompanyId,
    keyFor: (sector) => `${remapId(departmentIndex.oldToCanonicalId, sector.departmentId)}::${normalizeText(sector.name)}`,
    canonicalPatchFor: (sector) => ({
      departmentId: remapId(departmentIndex.oldToCanonicalId, sector.departmentId),
    }),
    mutations,
    stats,
  });

  const subsectorIndex = buildCanonicalIndex({
    db,
    collectionName: "subsectors",
    items: subsectors,
    groupId: macroGroupId,
    leaderCompanyId,
    keyFor: (subsector) => [
      remapId(departmentIndex.oldToCanonicalId, subsector.departmentId),
      remapId(sectorIndex.oldToCanonicalId, subsector.sectorId),
      normalizeText(subsector.name),
    ].join("::"),
    canonicalPatchFor: (subsector) => ({
      departmentId: remapId(departmentIndex.oldToCanonicalId, subsector.departmentId),
      sectorId: remapId(sectorIndex.oldToCanonicalId, subsector.sectorId),
    }),
    mutations,
    stats,
  });

  const teamIndex = buildCanonicalIndex({
    db,
    collectionName: "teams",
    items: teams,
    groupId: macroGroupId,
    leaderCompanyId,
    keyFor: (team) => normalizeText(team.name),
    canonicalPatchFor: () => ({}),
    mutations,
    stats,
  });

  const patchStructure = (source) => {
    const departmentId = remapId(departmentIndex.oldToCanonicalId, source.departmentId);
    const sectorId = remapId(sectorIndex.oldToCanonicalId, source.sectorId);
    const subsectorId = remapId(subsectorIndex.oldToCanonicalId, source.subsectorId);
    const teamId = remapId(teamIndex.oldToCanonicalId, source.teamId || source.realTeamId || source.dayTeamId);
    return { departmentId, sectorId, subsectorId, teamId };
  };

  employees.forEach((employee) => {
    const structure = patchStructure(employee);
    pushSet(mutations, doc(db, "employees", employee.id), {
      groupId: macroGroupId,
      departmentId: structure.departmentId,
      sectorId: structure.sectorId,
      subsectorId: structure.subsectorId,
      teamId: structure.teamId,
      updatedAt: now,
    });
    stats.employees += 1;
  });

  drafts.forEach((draft) => {
    const structure = patchStructure(draft);
    const payload = draft.payload || {};
    pushSet(mutations, doc(db, "employeeDrafts", draft.id), {
      groupId: macroGroupId,
      departmentId: structure.departmentId,
      sectorId: structure.sectorId,
      subsectorId: structure.subsectorId,
      payload: {
        ...payload,
        groupId: macroGroupId,
        departmentId: remapId(departmentIndex.oldToCanonicalId, payload.departmentId || structure.departmentId),
        sectorId: remapId(sectorIndex.oldToCanonicalId, payload.sectorId || structure.sectorId),
        subsectorId: remapId(subsectorIndex.oldToCanonicalId, payload.subsectorId || structure.subsectorId),
        teamId: remapId(teamIndex.oldToCanonicalId, payload.teamId || structure.teamId),
      },
      updatedAt: now,
    });
    stats.drafts += 1;
  });

  documents.forEach((documentData) => {
    const structure = patchStructure(documentData);
    pushSet(mutations, doc(db, "employeeDocuments", documentData.id), {
      groupId: macroGroupId,
      departmentId: structure.departmentId,
      sectorId: structure.sectorId,
      subsectorId: structure.subsectorId,
      updatedAt: now,
    });
    stats.documents += 1;
  });

  [...flatTimeRecords, ...nestedTimeRecords].forEach((record) => {
    const departmentId = remapId(departmentIndex.oldToCanonicalId, record.departmentId);
    const sectorId = remapId(sectorIndex.oldToCanonicalId, record.sectorId);
    const subsectorId = remapId(subsectorIndex.oldToCanonicalId, record.subsectorId);
    const realTeamId = remapId(teamIndex.oldToCanonicalId, record.realTeamId);
    const dayTeamId = remapId(teamIndex.oldToCanonicalId, record.dayTeamId);
    pushSet(mutations, record.ref, {
      groupId: macroGroupId,
      departmentId,
      sectorId,
      subsectorId,
      realTeamId,
      dayTeamId,
      departmentName: canonicalName(departmentIndex.canonicalById, departmentId, record.departmentName),
      sectorName: canonicalName(sectorIndex.canonicalById, sectorId, record.sectorName),
      subsectorName: canonicalName(subsectorIndex.canonicalById, subsectorId, record.subsectorName),
      realTeamName: canonicalName(teamIndex.canonicalById, realTeamId, record.realTeamName),
      dayTeamName: canonicalName(teamIndex.canonicalById, dayTeamId, record.dayTeamName),
      updatedAt: record.updatedAt || now,
    });
    stats.timeRecords += 1;
  });

  await commitMutations(db, mutations);

  console.log("Migracao de estrutura para grupo concluida.");
  console.log(`Projeto: ${firebaseConfig.projectId}`);
  console.log(`Grupo macro: ${macroGroup.name} (${macroGroupId})`);
  console.log(`Empresa lider da estrutura: ${leaderCompanyId}`);
  console.log(`Novos vinculos empresa-grupo: ${stats.groupRelations}`);
  console.log(`Grupos individuais desativados: ${stats.disabledDefaultGroups}`);
  console.log(`Duplicatas de estrutura desativadas: ${stats.duplicates}`);
  console.log(`Funcionarios atualizados: ${stats.employees}`);
  console.log(`Rascunhos atualizados: ${stats.drafts}`);
  console.log(`Documentos atualizados: ${stats.documents}`);
  console.log(`Registros de ponto atualizados: ${stats.timeRecords}`);
  if (KEEP_DUPLICATES_ACTIVE) console.log("Duplicatas foram mantidas ativas por causa de --keep-duplicates-active.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
