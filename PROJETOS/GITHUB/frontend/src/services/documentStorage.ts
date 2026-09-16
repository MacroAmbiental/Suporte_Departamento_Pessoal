import { deleteDoc, doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firestore, storage } from "@/services/firebase";

const FIRESTORE_FILE_PREFIX = "firestore-file://";
const FILE_COLLECTION = "employeeDocumentFiles";
const CHUNK_COLLECTION = "employeeDocumentFileChunks";
const CHUNK_SIZE = 350_000;
const FIRESTORE_FILE_STORAGE_ENABLED = import.meta.env.VITE_ALLOW_FIRESTORE_FILE_STORAGE !== "false";
const MAX_FIRESTORE_FILE_BYTES = Number(import.meta.env.VITE_FIRESTORE_FILE_MAX_BYTES || 1_000_000);

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

function createId(prefix: string) {
  const cryptoId = globalThis.crypto?.randomUUID?.();
  return cryptoId ? `${prefix}-${cryptoId}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatMegabytes(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function assertFirestoreFileStorageAllowed(file: File) {
  if (!FIRESTORE_FILE_STORAGE_ENABLED) {
    throw new Error("Armazenamento de arquivos no Firestore desativado.");
  }

  if (file.size > MAX_FIRESTORE_FILE_BYTES) {
    throw new Error(
      `Arquivo muito grande para o modo temporario sem Storage. Limite atual: ${formatMegabytes(MAX_FIRESTORE_FILE_BYTES)}.`,
    );
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Nao foi possivel ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [header, content] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "application/octet-stream";
  const binary = atob(content || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

export function isFirestoreDocumentFileUrl(fileUrl: string) {
  return fileUrl.startsWith(FIRESTORE_FILE_PREFIX);
}

async function saveFileToFirestore(employeeId: string, file: File) {
  const db = firestore;
  if (!db) {
    throw new Error("O Firebase/Firestore nao esta configurado para salvar documentos.");
  }

  assertFirestoreFileStorageAllowed(file);

  const dataUrl = await fileToBase64(file);
  const fileId = createId("employee-document-file");
  const now = new Date().toISOString();
  const chunkCount = Math.ceil(dataUrl.length / CHUNK_SIZE);
  const batchSize = 400;

  for (let offset = 0; offset < chunkCount; offset += batchSize) {
    const batch = writeBatch(db);
    const end = Math.min(chunkCount, offset + batchSize);
    for (let index = offset; index < end; index += 1) {
      const chunkId = `${fileId}-${index}`;
      const chunk = dataUrl.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      batch.set(doc(db, CHUNK_COLLECTION, chunkId), {
        id: chunkId,
        fileId,
        index,
        content: chunk,
      });
    }
    await batch.commit();
  }

  const manifest: StoredFileManifest = {
    id: fileId,
    employeeId,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    chunkCount,
    storageProvider: "firestore",
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, FILE_COLLECTION, fileId), manifest);
  return `${FIRESTORE_FILE_PREFIX}${fileId}`;
}

async function readFileFromFirestore(fileUrl: string) {
  const db = firestore;
  if (!db) {
    throw new Error("O Firebase/Firestore não está configurado para abrir documentos.");
  }

  const fileId = fileUrl.replace(FIRESTORE_FILE_PREFIX, "");
  const manifestSnapshot = await getDoc(doc(db, FILE_COLLECTION, fileId));
  if (!manifestSnapshot.exists()) {
    throw new Error("Arquivo não encontrado no banco de dados.");
  }

  const manifest = manifestSnapshot.data() as StoredFileManifest;
  const chunks: string[] = new Array(manifest.chunkCount);
  const readConcurrency = 8;

  // Limita leituras simultâneas para não estourar quota nem reservar RAM para
  // todas as respostas ao mesmo tempo.
  for (let offset = 0; offset < manifest.chunkCount; offset += readConcurrency) {
    const indexes = Array.from(
      { length: Math.min(readConcurrency, manifest.chunkCount - offset) },
      (_, position) => offset + position,
    );
    const snapshots = await Promise.all(
      indexes.map((index) => getDoc(doc(db, CHUNK_COLLECTION, `${fileId}-${index}`))),
    );
    snapshots.forEach((snapshot, position) => {
      const index = indexes[position];
      if (!snapshot.exists()) throw new Error(`Parte ${index + 1} do arquivo não encontrada no banco.`);
      chunks[index] = String(snapshot.data().content || "");
    });
  }

  return { manifest, dataUrl: chunks.join("") };
}

export async function uploadEmployeeDocumentFile(employeeId: string, file: File) {
  if (storage) {
    try {
      const path = `employeeDocuments/${employeeId}/${Date.now()}-${safeFileName(file.name)}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      return getDownloadURL(fileRef);
    } catch (error) {
      console.warn("Falha no Firebase Storage ao salvar documento.", error);
    }
  }

  return saveFileToFirestore(employeeId, file);
}

export async function openEmployeeDocumentFile(fileUrl: string, fileName = "documento") {
  if (!fileUrl) return;

  if (isFirestoreDocumentFileUrl(fileUrl)) {
    const { dataUrl } = await readFileFromFirestore(fileUrl);
    const blob = dataUrlToBlob(dataUrl);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  if (fileUrl.startsWith("data:")) {
    const blob = dataUrlToBlob(fileUrl);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  // Use a single navigation. window.open with noopener can return null even
  // when it succeeds, so its return value must not trigger a second download.
  const link = document.createElement("a");
  link.href = fileUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.download = fileName;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }

}

export async function deleteEmployeeDocumentFile(fileUrl: string) {
  const db = firestore;
  if (!db || !isFirestoreDocumentFileUrl(fileUrl)) return;

  const fileId = fileUrl.replace(FIRESTORE_FILE_PREFIX, "");
  const manifestSnapshot = await getDoc(doc(db, FILE_COLLECTION, fileId));
  if (!manifestSnapshot.exists()) return;

  const manifest = manifestSnapshot.data() as StoredFileManifest;
  const batchSize = 400;
  for (let offset = 0; offset < manifest.chunkCount; offset += batchSize) {
    const batch = writeBatch(db);
    const end = Math.min(manifest.chunkCount, offset + batchSize);
    for (let index = offset; index < end; index += 1) {
      batch.delete(doc(db, CHUNK_COLLECTION, `${fileId}-${index}`));
    }
    await batch.commit();
  }
  await deleteDoc(doc(db, FILE_COLLECTION, fileId));
}
