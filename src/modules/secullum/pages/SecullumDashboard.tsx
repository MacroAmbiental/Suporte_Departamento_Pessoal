import { useSecullum } from "../hooks/useSecullum";

export default function SecullumDashboard() {
    const { loading, result, error, sync } = useSecullum();

    function handleSync() {
        // Aqui você pode trocar as datas depois
        sync("2026-01-01", "2026-12-31");
    }

    return (
        <div style={{ padding: "20px" }}>
            <h1>Integração Secullum</h1>

            <button
                onClick={handleSync}
                style={{
                    padding: "10px 20px",
                    background: "#4f46e5",
                    color: "white",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    marginTop: "10px",
                }}
            >
                Sincronizar Batidas
            </button>

            {loading && <p style={{ marginTop: "20px" }}>Carregando dados...</p>}

            {error && (
                <p style={{ marginTop: "20px", color: "red" }}>
                    Erro: {error}
                </p>
            )}

            {result && (
                <div style={{ marginTop: "20px" }}>
                    <h2>Resultado da Sincronização</h2>
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
