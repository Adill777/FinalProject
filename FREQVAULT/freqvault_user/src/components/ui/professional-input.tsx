import { useState, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ProfessionalInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const ProfessionalInput = forwardRef<HTMLInputElement, ProfessionalInputProps>(
  ({ label, className, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(false);

    return (
      <div className="relative">
        <input
          ref={ref}
          className={cn(
            "professional-input w-full placeholder-transparent",
            "focus:outline-none",
            className
          )}
          onFocus={() => setIsFocused(true)}
          onBlur={(e) => {
            setIsFocused(false);
            setHasValue(e.target.value !== "");
          }}
          onChange={(e) => setHasValue(e.target.value !== "")}
          {...props}
        />
        <label
          className={cn(
            "floating-label",
            (isFocused || hasValue) && "active"
          )}
        >
          {label}
        </label>
      </div>
    );
  }
);

ProfessionalInput.displayName = "ProfessionalInput";

export { ProfessionalInput };