import process from "node:process";
import { initializeApp } from "firebase/app";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDxss90AlvYWvhlUPIlWlHjZf01N6qOW1g",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "macro-ambiental.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "macro-ambiental",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "macro-ambiental.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "539160683374",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:539160683374:web:ebbc79e4e1a4d4d944d77f",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-J387E86S8S",
};

const TABLES = ["companies", "departments", "sectors", "employees", "records", "additional_information"];
const LEGACY_ROOT = "Documentação_dp";
const LEGACY_DOCS = ["sistema", "tables"];
const DELETE_LEGACY = process.argv.includes("--delete-legacy");

function clean(value) {
  return JSON.parse(JSON.stringify(value));
}

async function readCollectionRows(db, ...path) {
  const snapshot = await getDocs(collection(db, ...path));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function readLegacyRowsDocument(db, tableName) {
  const snapshot = await getDoc(doc(db, LEGACY_ROOT, tableName));
  if (!snapshot.exists()) return [];

  const data = snapshot.data();
  return Array.isArray(data.rows) ? data.rows : [];
}

function mergeById(...groups) {
  const map = new Map();

  for (const group of groups) {
    for (const item of group) {
      if (!item?.id) continue;
      map.set(item.id, item);
    }
  }

  return Array.from(map.values());
}

function normalizeRow(tableName, row) {
  const now = new Date().toISOString();

  if (tableName === "companies") {
    return {
      ...row,
      name: row.name || row.legalName || "",
      cnpj: row.cnpj || row.document || "",
      location: row.location || "",
      active: row.active ?? true,
      createdAt: row.createdAt || now,
    };
  }

  if (tableName === "departments") {
    return {
      ...row,
      coordinatorName: row.coordinatorName || "",
      description: row.description || "",
      createdAt: row.createdAt || now,
    };
  }

  if (tableName === "sectors") {
    return {
      ...row,
      coordinatorName: row.coordinatorName || row.manager || "",
      leaderName: row.leaderName || "",
      costCenter: row.costCenter || "",
      createdAt: row.createdAt || now,
    };
  }

  if (tableName === "employees") {
    return {
      ...row,
      cpf: row.cpf || "",
      phone: row.phone || row.complement?.phone || "",
      department: row.department || "",
      sector: row.sector || "",
      role: row.role || "",
      costCenter: row.costCenter || "",
      admissionDate: row.admissionDate || now.slice(0, 10),
      status: row.status || "Ativo",
      esocialStatus: row.esocialStatus || "Pendente",
      syncStatus: row.syncStatus || "Incompleto",
      lastSync: row.lastSync || now,
      complement: {
        email: row.complement?.email || "",
        emergencyContact: row.complement?.emergencyContact || "",
        healthPlan: row.complement?.healthPlan || "Pendente",
        mealTicket: row.complement?.mealTicket || false,
        transportVoucher: row.complement?.transportVoucher || false,
      },
    };
  }

  if (tableName === "additional_information") {
    return {
      ...row,
      email: row.email || "",
      emergencyContact: row.emergencyContact || "",
      healthPlan: row.healthPlan || "Pendente",
      mealTicket: row.mealTicket || false,
      transportVoucher: row.transportVoucher || false,
      updatedAt: row.updatedAt || now,
    };
  }

  return row;
}

async function commitInChunks(db, operations, chunkSize = 400) {
  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = writeBatch(db);
    const chunk = operations.slice(index, index + chunkSize);

    for (const operation of chunk) {
      operation(batch);
    }

    await batch.commit();
  }
}

async function deleteCollectionDocs(db, ...path) {
  const snapshot = await getDocs(collection(db, ...path));
  if (snapshot.empty) return 0;

  const operations = snapshot.docs.map((item) => {
    return (batch) => batch.delete(item.ref);
  });

  await commitInChunks(db, operations);
  return snapshot.size;
}

async function writeTopLevelTable(db, tableName, rows) {
  const normalizedRows = rows
    .map((item) => normalizeRow(tableName, item))
    .filter((row) => row?.id);

  if (!normalizedRows.length) {
    console.log(`${tableName}: 0 documentos, nada para migrar`);
    return;
  }

  const operations = normalizedRows.map((row) => {
    return (batch) => {
      batch.set(doc(db, tableName, row.id), clean(row), { merge: true });
    };
  });

  await commitInChunks(db, operations);

  console.log(`${tableName}: ${normalizedRows.length} documentos migrados`);
}

async function removeLegacyStructure(db) {
  let deleted = 0;

  for (const legacyDoc of LEGACY_DOCS) {
    for (const tableName of TABLES) {
      deleted += await deleteCollectionDocs(db, LEGACY_ROOT, legacyDoc, tableName);
    }

    await deleteDoc(doc(db, LEGACY_ROOT, legacyDoc)).catch(() => undefined);
  }

  for (const tableName of TABLES) {
    await deleteDoc(doc(db, LEGACY_ROOT, tableName)).catch(() => undefined);
  }

  console.log(`${LEGACY_ROOT}: estrutura antiga removida (${deleted} documentos legados apagados)`);
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  for (const tableName of TABLES) {
    const currentTopLevel = await readCollectionRows(db, tableName);
    const legacyFromSistema = await readCollectionRows(db, LEGACY_ROOT, "sistema", tableName);
    const legacyFromTables = await readCollectionRows(db, LEGACY_ROOT, "tables", tableName);
    const legacyRowsDocument = await readLegacyRowsDocument(db, tableName);

    console.log(`\nTabela: ${tableName}`);
    console.log(`- Atual: ${currentTopLevel.length}`);
    console.log(`- Legado /sistema/${tableName}: ${legacyFromSistema.length}`);
    console.log(`- Legado /tables/${tableName}: ${legacyFromTables.length}`);
    console.log(`- Legado documento /${tableName}: ${legacyRowsDocument.length}`);

    const rows = mergeById(
      legacyRowsDocument,
      legacyFromTables,
      legacyFromSistema,
      currentTopLevel
    );

    await writeTopLevelTable(db, tableName, rows);
  }

  if (DELETE_LEGACY) {
    await removeLegacyStructure(db);
  } else {
    console.log(`\n${LEGACY_ROOT}: estrutura antiga preservada.`);
    console.log(`Use --delete-legacy somente depois de conferir se a migração ficou correta.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
