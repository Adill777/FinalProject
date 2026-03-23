import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background shadow-[inset_0_1px_0_rgba(208,215,222,0.2)] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-[#0969da] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0969da]/30 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:border-[#388bfd] dark:focus-visible:ring-[#388bfd]/35 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
