import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CloseIcon, LeafMark, MinusIcon } from "./icons";

interface BarButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}

function BarButton({ label, onClick, children, danger }: BarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "no-drag grid h-7 w-7 place-items-center rounded-lg text-subtle transition-colors",
        "hover:bg-surface-hover hover:text-fg active:bg-line",
        danger && "hover:bg-danger/15 hover:text-danger",
      )}
    >
      {children}
    </button>
  );
}

interface TitleBarProps {
  /** Replaces the default window buttons, e.g. on the settings window. */
  trailing?: ReactNode;
  onMinimize?: () => void;
  onHide?: () => void;
  hideLabel?: string;
}

/**
 * Frameless windows need their own chrome. The whole bar is a drag region; the
 * buttons opt out with `.no-drag`. Children of a drag region must not receive
 * pointer events, otherwise Tauri's hit test misses them (see `styles.css`).
 */
export function TitleBar({
  trailing,
  onMinimize,
  onHide,
  hideLabel = "Hide Breathe to the background",
}: TitleBarProps) {
  return (
    <header className="drag-region flex h-12 shrink-0 items-center gap-2.5 px-3.5">
      <LeafMark className="h-[19px] w-[19px] text-accent" />
      <h1 className="text-[14.5px] font-medium tracking-[-0.01em] text-fg">
        Breathe
      </h1>

      <div className="no-drag ml-auto flex items-center gap-0.5">
        {trailing ?? (
          <>
            {onMinimize ? (
              <BarButton label="Minimize" onClick={onMinimize}>
                <MinusIcon className="h-4 w-4" />
              </BarButton>
            ) : null}
            {onHide ? (
              <BarButton label={hideLabel} onClick={onHide}>
                <CloseIcon className="h-4 w-4" />
              </BarButton>
            ) : null}
          </>
        )}
      </div>
    </header>
  );
}
