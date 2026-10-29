import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, updateDoc, writeBatch } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import {
  CLASSIFICATION_COLLECTION,
  CLASSIFICATION_EVENTS,
  type ClassificationCase,
  type ClassificationEvent,
  type ClassificationPerson,
  type ClassificationStage,
} from "./classificationModel";

type CurrentUser = { id?: string; name?: string; username?: string } | null | undefined;

// Casos do kanban de Classificação. "save" grava os dados da etapa sem mudar de
// coluna; "advance" muda de coluna e registra o evento no histórico.
export function useClassificationCases(user: CurrentUser) {
  const [cases, setCases] = useState<ClassificationCase[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const person = useMemo<ClassificationPerson>(() => ({ id: user?.id || "", name: user?.name || user?.username || "" }), [user]);

  useEffect(() => {
    if (!firestore) return undefined;
    return onSnapshot(
      collection(firestore, CLASSIFICATION_COLLECTION),
      (snapshot) => {
        setCases(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as ClassificationCase));
        setReady(true);
        setLoadError(false);
      },
      (error) => {
        console.warn("Não foi possível carregar o processo de classificação.", error);
        setLoadError(true);
      },
    );
  }, []);

  const save = useCallback(async (item: ClassificationCase, patch: Partial<ClassificationCase>) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    await updateDoc(doc(firestore, CLASSIFICATION_COLLECTION, item.id), { ...patch, updatedAt: new Date().toISOString() });
  }, []);

  const advance = useCallback(async (item: ClassificationCase, stageTo: ClassificationStage, notes: string, patch: Partial<ClassificationCase> = {}) => {
    if (!firestore) throw new Error("Banco de dados não configurado.");
    const now = new Date().toISOString();
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, CLASSIFICATION_COLLECTION, item.id), {
      ...patch,
      stage: stageTo,
      ...(stageTo === "closed" ? { status: "closed", closedAt: now } : {}),
      updatedAt: now,
    });
    batch.set(doc(collection(firestore, CLASSIFICATION_COLLECTION, item.id, CLASSIFICATION_EVENTS)), {
      stageFrom: item.stage, stageTo, notes, createdAt: now, createdBy: person,
    });
    await batch.commit();
  }, [person]);

  return { cases, ready, loadError, save, advance };
}

export function useClassificationEvents(caseId: string | null) {
  const [events, setEvents] = useState<ClassificationEvent[]>([]);
  useEffect(() => {
    setEvents([]);
    if (!firestore || !caseId) return undefined;
    return onSnapshot(
      query(collection(firestore, CLASSIFICATION_COLLECTION, caseId, CLASSIFICATION_EVENTS), orderBy("createdAt", "asc")),
      (snapshot) => setEvents(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as ClassificationEvent)),
      (error) => console.warn("Não foi possível carregar o histórico da classificação.", error),
    );
  }, [caseId]);
  return events;
}
