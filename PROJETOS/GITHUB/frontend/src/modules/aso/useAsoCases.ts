import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where, writeBatch } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import { uploadEmployeeDocumentFile } from "@/services/documentStorage";
import {
  ASO_CASES_COLLECTION,
  ASO_EVENTS_SUBCOLLECTION,
  ASO_MAX_FILE_BYTES,
  type AsoCase,
  type AsoChannel,
  type AsoEvent,
  type AsoGuideRecipient,
  type AsoPerson,
  type AsoStage,
} from "@/modules/aso/asoModel";

type CurrentUser = { id?: string; name?: string; username?: string } | null | undefined;

export type AsoCaseSeed = Pick<AsoCase, "employeeId" | "employeeName" | "companyId" | "companyName" | "documentId" | "dueDate">;

// Casos de ASO em andamento (os encerrados ficam no banco como histórico) e as
// ações de cada etapa. Toda mudança de etapa grava o caso e o evento juntos.
export function useAsoCases(user: CurrentUser) {
  const [cases, setCases] = useState<AsoCase[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [recentlyClosed, setRecentlyClosed] = useState<AsoCase[]>([]);
  const person = useMemo<AsoPerson>(() => ({ id: user?.id || "", name: user?.name || user?.username || "" }), [user]);

  useEffect(() => {
    if (!firestore) return undefined;
    return onSnapshot(
      query(collection(firestore, ASO_CASES_COLLECTION), where("status", "==", "open")),
      (snapshot) => {
        setCases(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as AsoCase));
        setReady(true);
        setLoadError(false);
      },
      (error) => {
        console.warn("Não foi possível carregar os processos de ASO.", error);
        setLoadError(true);
      },
    );
  }, []);

  // Encerrados nos últimos 30 dias, para a coluna "Enviado à SERTRAS". Só o
  // filtro de data na consulta (sem índice composto); o status é conferido aqui.
  useEffect(() => {
    if (!firestore) return undefined;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    return onSnapshot(
      query(collection(firestore, ASO_CASES_COLLECTION), where("closedAt", ">=", since)),
      (snapshot) => setRecentlyClosed(snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }) as AsoCase)
        .filter((item) => item.status === "closed")),
      (error) => console.warn("Não foi possível carregar os processos de ASO encerrados.", error),
    );
  }, []);

  const moveStage = useCallback(async (caseId: string, stageFrom: AsoStage, patch: Partial<AsoCase> & { stage: AsoStage }, notes: string, seed?: AsoCaseSeed) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    const now = new Date().toISOString();
    const batch = writeBatch(firestore);
    const caseRef = doc(firestore, ASO_CASES_COLLECTION, caseId);
    if (seed) {
      batch.set(caseRef, { ...seed, status: "open", openedAt: now, openedBy: person, ...patch, stageChangedAt: now, updatedAt: now });
    } else {
      batch.update(caseRef, { ...patch, stageChangedAt: now, updatedAt: now });
    }
    batch.set(doc(collection(firestore, ASO_CASES_COLLECTION, caseId, ASO_EVENTS_SUBCOLLECTION)), {
      stageFrom, stageTo: patch.stage, notes, createdAt: now, createdBy: person,
    });
    await batch.commit();
  }, [person]);

  // Etapa 1 → 2: o caso nasce aqui, com a guia anexada.
  const saveGuide = useCallback(async (seed: AsoCaseSeed, file: File) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    if (file.size > ASO_MAX_FILE_BYTES) throw new Error("A guia passa de 10 MB. Envie um arquivo menor.");
    const guideFileUrl = await uploadEmployeeDocumentFile(seed.employeeId, file);
    const caseId = doc(collection(firestore, ASO_CASES_COLLECTION)).id;
    await moveStage(caseId, "notified", { stage: "guide_issued", guideFileUrl, guideFileName: file.name }, `Guia anexada: ${file.name}`, seed);
  }, [moveStage]);

  const markGuideSent = useCallback((item: AsoCase, to: AsoGuideRecipient, channel: AsoChannel, notes: string) => (
    moveStage(item.id, item.stage, { stage: "guide_sent", guideSentTo: to, guideSentChannel: channel }, notes)
  ), [moveStage]);

  const markExamDone = useCallback((item: AsoCase, examDate: string, notes: string) => (
    moveStage(item.id, item.stage, { stage: "exam_done", examDate }, notes)
  ), [moveStage]);

  const markAsoReceived = useCallback((item: AsoCase, newDueDate: string, newAsoFileName: string, notes: string) => (
    moveStage(item.id, item.stage, { stage: "aso_received", newDueDate, newAsoFileName }, notes)
  ), [moveStage]);

  // Etapa final: enviado ao portal da SERTRAS, o caso fecha.
  const markSentToSertras = useCallback((item: AsoCase, sentDate: string, notes: string) => (
    moveStage(item.id, item.stage, {
      stage: "closed", status: "closed", sertrasSentAt: sentDate, closedAt: new Date().toISOString(), closedBy: person,
    }, notes)
  ), [moveStage, person]);

  return { cases, recentlyClosed, ready, loadError, saveGuide, markGuideSent, markExamDone, markAsoReceived, markSentToSertras };
}

export function useAsoEvents(caseId: string | null) {
  const [events, setEvents] = useState<AsoEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    if (!firestore || !caseId) return undefined;
    return onSnapshot(
      query(collection(firestore, ASO_CASES_COLLECTION, caseId, ASO_EVENTS_SUBCOLLECTION), orderBy("createdAt", "asc")),
      (snapshot) => setEvents(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as AsoEvent)),
      (error) => console.warn("Não foi possível carregar o histórico do ASO.", error),
    );
  }, [caseId]);

  return events;
}
