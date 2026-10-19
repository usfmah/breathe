import { useMemo } from "react";
import { intervalLabel } from "@/lib/format";
import { describeMainWindow, primaryActionLabel } from "@/lib/presentation";
import { INTERVAL_OPTIONS, type Settings, type Snapshot } from "@/lib/types";
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

export function MainWindow({ settings, snapshot, actions }: MainWindowProps) {
  const copy = useMemo(
    () => describeMainWindow(settings, snapshot),
    [settings, snapshot],
  );

  const intervalOptions = useMemo(
    () =>
      INTERVAL_OPTIONS.map((minutes) => ({
        value: String(minutes),
        label: intervalLabel(minutes),
      })),
    [],
  );

  const resuming = copy.phase === "paused" || copy.phase === "snoozed";
  const primaryLabel = primaryActionLabel(copy.phase);

  return (
    <div className="flex h-full flex-col bg-app">
      <TitleBar onMinimize={actions.onMinimize} onHide={actions.onHide} />

      <main className="flex min-h-0 flex-1 flex-col px-6 pb-5">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <CircularTimer
            className="w-[234px] max-w-full"
            timeText={copy.time}
            label={copy.label}
            remainingFraction={snapshot.remainingFraction}
            muted={copy.muted}
          />
        </div>

        <p
          className="mx-auto mt-4 min-h-[40px] max-w-[292px] text-center text-[13px] leading-[1.55] text-muted"
          aria-live="polite"
        >
          {copy.support}
        </p>

        <PrimaryButton
          className="mt-4"
          onClick={resuming ? actions.onResume : actions.onPause}
          title={`${primaryLabel} reminders`}
          ariaLabel={`${primaryLabel} reminders`}
          disabled={copy.phase === "disabled"}
        >
          {resuming ? (
            <PlayIcon className="h-[15px] w-[15px]" />
          ) : (
            <PauseIcon className="h-[15px] w-[15px]" />
          )}
          {primaryLabel}
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
