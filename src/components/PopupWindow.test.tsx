import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PopupCard, type PopupActions } from "./PopupWindow";
import type { PopupView } from "@/lib/types";

function actions(): PopupActions {
  return { onTakeBreak: vi.fn(), onSnooze: vi.fn(), onDismiss: vi.fn() };
}

const reminder: PopupView = {
  seq: 5,
  content: { type: "reminder", reminder: { id: 9, kind: "eyes" } },
};

describe("<PopupCard />", () => {
  it("offers the break and the snooze for a due reminder", () => {
    const handlers = actions();
    render(<PopupCard view={reminder} snoozeEnabled actions={handlers} />);

    expect(screen.getByRole("status", { name: "Time to rest your eyes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Take a 3-minute break/ }));
    expect(handlers.onTakeBreak).toHaveBeenCalledWith(9);
    fireEvent.click(screen.getByRole("button", { name: /Snooze 10 minutes/ }));
    expect(handlers.onSnooze).toHaveBeenCalledWith(9);
  });

  it("hides without answering the reminder", () => {
    const handlers = actions();
    render(<PopupCard view={reminder} snoozeEnabled actions={handlers} />);

    fireEvent.click(screen.getByRole("button", { name: "Hide this popup" }));
    expect(handlers.onDismiss).toHaveBeenCalledWith(5);
    expect(handlers.onTakeBreak).not.toHaveBeenCalled();
    expect(handlers.onSnooze).not.toHaveBeenCalled();
  });

  it("leaves snooze out when it is turned off", () => {
    render(<PopupCard view={reminder} snoozeEnabled={false} actions={actions()} />);
    expect(screen.getByRole("button", { name: /Take a 3-minute break/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Snooze/ })).toBeNull();
  });

  it("announces the end of a break without actions", () => {
    render(
      <PopupCard
        view={{ seq: 6, content: { type: "breakOver", kind: "movement" } }}
        snoozeEnabled
        actions={actions()}
      />,
    );
    expect(screen.getByRole("status", { name: "Break's over" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /break/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Hide this popup" })).toBeTruthy();
  });

  it("marks the settings preview and offers no actions", () => {
    render(
      <PopupCard
        view={{ seq: 7, content: { type: "test", kind: "movement" } }}
        snoozeEnabled
        actions={actions()}
      />,
    );
    expect(screen.getByText("Preview")).toBeTruthy();
    expect(screen.getByText("Time to move a little")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Snooze/ })).toBeNull();
  });
});

describe("popup size (#17)", () => {
  // The window is sized to the card it measures, so the card must keep its
  // natural height: stretching it to the window brings the empty band back.
  it("does not stretch the card to fill the window", () => {
    const { container } = render(
      <PopupCard
        view={{ seq: 8, content: { type: "breakOver", kind: "eyes" } }}
        snoozeEnabled
        actions={actions()}
      />,
    );
    const frame = container.querySelector(".popup-frame");
    const card = screen.getByRole("status");
    expect(frame?.className).not.toMatch(/\bh-full\b/);
    expect(card.className).not.toMatch(/\bflex-1\b/);
    expect(container.querySelector(".mt-auto")).toBeNull();
  });
});
