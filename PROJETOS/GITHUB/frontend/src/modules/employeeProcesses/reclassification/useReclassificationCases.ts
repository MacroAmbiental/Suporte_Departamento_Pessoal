import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, writeBatch } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import { uploadEmployeeDocumentFile } from "@/services/documentStorage";
import {
  RECLASSIFICATION_COLLECTION,
  RECLASSIFICATION_EVENTS,
  RECLASSIFICATION_MAX_FILE_BYTES,
  type ReclassificationCase,
  type ReclassificationEvent,
  type ReclassificationPerson,
  type ReclassificationSeed,
  type ReclassificationStage,
} from "./reclassificationModel";

type CurrentUser = { id?: string; name?: string; username?: string } | null | undefined;

// Casos de reclassificação e as ações de cada etapa. Toda mudança grava o caso e
// o evento do histórico juntos.
export function useReclassificationCases(user: CurrentUser) {
  const [cases, setCases] = useState<ReclassificationCase[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const person = useMemo<ReclassificationPerson>(() => ({ id: user?.id || "", name: user?.name || user?.username || "" }), [user]);

  useEffect(() => {
    if (!firestore) return undefined;
    return onSnapshot(
      collection(firestore, RECLASSIFICATION_COLLECTION),
      (snapshot) => {
        setCases(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as ReclassificationCase));
        setReady(true);
        setLoadError(false);
      },
      (error) => {
        console.warn("Não foi possível carregar as reclassificações.", error);
        setLoadError(true);
      },
    );
  }, []);

  const move = useCallback(async (
    caseId: string,
    stageFrom: ReclassificationStage | "",
    patch: Partial<ReclassificationCase> & { stage: ReclassificationStage },
    notes: string,
    seed?: ReclassificationSeed,
  ) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    const now = new Date().toISOString();
    const batch = writeBatch(firestore);
    const ref = doc(firestore, RECLASSIFICATION_COLLECTION, caseId);
    if (seed) batch.set(ref, { ...seed, status: "open", openedAt: now, openedBy: person, ...patch, updatedAt: now });
    else batch.update(ref, { ...patch, updatedAt: now });
    batch.set(doc(collection(firestore, RECLASSIFICATION_COLLECTION, caseId, RECLASSIFICATION_EVENTS)), {
      stageFrom, stageTo: patch.stage, notes, createdAt: now, createdBy: person,
    });
    await batch.commit();
  }, [person]);

  const create = useCallback(async (seed: ReclassificationSeed) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    const id = doc(collection(firestore, RECLASSIFICATION_COLLECTION)).id;
    await move(id, "", { stage: "requested" }, `Pedido registrado (${seed.reason}${seed.requestedBy ? `, pedido por ${seed.requestedBy}` : ""}).`, seed);
  }, [move]);

  const approve = useCallback((item: ReclassificationCase, approvedBy: string, approvedAt: string) => (
    move(item.id, item.stage, { stage: "approved", approvedBy, approvedAt }, `Aprovado por ${approvedBy}.`)
  ), [move]);

  const reject = useCallback((item: ReclassificationCase, reason: string) => (
    move(item.id, item.stage, { stage: "rejected", status: "closed", rejectedReason: reason, closedAt: new Date().toISOString() }, `Recusado: ${reason}`)
  ), [move]);

  const attachTerm = useCallback(async (item: ReclassificationCase, file: File) => {
    if (file.size > RECLASSIFICATION_MAX_FILE_BYTES) throw new Error("O termo passa de 10 MB. Envie um arquivo menor.");
    const termFileUrl = await uploadEmployeeDocumentFile(item.employeeId, file);
    await move(item.id, item.stage, { stage: "signed", termFileUrl, termFileName: file.name }, `Termo assinado anexado: ${file.name}`);
  }, [move]);

  const markEffective = useCallback((item: ReclassificationCase) => (
    move(item.id, item.stage, { stage: "effective", effectiveAt: new Date().toISOString() }, "Cadastro atualizado com a nova função/cargo/salário.")
  ), [move]);

  const markPayroll = useCallback((item: ReclassificationCase, date: string) => (
    move(item.id, item.stage, { stage: "closed", status: "closed", payrollRegisteredAt: date, closedAt: new Date().toISOString() }, `Lançado na folha/eSocial em ${date.split("-").reverse().join("/")}.`)
  ), [move]);

  return { cases, ready, loadError, create, approve, reject, attachTerm, markEffective, markPayroll };
}

export function useReclassificationEvents(caseId: string | null) {
  const [events, setEvents] = useState<ReclassificationEvent[]>([]);
  useEffect(() => {
    setEvents([]);
    if (!firestore || !caseId) return undefined;
    return onSnapshot(
      query(collection(firestore, RECLASSIFICATION_COLLECTION, caseId, RECLASSIFICATION_EVENTS), orderBy("createdAt", "asc")),
      (snapshot) => setEvents(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as ReclassificationEvent)),
      (error) => console.warn("Não foi possível carregar o histórico da reclassificação.", error),
    );
  }, [caseId]);
  return events;
}
