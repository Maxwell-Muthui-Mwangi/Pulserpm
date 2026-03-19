import { createContext, useContext, ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { withAuth, getAuthToken } from "@/lib/utils";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: User | null | undefined;
  isLoading: boolean;
  isPatient: boolean;
  isProvider: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: undefined,
  isLoading: true,
  isPatient: false,
  isProvider: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const token = getAuthToken();
  const { data: user, isLoading } = useGetMe({
    request: withAuth(),
    query: { queryKey: ["me", token], enabled: !!token } as any,
  });

  const value: AuthContextValue = {
    user: user ?? null,
    isLoading,
    isPatient: user?.role === "patient",
    isProvider: user?.role === "provider",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
