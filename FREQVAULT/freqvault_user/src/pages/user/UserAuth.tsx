import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProfessionalButton } from "@/components/ui/professional-button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, QrCode, ShieldAlert } from "lucide-react";
import { OnboardingShell } from "@/components/OnboardingShell";
import { apiFetch, readApiJson } from "@/lib/api";

const UserAuth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const generateQr = async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        const res = await apiFetch("/api/user/generate-2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        if (res.status === 401) {
          navigate("/login");
          return;
        }
        const parsed = await readApiJson<{ qr?: string; message?: string }>(res);
        if (!res.ok || !parsed.success || !parsed.data.qr) {
          throw new Error(parsed.error || parsed.data.message || "Failed to generate QR code");
        }
        if (isMounted) setQr(parsed.data.qr);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to generate QR code";
        if (isMounted) {
          setErrorMessage(message);
          toast({ title: message, variant: "destructive" });
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void generateQr();
    return () => {
      isMounted = false;
    };
  }, [navigate, toast]);

  return (
    <OnboardingShell
      stepLabel="Step 2 of 3"
      stepHint="Secure Your Account with 2FA"
      title="Enable Two-Factor Authentication"
      description="Scan this QR code with Google Authenticator or Microsoft Authenticator to secure your account."
      icon={<QrCode className="h-6 w-6 text-primary" />}
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">Setup Steps</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Open your authenticator app.</li>
            <li>Scan the QR code below.</li>
            <li>Save and continue to key generation.</li>
          </ol>
        </div>
        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">Generating your secure QR code...</p>
          </div>
        ) : qr ? (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-2xl border border-border bg-white p-4 shadow-md ring-1 ring-primary/20">
              <img src={qr} alt="2FA QR code" className="mx-auto h-56 w-56" />
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              <div className="mb-1 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                <p className="font-semibold">QR code ready</p>
              </div>
              <p className="text-sm">After scanning, continue to generate your encryption key pair.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-900 dark:bg-red-950/30">
            <div className="mb-1 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-700 dark:text-red-300" />
              <p className="font-semibold text-red-700 dark:text-red-300">2FA setup failed</p>
            </div>
            <p className="text-sm text-red-700 dark:text-red-300">
              {errorMessage || "Unable to generate QR code. Please try again."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <ProfessionalButton
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
            disabled={isLoading}
            aria-label="Retry QR code generation"
          >
            Retry QR Generation
          </ProfessionalButton>
          <ProfessionalButton
            type="button"
            onClick={() => navigate("/keygen")}
            disabled={!qr}
            aria-label="Continue to key generation"
          >
            Continue
          </ProfessionalButton>
        </div>
      </div>
    </OnboardingShell>
  );
};

export default UserAuth;
