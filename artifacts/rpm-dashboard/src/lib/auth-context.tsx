import { createContext, useContext, ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { withAuth, getAuthToken } from "@/lib/utils";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  isSuperAdmin?: boolean;
  isManager?: boolean;
  approvalWelcomePending?: boolean;
}

interface AuthContextValue {
  user: User | null | undefined;
  isLoading: boolean;
  isPatient: boolean;
  isProvider: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isManager: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: undefined,
  isLoading: true,
  isPatient: false,
  isProvider: false,
  isAdmin: false,
  isSuperAdmin: false,
  isManager: false,
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
    isAdmin: user?.role === "admin",
    isSuperAdmin: Boolean(user?.isSuperAdmin),
    isManager: Boolean(user?.isManager),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
