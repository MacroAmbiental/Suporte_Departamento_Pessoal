import { useCallback, useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import { SALARY_TABLE_COLLECTION, type SalaryTableRole, type SalaryTableRoleDraft } from "./salaryTableModel";

// Só liga a escuta depois da chave de acesso (enabled), para os valores nem
// chegarem ao navegador de quem não destravou a tela.
export function useSalaryTable(enabled: boolean, userName: string) {
  const [roles, setRoles] = useState<SalaryTableRole[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!enabled || !firestore) return undefined;
    return onSnapshot(
      collection(firestore, SALARY_TABLE_COLLECTION),
      (snapshot) => {
        setRoles(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as SalaryTableRole));
        setReady(true);
        setLoadError(false);
      },
      (error) => {
        console.warn("Não foi possível carregar a tabela salarial.", error);
        setLoadError(true);
      },
    );
  }, [enabled]);

  // Grava o documento inteiro (sem merge) para um nível que deixou de ser fixo sair do banco.
  const toRecord = useCallback((id: string, role: SalaryTableRoleDraft, createdAt: string, now: string): SalaryTableRole => ({
    id,
    category: role.category.trim(),
    name: role.name.trim(),
    levelLabels: role.levelLabels,
    baseSalary: role.baseSalary,
    percent: role.percent,
    fixedLevels: role.fixedLevels || {},
    active: role.active,
    order: role.order,
    source: role.source || "",
    createdAt,
    updatedAt: now,
    updatedBy: userName,
  }), [userName]);

  const saveRole = useCallback(async (id: string, role: SalaryTableRoleDraft, createdAt?: string) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    const now = new Date().toISOString();
    await setDoc(doc(firestore, SALARY_TABLE_COLLECTION, id), toRecord(id, role, createdAt || now, now));
  }, [toRecord]);

  const importRoles = useCallback(async (items: { id: string; role: SalaryTableRoleDraft; createdAt?: string }[]) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    const now = new Date().toISOString();
    const batch = writeBatch(firestore);
    items.forEach(({ id, role, createdAt }) => batch.set(doc(firestore!, SALARY_TABLE_COLLECTION, id), toRecord(id, role, createdAt || now, now)));
    await batch.commit();
  }, [toRecord]);

  return { roles, ready, loadError, saveRole, importRoles };
}
