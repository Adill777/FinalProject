import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { OnboardingShell } from "@/components/OnboardingShell";
import { ProfessionalInput } from "@/components/ui/professional-input";
import { ProfessionalButton } from "@/components/ui/professional-button";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL, readApiJson } from "@/lib/api";
import AuthBackdrop from "@/components/AuthBackdrop";

const MIN_PASSWORD_LENGTH = 12;

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordValid = useMemo(() => {
    return (
      password.length >= MIN_PASSWORD_LENGTH &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password)
    );
  }, [password]);

  const isTokenMissing = token.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isTokenMissing) {
      toast({
        title: "Invalid link",
        description: "Password reset token is missing.",
        variant: "destructive"
      });
      return;
    }
    if (!passwordValid) {
      toast({
        title: "Weak password",
        description: "Use a stronger password that meets all requirements.",
        variant: "destructive"
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Confirm password must match.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const parsed = await readApiJson<{ message?: string; error?: string }>(response);
      const data = parsed.data;
      if (!response.ok) {
        toast({
          title: "Reset failed",
          description: parsed.error || data.error || data.message || "Unable to reset password.",
          variant: "destructive"
        });
        return;
      }
      toast({
        title: "Password reset successful",
        description: "Please log in with your new password."
      });
      navigate("/login");
    } catch {
      toast({
        title: "Network error",
        description: "Unable to connect to server.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      <AuthBackdrop />
      <div className="relative z-10">
        <OnboardingShell
          stepHint="Set a New Password"
          title="Reset Password"
          description="Create a new password to secure your account."
          icon={<KeyRound className="h-6 w-6 text-primary" />}
        >
          <div
            className="rounded-md border border-[#d0d7de] dark:border-[#30363d] bg-white/80 dark:bg-[#161b22]/80 p-4 backdrop-blur-[1.5px]"
            style={{ animation: "auth-enter 480ms ease-out both" }}
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              <ProfessionalInput
                label="New Password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <ProfessionalInput
                label="Confirm Password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />

              <ProfessionalButton type="submit" className="w-full" disabled={isSubmitting || isTokenMissing}>
                {isSubmitting ? "Updating..." : "Reset Password"}
              </ProfessionalButton>
            </form>
          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="text-sm text-muted-foreground hover:text-primary"
            >
              Back to Log in
            </button>
          </div>
        </OnboardingShell>
      </div>
    </div>
  );
};

export default ResetPassword;
