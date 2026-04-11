import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { schedulerFetch } from "../lib/customFetch";

const API = "/scheduler/api";

interface AuthUser {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    schedulerFetch<{ tutor: AuthUser }>(`${API}/auth/me`, { skipAuthRedirect: true })
      .then((data) => setUser(data.tutor))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string, rememberMe = false) {
    const data = await schedulerFetch<{ tutor: AuthUser }>(`${API}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password, rememberMe }),
    });
    setUser(data.tutor);
  }

  async function signup(name: string, email: string, password: string) {
    const data = await schedulerFetch<{ tutor: AuthUser }>(`${API}/auth/signup`, {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    setUser(data.tutor);
  }

  async function logout() {
    await schedulerFetch(`${API}/auth/logout`, { method: "POST" }).catch(() => {});
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, signup, logout, isLoading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
