import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, updateDoc, where, writeBatch } from "firebase/firestore";
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
  type AsoManualReason,
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

  // Etapa 1 → 2: o caso automático nasce aqui, com a guia anexada; o manual já
  // existe (foi gravado ao adicionar) e só avança.
  const saveGuide = useCallback(async (seed: AsoCaseSeed, file: File, existing?: AsoCase) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    if (file.size > ASO_MAX_FILE_BYTES) throw new Error("A guia passa de 10 MB. Envie um arquivo menor.");
    const guideFileUrl = await uploadEmployeeDocumentFile(seed.employeeId, file);
    const patch = { stage: "guide_issued" as const, guideFileUrl, guideFileName: file.name };
    if (existing) {
      await moveStage(existing.id, existing.stage, patch, `Guia anexada: ${file.name}`);
      return;
    }
    const caseId = doc(collection(firestore, ASO_CASES_COLLECTION)).id;
    await moveStage(caseId, "notified", patch, `Guia anexada: ${file.name}`, seed);
  }, [moveStage]);

  // Caso manual: entra em "Avisado" já gravado, com o motivo.
  const addManualCase = useCallback(async (seed: AsoCaseSeed, reason: AsoManualReason, reasonLabel: string, notes: string) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    const caseId = doc(collection(firestore, ASO_CASES_COLLECTION)).id;
    const manualNotes = notes.trim();
    await moveStage(caseId, "notified", { stage: "notified", origin: "manual", manualReason: reason, manualNotes },
      `Adicionado manualmente: ${reasonLabel}.${manualNotes ? ` ${manualNotes}` : ""}`, seed);
  }, [moveStage]);

  // Caso manual adicionado por engano: sai do quadro (fica no banco como cancelado).
  const cancelManualCase = useCallback((item: AsoCase, notes: string) => (
    moveStage(item.id, item.stage, {
      stage: item.stage, status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: person,
    }, notes)
  ), [moveStage, person]);

  const markGuideSent = useCallback((item: AsoCase, to: AsoGuideRecipient, channel: AsoChannel, sentDate: string, notes: string) => (
    moveStage(item.id, item.stage, { stage: "guide_sent", guideSentTo: to, guideSentChannel: channel, guideSentAt: sentDate }, notes)
  ), [moveStage]);

  // 2ª guia: prazo de 4 dias depois da 1ª.
  const markSecondGuideSent = useCallback((item: AsoCase, to: AsoGuideRecipient, channel: AsoChannel, sentDate: string, notes: string) => (
    moveStage(item.id, item.stage, {
      stage: "guide_resent", secondGuideSentTo: to, secondGuideSentChannel: channel, secondGuideSentAt: sentDate,
    }, notes)
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

  // Caso manual sem ASO em Registros: guarda o documento criado ao receber o ASO novo.
  const linkCaseDocument = useCallback(async (item: AsoCase, documentId: string) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    await updateDoc(doc(firestore, ASO_CASES_COLLECTION, item.id), { documentId, updatedAt: new Date().toISOString() });
  }, []);

  return { cases, recentlyClosed, ready, loadError, saveGuide, addManualCase, cancelManualCase, linkCaseDocument, markGuideSent, markSecondGuideSent, markExamDone, markAsoReceived, markSentToSertras };
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
