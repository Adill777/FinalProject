import { Sun, Moon } from "lucide-react";
import { useDarkMode } from "@/hooks/use-dark-mode";

export const DarkModeToggle = () => {
  const { enabled, toggle } = useDarkMode();

  return (
    <button
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-md text-[#656d76] transition-colors hover:bg-[rgba(208,215,222,0.32)] dark:text-[#8b949e] dark:hover:bg-[#30363d] focus:outline-none focus:ring-2 focus:ring-[#0969da]"
      aria-label="Toggle dark mode"
      title={enabled ? "Switch to light mode" : "Switch to dark mode"}
    >
      {enabled ? (
        <Sun className="h-[18px] w-[18px]" strokeWidth={2} />
      ) : (
        <Moon className="h-[18px] w-[18px]" strokeWidth={2} />
      )}
    </button>
  );
};
