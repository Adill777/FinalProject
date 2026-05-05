import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProfessionalCard } from "@/components/ui/professional-card";
import { ProfessionalButton } from "@/components/ui/professional-button";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL, readApiJson } from "@/lib/api";
import AuthBackdrop from "@/components/AuthBackdrop";

const ADMIN_PORTAL_URL = import.meta.env.VITE_ADMIN_PORTAL_URL || "http://localhost:8080/admin";

const inputClassName =
  "h-8 w-full rounded-md border border-[#d0d7de] bg-white px-3 text-sm text-[#1f2328] shadow-[inset_0_1px_0_rgba(208,215,222,0.2)] transition focus:border-[#fb8f44] focus:outline-none focus:ring-2 focus:ring-[#fb8f44]/30";

const AdminLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    username: "",
    password: ""
  });
  const [isLoading, setIsLoading] = useState(false);

  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Invalid admin credentials. Please try again.";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: formData.username,
          password: formData.password
        })
      });

      const parsed = await readApiJson<{ token?: string; admin?: { email?: string }; error?: string; message?: string }>(response);
      const data = parsed.data;
      if (!response.ok) {
        throw new Error(parsed.error || data.error || data.message || "Invalid admin credentials");
      }

      if (data.admin?.email) {
        localStorage.setItem("adminEmail", data.admin.email);
      }

      toast({
        title: "Admin Login Successful",
        description: "Welcome to FreqVault Admin Portal!"
      });
      window.location.assign(ADMIN_PORTAL_URL);
    } catch (error: unknown) {
      toast({
        title: "Login Failed",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6f8fa] px-4 py-10">
      <AuthBackdrop tone="admin" />
      <div className="relative z-10 mx-auto flex w-full max-w-[340px] flex-col items-center">
        <div className="mb-4 text-center" style={{ animation: "auth-enter 420ms ease-out both" }}>
          <h1 className="text-[32px] font-light tracking-[-0.5px] text-[#1f2328]">FreqVault</h1>
          <p className="mt-1 text-2xl font-light leading-8 text-[#1f2328]">Admin sign in</p>
        </div>

        <ProfessionalCard
          className="w-full rounded-md border border-[#d0d7de] bg-white/88 p-4 shadow-none backdrop-blur-[1.5px]"
          style={{ animation: "auth-enter 520ms ease-out both" }}
        >
          <div className="mb-5 text-center" style={{ animation: "auth-enter 620ms ease-out both" }}>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#1f2328] via-[#0c70f2] to-[#fb8f44]">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[#1f2328]">Administrator login</h2>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-busy={isLoading}
            style={{ animation: "auth-enter 700ms ease-out both" }}
          >
            <div className="space-y-2">
              <label htmlFor="admin-email" className="text-sm font-medium text-foreground">
                Admin email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={formData.username}
                onChange={(e) => handleInputChange("username", e.target.value)}
                className={inputClassName}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="admin-password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                className={inputClassName}
              />
            </div>

            <ProfessionalButton
              type="submit"
              className="mt-2 h-8 w-full rounded-md border border-[#d07a3e] bg-[#fb8f44] px-3 py-0 text-sm text-white shadow-none hover:scale-100 hover:bg-[#e57f35] focus:ring-2 focus:ring-[#fb8f44]/40"
              disabled={isLoading}
            >
              {isLoading ? "Authenticating..." : "Access admin portal"}
            </ProfessionalButton>
          </form>

          <div className="mt-6 text-center" style={{ animation: "auth-enter 780ms ease-out both" }}>
            <button
              type="button"
              onClick={() => navigate("/login")}
              aria-label="Back to user portal"
              className="text-sm text-[#0c70f2] transition-colors duration-200 hover:text-[#fb8f44] hover:underline focus:outline-none focus:ring-2 focus:ring-[#fb8f44]/30"
            >
              Back to user portal
            </button>
          </div>
        </ProfessionalCard>
      </div>
    </div>
  );
};

export default AdminLogin;
