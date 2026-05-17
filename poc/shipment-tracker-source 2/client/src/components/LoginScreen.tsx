import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Ship, LogIn, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

export function LoginScreen() {
  const { login, loginError, isLoggingIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    try {
      await login(email.trim(), password);
    } catch {
      // error is set in context
    }
  };

  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
      style={{ background: "hsl(var(--surface-6))" }}
      data-testid="login-screen"
    >
      <div
        className="w-full max-w-sm mx-4 rounded-xl border p-8"
        style={{
          background: "hsl(var(--surface-9))",
          borderColor: "hsl(var(--border-18))",
        }}
      >
        {/* Logo / Branding */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl"
            style={{ background: "var(--brand-teal-soft)" }}
          >
            <Ship className="w-7 h-7" style={{ color: "var(--brand-teal)" }} />
          </div>
          <div className="text-center">
            <h1
              className="text-lg font-semibold tracking-tight"
              style={{ color: "hsl(var(--fg-96))" }}
            >
              Shipment Tracker
            </h1>
            <p
              className="text-xs mt-1"
              style={{ color: "hsl(var(--muted-55))" }}
            >
              Sign in to your account
            </p>
          </div>
        </div>

        {/* Error */}
        {loginError && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 mb-4 text-xs"
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#f87171",
            }}
            data-testid="login-error"
          >
            <AlertCircle className="w-3.5 h-3.5 flex-none" />
            {loginError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: "hsl(var(--muted-65))" }}
              htmlFor="login-email"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@ourfuture.biz"
              className="h-9 rounded-lg border px-3 text-sm outline-none transition-colors focus:ring-1"
              style={{
                background: "hsl(var(--surface-7))",
                borderColor: "hsl(var(--border-20))",
                color: "hsl(var(--fg-96))",
              }}
              data-testid="input-email"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: "hsl(var(--muted-65))" }}
              htmlFor="login-password"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-9 w-full rounded-lg border px-3 pr-9 text-sm outline-none transition-colors focus:ring-1"
                style={{
                  background: "hsl(var(--surface-7))",
                  borderColor: "hsl(var(--border-20))",
                  color: "hsl(var(--fg-96))",
                }}
                data-testid="input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded transition-colors"
                style={{ color: "hsl(var(--muted-50))" }}
                tabIndex={-1}
                data-testid="toggle-password"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoggingIn || !email.trim() || !password.trim()}
            className="h-9 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
            style={{
              background: "var(--brand-teal)",
              color: "hsl(var(--surface-8))",
            }}
            data-testid="button-login"
          >
            {isLoggingIn ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Footer hint */}
        <p
          className="text-[10px] text-center mt-6"
          style={{ color: "hsl(var(--muted-40))" }}
        >
          OurFuture.biz Operations System
        </p>
      </div>
    </div>
  );
}
