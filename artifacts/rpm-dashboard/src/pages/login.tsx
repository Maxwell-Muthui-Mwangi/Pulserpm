import { useState } from "react";
import { useLocation } from "wouter";
import { Activity, Loader2, Eye, EyeOff } from "lucide-react";
import { useLogin, useSignup } from "@workspace/api-client-react";
import { setAuthToken } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

type Mode = "login" | "signup";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"provider" | "patient">("provider");
  const [specialty, setSpecialty] = useState("");

  const loginMutation = useLogin();
  const signupMutation = useSignup();

  const isPending = loginMutation.isPending || signupMutation.isPending;

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
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {mode === "login"
            ? "Remote Patient Monitoring Provider Portal"
            : "Join PulseRPM to monitor patient health"}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10"
      >
        <div className="bg-card py-8 px-4 shadow-xl border border-border/50 sm:rounded-2xl sm:px-10">
          {/* Mode toggle tabs */}
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
                        placeholder="Dr. Jane Smith"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="role">Account type</Label>
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRole("provider")}
                        className={`flex-1 py-2.5 px-3 text-sm rounded-lg border transition-all ${
                          role === "provider"
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        Healthcare Provider
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole("patient")}
                        className={`flex-1 py-2.5 px-3 text-sm rounded-lg border transition-all ${
                          role === "patient"
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        Patient
                      </button>
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
                      <Label htmlFor="specialty">Specialty <span className="text-muted-foreground font-normal">(optional)</span></Label>
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
                  placeholder="you@hospital.org"
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
                "Sign in"
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-muted-foreground">
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
