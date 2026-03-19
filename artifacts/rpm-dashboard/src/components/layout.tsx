import { ReactNode, useEffect } from "react";
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
  UserCircle
} from "lucide-react";
import { removeAuthToken } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, isLoading, isPatient } = useAuth();

  const handleLogout = () => {
    removeAuthToken();
    setLocation("/login");
  };

  const providerNavItems = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/patients", label: "Patients", icon: Users },
    { href: "/alerts", label: "Alerts", icon: AlertCircle },
  ];

  const patientNavItems = [
    { href: "/", label: "My Dashboard", icon: LayoutDashboard },
    { href: user ? `/patients/${user.id}` : "/", label: "My Profile", icon: UserCircle },
    { href: "/alerts", label: "My Alerts", icon: AlertCircle },
  ];

  const navItems = isPatient ? patientNavItems : providerNavItems;

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [isLoading, user, setLocation]);

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
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card shadow-sm z-10">
        <div className="h-16 flex items-center px-6 border-b border-border/50">
          <Activity className="h-6 w-6 text-primary mr-2" />
          <span className="font-display font-bold text-lg tracking-tight text-foreground">
            Pulse<span className="text-primary">RPM</span>
          </span>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          <div className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Menu
          </div>
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`
                  flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 group
                  ${isActive 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"}
                `}
              >
                <item.icon className={`h-5 w-5 mr-3 ${isActive ? "text-primary" : "group-hover:text-foreground"}`} />
                {item.label}
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
              placeholder="Search patients..." 
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center space-x-3">
            <button className="relative p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive border-2 border-card"></span>
            </button>
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
