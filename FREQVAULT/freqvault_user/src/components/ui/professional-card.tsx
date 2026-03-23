import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ProfessionalCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "glass";
}

const ProfessionalCard = forwardRef<HTMLDivElement, ProfessionalCardProps>(
  ({ variant = "default", className, ...props }, ref) => {
    const variants = {
      default: "professional-card",
      elevated: "professional-card shadow-[var(--shadow-medium)]",
      glass: "professional-card bg-white/90 backdrop-blur-lg border-white/20"
    };

    return (
      <div
        ref={ref}
        className={cn(variants[variant], className)}
        {...props}
      />
    );
  }
);

ProfessionalCard.displayName = "ProfessionalCard";

export { ProfessionalCard };