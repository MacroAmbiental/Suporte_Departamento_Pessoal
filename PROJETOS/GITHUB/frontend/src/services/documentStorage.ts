import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/services/firebase";

// 🔹 Utils

function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 🚀 Upload

export async function uploadEmployeeDocumentFile(employeeId: string, file: File) {
  if (!storage) {
    throw new Error("Firebase Storage não está configurado.");
  }

  const path = `employeeDocuments/${employeeId}/${Date.now()}-${safeFileName(file.name)}`;
  const fileRef = ref(storage, path);

  await uploadBytes(fileRef, file);

  const url = await getDownloadURL(fileRef);

  return url;
}

// 🔓 Abrir arquivo

export function openEmployeeDocumentFile(fileUrl: string) {
  if (!fileUrl) return;

  const opened = window.open(fileUrl, "_blank", "noopener,noreferrer");

  if (!opened) {
    const link = document.createElement("a");
    link.href = fileUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
  }
}

// 🗑️ Deletar arquivo (corrigido)

export async function deleteEmployeeDocumentFile(fileUrl: string) {
  if (!storage || !fileUrl) return;

  try {
    // 🔥 IMPORTANTE: converter URL → ref corretamente
    const fileRef = ref(storage, fileUrl);
    await deleteObject(fileRef);
  } catch (error) {
    console.warn("Erro ao deletar arquivo no Storage", error);
  }
}