import { Sun, Moon } from "lucide-react";
import { useDarkMode } from "@/hooks/use-dark-mode";

export const DarkModeToggle = () => {
  const { enabled, toggle } = useDarkMode();

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-full border border-border bg-background p-2 text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label="Toggle dark mode"
    >
      {enabled ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
};
