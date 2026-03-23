import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ProfessionalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "default" | "lg";
}

const ProfessionalButton = forwardRef<HTMLButtonElement, ProfessionalButtonProps>(
  ({ variant = "primary", size = "default", className, children, ...props }, ref) => {
    const variants = {
      primary: "professional-button",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
      outline: "border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground bg-transparent"
    };

    const sizes = {
      default: "px-8 py-3",
      lg: "px-12 py-4 text-lg"
    };

    return (
      <button
        ref={ref}
        className={cn(
          "font-medium rounded-xl transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/20",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

ProfessionalButton.displayName = "ProfessionalButton";

export { ProfessionalButton };