import { useState } from "react";
import { secullumSync } from "../api/secullum.client";

export function useSecullum() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    async function sync(inicio: string, fim: string) {
        try {
            setLoading(true);
            setError(null);

            const data = await secullumSync(inicio, fim);
            setResult(data);

        } catch (err: any) {
            console.error("Erro ao sincronizar Secullum:", err);
            setError("Falha ao consultar dados da Secullum");
        } finally {
            setLoading(false);
        }
    }

    return {
        loading,
        result,
        error,
        sync,
    };
}
