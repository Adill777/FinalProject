import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { API_BASE_URL, readApiJson } from "@/lib/api";
import AuthBackdrop from "@/components/AuthBackdrop";

const MIN_PASSWORD_LENGTH = 12;
const GOOGLE_AUTH_URL =
  import.meta.env.VITE_USER_GOOGLE_AUTH_URL || `${API_BASE_URL}/api/user/auth/google`;
const inputClassName =
  "block w-full rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] px-3 py-1.5 text-sm text-[#1f2328] dark:text-[#e6edf3] shadow-[inset_0_1px_0_rgba(208,215,222,0.2)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors focus:border-[#0969da] dark:focus:border-[#388bfd] focus:bg-white dark:focus:bg-[#0d1117] focus:outline-none focus:ring-1 focus:ring-[#0969da] dark:focus:ring-[#388bfd]";

const UserSignup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = formData.email.trim();
    const normalizedFirstName = formData.firstName.trim();
    const normalizedLastName = formData.lastName.trim();
    const password = formData.password;

    const passwordIsValid =
      password.length >= MIN_PASSWORD_LENGTH &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password);

    if (!normalizedFirstName || !normalizedLastName || !normalizedEmail) {
      toast({
        title: "Missing details",
        description: "Enter first name, last name, and email.",
        variant: "destructive"
      });
      return;
    }

    if (!passwordIsValid) {
      toast({
        title: "Weak password",
        description: "Password does not meet security requirements.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/user/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstname: normalizedFirstName,
          lastname: normalizedLastName,
          email: normalizedEmail,
          password,
        }),
      });

      const parsed = await readApiJson<{ message?: string; error?: string }>(response);
      const data = parsed.data;

      if (response.ok) {
        localStorage.setItem("isNewUser", "true");

        toast({
          title: "Account Created Successfully",
          description: "Welcome to FreqVault!",
        });

        navigate("/login");
      } else {
        toast({
          title: "Signup Failed",
          description: parsed.error || data.error || data.message || "Could not create account. Please try again.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Network Error",
        description: "Unable to connect to server",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleGoogleSignup = () => {
    window.location.href = GOOGLE_AUTH_URL;
  };

  useEffect(() => {
    const oauthError = searchParams.get("oauth_error");
    if (!oauthError) return;

    toast({
      title: "Google Sign Up Failed",
      description: "Unable to complete Google sign up. Please try again.",
      variant: "destructive"
    });

    const next = new URLSearchParams(searchParams);
    next.delete("oauth_error");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  const password = formData.password;
  const passwordChecks = [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, valid: password.length >= MIN_PASSWORD_LENGTH },
    { label: "At least one uppercase letter", valid: /[A-Z]/.test(password) },
    { label: "At least one lowercase letter", valid: /[a-z]/.test(password) },
    { label: "At least one number", valid: /\d/.test(password) },
    { label: "At least one special character", valid: /[^A-Za-z0-9]/.test(password) }
  ];

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center overflow-hidden bg-[#f6f8fa] dark:bg-[#0d1117] px-4 py-8 sm:py-12 transition-colors duration-200">
      <AuthBackdrop />

      <div className="absolute top-4 right-4 z-20 sm:top-8 sm:right-8">
        <ThemeToggle />
      </div>

      <div className="relative z-10 mb-6 text-center" style={{ animation: "auth-enter 420ms ease-out both" }}>
        <Shield className="mx-auto mb-6 h-12 w-12 text-[#24292f] dark:text-[#e6edf3]" strokeWidth={1.5} />
        <h1 className="text-2xl font-light tracking-tight text-[#1f2328] dark:text-[#e6edf3]">
          Sign up to FreqVault
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-[340px]">
        <div
          className="rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white/90 dark:bg-[#161b22]/90 p-4 shadow-sm backdrop-blur-[1.5px] sm:p-5"
          style={{ animation: "auth-enter 520ms ease-out both" }}
        >
          <form onSubmit={handleSubmit} aria-busy={isLoading}>
            <div className="mb-4">
              <label htmlFor="firstName" className="mb-2 block text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                First name
              </label>
              <input
                id="firstName"
                type="text"
                autoComplete="given-name"
                required
                value={formData.firstName}
                onChange={(e) => handleInputChange("firstName", e.target.value)}
                className={inputClassName}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="lastName" className="mb-2 block text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                Last name
              </label>
              <input
                id="lastName"
                type="text"
                autoComplete="family-name"
                required
                value={formData.lastName}
                onChange={(e) => handleInputChange("lastName", e.target.value)}
                className={inputClassName}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                className={inputClassName}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                className={inputClassName}
                aria-describedby="password-requirements"
              />
            </div>

            <div
              id="password-requirements"
              className="mb-4 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] p-3"
              aria-live="polite"
            >
              <p className="mb-2 text-xs font-semibold text-[#1f2328] dark:text-[#e6edf3]">Password requirements</p>
              <ul className="space-y-1">
                {passwordChecks.map((check) => (
                  <li
                    key={check.label}
                    className={`flex items-center gap-2 text-xs ${check.valid ? "text-[#1a7f37] dark:text-[#3fb950]" : "text-[#656d76] dark:text-[#8b949e]"}`}
                  >
                    {check.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    <span>{check.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="submit"
              className="block w-full rounded-md bg-[#2da44e] dark:bg-[#238636] px-4 py-2 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#2c974b] dark:hover:bg-[#2ea043] focus:outline-none focus:ring-2 focus:ring-[#2da44e]/50 dark:focus:ring-[#238636]/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? "Creating account..." : "Sign up"}
            </button>
          </form>

          <div className="my-5 flex items-center justify-center gap-2">
            <div className="h-px flex-1 bg-[#d8dee4] dark:bg-[#30363d]" />
            <span className="text-xs text-[#656d76] dark:text-[#8b949e]">or</span>
            <div className="h-px flex-1 bg-[#d8dee4] dark:bg-[#30363d]" />
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#21262d] px-4 py-2 text-sm font-medium text-[#1f2328] dark:text-[#e6edf3] shadow-sm transition-colors hover:bg-[#f3f4f6] dark:hover:bg-[#30363d] focus:outline-none focus:ring-2 focus:ring-[#0969da]/50 dark:focus:ring-[#388bfd]/50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleGoogleSignup}
            aria-label="Continue with Google"
            disabled={isLoading}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.6-2.5C16.8 3.5 14.6 2.6 12 2.6A9.4 9.4 0 0 0 2.6 12 9.4 9.4 0 0 0 12 21.4c5.4 0 9-3.8 9-9 0-.6-.1-1.1-.2-1.6H12z" />
            </svg>
            Continue with Google
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-[#656d76] dark:text-[#8b949e]">
          By signing up to create an account, I accept FreqVault&apos;s{" "}
          <Link to="/legal/user-agreement" className="text-[#0969da] dark:text-[#2f81f7] hover:underline">
            User Agreement
          </Link>
          ,{" "}
          <Link to="/legal/privacy-policy" className="text-[#0969da] dark:text-[#2f81f7] hover:underline">
            Privacy Policy
          </Link>
          , and{" "}
          <Link to="/legal/cookie-policy" className="text-[#0969da] dark:text-[#2f81f7] hover:underline">
            Cookie Policy
          </Link>
        </p>
      </div>

      <div
        className="relative z-10 mt-4 w-full max-w-[340px] rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white/80 dark:bg-[#161b22]/80 p-4 text-center text-sm shadow-sm backdrop-blur-[1.5px] md:p-5"
        style={{ animation: "auth-enter 620ms ease-out both" }}
      >
        <span className="text-[#1f2328] dark:text-[#e6edf3]">Already have an account? </span>
        <Link
          to="/login"
          className="text-[#0969da] dark:text-[#2f81f7] hover:underline focus:outline-none focus:ring-2 focus:ring-[#0969da]/50 dark:focus:ring-[#388bfd]/50"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
};

export default UserSignup;
