import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ProfessionalCard } from "@/components/ui/professional-card";
import { ProfessionalButton } from "@/components/ui/professional-button";
import { ProfessionalInput } from "@/components/ui/professional-input";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  email: string;
  name: string;
  status: "active" | "pending";
}

const AdminEncrypt = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const user = location.state?.user as User;
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [publicKey, setPublicKey] = useState("");
  const [isEncrypted, setIsEncrypted] = useState(false);

  if (!user) {
    navigate("/admin/dashboard");
    return null;
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      toast({
        title: "File Selected",
        description: `Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
      });
    }
  };

  const handleEncrypt = () => {
    if (!selectedFile || !publicKey) {
      toast({
        title: "Missing Information",
        description: "Please select a file and enter the public key.",
        variant: "destructive"
      });
      return;
    }

    // Simulate encryption process
    setTimeout(() => {
      setIsEncrypted(true);
      toast({
        title: "File Successfully Encrypted",
        description: `${selectedFile.name} has been encrypted and is ready for secure transmission.`,
      });
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-accent/20 to-secondary">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-lg border-b border-border/50 shadow-[var(--shadow-soft)]">
        <div className="max-w-7xl mx-auto px-8 py-6 flex justify-between items-center">
          <h1 className="aeronox-logo text-3xl font-bold">Aeronox Admin</h1>
          <div className="flex items-center gap-6">
            <ProfessionalButton variant="outline" onClick={() => navigate("/admin/dashboard")}>
              Back to Dashboard
            </ProfessionalButton>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-12 animate-fade-in-up">
          <h2 className="text-4xl font-semibold mb-4">File Encryption</h2>
          <p className="text-xl text-muted-foreground">
            Encrypt and transmit files securely to <span className="text-primary font-medium">{user.name}</span>
          </p>
        </div>

        {/* User Info Card */}
        <ProfessionalCard className="p-8 mb-8 animate-scale-in">
          <div className="flex items-center space-x-6">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary-glow rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-2xl font-semibold">{user.name}</h3>
              <p className="text-muted-foreground text-lg">{user.email}</p>
            </div>
          </div>
        </ProfessionalCard>

        {!isEncrypted ? (
          <div className="space-y-8">
            {/* File Upload Section */}
            <ProfessionalCard className="p-8 animate-scale-in" style={{ animationDelay: "0.1s" }}>
              <h3 className="text-xl font-semibold mb-6">1. Select File to Encrypt</h3>
              
              <div className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary transition-colors duration-200">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={handleFileSelect}
                  aria-label="Select file to encrypt"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary/20 to-primary-glow/20 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div className="text-lg font-medium text-primary mb-2">Choose File</div>
                  <div className="text-muted-foreground">or drag and drop your file here</div>
                </label>
              </div>

              {selectedFile && (
                <div className="mt-6 p-4 bg-accent rounded-xl border border-primary/20">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium">{selectedFile.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </ProfessionalCard>

            {/* Public Key Section */}
            <ProfessionalCard className="p-8 animate-scale-in" style={{ animationDelay: "0.2s" }}>
              <h3 className="text-xl font-semibold mb-6">2. Enter User's Public Key</h3>
              
              <div className="space-y-4">
                <ProfessionalInput
                  label="Public Key"
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder="-----BEGIN PUBLIC KEY-----..."
                  autoComplete="off"
                />
                <p className="text-sm text-muted-foreground">
                  Enter the recipient's public key to encrypt the file securely.
                </p>
              </div>
            </ProfessionalCard>

            {/* Encrypt Button */}
            <div className="text-center animate-scale-in" style={{ animationDelay: "0.3s" }}>
              <ProfessionalButton
                size="lg"
                onClick={handleEncrypt}
                disabled={!selectedFile || !publicKey}
                className="px-16"
                aria-label="Encrypt selected file"
              >
                Encrypt File
              </ProfessionalButton>
            </div>
          </div>
        ) : (
          /* Success State */
          <ProfessionalCard className="p-12 text-center animate-fade-in-up">
            <div className="w-24 h-24 mx-auto bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mb-8">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            
            <h3 className="text-3xl font-semibold text-green-600 mb-4">File Successfully Encrypted!</h3>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              The file <span className="font-medium">{selectedFile?.name}</span> has been encrypted using advanced 
              AES-256 encryption and is now ready for secure transmission to {user.name}.
            </p>

            <div className="flex justify-center space-x-6">
              <ProfessionalButton
                variant="outline"
                onClick={() => setIsEncrypted(false)}
                aria-label="Encrypt another file"
              >
                Encrypt Another File
              </ProfessionalButton>
              <ProfessionalButton
                onClick={() => navigate("/admin/dashboard")}
                aria-label="Back to admin dashboard"
              >
                Back to Dashboard
              </ProfessionalButton>
            </div>
          </ProfessionalCard>
        )}
      </div>
    </div>
  );
};

export default AdminEncrypt;
