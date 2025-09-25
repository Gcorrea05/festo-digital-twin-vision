// src/context/ThemeContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: (dark: boolean) => void;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Tema inicial: "dark" | "light" */
  defaultTheme?: "dark" | "light";
  /** Chave de armazenamento no localStorage (default: "darkMode") */
  storageKey?: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = "dark",
  storageKey = "darkMode",
}) => {
  const [isDarkMode, setIsDarkMode] = useState(defaultTheme === "dark");

  useEffect(() => {
    // 1) busca no localStorage
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      const dark = stored === "true";
      setIsDarkMode(dark);
      applyTheme(dark);
      return;
    }

    // 2) fallback: preferência do SO
    const isDark =
      defaultTheme === "dark" ||
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDarkMode(isDark);
    applyTheme(isDark);
  }, [defaultTheme, storageKey]);

  const toggleDarkMode = (dark: boolean) => {
    setIsDarkMode(dark);
    applyTheme(dark);
    localStorage.setItem(storageKey, String(dark));
  };

  const applyTheme = (dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
