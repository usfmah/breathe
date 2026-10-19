import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === "dark" ? "dark" : "light";
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#121815" : "#f7f2e8");
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      if (!window.localStorage.getItem("breathe-theme")) {
        setTheme(event.matches ? "dark" : "light");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = () => {
    setTheme((previous) => {
      const next = previous === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem("breathe-theme", next);
      } catch {
        // Theme switching still works when storage is unavailable.
      }
      return next;
    });
  };

  return { theme, toggleTheme };
}
