import type { Firestore } from "firebase-admin/firestore";

// Equipe ATUAL de cada funcionário (11/11/2026), para o link da Performance.
// O teamId do cadastro é o campo antigo: quando a equipe muda (ou é renomeada)
// na estrutura do grupo, ele não acompanha (caso "Asfalto II" → DAVID). Aqui vale
// a mesma regra do Controle de ponto (timekeepingTeamStructure) e da Classificação:
//   1. alocação do funcionário no grupo (companyGroupEmployeeAssignments.teamUnitId);
//   2. vínculo da equipe antiga com a equipe do grupo (companyGroupUnitLinks);
//   3. por último, o teamId do cadastro.

export type EquipeAtual = {
  id: string;
  matricula: string;
  nome: string;
  status: string;
  equipeId: string;
  equipe: string;
  /** Equipe que o campo antigo (teamId) aponta, para conferência. */
  equipeCadastroAntigo: string;
};

export async function equipesAtuais(db: Firestore): Promise<EquipeAtual[]> {
  const [funcionarios, equipes, unidades, empresasDoGrupo, vinculos, alocacoes] = await Promise.all([
    db.collection("employees").select("name", "registration", "status", "companyId", "groupId", "teamId").get(),
    db.collection("teams").select("name").get(),
    db.collection("companyGroupUnits").where("type", "==", "team").select("name", "groupId").get(),
    db.collection("companyGroupCompanies").select("companyId", "groupId").get(),
    db.collection("companyGroupUnitLinks").where("sourceType", "==", "team").select("companyId", "sourceId", "groupId", "groupUnitId").get(),
    db.collection("companyGroupEmployeeAssignments").select("groupId", "employeeId", "teamUnitId").get(),
  ]);
  const nomeEquipe = new Map<string, string>();
  equipes.docs.forEach((doc) => nomeEquipe.set(doc.id, String(doc.get("name") || "")));
  unidades.docs.forEach((doc) => nomeEquipe.set(doc.id, String(doc.get("name") || "")));
  const grupoDaUnidade = new Map(unidades.docs.map((doc) => [doc.id, String(doc.get("groupId") || "")]));
  const grupoDaEmpresa = new Map(empresasDoGrupo.docs.map((doc) => [String(doc.get("companyId") || ""), String(doc.get("groupId") || "")]));
  const alocacao = new Map(alocacoes.docs.map((doc) => [`${doc.get("groupId")}:${doc.get("employeeId")}`, String(doc.get("teamUnitId") || "")]));
  const vinculoPor = new Map<string, string>();
  for (const doc of vinculos.docs) {
    const unidade = String(doc.get("groupUnitId") || "");
    if (!grupoDaUnidade.has(unidade)) continue;
    const chave = `${doc.get("groupId")}:${doc.get("companyId")}:${doc.get("sourceId")}`;
    if (!vinculoPor.has(chave)) vinculoPor.set(chave, unidade);
  }

  return funcionarios.docs.map((doc) => {
    const companyId = String(doc.get("companyId") || "");
    const teamId = String(doc.get("teamId") || "");
    const groupId = String(doc.get("groupId") || "") || grupoDaEmpresa.get(companyId) || "";
    const chave = `${groupId}:${doc.id}`;
    let equipeId: string;
    if (alocacao.has(chave) && !alocacao.get(chave)) {
      equipeId = ""; // tirado de equipe na estrutura do grupo
    } else if (alocacao.get(chave) && grupoDaUnidade.get(alocacao.get(chave) || "") === groupId) {
      equipeId = alocacao.get(chave) || "";
    } else {
      equipeId = vinculoPor.get(`${groupId}:${companyId}:${teamId}`) || teamId;
    }
    return {
      id: doc.id,
      matricula: String(doc.get("registration") ?? ""),
      nome: String(doc.get("name") || ""),
      status: String(doc.get("status") || ""),
      equipeId,
      equipe: nomeEquipe.get(equipeId) || "",
      equipeCadastroAntigo: nomeEquipe.get(teamId) || "",
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
