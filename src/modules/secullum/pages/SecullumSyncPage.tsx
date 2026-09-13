import { useState } from "react";
import { useSecullum } from "../hooks/useSecullum";

export default function SecullumSyncPage() {
    const { loading, result, error, sync } = useSecullum();

    const [inicio, setInicio] = useState("2026-01-01");
    const [fim, setFim] = useState("2026-12-31");

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        sync(inicio, fim);
    }

    return (
        <div style={{ padding: "20px" }}>
            <h1>Sincronizar Batidas Secullum</h1>

            <form
                onSubmit={handleSubmit}
                style={{
                    marginTop: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    maxWidth: "300px",
                }}
            >
                <label>
                    Data Inicial:
                    <input
                        type="date"
                        value={inicio}
                        onChange={(e) => setInicio(e.target.value)}
                        style={{ padding: "8px", width: "100%" }}
                    />
                </label>

                <label>
                    Data Final:
                    <input
                        type="date"
                        value={fim}
                        onChange={(e) => setFim(e.target.value)}
                        style={{ padding: "8px", width: "100%" }}
                    />
                </label>

                <button
                    type="submit"
                    style={{
                        padding: "10px 20px",
                        background: "#2563eb",
                        color: "white",
                        borderRadius: "6px",
                        border: "none",
                        cursor: "pointer",
                        marginTop: "10px",
                    }}
                >
                    Sincronizar
                </button>
            </form>

            {loading && <p style={{ marginTop: "20px" }}>Carregando...</p>}

            {error && (
                <p style={{ marginTop: "20px", color: "red" }}>
                    Erro: {error}
                </p>
            )}

            {result && (
                <div style={{ marginTop: "20px" }}>
                    <h2>Resultado</h2>
                    <pre
                        style={{
                            background: "#f3f4f6",
                            padding: "20px",
                            borderRadius: "8px",
                            overflowX: "auto",
                        }}
                    >
                        {JSON.stringify(result, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
