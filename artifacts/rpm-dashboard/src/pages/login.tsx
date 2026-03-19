import { useState } from "react";
import { useLocation } from "wouter";
import { Activity, Stethoscope, User, Loader2, Eye, EyeOff } from "lucide-react";
import { useLogin, useSignup } from "@workspace/api-client-react";
import { setAuthToken } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

type Mode = "login" | "signup";
type Role = "provider" | "patient";

const ROLE_CONFIG = {
  provider: {
    label: "Healthcare Provider",
    icon: Stethoscope,
    subtitle: "Provider Portal — Monitor your patients remotely",
    emailPlaceholder: "you@hospital.org",
    accent: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary",
  },
  patient: {
    label: "Patient",
    icon: User,
    subtitle: "Patient Portal — View your health at a glance",
    emailPlaceholder: "you@email.com",
    accent: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-500",
  },
} as const;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("provider");
  const [specialty, setSpecialty] = useState("");

  const loginMutation = useLogin();
  const signupMutation = useSignup();

  const isPending = loginMutation.isPending || signupMutation.isPending;
  const cfg = ROLE_CONFIG[role];
  const RoleIcon = cfg.icon;

  const onSuccess = (token: string, userName: string) => {
    setAuthToken(token);
    toast({
      title: mode === "login" ? "Welcome back!" : "Account created!",
      description: `Signed in as ${userName}`,
    });
    setLocation("/");
  };

  const onError = (err: unknown) => {
    const message =
      (err as { data?: { message?: string }; message?: string })?.data?.message ??
      (err as { message?: string })?.message ??
      "Something went wrong";
    toast({
      title: mode === "login" ? "Login failed" : "Signup failed",
      description: message,
      variant: "destructive",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      loginMutation.mutate(
        { data: { email, password } },
        {
          onSuccess: (res) => onSuccess(res.token, res.user.name),
          onError,
        }
      );
    } else {
      signupMutation.mutate(
        { data: { name, email, password, role, ...(role === "provider" && specialty ? { specialty } : {}) } },
        {
          onSuccess: (res) => onSuccess(res.token, res.user.name),
          onError,
        }
      );
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setEmail("");
    setPassword("");
    setName("");
    setSpecialty("");
    setShowPassword(false);
  };

  const switchRole = (next: Role) => {
    setRole(next);
    setEmail("");
    setPassword("");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/10 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob" />
      <div className="absolute top-0 -right-4 w-72 h-72 bg-secondary/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-accent/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="sm:mx-auto sm:w-full sm:max-w-md z-10"
      >
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center shadow-inner">
            <Activity className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-bold tracking-tight text-foreground">
          {mode === "login" ? "Sign in to PulseRPM" : "Create your account"}
        </h2>
        <AnimatePresence mode="wait">
          <motion.p
            key={`${mode}-${role}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="mt-2 text-center text-sm text-muted-foreground"
          >
            {mode === "login" ? cfg.subtitle : "Join PulseRPM to monitor patient health"}
          </motion.p>
        </AnimatePresence>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10"
      >
        <div className="bg-card py-8 px-4 shadow-xl border border-border/50 sm:rounded-2xl sm:px-10">
          {/* Sign In / Sign Up toggle */}
          <div className="flex rounded-xl bg-muted p-1 mb-6">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === "login"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === "signup"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Role selector — shown on both login and signup */}
          <div className="mb-5">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              I am a…
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["provider", "patient"] as const).map((r) => {
                const c = ROLE_CONFIG[r];
                const Icon = c.icon;
                const active = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => switchRole(r)}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      active
                        ? `${c.border} ${c.bg} ${c.accent}`
                        : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? c.accent : ""}`} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <AnimatePresence mode="wait">
              {mode === "signup" && (
                <motion.div
                  key="signup-fields"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div>
                    <Label htmlFor="name">Full name</Label>
                    <div className="mt-1.5">
                      <Input
                        id="name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={role === "provider" ? "Dr. Jane Smith" : "Jane Smith"}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {role === "provider" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <Label htmlFor="specialty">
                        Specialty{" "}
                        <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <div className="mt-1.5">
                        <Input
                          id="specialty"
                          type="text"
                          value={specialty}
                          onChange={(e) => setSpecialty(e.target.value)}
                          placeholder="e.g. Cardiology, Internal Medicine"
                          className="w-full"
                        />
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <Label htmlFor="email">Email address</Label>
              <div className="mt-1.5">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={cfg.emailPlaceholder}
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="mt-1.5 relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "signup" ? 6 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === "signup" && (
                <p className="mt-1 text-xs text-muted-foreground">Minimum 6 characters</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base shadow-md hover:shadow-lg transition-all mt-2"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === "login" ? "Signing in..." : "Creating account..."}
                </>
              ) : mode === "login" ? (
                <>
                  <RoleIcon className="mr-2 h-4 w-4" />
                  Sign in as {cfg.label}
                </>
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          {/* Demo hint for sign-in */}
          {mode === "login" && (
            <motion.div
              key={role}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="mt-4 rounded-lg bg-muted/60 px-4 py-3 text-xs text-muted-foreground"
            >
              <span className="font-medium text-foreground">Demo — </span>
              {role === "provider" ? (
                <>sarah.mitchell@rpmhospital.com / <span className="font-mono">password123</span></>
              ) : (
                <>eleanor.thompson@email.com / <span className="font-mono">patient123</span></>
              )}
            </motion.div>
          )}

          <div className="mt-4 text-center text-xs text-muted-foreground">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="text-primary hover:underline font-medium"
                >
                  Sign up for free
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-primary hover:underline font-medium"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
