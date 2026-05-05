import { useState } from "react";
import { Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { apiFetch, readApiJson } from "@/lib/api";
import AuthBackdrop from "@/components/AuthBackdrop";

interface LoginFormProps {
  onLogin: (accessToken: string, email: string) => void;
}

const inputClassName =
  "block w-full rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-[#f6f8fa] dark:bg-[#0d1117] px-3 py-1.5 text-sm text-[#1f2328] dark:text-[#e6edf3] shadow-[inset_0_1px_0_rgba(208,215,222,0.2)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors focus:border-[#fb8f44] dark:focus:border-[#fb8f44] focus:bg-white dark:focus:bg-[#0d1117] focus:outline-none focus:ring-1 focus:ring-[#fb8f44] dark:focus:ring-[#fb8f44]";

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await apiFetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: username, password })
      });

      const parsed = await readApiJson<{
        accessToken?: string;
        token?: string;
        admin?: { email?: string };
        email?: string;
        message?: string;
        error?: string;
      }>(response);
      const data = parsed.data;
      const accessToken = data.accessToken || data.token;
      const email = data.admin?.email || data.email || username.trim();

      if (response.ok && accessToken && email) {
        toast({
          title: "Login Successful",
          description: "Welcome to FreqVault Admin Portal",
        });
        onLogin(accessToken, email);
      } else {
        toast({
          title: "Authentication Failed",
          description: parsed.error || data.error || data.message || "Invalid username or password",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Authentication Failed",
        description: "Could not reach server",
        variant: "destructive",
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
          FreqVault Admin
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-[340px]">
        <div
          className="rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white/90 dark:bg-[#161b22]/90 p-4 shadow-sm backdrop-blur-[1.5px] sm:p-5"
          style={{ animation: "auth-enter 520ms ease-out both" }}
        >
          <form onSubmit={handleLogin} aria-busy={isLoading} style={{ animation: "auth-enter 700ms ease-out both" }}>
            <div className="mb-4">
              <label htmlFor="username" className="mb-2 block text-sm font-semibold text-[#1f2328] dark:text-[#e6edf3]">
                Admin email
              </label>
              <input
                id="username"
                type="email"
                autoComplete="email"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClassName}
              />
            </div>

            <button
              type="submit"
              className="mt-6 block w-full rounded-md bg-[#fb8f44] px-4 py-2 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#e57f35] focus:outline-none focus:ring-2 focus:ring-[#fb8f44]/45 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? "Authenticating..." : "Access Portal"}
            </button>
          </form>
        </div>

        <div
          className="mt-4 rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white/75 dark:bg-[#161b22]/75 p-4 text-center text-sm text-[#1f2328] dark:text-[#e6edf3] backdrop-blur-[1.5px]"
          style={{ animation: "auth-enter 780ms ease-out both" }}
        >
          <span className="text-[#656d76] dark:text-[#8b949e]">Secure administrative workspace</span>
        </div>
      </div>
    </div>
  );
};
