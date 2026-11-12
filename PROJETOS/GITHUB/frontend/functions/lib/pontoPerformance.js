"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pontoPerformance = void 0;
exports.caminhoPermitido = caminhoPermitido;
exports.camposForcados = camposForcados;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const equipesAtuais_1 = require("./equipesAtuais");
const pontoPerformanceCache_1 = require("./pontoPerformanceCache");
// Link só de leitura do ponto para a planilha Custo x Faturamento da
// Performance (03/11/2026). Antes a planilha lia o banco do DP direto pela
// API REST do Firestore, sem login; com o banco fechado ela passa por aqui.
//
// Devolve EXATAMENTE a resposta da API REST do Firestore (mesmo JSON, mesma
// paginação com nextPageToken), então na planilha só muda o começo da URL e
// entra a chave no cabeçalho "x-chave" (ou ?chave=...).
//
// Antes: https://firestore.googleapis.com/v1/projects/macro-ambiental/databases/(default)/documents/timeRecords/2026-10-21/employeePoints?pageSize=300
// Agora: https://southamerica-east1-macro-ambiental.cloudfunctions.net/pontoPerformance/timeRecords/2026-10-21/employeePoints?pageSize=300
//
// 11/11: /equipesAtuais devolve [{id, matricula, nome, status, equipeId, equipe,
// equipeCadastroAntigo}] com a equipe ATUAL (estrutura do grupo, igual ao ponto).
// O teamId de employees é o campo antigo e não acompanha troca/renomeação.
//
// Só GET; timeRecords, lotação (departments/sectors/subsectors/teams) e, de
// employees, só os campos da lista abaixo.
const CHAVE = (0, params_1.defineSecret)("PERFORMANCE_CHAVE");
const PROJETO = "macro-ambiental";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents/`;
const PARAMETROS_PERMITIDOS = new Set(["pageSize", "pageToken", "orderBy", "mask.fieldPaths", "showMissing"]);
const SEGMENTO = /^[A-Za-z0-9_-]{1,200}$/;
function digest(valor) {
    return (0, node_crypto_1.createHash)("sha256").update(valor, "utf8").digest();
}
function chaveConfere(recebida, esperada) {
    return recebida !== "" && esperada !== "" && (0, node_crypto_1.timingSafeEqual)(digest(recebida), digest(esperada));
}
// Cadastro de funcionários (autorizado pelo usuário): o servidor força esta
// lista. 03/11: nome e salário (BASE SALARIAL). 04/11: situação, admissão,
// cargo, matrícula, vínculo, lotação, experiência e desligamento, usados
// pela BASE SALARIAL da C&F, equipes-dp.xlsx e planilha de contratos;
// + líder, empresa, data do pedido de demissão e desligamento cancelado.
// CPF, RG, PIS, telefone, endereço, banco, família etc. nunca saem por aqui.
const CAMPOS_FUNCIONARIOS = [
    "name",
    "salary",
    "status",
    "admissionDate",
    "role",
    "position",
    "registration",
    "companyId",
    "groupId",
    "departmentId",
    "sectorId",
    "subsectorId",
    "teamId",
    "isTeamLead",
    "registrationData.company",
    "registrationData.employeeKind",
    "registrationData.employmentContractType",
    "registrationData.employeeCategory",
    "registrationData.experienceDays",
    "registrationData.experienceContinued30At",
    "registrationData.experienceContinued60At",
    "registrationData.experienceConfirmedAt",
    "registrationData.scheduledDeactivationDate",
    "registrationData.deactivationEffectiveDate",
    "registrationData.deactivationCompletedDate",
    "registrationData.resignationDate",
    "registrationData.dismissalCancelledAt",
];
// Empresas do grupo (04/11, equipes-dp.xlsx): só nome, razão social e ativo.
const CAMPOS_EMPRESAS = ["name", "legalName", "active"];
// Lotação (04/11): documentos inteiros (nome, ativo, líder, centro de custo).
const COLECOES_LOTACAO = new Set(["departments", "sectors", "subsectors", "teams"]);
// timeRecords | timeRecords/{data} | timeRecords/{data}/employeePoints | timeRecords/{data}/employeePoints/{id}
// employees | employees/{id}  (só CAMPOS_FUNCIONARIOS)
// departments | sectors | subsectors | teams  (e /{id})
// companies | companies/{id}  (só CAMPOS_EMPRESAS)
function caminhoPermitido(caminho) {
    const partes = caminho.split("/").filter(Boolean);
    if (!partes.every((parte) => SEGMENTO.test(parte)))
        return false;
    if (partes[0] === "employees" || partes[0] === "companies" || COLECOES_LOTACAO.has(partes[0]))
        return partes.length <= 2;
    if (partes[0] !== "timeRecords" || partes.length > 4)
        return false;
    return partes.length < 3 || partes[2] === "employeePoints";
}
function camposForcados(caminho) {
    const colecao = caminho.split("/").filter(Boolean)[0];
    if (colecao === "employees")
        return CAMPOS_FUNCIONARIOS;
    if (colecao === "companies")
        return CAMPOS_EMPRESAS;
    return null;
}
const credencial = (0, app_1.applicationDefault)();
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
async function lerRest(caminho, parametros) {
    const { access_token: token } = await credencial.getAccessToken();
    const url = `${BASE}${caminho.split("/").map(encodeURIComponent).join("/")}${parametros.size ? `?${parametros}` : ""}`;
    const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return { status: resposta.status, corpo: await resposta.text() };
}
// Todas as páginas do dia, sem máscara (a cópia guarda o documento inteiro).
async function lerDiaInteiro(caminho) {
    const documentos = [];
    let pageToken = "";
    do {
        const parametros = new URLSearchParams({ pageSize: "300" });
        if (pageToken)
            parametros.set("pageToken", pageToken);
        const { status, corpo } = await lerRest(caminho, parametros);
        if (status !== 200)
            throw new Error(`REST ${status}`);
        const json = JSON.parse(corpo);
        documentos.push(...(json.documents || []));
        pageToken = json.nextPageToken || "";
    } while (pageToken);
    return documentos;
}
exports.pontoPerformance = (0, https_1.onRequest)({ region: "southamerica-east1", secrets: [CHAVE], cors: false, timeoutSeconds: 120 }, async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).json({ erro: "Só leitura (GET)." });
        return;
    }
    const cabecalho = req.get("x-chave") ?? "";
    const naUrl = typeof req.query.chave === "string" ? req.query.chave : "";
    if (!chaveConfere(cabecalho || naUrl, CHAVE.value())) {
        res.status(401).json({ erro: "Chave inválida." });
        return;
    }
    const caminhoBruto = typeof req.query.path === "string" && req.query.path ? req.query.path : req.path;
    let caminho;
    try {
        caminho = decodeURIComponent(caminhoBruto).replace(/^\/+|\/+$/g, "");
    }
    catch {
        res.status(400).json({ erro: "Caminho inválido." });
        return;
    }
    if (caminho === "equipesAtuais") {
        const lista = await (0, equipesAtuais_1.equipesAtuais)((0, firestore_1.getFirestore)());
        console.log("[PONTO_PERFORMANCE]", { caminho, status: 200, quantidade: lista.length });
        res.status(200).json(lista);
        return;
    }
    if (!caminhoPermitido(caminho)) {
        res.status(403).json({ erro: "Este link só libera o ponto (timeRecords), a lotação (departments, sectors, subsectors, teams, companies) e campos liberados dos funcionários (employees) e a equipe atual (equipesAtuais)." });
        return;
    }
    const parametros = new URLSearchParams();
    for (const [nome, valor] of Object.entries(req.query)) {
        if (!PARAMETROS_PERMITIDOS.has(nome))
            continue;
        for (const item of Array.isArray(valor) ? valor : [valor]) {
            if (typeof item === "string")
                parametros.append(nome, item);
        }
    }
    const forcados = camposForcados(caminho);
    if (forcados) {
        parametros.delete("mask.fieldPaths");
        for (const campo of forcados)
            parametros.append("mask.fieldPaths", campo);
    }
    const cacheavel = (0, pontoPerformanceCache_1.pedidoCacheavel)(caminho, parametros);
    if (cacheavel) {
        try {
            const { documentos, versao, origem } = await (0, pontoPerformanceCache_1.documentosDoDia)((0, firestore_1.getFirestore)(), cacheavel.data, () => lerDiaInteiro(caminho));
            console.log("[PONTO_PERFORMANCE]", { caminho, status: 200, pagina: parametros.has("pageToken"), origem });
            res.status(200).type("application/json").send(JSON.stringify((0, pontoPerformanceCache_1.paginaDaCopia)(documentos, parametros, versao)));
            return;
        }
        catch (erro) {
            // Qualquer falha na cópia: segue o caminho antigo (REST direto).
            console.error("[PONTO_PERFORMANCE] cópia falhou, usando REST", erro);
        }
    }
    const { status, corpo } = await lerRest(caminho, parametros);
    console.log("[PONTO_PERFORMANCE]", {
        caminho, status, pagina: parametros.has("pageToken"), origem: "rest",
        // Diagnóstico da cópia (C5): quais parâmetros vieram (sem o token/chave).
        parametros: [...parametros.entries()].filter(([nome]) => nome !== "pageToken").map(([nome, valor]) => `${nome}=${valor}`).join("&"),
        tokenRest: parametros.has("pageToken") && !String(parametros.get("pageToken")).startsWith("ppc1."),
    });
    res.status(status).type("application/json").send(corpo);
});
//# sourceMappingURL=pontoPerformance.js.map