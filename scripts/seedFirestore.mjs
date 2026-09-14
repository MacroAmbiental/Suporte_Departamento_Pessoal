import process from "node:process";
import { initializeApp } from "firebase/app";
import { doc, getFirestore, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDxss90AlvYWvhlUPIlWlHjZf01N6qOW1g",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "macro-ambiental.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "macro-ambiental",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "macro-ambiental.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "539160683374",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:539160683374:web:ebbc79e4e1a4d4d944d77f",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-J387E86S8S",
};

const seedData = {
  companies: [],
  departments: [],
  sectors: [],
  employees: [],
  records: [],
  additional_information: [],
};

function clean(value) {
  return JSON.parse(JSON.stringify(value));
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

async function seedTable(db, tableName, rows) {
  const normalizedRows = rows
    .map((row) => normalizeRow(tableName, row))
    .filter((row) => row?.id);

  if (!normalizedRows.length) {
    console.log(`${tableName}: 0 documentos`);
    return;
  }

  const operations = normalizedRows.map((row) => {
    return (batch) => {
      batch.set(doc(db, tableName, row.id), clean(row), { merge: true });
    };
  });

  await commitInChunks(db, operations);

  console.log(`${tableName}: ${normalizedRows.length} documentos`);
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("Projeto Firebase:", firebaseConfig.projectId);

  for (const [tableName, rows] of Object.entries(seedData)) {
    await seedTable(db, tableName, rows);
  }

  console.log("\nSeed concluído nas coleções principais.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});