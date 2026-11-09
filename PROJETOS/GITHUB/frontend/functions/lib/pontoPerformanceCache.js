"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLECAO_CACHE = void 0;
exports.pedidoCacheavel = pedidoCacheavel;
exports.aplicarMascara = aplicarMascara;
exports.paginaDaCopia = paginaDaCopia;
exports.documentosDoDia = documentosDoDia;
const node_crypto_1 = require("node:crypto");
const node_zlib_1 = require("node:zlib");
const firestore_1 = require("firebase-admin/firestore");
// C5 (09/11/2026): a Performance atualiza a planilha 5–6x por dia e cada
// atualização lê o ponto de 31 dias inteiros (~12 mil leituras), mesmo que só
// os últimos dias tenham mudado. Aqui fica uma cópia pronta (compactada) de cada
// dia, exatamente como a API REST devolve, conferida a cada pedido:
//   versão do dia = quantidade de registros + maior updatedAt dos registros
//   (toda gravação das telas atualiza updatedAt; exclusão muda a quantidade).
// Mudou qualquer coisa no dia (inclusive meses atrás) → relê o dia inteiro do
// banco e guarda a cópia nova. A cópia também vence em 7 dias (proteção contra
// gravação que não atualize updatedAt). Dia sem mudança: 3 leituras em vez de ~400.
exports.COLECAO_CACHE = "pontoPerformanceCache";
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;
const PREFIXO_TOKEN = "ppc1.";
const LIMITE_PAGINA_REST = 300;
// --- Partes puras (testáveis sem banco) ---
/** Pedido que a cópia consegue responder igual à REST; senão segue o caminho antigo. */
function pedidoCacheavel(caminho, parametros) {
    const partes = caminho.split("/").filter(Boolean);
    if (partes.length !== 3 || partes[0] !== "timeRecords" || partes[2] !== "employeePoints")
        return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(partes[1]))
        return null;
    for (const nome of parametros.keys()) {
        if (!["pageSize", "pageToken", "mask.fieldPaths"].includes(nome))
            return null;
    }
    // A planilha pede pageSize=1000; a REST corta em 300 por página (conferido 09/11).
    const tamanho = Number(parametros.get("pageSize"));
    if (!Number.isInteger(tamanho) || tamanho < 1)
        return null;
    const token = parametros.get("pageToken");
    if (token !== null && !token.startsWith(PREFIXO_TOKEN))
        return null;
    if (parametros.getAll("mask.fieldPaths").some((campo) => !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(campo)))
        return null;
    return { data: partes[1] };
}
/** Mesmo recorte de campos que o mask.fieldPaths da REST. */
function aplicarMascara(doc, caminhos) {
    if (!caminhos.length)
        return doc;
    const recorte = (campos, lista) => {
        const saida = {};
        if (!campos)
            return saida;
        const porTopo = new Map();
        for (const partes of lista) {
            const resto = porTopo.get(partes[0]) || [];
            resto.push(partes.slice(1));
            porTopo.set(partes[0], resto);
        }
        for (const [nome, restos] of porTopo) {
            const valor = campos[nome];
            if (valor === undefined)
                continue;
            if (restos.some((r) => r.length === 0)) {
                saida[nome] = valor;
            }
            else if (valor.mapValue) {
                const dentro = recorte(valor.mapValue.fields, restos);
                if (Object.keys(dentro).length)
                    saida[nome] = { mapValue: { fields: dentro } };
            }
        }
        return saida;
    };
    const fields = recorte(doc.fields, caminhos.map((c) => c.split(".")));
    const { fields: _ignorado, ...resto } = doc;
    void _ignorado;
    return Object.keys(fields).length ? { ...resto, fields } : resto;
}
/** Uma página da cópia, no formato da REST ({documents, nextPageToken} ou {}). */
function paginaDaCopia(documentos, parametros, versao) {
    const tamanho = Math.min(Number(parametros.get("pageSize")), LIMITE_PAGINA_REST);
    const token = parametros.get("pageToken");
    const inicio = token ? Number(Buffer.from(token.slice(PREFIXO_TOKEN.length), "base64url").toString("utf8").split("|").pop()) || 0 : 0;
    const mascara = parametros.getAll("mask.fieldPaths");
    const pagina = documentos.slice(inicio, inicio + tamanho).map((d) => aplicarMascara(d, mascara));
    const corpo = {};
    if (pagina.length)
        corpo.documents = pagina;
    if (inicio + tamanho < documentos.length) {
        corpo.nextPageToken = PREFIXO_TOKEN + Buffer.from(`${versao}|${inicio + tamanho}`, "utf8").toString("base64url");
    }
    return corpo;
}
// --- Banco ---
async function versaoDoDia(db, data) {
    const colecao = db.collection(`timeRecords/${data}/employeePoints`);
    const [contagem, ultimo] = await Promise.all([
        colecao.count().get(),
        colecao.orderBy("updatedAt", "desc").limit(1).select("updatedAt").get(),
    ]);
    const maior = ultimo.empty ? "" : String(ultimo.docs[0].get("updatedAt") ?? "");
    return (0, node_crypto_1.createHash)("sha256").update(`${contagem.data().count}|${maior}`).digest("hex").slice(0, 16);
}
/** Documentos do dia (formato REST, todas as páginas), da cópia ou relidos do banco. */
async function documentosDoDia(db, data, lerDoBanco) {
    const ref = db.collection(exports.COLECAO_CACHE).doc(data);
    const [versao, copia] = await Promise.all([versaoDoDia(db, data), ref.get()]);
    const salvo = copia.exists ? copia.data() : undefined;
    const criadoEm = salvo?.criadoEm instanceof firestore_1.Timestamp ? salvo.criadoEm.toMillis() : 0;
    if (salvo && salvo.versao === versao && Date.now() - criadoEm < VALIDADE_MS && salvo.gz) {
        const documentos = JSON.parse((0, node_zlib_1.gunzipSync)(Buffer.from(salvo.gz)).toString("utf8"));
        return { documentos, versao, origem: "copia" };
    }
    const documentos = await lerDoBanco();
    // A versão foi lida antes dos documentos: se algo mudar no meio, o próximo
    // pedido vê versão diferente e relê de novo (nunca fica preso numa cópia velha).
    const agora = Date.now();
    await ref.set({
        versao,
        quantidade: documentos.length,
        criadoEm: firestore_1.Timestamp.fromMillis(agora),
        // Para a exclusão automática (TTL) do Firestore, se configurada nesta coleção.
        expiraEm: firestore_1.Timestamp.fromMillis(agora + VALIDADE_MS),
        gz: (0, node_zlib_1.gzipSync)(JSON.stringify(documentos), { level: 9 }),
    });
    return { documentos, versao, origem: "banco" };
}
//# sourceMappingURL=pontoPerformanceCache.js.map