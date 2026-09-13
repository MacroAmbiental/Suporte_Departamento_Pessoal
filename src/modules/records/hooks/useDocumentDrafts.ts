import { useCallback, useState } from "react";
import type { DocumentDraft } from "@/modules/records/types";
import { documentDraftPatchFromFile, newDocumentDraft } from "@/modules/records/utils/recordsDocuments";

type UseDocumentDraftsParams = {
  createAlerts: boolean;
};

export function useDocumentDrafts({ createAlerts }: UseDocumentDraftsParams) {
  const createDraft = useCallback(() => newDocumentDraft({ createAlert: createAlerts }), [createAlerts]);
  const [documents, setDocuments] = useState<DocumentDraft[]>(() => [createDraft()]);

  const resetDocuments = useCallback(() => {
    setDocuments([createDraft()]);
  }, [createDraft]);

  const updateDocument = useCallback((id: string, patch: Partial<DocumentDraft>) => {
    setDocuments((current) => current.map((document) => (document.id === id ? { ...document, ...patch } : document)));
  }, []);

  const addDocument = useCallback(() => {
    setDocuments((current) => [...current, createDraft()]);
  }, [createDraft]);

  const handleFile = useCallback((id: string, file?: File) => {
    if (!file) return;
    updateDocument(id, documentDraftPatchFromFile(file));
  }, [updateDocument]);

  return {
    documents,
    setDocuments,
    resetDocuments,
    updateDocument,
    addDocument,
    handleFile,
  };
}
