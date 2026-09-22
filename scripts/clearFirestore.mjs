import process from "node:process";
import { initializeApp } from "firebase/app";
import { collection, deleteDoc, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDxss90AlvYWvhlUPIlWlHjZf01N6qOW1g",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "macro-ambiental.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "macro-ambiental",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "macro-ambiental.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "539160683374",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:539160683374:web:ebbc79e4e1a4d4d944d77f",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-J387E86S8S",
};

const collectionNames = [
  "systemUsers",
  "systemPermissions",
  "permissionProfiles",
  "companies",
  "departments",
  "sectors",
  "subsectors",
  "teams",
  "organizational_nodes",
  "employee_assignments",
  "companyGroups",
  "companyGroupCompanies",
  "companyGroupUnits",
  "companyGroupUnitLinks",
  "companyGroupEmployeeAssignments",
  "companyGroupLeadershipAssignments",
  "customModules",
  "benefitContracts",
  "benefitPlans",
  "benefitFolders",
  "benefitCustomFields",
  "employeeBenefits",
  "employees",
  "employeePromotions",
  "employeeDrafts",
  "employeeDocuments",
  "documentAlerts",
  "timeRecords",
  "talentCandidates",
  "talentColumnOptions",
  "records",
  "additional_information",
];

async function deleteCollection(db, name) {
  const snapshot = await getDocs(collection(db, name));
  if (snapshot.empty) {
    console.log(`${name}: 0 documentos`);
    return 0;
  }

  let count = 0;
  const docs = snapshot.docs;
  for (let index = 0; index < docs.length; index += 400) {
    const batch = writeBatch(db);
    docs.slice(index, index + 400).forEach((entry) => {
      batch.delete(doc(db, name, entry.id));
    });
    await batch.commit();
    count += Math.min(400, docs.length - index);
  }

  console.log(`${name}: ${count} documento(s) apagado(s)`);
  return count;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  console.log("Limpando projeto Firebase:", firebaseConfig.projectId);

  let total = 0;
  for (const name of collectionNames) {
    total += await deleteCollection(db, name);
  }

  console.log(`Limpeza concluída. Total apagado: ${total}`);
}

main().catch((error) => {
  console.error("Falha ao limpar Firestore:", error);
  process.exitCode = 1;
});
