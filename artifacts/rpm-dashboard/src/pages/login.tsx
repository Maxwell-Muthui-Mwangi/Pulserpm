import { useState, useRef } from "react";
import { Activity, Stethoscope, User, Loader2, Eye, EyeOff, Mail, CheckCircle2, Clock } from "lucide-react";
import { useLogin, useSignup } from "@workspace/api-client-react";
import { setAuthToken, getAuthToken } from "@/lib/utils";
import { queryClient } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Screen = "form" | "verify" | "pending";
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
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen>("form");
  const [mode, setMode] = useState<Mode>("login");
  const [role, setRole] = useState<Role>("provider");
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingName, setPendingName] = useState("");

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  const loginMutation = useLogin();
  const signupMutation = useSignup();

  const cfg = ROLE_CONFIG[role];
  const RoleIcon = cfg.icon;

  const redirectToApp = (token: string, userName: string, successMsg: string) => {
    setAuthToken(token);
    queryClient.clear();
    toast({ title: successMsg, description: `Signed in as ${userName}` });
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    window.location.href = base + "/";
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { email, password } },
      {
        onSuccess: (res) => redirectToApp(res.token, res.user.name, "Welcome back!"),
        onError: (err: unknown) => {
          const errData = (err as { data?: { status?: string; message?: string; name?: string; email?: string } })?.data;
          if (errData?.status === "pending_approval") {
            setPendingName(errData.name ?? email);
            setPendingEmail(email);
            setScreen("pending");
            return;
          }
          if (errData?.status === "email_unverified") {
            setPendingEmail(errData.email ?? email);
            setScreen("verify");
            toast({ title: "Please verify your email", description: "Enter the 6-digit code we sent you.", variant: "destructive" });
            return;
          }
          const message = errData?.message ?? (err as { message?: string })?.message ?? "Invalid email or password";
          toast({ title: "Login failed", description: message, variant: "destructive" });
        },
      }
    );
  };

  const handleProviderSignup = (e: React.FormEvent) => {
    e.preventDefault();
    signupMutation.mutate(
      { data: { name, email, password, role: "provider", ...(specialty ? { specialty } : {}) } },
      {
        onSuccess: (res) => redirectToApp(res.token, res.user.name, "Account created!"),
        onError: (err: unknown) => {
          const message =
            (err as { data?: { message?: string } })?.data?.message ??
            (err as { message?: string })?.message ??
            "Signup failed";
          toast({ title: "Signup failed", description: message, variant: "destructive" });
        },
      }
    );
  };

  const handlePatientSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/patient-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Signup failed", description: data.message ?? "Something went wrong", variant: "destructive" });
        return;
      }
      setPendingEmail(email);
      setPendingName(name);
      setCode(["", "", "", "", "", ""]);
      setScreen("verify");
    } catch {
      toast({ title: "Signup failed", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      toast({ title: "Invalid code", description: "Please enter all 6 digits.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, code: fullCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Verification failed", description: data.message ?? "Incorrect or expired code.", variant: "destructive" });
        return;
      }
      setScreen("pending");
    } catch {
      toast({ title: "Verification failed", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setResendSent(false);
    try {
      const res = await fetch(`${API_BASE}/api/auth/resend-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      if (res.ok) {
        setResendSent(true);
        setCode(["", "", "", "", "", ""]);
        codeRefs.current[0]?.focus();
        setTimeout(() => setResendSent(false), 5000);
      } else {
        const d = await res.json();
        toast({ title: "Failed to resend", description: d.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to resend", description: "Network error.", variant: "destructive" });
    } finally {
      setResendLoading(false);
    }
  };

  const handleCodeInput = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < 5) codeRefs.current[idx + 1]?.focus();
  };

  const handleCodeKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      codeRefs.current[idx - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      codeRefs.current[5]?.focus();
    }
  };

  const reset = (nextMode: Mode, nextRole?: Role) => {
    setScreen("form");
    setMode(nextMode);
    if (nextRole) setRole(nextRole);
    setEmail(""); setPassword(""); setName(""); setSpecialty("");
    setCode(["", "", "", "", "", ""]);
    setShowPassword(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/10 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob" />
      <div className="absolute top-0 -right-4 w-72 h-72 bg-secondary/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-accent/20 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="sm:mx-auto sm:w-full sm:max-w-md z-10"
      >
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center shadow-inner">
            <Activity className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-bold tracking-tight text-foreground">
          {screen === "verify" ? "Verify your email" : screen === "pending" ? "Account pending" : mode === "login" ? "Sign in to PulseRPM" : "Create your account"}
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {screen === "verify"
            ? `Enter the 6-digit code sent to ${pendingEmail}`
            : screen === "pending"
            ? "Your account is awaiting provider approval"
            : mode === "login" ? cfg.subtitle : "Join PulseRPM to monitor patient health"}
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.1 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10"
      >
        <div className="bg-card py-8 px-4 shadow-xl border border-border/50 sm:rounded-2xl sm:px-10">
          <AnimatePresence mode="wait">

            {/* ── VERIFY EMAIL STEP ── */}
            {screen === "verify" && (
              <motion.div key="verify" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <div className="flex items-center justify-center mb-6">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="h-7 w-7 text-primary" />
                  </div>
                </div>
                <form onSubmit={handleVerify} className="space-y-6">
                  <div>
                    <Label className="text-center block text-sm text-muted-foreground mb-3">Verification code</Label>
                    <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
                      {code.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => { codeRefs.current[idx] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleCodeInput(idx, e.target.value)}
                          onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                          className="w-11 h-14 text-center text-xl font-bold rounded-xl border-2 border-border bg-muted/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                      ))}
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-11 text-base shadow-md" disabled={loading || code.join("").length !== 6}>
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : "Verify Email"}
                  </Button>
                </form>
                <div className="mt-5 text-center space-y-2">
                  {resendSent ? (
                    <p className="text-sm text-success font-medium flex items-center justify-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> New code sent!</p>
                  ) : (
                    <button type="button" onClick={handleResend} disabled={resendLoading} className="text-sm text-primary hover:underline font-medium disabled:opacity-50">
                      {resendLoading ? "Sending..." : "Resend code"}
                    </button>
                  )}
                  <div>
                    <button type="button" onClick={() => reset("signup", "patient")} className="text-xs text-muted-foreground hover:text-foreground">
                      ← Back to sign up
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── PENDING APPROVAL SCREEN ── */}
            {screen === "pending" && (
              <motion.div key="pending" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}
                className="text-center space-y-5"
              >
                <div className="flex items-center justify-center">
                  <div className="h-16 w-16 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
                    <Clock className="h-8 w-8 text-amber-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-lg text-foreground">Email verified!</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Your email has been verified successfully. Your account for <strong>{pendingEmail}</strong> is now awaiting approval from a healthcare provider.
                  </p>
                  <p className="text-xs text-muted-foreground">You'll be able to log in once a provider approves your account.</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-amber-700 font-medium">What happens next?</p>
                  <p className="text-xs text-amber-600 mt-1">A healthcare provider will review your request and add you as a monitored patient. This usually happens within 24 hours.</p>
                </div>
                <button type="button" onClick={() => reset("login", "patient")} className="text-sm text-primary hover:underline font-medium">
                  Back to sign in
                </button>
              </motion.div>
            )}

            {/* ── MAIN FORM ── */}
            {screen === "form" && (
              <motion.div key="form" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
                {/* Sign In / Sign Up toggle */}
                <div className="flex rounded-xl bg-muted p-1 mb-6">
                  {(["login", "signup"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => reset(m)}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {m === "login" ? "Sign In" : "Sign Up"}
                    </button>
                  ))}
                </div>

                {/* Role selector */}
                <div className="mb-5">
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">I am a…</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["provider", "patient"] as const).map((r) => {
                      const c = ROLE_CONFIG[r];
                      const Icon = c.icon;
                      const active = role === r;
                      return (
                        <button key={r} type="button" onClick={() => { setRole(r); setEmail(""); setPassword(""); }}
                          className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${active ? `${c.border} ${c.bg} ${c.accent}` : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${active ? c.accent : ""}`} />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Patient signup note */}
                {mode === "signup" && role === "patient" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="mb-4 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-700"
                  >
                    <p className="font-medium mb-0.5">Patient self-registration</p>
                    <p>After signing up, you'll verify your email with a code, then a provider will approve your account.</p>
                  </motion.div>
                )}

                <form className="space-y-4" onSubmit={
                  mode === "login" ? handleLoginSubmit :
                  role === "patient" ? handlePatientSignup :
                  handleProviderSignup
                }>
                  <AnimatePresence mode="wait">
                    {mode === "signup" && (
                      <motion.div key="signup-name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-4 overflow-hidden">
                        <div>
                          <Label htmlFor="name">Full name</Label>
                          <div className="mt-1.5">
                            <Input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
                              placeholder={role === "provider" ? "Dr. Jane Smith" : "Jane Smith"} className="w-full" />
                          </div>
                        </div>
                        {role === "provider" && (
                          <div>
                            <Label htmlFor="specialty">Specialty <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <div className="mt-1.5">
                              <Input id="specialty" type="text" value={specialty} onChange={(e) => setSpecialty(e.target.value)}
                                placeholder="e.g. Cardiology, Internal Medicine" className="w-full" />
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <Label htmlFor="email">Email address</Label>
                    <div className="mt-1.5">
                      <Input id="email" type="email" autoComplete="email" required value={email}
                        onChange={(e) => setEmail(e.target.value)} placeholder={cfg.emailPlaceholder} className="w-full" />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="password">Password</Label>
                    <div className="mt-1.5 relative">
                      <Input id="password" type={showPassword ? "text" : "password"}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        required minLength={mode === "signup" ? 6 : undefined}
                        value={password} onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••" className="w-full pr-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {mode === "signup" && <p className="mt-1 text-xs text-muted-foreground">Minimum 6 characters</p>}
                  </div>

                  <Button type="submit" className="w-full h-11 text-base shadow-md hover:shadow-lg transition-all mt-2"
                    disabled={loginMutation.isPending || signupMutation.isPending || loading}
                  >
                    {(loginMutation.isPending || signupMutation.isPending || loading) ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{mode === "login" ? "Signing in..." : "Creating account..."}</>
                    ) : mode === "login" ? (
                      <><RoleIcon className="mr-2 h-4 w-4" />Sign in as {cfg.label}</>
                    ) : role === "patient" ? (
                      "Continue — Verify Email"
                    ) : (
                      "Create account"
                    )}
                  </Button>
                </form>

                {mode === "login" && (
                  <motion.div key={role} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
                    className="mt-4 rounded-lg bg-muted/60 px-4 py-3 text-xs text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">Demo — </span>
                    {role === "provider"
                      ? <>sarah.mitchell@rpmhospital.com / <span className="font-mono">password123</span></>
                      : <>eleanor.thompson@email.com / <span className="font-mono">patient123</span></>}
                  </motion.div>
                )}

                <div className="mt-4 text-center text-xs text-muted-foreground">
                  {mode === "login" ? (
                    <>Don't have an account?{" "}<button type="button" onClick={() => reset("signup")} className="text-primary hover:underline font-medium">Sign up for free</button></>
                  ) : (
                    <>Already have an account?{" "}<button type="button" onClick={() => reset("login")} className="text-primary hover:underline font-medium">Sign in</button></>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
