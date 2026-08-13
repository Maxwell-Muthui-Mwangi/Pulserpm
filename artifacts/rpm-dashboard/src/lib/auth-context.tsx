import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { withAuth, getAuthToken } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const PATIENT_MODE_KEY = "rpm_admin_patient_mode";
const PATIENT_ID_KEY   = "rpm_admin_patient_id";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  isSuperAdmin?: boolean;
  adminRole?: string;      // e.g. "Security Admin", "God Level" — set by bootstrap
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
  /** Display label for super admins: "Security Admin", "God Level", etc. */
  adminRole: string | undefined;
  isManager: boolean;
  /** True when super admin has toggled into patient view */
  adminPatientMode: boolean;
  /** Patient record ID linked to the super admin's email */
  adminPatientId: number | null;
  setAdminPatientMode: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: undefined,
  isLoading: true,
  isPatient: false,
  isProvider: false,
  isAdmin: false,
  isSuperAdmin: false,
  adminRole: undefined,
  isManager: false,
  adminPatientMode: false,
  adminPatientId: null,
  setAdminPatientMode: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const token = getAuthToken();
  const { data: user, isLoading } = useGetMe({
    request: withAuth(),
    query: { queryKey: ["me", token], enabled: !!token } as any,
  });

  const [adminPatientMode, setAdminPatientModeState] = useState<boolean>(
    () => localStorage.getItem(PATIENT_MODE_KEY) === "true"
  );
  const [adminPatientId, setAdminPatientId] = useState<number | null>(() => {
    const stored = localStorage.getItem(PATIENT_ID_KEY);
    return stored ? Number(stored) : null;
  });

  // Discover the super admin's linked patient record (matched by email)
  useEffect(() => {
    if (!user?.isSuperAdmin || !token) return;
    fetch(`${API_BASE}/api/admin/my-patient-profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.id) {
          setAdminPatientId(data.id);
          localStorage.setItem(PATIENT_ID_KEY, String(data.id));
        }
      })
      .catch(() => {});
  }, [user?.isSuperAdmin, token]);

  // Clear patient mode if user logs out
  useEffect(() => {
    if (!user && !isLoading) {
      setAdminPatientModeState(false);
      localStorage.removeItem(PATIENT_MODE_KEY);
    }
  }, [user, isLoading]);

  const setAdminPatientMode = (v: boolean) => {
    localStorage.setItem(PATIENT_MODE_KEY, String(v));
    setAdminPatientModeState(v);
  };

  const value: AuthContextValue = {
    user: user ?? null,
    isLoading,
    isPatient: user?.role === "patient",
    isProvider: user?.role === "provider",
    isAdmin: user?.role === "admin",
    isSuperAdmin: Boolean(user?.isSuperAdmin),
    adminRole: user?.adminRole,
    isManager: Boolean(user?.isManager),
    adminPatientMode,
    adminPatientId,
    setAdminPatientMode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
