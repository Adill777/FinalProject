import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, readApiJson, setUserSession } from "@/lib/api";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import AuthBackdrop from "@/components/AuthBackdrop";

const inputClassName =
  "block w-full rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] px-3 py-1.5 text-sm text-[#1f2328] dark:text-[#e6edf3] shadow-[inset_0_1px_0_rgba(208,215,222,0.2)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors focus:border-[#0969da] dark:focus:border-[#388bfd] focus:bg-white dark:focus:bg-[#0d1117] focus:outline-none focus:ring-1 focus:ring-[#0969da] dark:focus:ring-[#388bfd]";

const UserLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  const [otp, setOtp] = useState("");
  const [otpRequired, setOtpRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const email = formData.email.trim();
    const password = formData.password;
    const normalizedOtp = otp.trim();

    if (!email || !password) {
      toast({
        title: "Missing credentials",
        description: "Enter your email and password.",
        variant: "destructive"
      });
      return;
    }

    if (otpRequired && !/^\d{6}$/.test(normalizedOtp)) {
      toast({
        title: "Invalid OTP",
        description: "Enter a valid 6-digit authenticator code.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiFetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          otp: otpRequired ? normalizedOtp : undefined
        })
      });

      const parsed = await readApiJson<{
        accessToken?: string;
        token?: string;
        email?: string;
        isFirstLogin?: boolean;
        otpRequired?: boolean;
        requiresOtp?: boolean;
        error?: string;
        message?: string;
      }>(response);
      const data = parsed.data;

      const fallbackMessage = parsed.error || data.error || data.message || "";
      const isOtpChallenge =
        data.otpRequired === true ||
        data.requiresOtp === true ||
        parsed.code === "OTP_REQUIRED" ||
        /otp|authenticator|2fa/i.test(fallbackMessage);

      if (isOtpChallenge) {
        setOtpRequired(true);
        toast({
          title: "OTP Required",
          description: "Enter the 6-digit code from your Authenticator app"
        });
        return;
      }

      const hasToken = Boolean(data.accessToken || data.token);
      const loginSucceeded = response.ok && (parsed.success || hasToken);

      if (loginSucceeded) {
        toast({
          title: "Login Successful",
          description: "Welcome back to FreqVault!"
        });

        if (data.accessToken || data.token) {
          setUserSession(data.accessToken || data.token, data.email || email);
        }
        if (typeof data.isFirstLogin === "boolean") {
          localStorage.setItem("isFirstLogin", String(data.isFirstLogin));
        }

        if (data.isFirstLogin === true) {
          navigate("/auth");
        } else {
          navigate("/files");
        }
        return;
      }

      toast({
        title: "Login Failed",
        description: fallbackMessage || "Invalid credentials",
        variant: "destructive"
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Something went wrong. Please try again later.";
      const description = /Failed to fetch|NetworkError|CORS|Load failed/i.test(errorMessage)
        ? "Network/CORS issue: verify backend is running and CORS allows this frontend origin."
        : errorMessage;
      toast({
        title: "Error",
        description,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#f6f8fa] dark:bg-[#0d1117] px-4 py-8 sm:py-12 transition-colors duration-200">
      <AuthBackdrop />

      <div className="absolute top-4 right-4 z-20 sm:top-8 sm:right-8">
        <DarkModeToggle />
      </div>

      <div className="relative z-10 mb-6 text-center" style={{ animation: "auth-enter 420ms ease-out both" }}>
        <Shield className="mx-auto mb-6 h-12 w-12 text-[#24292f] dark:text-[#e6edf3]" strokeWidth={1.5} />
        <h1 className="text-2xl font-light tracking-tight text-[#1f2328] dark:text-[#e6edf3]">
          Sign in to FreqVault
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-[340px]">
        <div
          className="rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white/90 dark:bg-[#161b22]/90 p-4 shadow-sm backdrop-blur-[1.5px] sm:p-5"
          style={{ animation: "auth-enter 520ms ease-out both" }}
        >
          <form onSubmit={handleSubmit} aria-busy={isLoading}>
            <div className="mb-4">
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                Username or email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  setOtpRequired(false);
                  setOtp("");
                }}
                className={inputClassName}
              />
            </div>

            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  aria-label="Go to forgot password page"
                  className="text-xs font-medium text-[#0969da] dark:text-[#2f81f7] hover:underline focus:outline-none focus:ring-2 focus:ring-[#0969da]/50 dark:focus:ring-[#388bfd]/50"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    setOtpRequired(false);
                    setOtp("");
                  }}
                  className={`${inputClassName} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-[#656d76] dark:text-[#8b949e]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {otpRequired && (
              <div className="mb-4">
                <label htmlFor="otp" className="mb-2 block text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                  Authenticator code
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className={inputClassName}
                  aria-describedby="otp-help"
                />
                <p id="otp-help" className="mt-2 text-xs text-[#656d76] dark:text-[#8b949e]">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
            )}

            <button
              type="submit"
              className="mt-6 block w-full rounded-md bg-[#2da44e] dark:bg-[#238636] px-4 py-2 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#2c974b] dark:hover:bg-[#2ea043] focus:outline-none focus:ring-2 focus:ring-[#2da44e]/50 dark:focus:ring-[#238636]/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <div
          className="mt-4 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white/75 dark:bg-[#161b22]/75 p-4 text-center text-sm text-[#1f2328] backdrop-blur-[1.5px] dark:text-[#e6edf3]"
          style={{ animation: "auth-enter 620ms ease-out both" }}
        >
          <span className="text-[#656d76] dark:text-[#8b949e]">New to FreqVault? </span>
          <button
            type="button"
            onClick={() => navigate("/signup")}
            aria-label="Go to account signup page"
            className="font-medium text-[#0969da] dark:text-[#2f81f7] hover:underline focus:outline-none focus:ring-2 focus:ring-[#0969da]/50 dark:focus:ring-[#388bfd]/50"
          >
            Create an account
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserLogin;
