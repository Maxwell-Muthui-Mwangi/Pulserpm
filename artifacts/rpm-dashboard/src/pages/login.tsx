import { useState, useRef } from "react";
import { Activity, Stethoscope, User, Loader2, Eye, EyeOff, Mail, CheckCircle2, Clock, KeyRound, ShieldCheck } from "lucide-react";
import { useLogin } from "@workspace/api-client-react";
import { setAuthToken, getAuthToken } from "@/lib/utils";
import { queryClient } from "@/lib/query-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Screen = "form" | "verify" | "pending" | "verified" | "forgot" | "forgot-verify" | "reset";
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
  const [fallbackCode, setFallbackCode] = useState<string | null>(null);
  const [verifyingRole, setVerifyingRole] = useState<Role>("patient");

  // Forgot-password flow state
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode] = useState<string>(""); // captured after OTP entry
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  const loginMutation = useLogin();

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
            // Providers wait for admin approval (verified screen); patients wait for provider (pending screen)
            setScreen(errData?.role === "provider" ? "verified" : "pending");
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

  const handleProviderSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role: "provider", ...(specialty ? { specialty } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Signup failed", description: data.message ?? "Something went wrong", variant: "destructive" });
        return;
      }
      setPendingEmail(email);
      setPendingName(name);
      setCode(["", "", "", "", "", ""]);
      setFallbackCode(data.fallbackCode ?? null);
      setVerifyingRole("provider");
      setScreen("verify");
    } catch {
      toast({ title: "Signup failed", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
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
      setFallbackCode(data.fallbackCode ?? null);
      setVerifyingRole("patient");
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
      const endpoint = verifyingRole === "provider"
        ? `${API_BASE}/api/auth/provider/verify-email`
        : `${API_BASE}/api/auth/verify-email`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, code: fullCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Verification failed", description: data.message ?? "Incorrect or expired code.", variant: "destructive" });
        return;
      }
      // Providers: email verified but now awaiting admin approval (verified screen)
      // Patients: email verified, awaiting provider approval (pending screen)
      setScreen(verifyingRole === "provider" ? "verified" : "pending");
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
        const d = await res.json();
        setFallbackCode(d.fallbackCode ?? null);
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

  // ── Forgot password handlers ────────────────────────────────────────────────

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Request failed", description: data.message ?? "Something went wrong.", variant: "destructive" });
        return;
      }
      setCode(["", "", "", "", "", ""]);
      setFallbackCode(data.fallbackCode ?? null);
      setScreen("forgot-verify");
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } catch {
      toast({ title: "Request failed", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length !== 6) {
      toast({ title: "Invalid code", description: "Please enter all 6 digits.", variant: "destructive" });
      return;
    }
    // Store the code and move to the password-reset step — the actual
    // verification happens server-side when the new password is submitted.
    setResetCode(fullCode);
    setNewPassword("");
    setConfirmPassword("");
    setScreen("reset");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are identical.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim(), code: resetCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Code may have expired — send them back to re-request
        toast({ title: "Reset failed", description: data.message ?? "The code may have expired. Please try again.", variant: "destructive" });
        if (res.status === 400) {
          setCode(["", "", "", "", "", ""]);
          setScreen("forgot-verify");
        }
        return;
      }
      toast({ title: "Password updated!", description: "You can now sign in with your new password." });
      reset("login");
    } catch {
      toast({ title: "Reset failed", description: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResendResetCode = async () => {
    setResendLoading(true);
    setResendSent(false);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      if (res.ok) {
        const d = await res.json();
        setFallbackCode(d.fallbackCode ?? null);
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

  // ── Code input helpers ──────────────────────────────────────────────────────

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
    setFallbackCode(null);
    setShowPassword(false);
    setForgotEmail(""); setResetCode("");
    setNewPassword(""); setConfirmPassword("");
    setShowNewPassword(false); setShowConfirmPassword(false);
  };

  // ── Screen title / subtitle ─────────────────────────────────────────────────
  const screenTitle = (() => {
    if (screen === "verify")        return "Verify your email";
    if (screen === "pending")       return "Account pending";
    if (screen === "verified")      return "Email verified!";
    if (screen === "forgot")        return "Forgot password?";
    if (screen === "forgot-verify") return "Check your email";
    if (screen === "reset")         return "Set new password";
    return mode === "login" ? "Sign in to PulseRPM" : "Create your account";
  })();

  const screenSubtitle = (() => {
    if (screen === "verify")        return `Check your inbox at ${pendingEmail}`;
    if (screen === "pending")       return "Your account is awaiting provider approval";
    if (screen === "verified")      return verifyingRole === "provider" ? "Your account is awaiting admin approval" : "Your account is ready — sign in to get started";
    if (screen === "forgot")        return "Enter your email and we'll send a reset code";
    if (screen === "forgot-verify") return `We sent a reset code to ${forgotEmail}`;
    if (screen === "reset")         return "Choose a new password for your account";
    return mode === "login" ? cfg.subtitle : "Join PulseRPM to monitor patient health";
  })();

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
          {screenTitle}
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {screenSubtitle}
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

                {fallbackCode ? (
                  <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center space-y-1">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Email delivery unavailable</p>
                    <p className="text-xs text-amber-600">We couldn't send the email. Use this code instead:</p>
                    <p className="text-3xl font-extrabold tracking-[0.25em] text-amber-800 font-mono py-1">{fallbackCode}</p>
                    <p className="text-[11px] text-amber-500">Expires in 15 minutes — enter it in the boxes below</p>
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground mb-5">
                    We sent a 6-digit code to <strong>{pendingEmail}</strong>. Check your inbox (and spam folder).
                  </p>
                )}

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
                    <button type="button" onClick={() => reset("signup", verifyingRole)} className="text-xs text-muted-foreground hover:text-foreground">
                      ← Back to sign up
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── PROVIDER VERIFIED / PENDING ADMIN APPROVAL SCREEN ── */}
            {screen === "verified" && (
              <motion.div key="verified" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}
                className="text-center space-y-5"
              >
                <div className="flex items-center justify-center">
                  <div className={`h-16 w-16 rounded-full flex items-center justify-center ${verifyingRole === "provider" ? "bg-amber-50 border-2 border-amber-200" : "bg-green-50 border-2 border-green-200"}`}>
                    {verifyingRole === "provider"
                      ? <Clock className="h-8 w-8 text-amber-500" />
                      : <CheckCircle2 className="h-8 w-8 text-green-500" />}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-lg text-foreground">
                    {verifyingRole === "provider" ? "Email verified!" : "You're all set!"}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {verifyingRole === "provider"
                      ? <>Your email <strong>{pendingEmail}</strong> has been confirmed. Your provider account is now awaiting approval from the system administrator.</>
                      : <>Your email <strong>{pendingEmail}</strong> has been confirmed. Your account is now active.</>}
                  </p>
                </div>
                {verifyingRole === "provider" ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left space-y-1">
                    <p className="text-xs text-amber-700 font-medium">What happens next?</p>
                    <p className="text-xs text-amber-600">An administrator will review your registration and approve your account. You'll receive an email notification when you're approved — this usually takes less than 24 hours.</p>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-left space-y-1">
                    <p className="text-xs text-blue-700 font-medium">You're all set</p>
                    <p className="text-xs text-blue-600">Sign in with your email and password to access your dashboard.</p>
                  </div>
                )}
                <button type="button" onClick={() => reset("login", "provider")} className="text-sm text-primary hover:underline font-medium">
                  Back to sign in
                </button>
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

            {/* ── FORGOT PASSWORD — ENTER EMAIL ── */}
            {screen === "forgot" && (
              <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <div className="flex items-center justify-center mb-6">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <KeyRound className="h-7 w-7 text-primary" />
                  </div>
                </div>

                <form onSubmit={handleForgotRequest} className="space-y-5">
                  <div>
                    <Label htmlFor="forgot-email">Email address</Label>
                    <div className="mt-1.5">
                      <Input
                        id="forgot-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full"
                        autoFocus
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Works for both provider and patient accounts.
                    </p>
                  </div>

                  <Button type="submit" className="w-full h-11 text-base shadow-md" disabled={loading}>
                    {loading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending reset code...</>
                      : "Send reset code"}
                  </Button>
                </form>

                <div className="mt-5 text-center">
                  <button type="button" onClick={() => reset("login")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    ← Back to sign in
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── FORGOT PASSWORD — ENTER CODE ── */}
            {screen === "forgot-verify" && (
              <motion.div key="forgot-verify" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <div className="flex items-center justify-center mb-6">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Mail className="h-7 w-7 text-primary" />
                  </div>
                </div>

                {fallbackCode ? (
                  <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center space-y-1">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Email delivery unavailable</p>
                    <p className="text-xs text-amber-600">We couldn't send the email. Use this code instead:</p>
                    <p className="text-3xl font-extrabold tracking-[0.25em] text-amber-800 font-mono py-1">{fallbackCode}</p>
                    <p className="text-[11px] text-amber-500">Expires in 15 minutes</p>
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground mb-5">
                    We sent a 6-digit reset code to <strong>{forgotEmail}</strong>. It expires in 15 minutes.
                  </p>
                )}

                <form onSubmit={handleForgotVerify} className="space-y-6">
                  <div>
                    <Label className="text-center block text-sm text-muted-foreground mb-3">Reset code</Label>
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
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : "Continue"}
                  </Button>
                </form>

                <div className="mt-5 text-center space-y-2">
                  {resendSent ? (
                    <p className="text-sm text-success font-medium flex items-center justify-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> New code sent!</p>
                  ) : (
                    <button type="button" onClick={handleResendResetCode} disabled={resendLoading} className="text-sm text-primary hover:underline font-medium disabled:opacity-50">
                      {resendLoading ? "Sending..." : "Resend code"}
                    </button>
                  )}
                  <div>
                    <button type="button" onClick={() => setScreen("forgot")} className="text-xs text-muted-foreground hover:text-foreground">
                      ← Change email
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── RESET PASSWORD — SET NEW PASSWORD ── */}
            {screen === "reset" && (
              <motion.div key="reset" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <div className="flex items-center justify-center mb-6">
                  <div className="h-14 w-14 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
                    <ShieldCheck className="h-7 w-7 text-green-500" />
                  </div>
                </div>

                <div className="mb-5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
                  <p className="text-xs font-medium text-green-700">Code verified ✓</p>
                  <p className="text-xs text-green-600 mt-0.5">Now choose a new password for <strong>{forgotEmail}</strong></p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <Label htmlFor="new-password">New password</Label>
                    <div className="mt-1.5 relative">
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pr-10"
                        autoFocus
                      />
                      <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Minimum 6 characters</p>
                  </div>

                  <div>
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <div className="mt-1.5 relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`w-full pr-10 ${confirmPassword && confirmPassword !== newPassword ? "border-destructive focus:ring-destructive/20" : ""}`}
                      />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p className="mt-1 text-xs text-destructive">Passwords don't match</p>
                    )}
                    {confirmPassword && confirmPassword === newPassword && (
                      <p className="mt-1 text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Passwords match</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 text-base shadow-md mt-2"
                    disabled={loading || newPassword.length < 6 || newPassword !== confirmPassword}
                  >
                    {loading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating password...</>
                      : "Update password"}
                  </Button>
                </form>
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
                    <div className="flex items-center justify-between mb-1.5">
                      <Label htmlFor="password">Password</Label>
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => { setForgotEmail(email); setScreen("forgot"); }}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
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
                    disabled={loginMutation.isPending || loading}
                  >
                    {(loginMutation.isPending || loading) ? (
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
