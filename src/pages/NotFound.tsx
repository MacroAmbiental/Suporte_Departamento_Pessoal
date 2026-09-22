import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Página não encontrada</h1>
        <p>O endereço solicitado não existe neste sistema.</p>
        <Link className="btn btn-primary" to="/app">
          Voltar ao painel
        </Link>
      </section>
    </main>
  );
}
