import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { queryClient } from "@/lib/query-client";
import { TimezoneProvider } from "@/lib/timezone-context";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Patients from "@/pages/patients";
import PatientDetail from "@/pages/patient-detail";
import Alerts from "@/pages/alerts";
import Sync from "@/pages/sync";
import SyncHealthwear from "@/pages/sync-healthwear";
import AuditLog from "@/pages/audit-log";
import SecurityFramework from "@/pages/security-framework";
import ThreatDetection from "@/pages/threat-detection";
import BlockchainMonitor from "@/pages/blockchain-monitor";
import SuperAdmin from "@/pages/super-admin";


function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/sync" component={Sync} />
      <Route path="/sync-healthwear" component={SyncHealthwear} />
      <Route path="/" component={Dashboard} />
      <Route path="/patients" component={Patients} />
      <Route path="/patients/:id" component={PatientDetail} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/security" component={AuditLog} />
      <Route path="/security-framework" component={SecurityFramework} />
      <Route path="/threat-detection" component={ThreatDetection} />
      <Route path="/blockchain" component={BlockchainMonitor} />
      <Route path="/super-admin" component={SuperAdmin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TimezoneProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </TimezoneProvider>
    </QueryClientProvider>
  );
}

export default App;
