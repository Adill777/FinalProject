import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { ProfessionalInput } from "@/components/ui/professional-input";
import { ProfessionalButton } from "@/components/ui/professional-button";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL, readApiJson } from "@/lib/api";
import AuthBackdrop from "@/components/AuthBackdrop";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      toast({
        title: "Email required",
        description: "Enter your account email.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/user/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail })
      });
      const parsed = await readApiJson<{ message?: string; error?: string }>(response);
      const data = parsed.data;
      if (!response.ok) {
        toast({
          title: "Request failed",
          description: parsed.error || data.error || data.message || "Unable to process password reset request.",
          variant: "destructive"
        });
        return;
      }
      setSubmitted(true);
      toast({
        title: "Check your email",
        description: "If your email is registered, a reset link has been sent."
      });
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
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#f6f8fa] px-4 py-8 dark:bg-[#0d1117] sm:py-12">
      <AuthBackdrop />
      <div className="absolute right-4 top-4 z-20 sm:right-8 sm:top-8">
        <DarkModeToggle />
      </div>

      <div className="relative z-10 mb-6 text-center" style={{ animation: "auth-enter 420ms ease-out both" }}>
        <Mail className="mx-auto mb-6 h-12 w-12 text-[#24292f] dark:text-[#e6edf3]" strokeWidth={1.5} />
        <h1 className="text-2xl font-light tracking-tight text-[#1f2328] dark:text-[#e6edf3]">Forgot Password</h1>
        <p className="mt-2 text-sm text-[#656d76] dark:text-[#8b949e]">
          Enter your account email to receive a secure reset link.
        </p>
      </div>

      <div className="relative z-10 w-full max-w-[340px]">
        <div
          className="rounded-md border border-[#d0d7de] bg-white/90 p-4 shadow-sm backdrop-blur-[1.5px] dark:border-[#30363d] dark:bg-[#161b22]/90 sm:p-5"
          style={{ animation: "auth-enter 520ms ease-out both" }}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <ProfessionalInput
              label="Email"
              type="email"
              autoComplete="email"
              required
              disabled={submitted}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <ProfessionalButton type="submit" className="w-full" disabled={isSubmitting || submitted}>
              {isSubmitting ? "Sending..." : submitted ? "Email Sent" : "Send Reset Link"}
            </ProfessionalButton>
          </form>
        </div>

        <div
          className="mt-4 rounded-md border border-[#d0d7de] bg-white/80 p-4 text-center text-sm text-[#1f2328] shadow-sm backdrop-blur-[1.5px] dark:border-[#30363d] dark:bg-[#161b22]/80 dark:text-[#e6edf3]"
          style={{ animation: "auth-enter 620ms ease-out both" }}
        >
          <span className="text-[#656d76] dark:text-[#8b949e]">Remembered your password? </span>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="font-medium text-[#0969da] hover:underline focus:outline-none focus:ring-2 focus:ring-[#0969da]/40 dark:text-[#2f81f7] dark:focus:ring-[#388bfd]/50"
          >
            Back to Log in
          </button>
        </div>
      </div>

      {submitted && (
        <div
          className="relative z-10 mt-4 w-full max-w-[340px] rounded-md border border-[#d0d7de] bg-white/80 p-3 text-center text-xs text-[#1f2328] shadow-sm backdrop-blur-[1.5px] dark:border-[#30363d] dark:bg-[#161b22]/80 dark:text-[#e6edf3]"
          style={{ animation: "auth-enter 720ms ease-out both" }}
        >
          Check your inbox and spam folder for the reset email.
        </div>
      )}
    </div>
  );
};

export default ForgotPassword;
