"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pontoPerformance = void 0;
exports.caminhoPermitido = caminhoPermitido;
exports.camposForcados = camposForcados;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
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
// Só GET; só timeRecords e, de employees, só nome e salário.
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
// Cadastro de funcionários (03/11, autorizado pelo usuário): só nome e
// salário, para a consulta "BASE SALARIAL". O servidor força esses campos;
// CPF, telefone, dados de registro etc. nunca saem por aqui.
const CAMPOS_FUNCIONARIOS = ["name", "salary"];
// timeRecords | timeRecords/{data} | timeRecords/{data}/employeePoints | timeRecords/{data}/employeePoints/{id}
// employees | employees/{id}  (só nome e salário)
function caminhoPermitido(caminho) {
    const partes = caminho.split("/").filter(Boolean);
    if (!partes.every((parte) => SEGMENTO.test(parte)))
        return false;
    if (partes[0] === "employees")
        return partes.length <= 2;
    if (partes[0] !== "timeRecords" || partes.length > 4)
        return false;
    return partes.length < 3 || partes[2] === "employeePoints";
}
function camposForcados(caminho) {
    return caminho.split("/").filter(Boolean)[0] === "employees" ? CAMPOS_FUNCIONARIOS : null;
}
const credencial = (0, app_1.applicationDefault)();
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
    if (!caminhoPermitido(caminho)) {
        res.status(403).json({ erro: "Este link só libera o ponto (timeRecords) e nome/salário dos funcionários (employees)." });
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
    const { access_token: token } = await credencial.getAccessToken();
    const url = `${BASE}${caminho.split("/").map(encodeURIComponent).join("/")}${parametros.size ? `?${parametros}` : ""}`;
    const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const corpo = await resposta.text();
    console.log("[PONTO_PERFORMANCE]", { caminho, status: resposta.status, pagina: parametros.has("pageToken") });
    res.status(resposta.status).type("application/json").send(corpo);
});
//# sourceMappingURL=pontoPerformance.js.map