import { useEffect, useRef, useState } from "react";
import { playChime } from "@/lib/chime";
import { dismissPopup, getPopup, onPopup, resizePopup } from "@/lib/ipc";
import {
  breakActionLabel,
  describePopup,
  snoozeActionLabel,
} from "@/lib/presentation";
import type { PopupView } from "@/lib/types";
import { useT } from "@/i18n/I18nProvider";
import { CloseIcon, ClockIcon, EyeIcon, MovementIcon } from "./icons";

export interface PopupActions {
  onTakeBreak: (reminderId: number) => void;
  onSnooze: (reminderId: number) => void;
  onDismiss: (seq: number) => void;
}

interface PopupCardProps {
  view: PopupView;
  snoozeEnabled: boolean;
  actions: PopupActions;
}

/**
 * The popup's content. Rust owns the lifecycle (what is shown, when it hides);
 * this component only renders the current view and forwards the user's choice.
 *
 * It announces itself politely (`role="status"`) rather than as an alert: the
 * popup never takes keyboard focus, so it must not interrupt a screen reader
 * mid-sentence either.
 */
export function PopupCard({ view, snoozeEnabled, actions }: PopupCardProps) {
  const t = useT();
  const copy = describePopup(view.content, t, view.seq);
  const reminder = view.content.type === "reminder" ? view.content.reminder : null;
  const KindIcon = copy.kind === "movement" ? MovementIcon : EyeIcon;

  return (
    <div className="popup-frame w-full p-2">
      <section
        key={view.seq}
        role="status"
        aria-live="polite"
        aria-label={copy.title}
        className="popup-card popup-enter relative flex min-w-0 flex-col rounded-[18px] border border-line bg-app px-4 pb-3.5 pt-3.5 shadow-[0_10px_28px_-12px_rgb(var(--shadow)/0.45)]"
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg"
          >
            <KindIcon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0 flex-1 pe-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">
              {copy.eyebrow}
            </p>
            <h2 className="mt-0.5 text-[15px] font-semibold leading-snug text-fg">
              {copy.title}
            </h2>
            <p
              className={
                copy.bodyIsPhrase
                  ? "phrase mt-1 text-[14px] text-fg/80"
                  : "mt-1 text-[12.5px] leading-[1.5] text-muted"
              }
            >
              {copy.body}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => actions.onDismiss(view.seq)}
          aria-label={t("popup.hide")}
          title={t("popup.hideShort")}
          className="absolute end-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-subtle transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <CloseIcon className="h-[15px] w-[15px]" />
        </button>

        {reminder ? (
          <div className="mt-3.5 flex gap-2">
            <button
              type="button"
              onClick={() => actions.onTakeBreak(reminder.id)}
              className="flex h-9 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent px-3 text-[13px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
            >
              <KindIcon className="h-[15px] w-[15px]" />
              {breakActionLabel(t)}
            </button>
            {snoozeEnabled ? (
              <button
                type="button"
                onClick={() => actions.onSnooze(reminder.id)}
                className="flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-line bg-surface px-3 text-[13px] font-medium text-fg transition-colors hover:bg-surface-hover"
              >
                <ClockIcon className="h-[15px] w-[15px]" />
                {snoozeActionLabel(t)}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

interface PopupWindowProps {
  snoozeEnabled: boolean;
  soundEnabled: boolean;
  onTakeBreak: (reminderId: number) => void;
  onSnooze: (reminderId: number) => void;
}

/** The `popup` window: mirrors Rust's popup view and renders it. */
export function PopupWindow({
  snoozeEnabled,
  soundEnabled,
  onTakeBreak,
  onSnooze,
}: PopupWindowProps) {
  const [view, setView] = useState<PopupView | null>(null);
  const chimedFor = useRef<number | null>(null);

  // One chime per popup: Rust gives every new popup a new seq, so re-renders
  // and a repeated event for the same popup stay silent.
  const seq = view?.seq ?? null;
  useEffect(() => {
    if (seq === null || chimedFor.current === seq) return;
    chimedFor.current = seq;
    if (soundEnabled) void playChime();
  }, [seq, soundEnabled]);

  useEffect(() => {
    document.documentElement.dataset.window = "popup";
    // macOS webviews cannot be transparent without private APIs, so there the
    // window itself is rounded and shadowed and the card fills it.
    if (/Macintosh|Mac OS X/.test(navigator.userAgent)) {
      document.documentElement.dataset.platform = "mac";
    }
    let active = true;
    const off = onPopup((next) => {
      if (active) setView(next);
    });
    // Pull the current view too, in case Rust emitted before we listened.
    void getPopup().then((current) => {
      if (active) setView((existing) => existing ?? current);
    });
    return () => {
      active = false;
      off();
    };
  }, []);

  // The window follows the card's height (issue #17): a popup without
  // actions, or with a one-line message, has no empty band under the text.
  // offsetHeight ignores the entrance animation's transform.
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const report = () => {
      if (frame.offsetHeight > 0) void resizePopup(frame.offsetHeight);
    };
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [view]);

  if (!view) return null;

  return (
    <div ref={frameRef}>
      <PopupCard
        view={view}
        snoozeEnabled={snoozeEnabled}
        actions={{
          onTakeBreak,
          onSnooze,
          onDismiss: (seq) => {
            void dismissPopup(seq);
          },
        }}
      />
    </div>
  );
}
