import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RemindersPanel, type PanelProps } from "./panels";
import type { Settings, Snapshot } from "@/lib/types";

const settings: Settings = {
  intervalMinutes: 45,
  eyesEnabled: true,
  movementEnabled: true,
  snoozeEnabled: true,
  soundEnabled: true,
  notificationStyle: "popup",
  language: "en",
  theme: "system",
  startWithSession: false,
  startRunning: true,
};

const snapshot: Snapshot = {
  state: "running",
  windowHidden: false,
  intervalMinutes: 45,
  remainingMs: 60_000,
  remainingFraction: 0.5,
  nextKind: "eyes",
  nextAtMs: null,
  snoozeRemainingMs: null,
  pending: null,
};

function props(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    settings,
    snapshot,
    update: vi.fn(async () => {}),
    testing: false,
    testResult: null,
    onTest: vi.fn(),
    onSnooze: vi.fn(),
    autostartStatus: null,
    autostartBusy: false,
    onToggleAutostart: vi.fn(),
    appInfo: null,
    onQuit: vi.fn(),
    ...overrides,
  };
}

describe("<RemindersPanel /> reminder style", () => {
  it("offers the popup and system notifications, defaulting to the popup", () => {
    render(<RemindersPanel {...props()} />);
    const select = screen.getByRole("combobox", { name: "Reminder style" }) as HTMLSelectElement;
    expect(select.value).toBe("popup");
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      "Breathe popup",
      "System notifications",
    ]);
    expect(
      (screen.getByRole("switch", { name: "Play a sound" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("saves the chosen style", () => {
    const update = vi.fn(async () => {});
    render(<RemindersPanel {...props({ update })} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Reminder style" }), {
      target: { value: "system" },
    });
    expect(update).toHaveBeenCalledWith({ notificationStyle: "system" });
  });

  it("disables the popup chime when system notifications are used", () => {
    render(
      <RemindersPanel
        {...props({ settings: { ...settings, notificationStyle: "system" } })}
      />,
    );
    expect(
      (screen.getByRole("switch", { name: "Play a sound" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Take a break or snooze from the tray/)).toBeTruthy();
  });
});
