import { useState, useEffect } from "react";

// custom hook that syncs dark mode preference with localStorage and html class
export function useDarkMode() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("darkMode");
      if (stored !== null) {
        return stored === "true";
      }
    } catch {
      // Ignore storage access issues (private mode / blocked storage)
      void 0;
    }
    // if nothing in storage, respect system preference
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", enabled);
    try {
      localStorage.setItem("darkMode", String(enabled));
    } catch {
      // Ignore storage access issues (private mode / blocked storage)
      void 0;
    }
  }, [enabled]);

  const toggle = () => setEnabled((v) => !v);

  return { enabled, toggle };
}
