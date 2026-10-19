import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  resolveTheme,
  systemPrefersDark,
  watchSystemTheme,
  THEME_STORAGE_KEY,
} from "./theme";

describe("resolveTheme", () => {
  it("honours explicit overrides regardless of the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system for the default preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("writes the resolved theme onto the document root", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset["theme"]).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("mirrors the preference for the pre-paint boot script", () => {
    applyTheme("dark", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    applyTheme("light", "system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("does not overwrite the mirror when no preference is given", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    applyTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});

describe("system preference detection", () => {
  it("reports light when matchMedia is missing", () => {
    const original = window.matchMedia;
    // @ts-expect-error – simulate an environment without matchMedia
    delete window.matchMedia;
    expect(systemPrefersDark()).toBe(false);
    expect(watchSystemTheme(vi.fn())()).toBeUndefined();
    window.matchMedia = original;
  });

  it("subscribes and unsubscribes to change events", () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const addEventListener = vi.fn(
      (_: string, handler: (event: MediaQueryListEvent) => void) => {
        listeners.add(handler);
      },
    );
    const removeEventListener = vi.fn(
      (_: string, handler: (event: MediaQueryListEvent) => void) => {
        listeners.delete(handler);
      },
    );

    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener,
        removeEventListener,
      })),
    );

    const seen: boolean[] = [];
    const stop = watchSystemTheme((dark) => seen.push(dark));

    for (const handler of listeners) {
      handler({ matches: false } as MediaQueryListEvent);
    }
    expect(seen).toEqual([false]);

    stop();
    expect(removeEventListener).toHaveBeenCalledTimes(1);
  });
});
