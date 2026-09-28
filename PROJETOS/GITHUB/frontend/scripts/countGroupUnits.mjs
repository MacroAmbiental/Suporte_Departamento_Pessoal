import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore, query, where } from "firebase/firestore";

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  const groupId = process.argv[2] || "cac49786-1f0f-4876-9b5c-68c1020710a2"; // macro group

  const unitsSnap = await getDocs(query(collection(db, "companyGroupUnits"), where("groupId", "==", groupId)));
  const linksSnap = await getDocs(query(collection(db, "companyGroupUnitLinks"), where("groupId", "==", groupId)));

  console.log(`companyGroupUnits: ${unitsSnap.size}`);
  console.log(`companyGroupUnitLinks: ${linksSnap.size}`);

  const units = unitsSnap.docs.slice(0, 10).map((d) => ({ id: d.id, ...d.data() }));
  const links = linksSnap.docs.slice(0, 10).map((d) => ({ id: d.id, ...d.data() }));

  console.log("\nExemplos de units (até 10):");
  console.log(JSON.stringify(units, null, 2));

  console.log("\nExemplos de links (até 10):");
  console.log(JSON.stringify(links, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
