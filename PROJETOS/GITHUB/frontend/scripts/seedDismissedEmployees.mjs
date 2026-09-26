import process from "node:process";
import { initializeApp } from "firebase/app";
import { collection, getFirestore, writeBatch, getDocs, doc, updateDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDxss90AlvYWvhlUPIlWlHjZf01N6qOW1g",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "macro-ambiental.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "macro-ambiental",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "macro-ambiental.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "539160683374",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:539160683374:web:ebbc79e4e1a4d4d944d77f",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-J387E86S8S",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedDismissedEmployees() {
  console.log("🔄 Iniciando seed de funcionários desligados...\n");

  try {
    // 1. Buscar primeiros funcionários ativos
    const employeesRef = collection(db, "employees");
    const snapshot = await getDocs(employeesRef);
    
    const employees = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((e) => e.status !== "terminated");
    
    if (employees.length === 0) {
      console.log("❌ Nenhum funcionário encontrado para desligar.");
      process.exit(1);
    }

    const employeesToDismiss = employees.slice(0, Math.min(3, employees.length));
    console.log(`📋 Encontrados ${employees.length} funcionários ativos.`);
    console.log(`🎯 Selecionados ${employeesToDismiss.length} para desligamento.\n`);

    const now = new Date().toISOString();
    const dismissalDates = {
      0: "2026-08-15",
      1: "2026-07-20", 
      2: "2026-09-01",
    };

    for (let i = 0; i < employeesToDismiss.length; i++) {
      const employee = employeesToDismiss[i];
      const dismissedDate = dismissalDates[i] || new Date().toISOString().split("T")[0];

      try {
        // 1. Atualizar employee (marcar como terminated)
        const employeeDocRef = doc(db, "employees", employee.id);
        await updateDoc(employeeDocRef, {
          status: "terminated",
          registrationData: {
            ...(employee.registrationData || {}),
            dismissalApprovedAt: dismissedDate,
            deactivationEffectiveDate: dismissedDate,
            deactivationCompletedDate: now,
          },
          updatedAt: now,
        });

        // 2. Inserir em dismissedEmployees
        const dismissedDocRef = doc(db, "dismissedEmployees", employee.id);
        await setDoc(dismissedDocRef, {
          ...employee,
          status: "terminated",
          registrationData: {
            ...(employee.registrationData || {}),
            dismissalApprovedAt: dismissedDate,
            deactivationEffectiveDate: dismissedDate,
            deactivationCompletedDate: now,
          },
          updatedAt: now,
        });

        console.log(`✅ Desligado: ${employee.name}`);
        console.log(`   └─ ID: ${employee.id}`);
        console.log(`   └─ Data: ${dismissedDate}\n`);
      } catch (error) {
        console.error(`❌ Erro ao desligar ${employee.name}:`, error.message);
      }
    }

    console.log(`✨ Seed concluída!\n`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro durante seed:", error);
    process.exit(1);
  }
}

seedDismissedEmployees();
