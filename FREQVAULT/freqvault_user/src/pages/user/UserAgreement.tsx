import { Link } from "react-router-dom";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { ProfessionalCard } from "@/components/ui/professional-card";

const UserAgreement = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-secondary dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 p-4 sm:p-6 md:p-8 transition-colors">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/signup" className="text-sm text-muted-foreground hover:text-primary">
            Back to Sign Up
          </Link>
          <DarkModeToggle />
        </div>

        <ProfessionalCard className="p-6 sm:p-8 md:p-10">
          <h1 className="text-3xl font-bold text-foreground">Aeronox User Agreement</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective date: March 4, 2026</p>

          <div className="mt-8 space-y-6 text-sm leading-6 text-foreground/90">
            <section>
              <h2 className="text-base font-semibold">1. Account Use</h2>
              <p>
                You must provide accurate account information and keep your credentials confidential. You are
                responsible for all activity under your account.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">2. Acceptable Use</h2>
              <p>
                You may use Aeronox only for authorized business or academic purposes. Misuse, unauthorized
                access attempts, and policy violations are prohibited.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">3. Security Responsibilities</h2>
              <p>
                You must follow password and 2FA requirements, protect private keys and one-time codes, and
                report suspicious activity to your administrator immediately.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">4. Access and Availability</h2>
              <p>
                Access rights are controlled by administrators and may be revoked, suspended, or limited at any
                time for security or compliance reasons.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">5. Termination</h2>
              <p>
                Accounts may be disabled for violations, security risk, or organizational policy decisions. Audit
                records may be retained as required by governance and law.
              </p>
            </section>
          </div>
        </ProfessionalCard>
      </div>
    </div>
  );
};

export default UserAgreement;
