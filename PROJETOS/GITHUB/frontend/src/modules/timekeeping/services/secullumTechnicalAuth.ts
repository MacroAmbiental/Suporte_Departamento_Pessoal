/**
 * Gravação de Neutro/Compensado no Secullum pela function
 * "atualizarFlagsSecullum".
 *
 * Usa a sessão do usuário logado (aberta pelo entrarDP no login); a function
 * confere no servidor se ele tem permissão de editar o Controle de Ponto.
 * (Até 27/10/2026 usava uma conta técnica de teste com senha digitada.)
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/services/firebase";
import { exigirSessaoServidor } from "@/services/firebaseSession";
import type { AttendanceStatus } from "@/types/domain";

type FlagsInput = {
    cpf: string;
    data: string;
    neutro: boolean;
    compensado: boolean;
};

type FlagsResponse = {
    ok: boolean;
    flagsPersistidas: boolean;
    alteracoesColaterais?: string[];
};

export async function gravarFlagsSecullum(
    userId: string | undefined,
    input: FlagsInput
): Promise<FlagsResponse> {
    if (!firebaseApp) {
        throw new Error("Firebase nao inicializado.");
    }

    await exigirSessaoServidor(userId);

    const callable = httpsCallable<
        FlagsInput,
        FlagsResponse
    >(
        getFunctions(firebaseApp, "southamerica-east1"),
        "atualizarFlagsSecullum"
    );

    const resultado = await callable(input);

    if (
        !resultado.data.ok ||
        !resultado.data.flagsPersistidas
    ) {
        throw new Error(
            "Secullum nao confirmou a persistencia das flags."
        );
    }

    return resultado.data;
}

/**
 * Folga / Falta / Atestado do Ponto viram justificativa no cartão ponto do
 * Secullum (function "enviarJustificativasSecullum", de-para de 28/10/2026).
 * A function repete estas regras no servidor; aqui servem para montar a lista
 * que o usuário confirma antes de salvar o dia.
 */
export const JUSTIFICATIVA_SECULLUM_POR_STATUS: Partial<Record<AttendanceStatus, string>> = {
    day_off: "FOLGA",
    absence_confirmed: "FALTA",
    medical_certificate: "AT.MED",
};

// Só dias a partir da entrada no ar (igual à function).
export const INICIO_JUSTIFICATIVAS_SECULLUM = "2026-10-29";

type JustificativasInput = {
    data: string;
    itens: Array<{ cpf: string; status: AttendanceStatus; grupos: number[] }>;
};

export type ResultadoJustificativaSecullum = {
    cpf: string;
    enviados: number[];
    jaEstavam: number[];
    conflitos: Array<{ grupo: number; valor: string }>;
    semRegistro?: boolean;
    erro?: string;
    conferido: boolean | null;
};

export async function enviarJustificativasSecullum(
    userId: string | undefined,
    input: JustificativasInput
): Promise<ResultadoJustificativaSecullum[]> {
    if (!firebaseApp) {
        throw new Error("Firebase nao inicializado.");
    }

    await exigirSessaoServidor(userId);

    const callable = httpsCallable<
        JustificativasInput,
        { resultados: ResultadoJustificativaSecullum[] }
    >(
        getFunctions(firebaseApp, "southamerica-east1"),
        "enviarJustificativasSecullum",
        { timeout: 130000 }
    );

    const resultado = await callable(input);
    return resultado.data.resultados || [];
}
