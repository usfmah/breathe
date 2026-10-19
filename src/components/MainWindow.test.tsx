import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MainWindow, type MainWindowActions } from "./MainWindow";
import type { Settings, Snapshot } from "@/lib/types";

const settings: Settings = {
  intervalMinutes: 45,
  eyesEnabled: true,
  movementEnabled: true,
  snoozeEnabled: true,
  theme: "system",
  startWithSession: false,
  startRunning: true,
};

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    state: "running",
    windowHidden: false,
    intervalMinutes: 45,
    remainingMs: 32 * 60 * 1000 + 15 * 1000,
    remainingFraction: 0.72,
    nextKind: "eyes",
    nextAtMs: Date.UTC(2026, 3, 13, 10, 29),
    snoozeRemainingMs: null,
    ...overrides,
  };
}

function actions(overrides: Partial<MainWindowActions> = {}): MainWindowActions {
  return {
    onPause: vi.fn(),
    onResume: vi.fn(),
    onSetInterval: vi.fn(),
    onOpenSettings: vi.fn(),
    onHide: vi.fn(),
    onMinimize: vi.fn(),
    ...overrides,
  };
}

describe("<MainWindow />", () => {
  it("renders the countdown, caption and interval picker", () => {
    render(
      <MainWindow settings={settings} snapshot={snapshot()} actions={actions()} />,
    );

    expect(screen.getByText("32:15")).toBeTruthy();
    expect(screen.getByText("Next eye break in")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Reminder interval" })).toBeTruthy();
    expect(screen.getByText("Every 45 minutes")).toBeTruthy();
  });

  it("pauses when the primary button is pressed while running", () => {
    const handlers = actions();
    render(
      <MainWindow settings={settings} snapshot={snapshot()} actions={handlers} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Pause reminders/i }));
    expect(handlers.onPause).toHaveBeenCalledTimes(1);
    expect(handlers.onResume).not.toHaveBeenCalled();
  });

  it("resumes when the primary button is pressed while paused", () => {
    const handlers = actions();
    render(
      <MainWindow
        settings={settings}
        snapshot={snapshot({ state: "paused" })}
        actions={handlers}
      />,
    );

    expect(screen.getByText("Paused")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Resume reminders/i }));
    expect(handlers.onResume).toHaveBeenCalledTimes(1);
    expect(handlers.onPause).not.toHaveBeenCalled();
  });

  it("offers Resume now while snoozed and hides the real countdown", () => {
    const handlers = actions();
    render(
      <MainWindow
        settings={settings}
        snapshot={snapshot({
          state: "snoozed",
          snoozeRemainingMs: 4 * 60 * 1000 + 30 * 1000,
        })}
        actions={handlers}
      />,
    );

    expect(screen.getByText("04:30")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Resume now reminders/i }));
    expect(handlers.onResume).toHaveBeenCalledTimes(1);
  });

  it("disables the primary action and blanks the ring when reminders are off", () => {
    render(
      <MainWindow
        settings={{ ...settings, eyesEnabled: false, movementEnabled: false }}
        snapshot={snapshot()}
        actions={actions()}
      />,
    );

    expect(screen.getByText("--:--")).toBeTruthy();
    const button = screen.getByRole("button", { name: /Pause reminders/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("forwards interval changes as numbers", () => {
    const handlers = actions();
    render(
      <MainWindow settings={settings} snapshot={snapshot()} actions={handlers} />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Reminder interval" }), {
      target: { value: "60" },
    });

    expect(handlers.onSetInterval).toHaveBeenCalledWith(60);
  });

  it("opens settings from the gear button", () => {
    const handlers = actions();
    render(
      <MainWindow settings={settings} snapshot={snapshot()} actions={handlers} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("hides to the background instead of quitting from the title bar", () => {
    const handlers = actions();
    render(
      <MainWindow settings={settings} snapshot={snapshot()} actions={handlers} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Hide Breathe to the background/i }),
    );
    expect(handlers.onHide).toHaveBeenCalledTimes(1);
  });
});
