import { useNavigate } from "react-router-dom";
import { ProfessionalButton } from "@/components/ui/professional-button";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-accent/30 to-secondary flex items-center justify-center p-8">
      <div className="text-center animate-fade-in-up">
        {/* FreqVault Logo */}
        <div className="mb-16">
          <h1 className="freqvault-logo text-8xl font-bold mb-6">
            FreqVault
          </h1>
          <p className="text-xl text-muted-foreground font-light max-w-md mx-auto">
            Professional Secure File Transmission System
          </p>
        </div>

        {/* Portal Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* User Portal */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-8 border border-border/50 shadow-[var(--shadow-soft)] animate-scale-in">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary to-primary-glow rounded-full flex items-center justify-center mb-6 shadow-[var(--shadow-glow)]">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-4">User Portal</h2>
            <p className="text-muted-foreground mb-6">Access your secure files and manage your account</p>
            <div className="space-y-4">
              <ProfessionalButton
                size="lg"
                onClick={() => navigate("/user/login")}
                className="w-full"
              >
                Login
              </ProfessionalButton>
              <ProfessionalButton
                variant="outline"
                size="lg"
                onClick={() => navigate("/user/signup")}
                className="w-full"
              >
                Sign Up
              </ProfessionalButton>
            </div>
          </div>

          {/* Admin Portal */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl p-8 border border-border/50 shadow-[var(--shadow-soft)] animate-scale-in" style={{ animationDelay: "0.2s" }}>
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-accent-foreground to-secondary-foreground rounded-full flex items-center justify-center mb-6 shadow-[var(--shadow-medium)]">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-4">Admin Portal</h2>
            <p className="text-muted-foreground mb-6">Manage files, users, and system settings</p>
            <ProfessionalButton
              variant="secondary"
              size="lg"
              onClick={() => navigate("/admin/login")}
              className="w-full"
            >
              Access Admin Portal
            </ProfessionalButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;