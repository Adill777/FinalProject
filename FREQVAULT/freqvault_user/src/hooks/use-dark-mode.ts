import { useState, useEffect } from "react";

const DARK_MODE_KEY = "darkMode";
const DARK_MODE_EVENT = "dark-mode-updated";

const isBrowser = () => typeof window !== "undefined";

const readInitialDarkMode = (): boolean => {
  if (!isBrowser()) return false;

  // Highest precedence: explicit class already present.
  if (document.documentElement.classList.contains("dark")) return true;

  try {
    const stored = localStorage.getItem(DARK_MODE_KEY);
    if (stored !== null) return stored === "true";
  } catch {
    // Ignore storage access issues (private mode / blocked storage)
  }

  if (window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
};

const applyDarkClass = (enabled: boolean) => {
  if (!isBrowser()) return;
  document.documentElement.classList.toggle("dark", enabled);
  document.body.classList.toggle("dark", enabled);
};

const persistDarkMode = (enabled: boolean) => {
  if (!isBrowser()) return;
  applyDarkClass(enabled);
  try {
    localStorage.setItem(DARK_MODE_KEY, String(enabled));
  } catch {
    // Ignore storage access issues (private mode / blocked storage)
  }
  window.dispatchEvent(new Event(DARK_MODE_EVENT));
};

export function useDarkMode() {
  const [enabled, setEnabled] = useState<boolean>(readInitialDarkMode);

  useEffect(() => {
    persistDarkMode(enabled);
  }, [enabled]);

  useEffect(() => {
    const syncFromStorage = () => {
      setEnabled(readInitialDarkMode());
    };

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(DARK_MODE_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(DARK_MODE_EVENT, syncFromStorage);
    };
  }, []);

  const toggle = () => {
    setEnabled((prev) => !prev);
  };

  return { enabled, toggle };
}
