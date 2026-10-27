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
