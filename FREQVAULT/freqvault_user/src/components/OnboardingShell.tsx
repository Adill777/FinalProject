import type { ReactNode } from "react";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { ProfessionalCard } from "@/components/ui/professional-card";
import { Badge } from "@/components/ui/badge";

interface OnboardingShellProps {
  stepLabel?: string;
  stepHint?: string;
  title: string;
  description: string;
  icon?: ReactNode;
  children: ReactNode;
}

export const OnboardingShell = ({
  stepLabel,
  stepHint,
  title,
  description,
  icon,
  children
}: OnboardingShellProps) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.12),transparent_40%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.1),transparent_45%),linear-gradient(145deg,hsl(var(--background))_0%,hsl(var(--accent)/0.12)_100%)] p-8">
      <div className="pointer-events-none absolute -left-20 top-12 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-12 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center justify-center">
      <ProfessionalCard className="relative w-full max-w-3xl border border-border/70 bg-card/90 p-8 shadow-xl backdrop-blur md:p-10">
        <div className="absolute right-4 top-4">
          <DarkModeToggle />
        </div>

        <div className="mb-4 text-center">
          <h1 className="aeronox-logo text-4xl font-bold">Aeronox</h1>
          <p className="text-xs text-muted-foreground">Secure onboarding workspace</p>
        </div>

        {(stepLabel || stepHint) && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
            {stepLabel ? <Badge variant="secondary">{stepLabel}</Badge> : <span />}
            {stepHint ? <span className="text-sm text-muted-foreground">{stepHint}</span> : null}
          </div>
        )}

        <div className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            {icon}
            <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {children}
      </ProfessionalCard>
      </div>
    </div>
  );
};
