import { Link } from "react-router-dom";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { ProfessionalCard } from "@/components/ui/professional-card";

const CookiePolicy = () => {
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
          <h1 className="text-3xl font-bold text-foreground">Aeronox Cookie Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective date: March 4, 2026</p>

          <div className="mt-8 space-y-6 text-sm leading-6 text-foreground/90">
            <section>
              <h2 className="text-base font-semibold">1. What Cookies We Use</h2>
              <p>
                Aeronox uses essential cookies for session management, CSRF protection, authentication continuity,
                and basic security controls.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">2. Why We Use Cookies</h2>
              <p>
                Cookies help keep sessions secure, allow token refresh flows, and maintain reliable portal
                behavior across requests.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">3. Third-Party Cookies</h2>
              <p>
                The portal does not intentionally use advertising or tracking cookies. Operational providers may
                process limited technical data required for infrastructure and security.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">4. Managing Cookies</h2>
              <p>
                You can manage cookies in your browser settings, but disabling essential cookies may prevent
                login and secure portal use.
              </p>
            </section>

            <section>
              <h2 className="text-base font-semibold">5. Policy Updates</h2>
              <p>
                This policy may be updated as security and compliance requirements evolve. Material changes are
                reflected by updating the effective date.
              </p>
            </section>
          </div>
        </ProfessionalCard>
      </div>
    </div>
  );
};

export default CookiePolicy;
