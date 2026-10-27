import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { firestore } from "@/services/firebase";
import type { Employee } from "@/types/domain";

// Contratações homologadas no sistema de RH (projeto Firebase separado). Uma
// rotina do RH (GitHub Actions, migration/enviarNovosContratadosDP.js no repo
// do RH) grava aqui com status "pendente", já com os documentos copiados para
// o Storage deste projeto. O DP conclui o cadastro a partir delas.
export const NEW_HIRES_RH_COLLECTION = "novosContratadosRH";

export type NewHireRhDocument = {
  tipo: string;
  nome: string;
  // "controleAtivo" = o DP monitora vencimento (ASO, CNH, NRs...); "admissional" = só arquivo.
  destino: "admissional" | "controleAtivo";
  nomeArquivoOriginal: string;
  dataEnvio: string;
  arquivoUrl: string;
  arquivoCaminho: string;
  contentType: string;
  tamanhoBytes: number;
};

export type NewHireRh = {
  id: string;
  admissaoId: string;
  nome: string;
  cpf: string;
  dataNascimento: string;
  email: string;
  telefone: string;
  endereco: string;
  cargo: string;
  empresaId: string;
  empresa: string;
  departamentoId: string;
  departamento: string;
  equipeId: string;
  equipe: string;
  // Data de admissão (YYYY-MM-DD), informada pelo RH ao homologar.
  dataHomologacao: string;
  documentos: NewHireRhDocument[];
  status: "pendente" | "cadastrado";
  employeeId?: string;
};

function fromSnapshot(id: string, data: Record<string, unknown>): NewHireRh {
  return { ...(data as Omit<NewHireRh, "id">), id, documentos: (data.documentos as NewHireRhDocument[]) || [] };
}

export function useNewHiresRh(enabled: boolean) {
  const [items, setItems] = useState<NewHireRh[]>([]);

  useEffect(() => {
    if (!enabled || !firestore) {
      setItems([]);
      return;
    }
    const pending = query(collection(firestore, NEW_HIRES_RH_COLLECTION), where("status", "==", "pendente"));
    return onSnapshot(
      pending,
      (snapshot) => {
        const list = snapshot.docs.map((entry) => fromSnapshot(entry.id, entry.data()));
        list.sort((a, b) => (a.dataHomologacao || "").localeCompare(b.dataHomologacao || "") || a.nome.localeCompare(b.nome));
        setItems(list);
      },
      () => setItems([]),
    );
  }, [enabled]);

  return items;
}

export async function loadNewHireRh(id: string): Promise<NewHireRh | null> {
  if (!firestore || !id) return null;
  const snapshot = await getDoc(doc(firestore, NEW_HIRES_RH_COLLECTION, id));
  return snapshot.exists() ? fromSnapshot(snapshot.id, snapshot.data()) : null;
}

// Cadastro concluído no DP: sai de "Novos contratados" e guarda o vínculo com o funcionário criado.
export async function markNewHireRhRegistered(id: string, employeeId: string) {
  if (!firestore) return;
  await updateDoc(doc(firestore, NEW_HIRES_RH_COLLECTION, id), {
    status: "cadastrado",
    employeeId,
    cadastradoEm: new Date().toISOString(),
  });
}

export function newHireRhDocumentKind(contentType: string): "pdf" | "image" | "file" {
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("image/")) return "image";
  return "file";
}

// Rascunho do cadastro (Funcionário - CLT) com o que veio do RH; o resto o DP completa no formulário.
export function newHireRhEmployeeDraft(hire: NewHireRh): Partial<Employee> {
  return {
    name: hire.nome,
    cpf: hire.cpf,
    phone: hire.telefone,
    role: hire.cargo,
    position: hire.cargo,
    admissionDate: hire.dataHomologacao,
    companyId: hire.empresaId,
    departmentId: hire.departamentoId,
    teamId: hire.equipeId,
    complement: {
      email: hire.email,
      emergencyContact: "",
      transportVoucher: false,
      mealVoucher: false,
      foodVoucher: false,
      healthPlan: false,
      dentalPlan: false,
      customBenefits: {},
      notes: "",
    },
    registrationData: {
      employeeKind: "company",
      name: hire.nome,
      cpf: hire.cpf,
      birthDate: hire.dataNascimento,
      mobilePhone: hire.telefone,
      residence: hire.endereco,
      email: hire.email,
      role: hire.cargo,
      position: hire.cargo,
      admissionDate: hire.dataHomologacao,
      newHireRhId: hire.id,
    },
  };
}
