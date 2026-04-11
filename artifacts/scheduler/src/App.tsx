import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import DashboardPage from "./pages/DashboardPage";
import CalendarPage from "./pages/CalendarPage";
import WeeklyPage from "./pages/WeeklyPage";
import DailyPage from "./pages/DailyPage";
import StudentsPage from "./pages/StudentsPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import ClassesPage from "./pages/ClassesPage";
import PaymentsPage from "./pages/PaymentsPage";
import SearchPage from "./pages/SearchPage";
import StudentProfilePage from "./pages/StudentProfilePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const BASE = import.meta.env.BASE_URL;

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#0f1c2e" }}>
      <div style={{ width: 32, height: 32, border: "2px solid rgba(245,200,66,0.3)", borderTopColor: "#f5c842", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="login" replace />;
  return <Layout>{children}</Layout>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="login" element={<AuthRoute><LoginPage /></AuthRoute>} />
        <Route path="signup" element={<AuthRoute><SignupPage /></AuthRoute>} />
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="daily" element={<ProtectedRoute><DailyPage /></ProtectedRoute>} />
        <Route path="weekly" element={<ProtectedRoute><WeeklyPage /></ProtectedRoute>} />
        <Route path="calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
        <Route path="assignments" element={<ProtectedRoute><AssignmentsPage /></ProtectedRoute>} />
        <Route path="students" element={<ProtectedRoute><StudentsPage /></ProtectedRoute>} />
        <Route path="classes" element={<ProtectedRoute><ClassesPage /></ProtectedRoute>} />
        <Route path="payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
        <Route path="search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
        <Route path="students/:studentId" element={<ProtectedRoute><StudentProfilePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={BASE}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
