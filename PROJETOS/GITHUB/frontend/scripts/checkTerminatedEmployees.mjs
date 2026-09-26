import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDTCJU1-8iYy3iE8V7x5rXA0f5TxCPkBow",
  authDomain: "macro-ambiental.firebaseapp.com",
  projectId: "macro-ambiental",
  storageBucket: "macro-ambiental.appspot.com",
  messagingSenderId: "440703223319",
  appId: "1:440703223319:web:b62e7b3e3caf26cdcceb76"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkEmployees() {
  console.log("🔍 Verificando funcionários com status 'terminated' na coleção 'employees'...");
  
  const q = query(collection(db, "employees"), where("status", "==", "terminated"));
  const snapshot = await getDocs(q);
  
  console.log(`\n📊 Encontrados ${snapshot.docs.length} funcionários com status 'terminated' na coleção 'employees'`);
  
  if (snapshot.docs.length > 0) {
    console.log("\n👥 Primeiros 10:");
    snapshot.docs.slice(0, 10).forEach((doc) => {
      const employee = doc.data();
      console.log(`  - ${employee.name} (ID: ${doc.id})`);
    });
  }
  
  // Also check dismissedEmployees collection
  const dismissedSnapshot = await getDocs(collection(db, "dismissedEmployees"));
  console.log(`\n📊 Total na coleção 'dismissedEmployees': ${dismissedSnapshot.docs.length}`);
  
  console.log("\n✨ Verificação concluída!");
}

checkEmployees().catch(console.error);
