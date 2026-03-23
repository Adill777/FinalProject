import { Link } from "react-router-dom";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { ProfessionalCard } from "@/components/ui/professional-card";

const PrivacyPolicy = () => {
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
          <h1 className="text-3xl font-bold text-foreground">FreqVault Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective date: March 4, 2026</p>

          <div className="mt-8 space-y-6 text-sm leading-6 text-foreground/90">
            <section>
              <h2 className="text-base font-semibold">1. Data We Collect</h2>
              <p>
                We process account details (name, email), authentication data, audit events, and operational
                metadata required to secure and run the portal.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">2. How We Use Data</h2>
              <p>
                Data is used for authentication, access control, security monitoring, notifications, and service
                reliability. We do not use your data for unrelated profiling.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">3. Data Sharing</h2>
              <p>
                Data is shared only with authorized administrators and approved service providers necessary for
                portal operation, security, and legal compliance.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">4. Retention</h2>
              <p>
                We retain data only as long as needed for security, operational, and compliance purposes. Retention
                timelines are controlled by organizational policy.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">5. Your Rights</h2>
              <p>
                Depending on your jurisdiction and organization, you may request access, correction, or deletion of
                personal data through your administrator.
              </p>
            </section>
          </div>
        </ProfessionalCard>
      </div>
    </div>
  );
};

export default PrivacyPolicy;

