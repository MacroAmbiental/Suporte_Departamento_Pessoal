import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { userHasPermission } from "@/services/accessControl";
import { authenticateSystemUser } from "@/services/domainRepository";
import type { AppScreen, PermissionAction } from "@/types/domain";
import type { User } from "@/types/domain";

interface AuthContextValue {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
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

  const login = useCallback(async (username: string, password: string) => {
    try {
      const authenticatedUser = await authenticateSystemUser(username, password);

      if (authenticatedUser) {
        setUser(authenticatedUser);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Falha ao autenticar usuário.", error);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  const can = useCallback((screen: AppScreen, action: PermissionAction = "view") => (
    userHasPermission(user, screen, action)
  ), [user]);

  const value = useMemo<AuthContextValue>(() => ({ user, login, logout, can }), [can, login, logout, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
