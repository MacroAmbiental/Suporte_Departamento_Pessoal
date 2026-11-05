import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { userHasPermission } from "@/services/accessControl";
import { authenticateSystemUser } from "@/services/domainRepository";
import {
  encerrarSessaoServidor,
  iniciarSessaoServidor,
  LoginRecusadoServidor,
  observarSessao,
  SERVIDOR_INDISPONIVEL,
  uidSessaoSalva,
} from "@/services/firebaseSession";
import type { AppScreen, PermissionAction } from "@/types/domain";
import type { User } from "@/types/domain";

// true = entrou; false = usuário/senha inválidos; texto = outro problema (mostrar na tela).
export type LoginResult = true | false | string;

interface AuthContextValue {
  user: User | null;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  can: (screen: AppScreen, action?: PermissionAction) => boolean;
}

const AUTH_STORAGE_KEY = "macro-dp:user";

function readStoredUser(): User | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as User;
    return Array.isArray(parsed.permissions) ? parsed : null;
  } catch {
    return null;
  }
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());

  useEffect(() => {
    if (user) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      return;
    }

    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [user]);

  // Enquanto o Firebase não carrega a sessão salva, nada é mostrado: as telas
  // só leem o banco depois de saber se a sessão existe e é deste usuário.
  const [sessionChecked, setSessionChecked] = useState(false);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    let active = true;
    void uidSessaoSalva()
      .catch(() => null)
      .then((uid) => {
        if (!active) return;
        // Login antigo (de antes da sessão no servidor) ou de outro usuário:
        // volta para a tela de login.
        if (userRef.current && uid !== userRef.current.id) setUser(null);
        setSessionChecked(true);
      });
    // Sessão encerrada em outra aba: sai aqui também.
    const unsubscribe = observarSessao((firebaseUser) => {
      if (!firebaseUser && userRef.current) setUser(null);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    try {
      // 1º o servidor confere a senha e abre a sessão; só com ela o banco
      // deixa ler o cadastro do usuário.
      const sessionOpened = await iniciarSessaoServidor(username, password);
      if (!sessionOpened) return false;

      const authenticatedUser = await authenticateSystemUser(username, password);
      if (authenticatedUser) {
        setUser(authenticatedUser);
        return true;
      }

      await encerrarSessaoServidor().catch(() => undefined);
      return false;
    } catch (error) {
      console.error("Falha ao autenticar usuário.", error);
      await encerrarSessaoServidor().catch(() => undefined);
      if (error instanceof LoginRecusadoServidor) return error.message;
      return error instanceof Error && error.message === SERVIDOR_INDISPONIVEL ? SERVIDOR_INDISPONIVEL : false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    void encerrarSessaoServidor().catch(() => undefined);
  }, []);

  const can = useCallback((screen: AppScreen, action: PermissionAction = "view") => (
    userHasPermission(user, screen, action)
  ), [user]);

  const value = useMemo<AuthContextValue>(() => ({ user, login, logout, can }), [can, login, logout, user]);

  if (!sessionChecked) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--text-muted, #64748b)" }}>
        Carregando…
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
