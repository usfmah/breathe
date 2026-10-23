import { cn } from "@/lib/cn";
import { clampFraction } from "@/lib/format";
import { LeafMark } from "./icons";

const VIEWBOX = 240;
const CENTER = VIEWBOX / 2;
const RADIUS = 104;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface CircularTimerProps {
  /** Text shown inside the ring, already formatted (MM:SS or --:--). */
  timeText: string;
  /** Caption above the time. */
  label: string;
  /** 0..1 — the fraction of the interval still remaining. */
  remainingFraction: number;
  /** Dims the arc when the schedule is not actively counting down. */
  muted?: boolean;
  className?: string;
}

/**
 * Large circular countdown. The arc represents the time *remaining*, so it
 * drains clockwise as the next break approaches.
 */
export function CircularTimer({
  timeText,
  label,
  remainingFraction,
  muted = false,
  className,
}: CircularTimerProps) {
  const fraction = clampFraction(remainingFraction);
  const dashOffset = CIRCUMFERENCE * (1 - fraction);

  return (
    <div className={cn("relative aspect-square", className)}>
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="h-full w-full -rotate-90"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="breathe-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--arc)" />
            <stop offset="100%" stopColor="var(--arc-tail)" />
          </linearGradient>
        </defs>

        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--track)"
          strokeWidth={7}
        />

        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="url(#breathe-arc)"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          opacity={muted ? 0.4 : 1}
          style={{ transition: "stroke-dashoffset 500ms linear, opacity 300ms ease" }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[12.5px] font-medium tracking-[0.01em] text-muted"
          aria-hidden="true"
        >
          {label}
        </span>
        <span
          className={cn(
            "tnum mt-0.5 text-[44px] font-semibold leading-none tracking-[-0.03em]",
            muted ? "text-muted" : "text-fg",
          )}
        >
          {timeText}
        </span>
        <LeafMark className="mt-2.5 h-[15px] w-[15px] text-accent/70" />
      </div>
    </div>
  );
}
