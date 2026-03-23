import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProfessionalButton } from "@/components/ui/professional-button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Copy, Download, KeyRound, ShieldAlert } from "lucide-react";
import { OnboardingShell } from "@/components/OnboardingShell";
import { apiFetch, readApiJson } from "@/lib/api";

interface GeneratedKeys {
  message: string;
  publicKey: string;
  secretKey: string;
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Failed to generate keys";

const UserKeyGen = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [keys, setKeys] = useState<GeneratedKeys | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const generate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const res = await apiFetch("/api/user/generate-keypair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      const parsed = await readApiJson<{ message?: string; publicKey?: string; secretKey?: string }>(res);
      if (!res.ok || !parsed.success) throw new Error(parsed.error || parsed.data.message || "Failed to generate keys");
      const data = parsed.data;
      if (!data.message || !data.publicKey || !data.secretKey) {
        throw new Error("Invalid key payload from server");
      }

      setKeys({
        message: data.message,
        publicKey: data.publicKey,
        secretKey: data.secretKey
      });
      toast({ title: "Keys generated - SAVE PRIVATE KEY" });
      setHasAcknowledged(false);
      setIsCopied(false);
    } catch (err: unknown) {
      toast({ title: getErrorMessage(err), variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyPrivateKey = async () => {
    if (!keys?.secretKey) return;
    try {
      await navigator.clipboard.writeText(keys.secretKey);
      setIsCopied(true);
      toast({ title: "Private key copied to clipboard" });
    } catch (_err) {
      toast({ title: "Failed to copy private key", variant: "destructive" });
    }
  };

  const downloadPrivateKey = () => {
    if (!keys?.secretKey) return;
    const content = [
      "FreqVault Private Key",
      `Generated At: ${new Date().toISOString()}`,
      "",
      keys.secretKey
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `freqvault-private-key-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    window.URL.revokeObjectURL(url);
    toast({ title: "Private key file downloaded" });
  };

  const finish = () => {
    localStorage.removeItem("isFirstLogin");
    navigate("/login");
  };

  return (
    <OnboardingShell
      stepLabel="Step 3 of 3"
      stepHint="Finalize Your Secure Setup"
      title="Generate Your Key Pair"
      description="Your private key is shown once. Save it securely before continuing."
      icon={<KeyRound className="h-6 w-6 text-primary" />}
    >
      {!keys ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-border/70 bg-muted/30 p-5">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              <p className="font-semibold">Important</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Do not share your private key with anyone. It is required later for decryption.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ProfessionalButton onClick={generate} disabled={isGenerating}>
              {isGenerating ? "Generating secure keypair..." : "Generate Keys"}
            </ProfessionalButton>
            <span className="text-xs text-muted-foreground">This may take a few seconds.</span>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            <div className="mb-1 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-semibold">Key pair generated successfully</p>
            </div>
            <p className="text-sm">{keys.message}</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Private Key</p>
            <div className="max-h-56 overflow-auto rounded-xl border border-border bg-muted/40 p-4 shadow-inner">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground">
                {keys.secretKey}
              </pre>
            </div>
            <div className="flex flex-wrap gap-3">
              <ProfessionalButton
                type="button"
                variant="outline"
                onClick={copyPrivateKey}
                aria-label="Copy private key to clipboard"
              >
                <Copy className="mr-2 h-4 w-4" />
                {isCopied ? "Copied" : "Copy Private Key"}
              </ProfessionalButton>
              <ProfessionalButton
                type="button"
                variant="outline"
                onClick={downloadPrivateKey}
                aria-label="Download private key as text file"
              >
                <Download className="mr-2 h-4 w-4" />
                Download .txt
              </ProfessionalButton>
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-900 dark:bg-red-950/30">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Save this private key. It will NOT be shown again.
            </p>
          </div>

          <label
            htmlFor="acknowledge-private-key"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
          >
            <input
              id="acknowledge-private-key"
              type="checkbox"
              className="mt-1"
              checked={hasAcknowledged}
              onChange={(e) => setHasAcknowledged(e.target.checked)}
            />
            <span className="text-sm text-foreground">
              I have securely stored my private key and understand it cannot be recovered.
            </span>
          </label>

          <ProfessionalButton onClick={finish} disabled={!hasAcknowledged}>
            Logout & Continue
          </ProfessionalButton>
        </div>
      )}
    </OnboardingShell>
  );
};

export default UserKeyGen;
