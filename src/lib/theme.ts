import type { ThemePreference } from "./types";

export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "breathe.theme";

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Subscribes to the OS colour-scheme preference. Returns a no-op unsubscribe on
 * environments without `matchMedia` (such as the test runner).
 */
export function watchSystemTheme(
  onChange: (dark: boolean) => void,
): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}

/**
 * Applies the resolved theme to the document and mirrors the *preference* into
 * localStorage so `index.html` can paint the right background before React
 * boots. The authoritative copy still lives in the Rust settings store.
 */
export function applyTheme(
  resolved: ResolvedTheme,
  preference?: ThemePreference,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset["theme"] = resolved;
  root.style.colorScheme = resolved;
  if (preference) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      /* storage may be unavailable; the theme still applies for this session */
    }
  }
}
