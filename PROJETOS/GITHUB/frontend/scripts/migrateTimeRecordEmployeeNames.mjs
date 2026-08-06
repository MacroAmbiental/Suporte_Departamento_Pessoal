import process from "node:process";
import { initializeApp } from "firebase/app";
import { collection, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDxss90AlvYWvhlUPIlWlHjZf01N6qOW1g",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "macro-ambiental.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "macro-ambiental",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "macro-ambiental.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "539160683374",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:539160683374:web:ebbc79e4e1a4d4d944d77f",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-J387E86S8S",
};

const BATCH_LIMIT = 400;

async function commitUpdates(db, updates) {
  for (let start = 0; start < updates.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = updates.slice(start, start + BATCH_LIMIT);
    chunk.forEach(({ id, ...fields }) => {
      batch.set(doc(db, "timeRecords", id), fields, { merge: true });
    });
    await batch.commit();
    console.log(`Atualizados ${Math.min(start + chunk.length, updates.length)} de ${updates.length} registros.`);
  }
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const [employeesSnapshot, teamsSnapshot, timeRecordsSnapshot] = await Promise.all([
    getDocs(collection(db, "employees")),
    getDocs(collection(db, "teams")),
    getDocs(collection(db, "timeRecords")),
  ]);

  const employeeById = new Map(
    employeesSnapshot.docs
      .filter((item) => item.id !== "__schema")
      .map((item) => [item.id, String(item.data().name || "").trim()]),
  );

  const teamById = new Map(
    teamsSnapshot.docs
      .filter((item) => item.id !== "__schema")
      .map((item) => [item.id, String(item.data().name || "").trim()]),
  );

  const updates = [];
  let alreadyFilled = 0;
  let missingEmployee = 0;
  let missingTeam = 0;

  for (const recordDocument of timeRecordsSnapshot.docs) {
    if (recordDocument.id === "__schema") continue;
    const record = recordDocument.data();
    const employeeName = String(record.employeeName || "").trim()
      || employeeById.get(record.employeeId)
      || "";
    const realTeamId = String(record.realTeamId || "").trim();
    const dayTeamId = String(record.dayTeamId || realTeamId || "").trim();
    const realTeamName = String(record.realTeamName || "").trim()
      || teamById.get(realTeamId)
      || "";
    const dayTeamName = String(record.dayTeamName || "").trim()
      || teamById.get(dayTeamId)
      || "";

    if (!employeeName) missingEmployee += 1;
    if ((realTeamId && !realTeamName) || (dayTeamId && !dayTeamName)) missingTeam += 1;

    const fields = {};
    if (!String(record.employeeName || "").trim() && employeeName) fields.employeeName = employeeName;
    if (!String(record.realTeamName || "").trim() && realTeamName) fields.realTeamName = realTeamName;
    if (!String(record.dayTeamName || "").trim() && dayTeamName) fields.dayTeamName = dayTeamName;

    if (Object.keys(fields).length === 0) {
      alreadyFilled += 1;
      continue;
    }

    updates.push({ id: recordDocument.id, ...fields });
  }

  await commitUpdates(db, updates);
  console.log("Migração concluída.");
  console.log(`Registros atualizados: ${updates.length}`);
  console.log(`Já preenchidos: ${alreadyFilled}`);
  console.log(`Funcionário não encontrado: ${missingEmployee}`);
  console.log(`Equipe não encontrada: ${missingTeam}`);
}

main().catch((error) => {
  console.error("Falha ao migrar employeeName, realTeamName e dayTeamName nos registros de ponto.", error);
  process.exitCode = 1;
});
