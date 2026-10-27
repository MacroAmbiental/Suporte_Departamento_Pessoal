
/**
 * Autenticacao temporaria de teste para chamadas Secullum.
 *
 * Ambientes permitidos:
 * - http://localhost:5173
 * - http://127.0.0.1:5173
 * - https://suportes.onrender.com
 *
 * A senha e solicitada no momento do salvamento.
 * Nunca deve ser incorporada ao bundle do frontend.
 *
 * ATENCAO:
 * A restricao de hostname no frontend nao substitui
 * a autorizacao realizada pela Cloud Function.
 */

import { initializeApp, getApps } from "firebase/app";
import {
    getAuth,
    inMemoryPersistence,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/services/firebase";

const APP_TESTE = "secullum-post-piloto-isolado";

const EMAIL_TESTE = "yuri.takeo.miyazaki@gmail.com";
const UID_TESTE = "TkdbEBo0WPcVFGM8AsMiDWuaCqG3";

const HOSTS_PERMITIDOS = new Set([
    "localhost",
    "127.0.0.1",
    "suportes.onrender.com",
]);

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

export async function gravarFlagsComContaTecnica(
    input: FlagsInput
): Promise<FlagsResponse> {
    const hostname = window.location.hostname;

    if (!HOSTS_PERMITIDOS.has(hostname)) {
        throw new Error(
            `Integracao tecnica de teste nao permitida neste dominio: ${hostname}`
        );
    }

    if (!firebaseApp) {
        throw new Error("Firebase nao inicializado.");
    }

    const senha = window.prompt(
        "Senha da conta tecnica Firebase para confirmar o POST real no Secullum:"
    );

    if (!senha) {
        throw new Error(
            "POST cancelado: autenticacao tecnica nao informada."
        );
    }

    const app =
        getApps().find((app) => app.name === APP_TESTE) ??
        initializeApp(firebaseApp.options, APP_TESTE);

    const auth = getAuth(app);

    await setPersistence(auth, inMemoryPersistence);

    try {
        if (auth.currentUser) {
            await signOut(auth);
        }

        const login = await signInWithEmailAndPassword(
            auth,
            EMAIL_TESTE,
            senha
        );

        const tokenResult = await login.user.getIdTokenResult();

        const claim = tokenResult.claims.secullumNeutroWrite;

        if (
            login.user.uid !== UID_TESTE ||
            claim !== true
        ) {
            throw new Error(
                "Conta tecnica sem autorizacao para atualizar flags no Secullum."
            );
        }

        const callable = httpsCallable<
            FlagsInput,
            FlagsResponse
        >(
            getFunctions(app, "southamerica-east1"),
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
    } finally {
        await signOut(auth).catch(() => undefined);
    }
}
