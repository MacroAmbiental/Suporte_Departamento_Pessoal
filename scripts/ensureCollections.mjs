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

const collections = [
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
  "employees",
  "systemUsers",
  "systemPermissions",
  "permissionProfiles",
  "accessKeys",
  "employeeDocuments",
  "employeeDocumentFiles",
  "employeeDocumentFileChunks",
  "documentAlerts",
  "benefitContracts",
  "benefitPlans",
  "benefitFolders",
  "benefitCustomFields",
  "employeeBenefits",
  "employeePromotions",
  "employeeDrafts",
  "appDrafts",
  "timeRecords",
  "timekeepingColumns",
  "talentCandidates",
  "talentColumnOptions",
  "customModules",
];

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  for (const collectionName of collections) {
    batch.set(doc(db, collectionName, "__schema"), {
      id: "__schema",
      __systemMeta: true,
      collectionName,
      description: "Documento técnico para inicializar a coleção no Firestore. O app ignora este documento.",
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  await batch.commit();
  console.log("Coleções técnicas inicializadas no Firestore.");
  console.log(`Projeto: ${firebaseConfig.projectId}`);
  console.log(`Total: ${collections.length} coleções`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
