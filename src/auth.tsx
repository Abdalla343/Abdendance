import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api, clearToken, getToken, post, setToken, setUnauthorizedHandler } from "./api";
import type { User } from "./types";

interface AuthState { user: User | null; loading: boolean; login(u: string, p: string): Promise<void>; logout(): void }
const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const logout = useCallback(() => { clearToken(); setUser(null); }, []);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);
  useEffect(() => {
    if (!getToken()) return;
    api<{ user: User }>("/api/auth/me").then((r) => setUser(r.user)).catch((e) => { if (e instanceof ApiError && e.status === 401) logout(); }).finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const r = await post<{ token: string; user: User }>("/api/auth/login", { username, password });
    setToken(r.token); setUser(r.user);
  }, []);
  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
