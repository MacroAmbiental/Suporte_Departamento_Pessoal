import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  writeBatch,
} from "firebase/firestore";

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import { firestore, storage } from "@/services/firebase";

const FIRESTORE_FILE_PREFIX = "firestore-file://";
const FILE_COLLECTION = "employeeDocumentFiles";
const CHUNK_COLLECTION = "employeeDocumentFileChunks";
const CHUNK_SIZE = 350_000;

const FIRESTORE_FILE_STORAGE_ENABLED =
  import.meta.env.VITE_ALLOW_FIRESTORE_FILE_STORAGE !== "false";

const MAX_FIRESTORE_FILE_BYTES = Number(
  import.meta.env.VITE_FIRESTORE_FILE_MAX_BYTES || 1_000_000
);

type StoredFileManifest = {
  id: string;
  employeeId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  storageProvider: "firestore";
  createdAt: string;
  updatedAt: string;
};

/**
 * Gera um ID único para arquivos armazenados no Firestore.
 */
function createId(prefix: string) {
  const cryptoId = globalThis.crypto?.randomUUID?.();

  return cryptoId
    ? `${prefix}-${cryptoId}`
    : `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
}

/**
 * Remove caracteres inválidos do nome do arquivo.
 */
function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Formata bytes para MB.
 */
function formatMegabytes(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * Validação para o armazenamento legado em Firestore.
 */
function assertFirestoreFileStorageAllowed(file: File) {
  if (!FIRESTORE_FILE_STORAGE_ENABLED) {
    throw new Error(
      "Armazenamento de arquivos no Firestore desativado."
    );
  }

  if (file.size > MAX_FIRESTORE_FILE_BYTES) {
    throw new Error(
      `Arquivo muito grande para o modo temporário sem Storage. Limite atual: ${formatMegabytes(
        MAX_FIRESTORE_FILE_BYTES
      )}.`
    );
  }
}

/**
 * Converte File em Base64.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));

    reader.onerror = () =>
      reject(
        reader.error ||
        new Error("Não foi possível ler o arquivo.")
      );

    reader.readAsDataURL(file);
  });
}

/**
 * Converte Base64 para Blob.
 */
function dataUrlToBlob(dataUrl: string) {
  const [header, content] = dataUrl.split(",");

  const mime =
    header.match(/data:(.*?);base64/)?.[1] ||
    "application/octet-stream";

  const binary = atob(content || "");

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], {
    type: mime,
  });
}

/**
 * Identifica se a URL pertence ao armazenamento legado.
 */
export function isFirestoreDocumentFileUrl(fileUrl: string) {
  return fileUrl.startsWith(FIRESTORE_FILE_PREFIX);
}

/**
 * Salva arquivo no Firestore (LEGADO).
 * Mantido apenas para compatibilidade e fallback.
 */
async function saveFileToFirestore(
  employeeId: string,
  file: File
) {
  const db = firestore;

  if (!db) {
    throw new Error(
      "O Firebase/Firestore não está configurado para salvar documentos."
    );
  }

  assertFirestoreFileStorageAllowed(file);

  const dataUrl = await fileToBase64(file);

  const fileId = createId("employee-document-file");

  const now = new Date().toISOString();

  const chunkCount = Math.ceil(
    dataUrl.length / CHUNK_SIZE
  );

  const batchSize = 400;

  for (
    let offset = 0;
    offset < chunkCount;
    offset += batchSize
  ) {
    const batch = writeBatch(db);

    const end = Math.min(
      chunkCount,
      offset + batchSize
    );

    for (let index = offset; index < end; index++) {
      const chunkId = `${fileId}-${index}`;

      const chunk = dataUrl.slice(
        index * CHUNK_SIZE,
        (index + 1) * CHUNK_SIZE
      );

      batch.set(
        doc(db, CHUNK_COLLECTION, chunkId),
        {
          id: chunkId,
          fileId,
          index,
          content: chunk,
        }
      );
    }

    await batch.commit();
  }

  const manifest: StoredFileManifest = {
    id: fileId,
    employeeId,
    fileName: file.name,
    mimeType:
      file.type ||
      "application/octet-stream",
    sizeBytes: file.size,
    chunkCount,
    storageProvider: "firestore",
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(
    doc(db, FILE_COLLECTION, fileId),
    manifest
  );

  return `${FIRESTORE_FILE_PREFIX}${fileId}`;
}

/**
 * Lê um arquivo salvo no Firestore (LEGADO).
 */
async function readFileFromFirestore(
  fileUrl: string
) {
  const db = firestore;

  if (!db) {
    throw new Error(
      "O Firebase/Firestore não está configurado para abrir documentos."
    );
  }

  const fileId = fileUrl.replace(
    FIRESTORE_FILE_PREFIX,
    ""
  );

  const manifestSnapshot = await getDoc(
    doc(db, FILE_COLLECTION, fileId)
  );

  if (!manifestSnapshot.exists()) {
    throw new Error(
      "Arquivo não encontrado no banco de dados."
    );
  }

  const manifest =
    manifestSnapshot.data() as StoredFileManifest;

  const chunks: string[] = new Array(
    manifest.chunkCount
  );

  const readConcurrency = 8;

  for (
    let offset = 0;
    offset < manifest.chunkCount;
    offset += readConcurrency
  ) {
    const indexes = Array.from(
      {
        length: Math.min(
          readConcurrency,
          manifest.chunkCount - offset
        ),
      },
      (_, position) => offset + position
    );

    const snapshots = await Promise.all(
      indexes.map((index) =>
        getDoc(
          doc(
            db,
            CHUNK_COLLECTION,
            `${fileId}-${index}`
          )
        )
      )
    );

    snapshots.forEach(
      (snapshot, position) => {
        const index = indexes[position];

        if (!snapshot.exists()) {
          throw new Error(
            `Parte ${index + 1
            } do arquivo não encontrada.`
          );
        }

        chunks[index] = String(
          snapshot.data().content || ""
        );
      }
    );
  }

  return {
    manifest,
    dataUrl: chunks.join(""),
  };
}

/**
 * Upload de documentos.
 * Padrão: Firebase Storage.
 * Fallback: Firestore (legado).
 */
export async function uploadEmployeeDocumentFile(
  employeeId: string,
  file: File
) {
  if (storage) {
    try {
      const path = `employeeDocuments/${employeeId}/${Date.now()}-${safeFileName(
        file.name
      )}`;

      const fileRef = ref(storage, path);

      await uploadBytes(fileRef, file);

      return await getDownloadURL(fileRef);
    } catch (error) {
      console.warn(
        "Falha ao salvar no Firebase Storage. Utilizando Firestore.",
        error
      );
    }
  }

  // Compatibilidade / fallback
  return saveFileToFirestore(employeeId, file);
}

/**
 * Abre documentos.
 * Compatível com:
 * - Firestore legado
 * - Base64
 * - Firebase Storage
 */
export async function openEmployeeDocumentFile(
  fileUrl: string,
  fileName = "documento"
) {
  if (!fileUrl) return;

  // Arquivos antigos salvos no Firestore
  if (isFirestoreDocumentFileUrl(fileUrl)) {
    const { dataUrl } = await readFileFromFirestore(fileUrl);

    const blob = dataUrlToBlob(dataUrl);

    const url = URL.createObjectURL(blob);

    window.open(url, "_blank", "noopener,noreferrer");

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);

    return;
  }

  // Compatibilidade com base64
  if (fileUrl.startsWith("data:")) {
    const blob = dataUrlToBlob(fileUrl);

    const url = URL.createObjectURL(blob);

    window.open(url, "_blank", "noopener,noreferrer");

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);

    return;
  }

  // Firebase Storage
  const opened = window.open(
    fileUrl,
    "_blank",
    "noopener,noreferrer"
  );

  if (!opened) {
    const link = document.createElement("a");

    link.href = fileUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.download = fileName;

    link.click();
  }
}

/**
 * Remove documentos.
 * Compatível com Firestore legado e Firebase Storage.
 */
export async function deleteEmployeeDocumentFile(
  fileUrl: string
) {
  if (!fileUrl) return;

  // ===============================
  // Firestore (LEGADO)
  // ===============================
  if (isFirestoreDocumentFileUrl(fileUrl)) {
    const db = firestore;

    if (!db) return;

    const fileId = fileUrl.replace(
      FIRESTORE_FILE_PREFIX,
      ""
    );

    const manifestSnapshot = await getDoc(
      doc(db, FILE_COLLECTION, fileId)
    );

    if (!manifestSnapshot.exists()) {
      return;
    }

    const manifest =
      manifestSnapshot.data() as StoredFileManifest;

    const batchSize = 400;

    for (
      let offset = 0;
      offset < manifest.chunkCount;
      offset += batchSize
    ) {
      const batch = writeBatch(db);

      const end = Math.min(
        manifest.chunkCount,
        offset + batchSize
      );

      for (let index = offset; index < end; index++) {
        batch.delete(
          doc(
            db,
            CHUNK_COLLECTION,
            `${fileId}-${index}`
          )
        );
      }

      await batch.commit();
    }

    await deleteDoc(
      doc(db, FILE_COLLECTION, fileId)
    );

    return;
  }

  // ===============================
  // Firebase Storage
  // ===============================
  if (storage) {
    try {
      const fileRef = ref(storage, fileUrl);

      await deleteObject(fileRef);
    } catch (error) {
      console.warn(
        "Erro ao excluir arquivo do Firebase Storage.",
        error
      );
    }
  }
}