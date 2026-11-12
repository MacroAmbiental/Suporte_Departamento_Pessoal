"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.equipesAtuais = equipesAtuais;
async function equipesAtuais(db) {
    const [funcionarios, equipes, unidades, empresasDoGrupo, vinculos, alocacoes] = await Promise.all([
        db.collection("employees").select("name", "registration", "status", "companyId", "groupId", "teamId").get(),
        db.collection("teams").select("name").get(),
        db.collection("companyGroupUnits").where("type", "==", "team").select("name", "groupId").get(),
        db.collection("companyGroupCompanies").select("companyId", "groupId").get(),
        db.collection("companyGroupUnitLinks").where("sourceType", "==", "team").select("companyId", "sourceId", "groupId", "groupUnitId").get(),
        db.collection("companyGroupEmployeeAssignments").select("groupId", "employeeId", "teamUnitId").get(),
    ]);
    const nomeEquipe = new Map();
    equipes.docs.forEach((doc) => nomeEquipe.set(doc.id, String(doc.get("name") || "")));
    unidades.docs.forEach((doc) => nomeEquipe.set(doc.id, String(doc.get("name") || "")));
    const grupoDaUnidade = new Map(unidades.docs.map((doc) => [doc.id, String(doc.get("groupId") || "")]));
    const grupoDaEmpresa = new Map(empresasDoGrupo.docs.map((doc) => [String(doc.get("companyId") || ""), String(doc.get("groupId") || "")]));
    const alocacao = new Map(alocacoes.docs.map((doc) => [`${doc.get("groupId")}:${doc.get("employeeId")}`, String(doc.get("teamUnitId") || "")]));
    const vinculoPor = new Map();
    for (const doc of vinculos.docs) {
        const unidade = String(doc.get("groupUnitId") || "");
        if (!grupoDaUnidade.has(unidade))
            continue;
        const chave = `${doc.get("groupId")}:${doc.get("companyId")}:${doc.get("sourceId")}`;
        if (!vinculoPor.has(chave))
            vinculoPor.set(chave, unidade);
    }
    return funcionarios.docs.map((doc) => {
        const companyId = String(doc.get("companyId") || "");
        const teamId = String(doc.get("teamId") || "");
        const groupId = String(doc.get("groupId") || "") || grupoDaEmpresa.get(companyId) || "";
        const chave = `${groupId}:${doc.id}`;
        let equipeId;
        if (alocacao.has(chave) && !alocacao.get(chave)) {
            equipeId = ""; // tirado de equipe na estrutura do grupo
        }
        else if (alocacao.get(chave) && grupoDaUnidade.get(alocacao.get(chave) || "") === groupId) {
            equipeId = alocacao.get(chave) || "";
        }
        else {
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
//# sourceMappingURL=equipesAtuais.js.map