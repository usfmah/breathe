import { useMemo } from "react";
import { formatClockTime, formatDuration, intervalLabel } from "@/lib/format";
import {
  INTERVAL_OPTIONS,
  type Settings,
  type Snapshot,
} from "@/lib/types";
import { CircularTimer } from "./CircularTimer";
import { TitleBar } from "./TitleBar";
import { PauseIcon, PlayIcon, SettingsIcon } from "./icons";
import { IconButton, PrimaryButton, SelectField } from "./ui";

export interface MainWindowActions {
  onPause: () => void;
  onResume: () => void;
  onSetInterval: (minutes: number) => void;
  onOpenSettings: () => void;
  onHide: () => void;
  onMinimize: () => void;
}

interface MainWindowProps {
  settings: Settings;
  snapshot: Snapshot;
  actions: MainWindowActions;
}

type Phase = "running" | "paused" | "snoozed" | "disabled";

interface Copy {
  label: string;
  time: string;
  support: string;
  phase: Phase;
}

function describe(settings: Settings, snapshot: Snapshot): Copy {
  const remindersOff = !settings.eyesEnabled && !settings.movementEnabled;

  if (remindersOff) {
    return {
      label: "Reminders are off",
      time: "--:--",
      support: "Turn on eye rest or movement reminders in Settings.",
      phase: "disabled",
    };
  }

  if (snapshot.state === "paused") {
    return {
      label: "Paused",
      time: formatDuration(snapshot.remainingMs),
      support: "Reminders are paused. You can resume them anytime.",
      phase: "paused",
    };
  }

  if (snapshot.state === "snoozed") {
    const at = formatClockTime(snapshot.nextAtMs);
    return {
      label: "Snoozed",
      time: formatDuration(snapshot.snoozeRemainingMs ?? snapshot.remainingMs),
      support: at
        ? `Next reminder at ${at}.`
        : "The next reminder is scheduled shortly.",
      phase: "snoozed",
    };
  }

  const nextLabel =
    snapshot.nextKind === "movement"
      ? "Next movement break in"
      : snapshot.nextKind === "eyes"
        ? "Next eye break in"
        : "Next break in";

  return {
    label: nextLabel,
    time: formatDuration(snapshot.remainingMs),
    support: "A short break now helps you focus better later.",
    phase: "running",
  };
}

export function MainWindow({ settings, snapshot, actions }: MainWindowProps) {
  const copy = useMemo(() => describe(settings, snapshot), [settings, snapshot]);

  const intervalOptions = useMemo(
    () =>
      INTERVAL_OPTIONS.map((minutes) => ({
        value: String(minutes),
        label: intervalLabel(minutes),
      })),
    [],
  );

  const primary =
    copy.phase === "paused" || copy.phase === "snoozed"
      ? {
          label: copy.phase === "snoozed" ? "Resume now" : "Resume",
          icon: <PlayIcon className="h-[15px] w-[15px]" />,
          onClick: actions.onResume,
        }
      : {
          label: "Pause",
          icon: <PauseIcon className="h-[15px] w-[15px]" />,
          onClick: actions.onPause,
        };

  return (
    <div className="flex h-full flex-col bg-app">
      <TitleBar onMinimize={actions.onMinimize} onHide={actions.onHide} />

      <main className="flex min-h-0 flex-1 flex-col px-6 pb-5">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <CircularTimer
            className="w-[236px] max-w-full"
            timeText={copy.time}
            label={copy.label}
            remainingFraction={snapshot.remainingFraction}
            muted={copy.phase !== "running"}
          />
        </div>

        <p
          className="mx-auto mt-4 max-w-[300px] text-center text-[13px] leading-[1.55] text-muted"
          aria-live="polite"
        >
          {copy.support}
        </p>

        <PrimaryButton
          className="mt-5"
          onClick={primary.onClick}
          disabled={copy.phase === "disabled" && false}
          title={`${primary.label} reminders`}
        >
          {primary.icon}
          {primary.label}
        </PrimaryButton>

        <div className="mt-3 flex items-stretch gap-2.5">
          <SelectField
            className="flex-1"
            label="Reminder interval"
            value={String(snapshot.intervalMinutes)}
            options={intervalOptions}
            onChange={(value) => actions.onSetInterval(Number(value))}
          />
          <IconButton label="Settings" onClick={actions.onOpenSettings}>
            <SettingsIcon className="h-[18px] w-[18px]" />
          </IconButton>
        </div>
      </main>
    </div>
  );
}
