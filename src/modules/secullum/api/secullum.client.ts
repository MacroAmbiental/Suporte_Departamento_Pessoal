import { getFunctions, httpsCallable } from "firebase/functions";

export async function secullumSync(inicio: string, fim: string) {
    const functions = getFunctions();
    const fn = httpsCallable(functions, "obterBatidas");

    const result = await fn({ inicio, fim });
    return result.data;
}
