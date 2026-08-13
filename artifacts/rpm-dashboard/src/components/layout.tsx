import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Activity, 
  Users, 
  AlertCircle, 
  LayoutDashboard, 
  LogOut,
  Bell,
  Search,
  Menu,
  UserCircle,
  AlertTriangle,
  X,
  ChevronRight,
  CheckCircle2,
  HeartPulse,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Link2,
  Globe,
} from "lucide-react";
import { removeAuthToken, withAuth, getAuthToken } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Crown, Stethoscope, BrainCircuit } from "lucide-react";
import { useListAlerts } from "@workspace/api-client-react";
import { queryClient } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTimezone, TIMEZONE_OPTIONS } from "@/lib/timezone-context";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, isLoading, isPatient, isAdmin, isSuperAdmin,
          adminPatientMode, adminPatientId, setAdminPatientMode } = useAuth();
  const { timezone, setTimezone, fmt } = useTimezone();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  const showWelcomePopup = isPatient && !welcomeDismissed && !!user?.approvalWelcomePending;

  const dismissWelcome = async () => {
    setWelcomeDismissed(true);
    try {
      await fetch(`${API_BASE}/api/auth/dismiss-welcome`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
    } catch { /* ignore */ }
  };

  const { data: dangerAlerts } = useListAlerts(
    { status: "active", limit: 20 },
    { request: withAuth(), query: { enabled: !isPatient, refetchInterval: 30_000 } as any }
  );

  const filteredDangerAlerts = (dangerAlerts ?? []).filter(
    (a) => a.severity === "critical" || a.severity === "warning"
  );
  const dangerCount = filteredDangerAlerts.length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifOpen]);

  const handleLogout = () => {
    queryClient.clear();
    removeAuthToken();
    setLocation("/login");
  };

  // Nav items when super admin is in patient-view mode
  const adminAsPatientNavItems = [
    { href: adminPatientId ? `/patients/${adminPatientId}` : "/", label: "My Patient Profile", icon: UserCircle },
    { href: "/alerts", label: "My Alerts", icon: AlertCircle },
    { href: adminPatientId ? `/patients/${adminPatientId}?tab=device` : "/", label: "Connect Device", icon: HeartPulse },
  ];

  const providerNavItems = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/patients", label: "Patients", icon: Users },
    ...(isSuperAdmin ? [{ href: "/super-admin?section=healthcare-providers", label: "Healthcare Providers", icon: Stethoscope }] : []),
    { href: "/alerts", label: "Alerts", icon: AlertCircle },
    // Security / admin-only items — hidden from regular providers
    ...(isAdmin ? [
      { href: "/security", label: "Audit Log", icon: Shield },
      { href: "/threat-detection", label: "MLNN Model Anomaly Detection", icon: ShieldAlert },
      ...(isSuperAdmin ? [{ href: "/super-admin?section=mlnn-research", label: "MODEL PARAMETERS", icon: BrainCircuit }] : []),
      { href: "/blockchain", label: "Blockchain Monitor", icon: Link2 },
      { href: "/security-framework", label: "Security Framework", icon: ShieldCheck },
    ] : []),
    ...(isAdmin ? [{ href: "/super-admin", label: isSuperAdmin ? "Super Admin" : "Admin Panel", icon: Crown, admin: true }] : []),
  ];

  const patientNavItems = [
    { href: "/", label: "My Dashboard", icon: LayoutDashboard },
    { href: user ? `/patients/${user.id}` : "/", label: "My Profile", icon: UserCircle },
    { href: "/alerts", label: "My Alerts", icon: AlertCircle },
    { href: user ? `/patients/${user.id}?tab=device` : "/", label: "Connect Smartwatch", icon: HeartPulse },
  ];

  const navItems = isPatient
    ? patientNavItems
    : (isSuperAdmin && adminPatientMode)
      ? adminAsPatientNavItems
      : providerNavItems;

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [isLoading, user, setLocation]);

  // When super admin is in patient mode and lands on "/", redirect to their patient profile
  useEffect(() => {
    if (isSuperAdmin && adminPatientMode && adminPatientId && location === "/") {
      setLocation(`/patients/${adminPatientId}`);
    }
  }, [isSuperAdmin, adminPatientMode, adminPatientId, location, setLocation]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* One-time welcome popup for newly approved patients */}
      {showWelcomePopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-6 pt-8 pb-6 text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-success/15 border-2 border-success/30 flex items-center justify-center">
                  <HeartPulse className="h-8 w-8 text-success" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-foreground">Welcome to PulseRPM!</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                You've been approved as a monitored patient by your healthcare provider. Your health dashboard is now active.
              </p>
            </div>
            <div className="px-6 pb-6 space-y-3">
              <div className="bg-success/8 border border-success/20 rounded-xl px-4 py-3 flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <p className="text-xs text-success-foreground">Your vitals will be monitored and your provider will be alerted if anything needs attention.</p>
              </div>
              <Button className="w-full h-11 shadow-md" onClick={dismissWelcome}>
                Get Started
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card shadow-sm z-10">
        <div className="h-16 flex items-center px-6 border-b border-border/50">
          <Activity className="h-6 w-6 text-primary mr-2" />
          <span className="font-display font-bold text-lg tracking-tight text-foreground">
            Pulse<span className="text-primary">RPM</span>
          </span>
        </div>

        {/* Patient-mode banner — visible only when super admin is in patient view */}
        {isSuperAdmin && adminPatientMode && (
          <div className="px-3 py-2.5 bg-violet-500/10 border-b border-violet-500/20">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">Patient View Active</span>
            </div>
            <button
              onClick={() => { setAdminPatientMode(false); setLocation("/"); }}
              className="w-full flex items-center justify-center gap-1.5 h-7 px-3 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/35 rounded-lg text-[11px] text-violet-200 font-semibold transition-colors"
            >
              <Crown className="h-3 w-3" /> ⚡ Return to Admin Mode
            </button>
          </div>
        )}
        
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Menu
          </div>
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const isAdminItem = (item as any).admin === true;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`
                  flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 group
                  ${isAdminItem
                    ? isActive
                      ? "bg-amber-500/15 text-amber-400 font-medium border border-amber-500/20"
                      : "text-amber-600 hover:bg-amber-500/10 hover:text-amber-400 border border-amber-500/10"
                    : isActive 
                      ? "bg-primary/10 text-primary font-medium" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"}
                `}
              >
                <item.icon className={`h-5 w-5 mr-3 ${isAdminItem ? "text-amber-500" : isActive ? "text-primary" : "group-hover:text-foreground"}`} />
                {item.label}
                {isAdminItem && (
                  isSuperAdmin ? (
                    <span className="ml-auto text-[9px] font-bold bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full border border-violet-500/30">
                      SUPER ADMIN
                    </span>
                  ) : (
                    <span className="ml-auto text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
                      ADMIN
                    </span>
                  )
                )}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center p-3 rounded-xl bg-muted/50 mb-3">
            <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold mr-3">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium text-foreground truncate">{user.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{user.role}</div>
            </div>
          </div>

          {/* Timezone picker */}
          <div className="flex items-center gap-2 px-1 mb-2">
            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="flex-1 text-xs bg-transparent border-none outline-none text-muted-foreground hover:text-foreground cursor-pointer truncate"
              title="Display timezone"
            >
              {TIMEZONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Super admin patient-mode toggle */}
          {isSuperAdmin && !adminPatientMode && (
            <button
              onClick={() => {
                setAdminPatientMode(true);
                setLocation(adminPatientId ? `/patients/${adminPatientId}` : "/");
              }}
              className="w-full flex items-center gap-2 px-3 py-2 mb-1 rounded-xl text-[12px] text-violet-400 hover:bg-violet-500/10 border border-violet-500/15 hover:border-violet-500/30 transition-colors"
            >
              <UserCircle className="h-4 w-4 shrink-0" />
              <span>Switch to Patient View</span>
            </button>
          )}

          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-border/50 bg-card shadow-sm z-10 shrink-0">
          <div className="flex items-center md:hidden">
            <Activity className="h-6 w-6 text-primary mr-2" />
            <span className="font-display font-bold text-lg text-foreground">PulseRPM</span>
          </div>
          
          <div className="hidden md:flex items-center bg-muted/50 rounded-full px-3 py-1.5 w-64 border border-border/50 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <Search className="h-4 w-4 text-muted-foreground mr-2" />
            <input 
              type="text" 
              placeholder={isPatient ? "Search alerts..." : "Search patients..."} 
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center space-x-3">
            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {dangerCount > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-destructive border-2 border-card flex items-center justify-center">
                    <span className="text-[9px] font-bold text-white leading-none">
                      {dangerCount > 9 ? "9+" : dangerCount}
                    </span>
                  </span>
                )}
              </button>

              {/* Notification panel */}
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-96 max-h-[480px] bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-50 flex flex-col">
                  {/* Panel header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-foreground" />
                      <span className="font-semibold text-sm text-foreground">
                        {isPatient ? "My Notifications" : "Patient Alerts"}
                      </span>
                      {dangerCount > 0 && (
                        <Badge variant="critical" className="text-[10px] px-1.5 py-0 h-4">
                          {dangerCount}
                        </Badge>
                      )}
                    </div>
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Alert list */}
                  <div className="overflow-y-auto flex-1">
                    {filteredDangerAlerts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                        <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center mb-3">
                          <Bell className="h-5 w-5 text-success" />
                        </div>
                        <p className="text-sm font-medium text-foreground">No danger alerts</p>
                        <p className="text-xs text-muted-foreground mt-1">All patients are currently stable.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/40">
                        {filteredDangerAlerts.map((alert) => (
                          <Link
                            key={alert.id}
                            href={`/patients/${alert.patientId}`}
                            onClick={() => setNotifOpen(false)}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
                          >
                            <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                              alert.severity === "critical" ? "bg-destructive animate-pulse" : "bg-warning"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-medium text-sm text-foreground truncate">
                                  {(alert as any).patientName ?? "Patient"}
                                </span>
                                <Badge
                                  variant={alert.severity === "critical" ? "critical" : "amber"}
                                  className="text-[9px] px-1 py-0 h-3.5 shrink-0"
                                >
                                  {alert.severity === "critical" ? "CRITICAL" : "WARNING"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                {alert.triggeredAt && !isNaN(new Date(alert.triggeredAt).getTime())
                                  ? fmt(new Date(alert.triggeredAt), "MMM d, h:mm a")
                                  : "—"}
                                {" · "}{(alert.vitalType ?? "").replace("_", " ")}
                              </p>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 mt-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Panel footer */}
                  <div className="px-4 py-3 border-t border-border/50 shrink-0">
                    <Link
                      href="/alerts"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      View all alerts
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <button className="md:hidden p-2 rounded-md text-muted-foreground hover:bg-muted">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
