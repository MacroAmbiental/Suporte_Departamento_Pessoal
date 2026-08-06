import { LogIn } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { normalizeUsername } from "@/services/accessControl";
import bg from "@/assets/images/Capa_global.png";
import logo from "@/assets/images/logo-empresas.png";
import "./login.css";

export default function Login() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/app", { replace: true });
  }, [navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const accepted = await login(username, password);

    if (accepted) {
      navigate("/app", { replace: true });
      return;
    }

    setError("Usuário ou senha inválidos.");
    setLoading(false);
  }

  return (
    <main className="login-page" style={{ backgroundImage: `linear-gradient(rgba(9, 22, 34, 0.66), rgba(9, 22, 34, 0.82)), url(${bg})` }}>
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} alt="Macro Ambiental, Dinâmica Construções e RC Silva" />

        <label>
          <input
            value={username}
            onChange={(event) => setUsername(normalizeUsername(event.target.value))}
            autoComplete="username"
            maxLength={7}
            placeholder="Usuário"
          />
        </label>

        <label>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Senha"
            type="password"
          />
        </label>

        {error ? <span className="login-error">{error}</span> : null}

        <button className="btn btn-primary" type="submit" disabled={loading}>
          <LogIn size={17} />
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
