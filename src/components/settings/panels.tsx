import { cn } from "@/lib/cn";
import { formatMinutes, reminderLabel } from "@/lib/format";
import {
  INTERVAL_OPTIONS,
  type AppInfo,
  type AutostartStatus,
  type NotificationStatus,
  type Settings,
  type SettingsPatch,
  type Snapshot,
  type TestNotificationResult,
  type ThemePreference,
} from "@/lib/types";
import {
  BellIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  InfoIcon,
  LeafMark,
  MovementIcon,
  PauseIcon,
  PlayIcon,
  PaletteIcon,
  PowerIcon,
} from "../icons";
import {
  Mono,
  Note,
  Rows,
  SecondaryButton,
  SectionHeading,
  SelectField,
  SettingRow,
  Toggle,
} from "../ui";

export interface PanelProps {
  settings: Settings;
  snapshot: Snapshot;
  update: (patch: SettingsPatch) => Promise<void>;
  testing: boolean;
  testResult: TestNotificationResult | null;
  onTest: () => void;
  onSnooze: () => void;
  notificationStatus: NotificationStatus | null;
  autostartStatus: AutostartStatus | null;
  autostartBusy: boolean;
  onToggleAutostart: (enabled: boolean) => void;
  appInfo: AppInfo | null;
  onQuit: () => void;
}

function bothDisabled(settings: Settings): boolean {
  return !settings.eyesEnabled && !settings.movementEnabled;
}

/* -------------------------------------------------------------------------- */
/* General                                                                    */
/* -------------------------------------------------------------------------- */

export function GeneralPanel({ settings, snapshot, update }: PanelProps) {
  const remindersOff = !settings.eyesEnabled && !settings.movementEnabled;
  const running = snapshot.state === "running";

  return (
    <>
      <SectionHeading
        title="General"
        description="Configure how Breathe works for you."
      />
      <Rows>
        <SettingRow
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
          title="Reminder interval"
          description="How often you would like to take a break."
          control={
            <SelectField
              className="w-[150px]"
              label="Reminder interval"
              leadingIcon="none"
              value={String(settings.intervalMinutes)}
              options={INTERVAL_OPTIONS.map((minutes) => ({
                value: String(minutes),
                label: formatMinutes(minutes),
              }))}
              onChange={(value) => {
                void update({ intervalMinutes: Number(value) });
              }}
            />
          }
        />
        <SettingRow
          icon={running ? <PauseIcon className="h-[18px] w-[18px]" /> : <PlayIcon className="h-[18px] w-[18px]" />}
          title="Reminder scheduling"
          description={
            running
              ? "Scheduling is active. Breaks are being counted down."
              : "Scheduling is paused. No reminders will be delivered."
          }
          control={
            <SecondaryButton
              disabled={remindersOff}
              onClick={() => {
                void update({ startRunning: !running });
              }}
            >
              {running ? "Pause" : "Start"}
            </SecondaryButton>
          }
        />
      </Rows>
      {remindersOff ? (
        <div className="mt-4">
          <Note tone="warning">
            Both reminder types are turned off, so Breathe will stay quiet. Enable
            eye rest or movement reminders under <strong>Reminders</strong>.
          </Note>
        </div>
      ) : null}
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        Changing the interval restarts the current countdown: the next reminder is
        scheduled one full interval from the moment you change it.
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Reminders                                                                  */
/* -------------------------------------------------------------------------- */

export function RemindersPanel({
  settings,
  snapshot,
  update,
  testing,
  testResult,
  onTest,
  onSnooze,
  notificationStatus,
}: PanelProps) {
  const bothEnabled = settings.eyesEnabled && settings.movementEnabled;
  const nextKind = snapshot.nextKind;
  const canSnooze =
    settings.snoozeEnabled &&
    !bothDisabled(settings) &&
    snapshot.state !== "paused";

  return (
    <>
      <SectionHeading
        title="Reminders"
        description="Choose what Breathe nudges you about, and how."
      />
      <Rows>
        <SettingRow
          icon={<EyeIcon className="h-[18px] w-[18px]" />}
          title="Eye break reminders"
          description="Remind me to look away from the screen for a moment."
          control={
            <Toggle
              label="Eye break reminders"
              checked={settings.eyesEnabled}
              onChange={(next) => {
                void update({ eyesEnabled: next });
              }}
            />
          }
        />
        <SettingRow
          icon={<MovementIcon className="h-[18px] w-[18px]" />}
          title="Movement reminders"
          description="Remind me to stand up, stretch and move."
          control={
            <Toggle
              label="Movement reminders"
              checked={settings.movementEnabled}
              onChange={(next) => {
                void update({ movementEnabled: next });
              }}
            />
          }
        />
        <SettingRow
          icon={<BellIcon className="h-[18px] w-[18px]" />}
          title="Allow snoozing"
          description="Adds a five minute snooze action to the tray menu and this window."
          control={
            <Toggle
              label="Allow snoozing"
              checked={settings.snoozeEnabled}
              onChange={(next) => {
                void update({ snoozeEnabled: next });
              }}
            />
          }
        />
      </Rows>

      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        {bothEnabled
          ? `Both types are enabled, so Breathe alternates between them. ${reminderLabel(
              nextKind,
            )} is next.`
          : settings.eyesEnabled
            ? "Eye break reminders are enabled, so every reminder is an eye rest."
            : settings.movementEnabled
              ? "Movement reminders are enabled, so every reminder is a movement break."
              : "No reminders are enabled."}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SecondaryButton onClick={onTest} disabled={testing}>
          <BellIcon className="h-[15px] w-[15px]" />
          {testing ? "Sending…" : "Send test notification"}
        </SecondaryButton>
        <SecondaryButton onClick={onSnooze} disabled={!canSnooze}>
          <ClockIcon className="h-[15px] w-[15px]" />
          Snooze 5 minutes
        </SecondaryButton>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-subtle">
        The test uses the category of the next scheduled reminder, so it verifies
        the real delivery path. Snoozing schedules a single reminder five minutes
        from now.
      </p>

      <div className="mt-3 space-y-2">
        {testResult ? (
          <Note tone={testResult.delivered ? "success" : "warning"}>
            {testResult.delivered
              ? `A ${reminderLabel(testResult.kind).toLowerCase()} test notification was sent to the desktop notification service.`
              : `Could not deliver the test notification. ${testResult.error ?? ""}`}
          </Note>
        ) : null}

        {notificationStatus ? (
          notificationStatus.available ? (
            <Note tone="success">
              Notification service: <strong>{notificationStatus.service}</strong>
              {notificationStatus.version ? ` ${notificationStatus.version}` : ""}
              {notificationStatus.vendor ? ` (${notificationStatus.vendor})` : ""}.
              {notificationStatus.specVersion
                ? ` Freedesktop specification ${notificationStatus.specVersion}.`
                : " The native notification service is active."}
            </Note>
          ) : (
            <Note tone="warning">
              No notification service was found. Breathe will keep scheduling,
              but nothing will be shown.
              {notificationStatus.error ? ` (${notificationStatus.error})` : ""}
            </Note>
          )
        ) : null}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

const LIGHT_PALETTE = {
  bg: "#FBF8F2",
  line: "#E8E3D7",
  arc: "#6B9474",
  track: "#E9E6DC",
  accent: "#527A5D",
};
const DARK_PALETTE = {
  bg: "#191E1C",
  line: "#2E3733",
  arc: "#82AE8F",
  track: "#2F3834",
  accent: "#7FA98C",
};

type Palette = typeof LIGHT_PALETTE;

function ThemePreviewHalf({ palette }: { palette: Palette }) {
  return (
    <div
      className="relative h-full flex-1"
      style={{ backgroundColor: palette.bg }}
    >
      <div
        className="absolute left-3 top-1/2 h-[26px] w-[26px] -translate-y-1/2 rounded-full"
        style={{
          border: `3px solid ${palette.arc}`,
          borderRightColor: palette.track,
          borderBottomColor: palette.track,
        }}
      />
      <div
        className="absolute right-3 top-[13px] h-[7px] w-[34px] rounded-full"
        style={{ backgroundColor: palette.line }}
      />
      <div
        className="absolute right-3 top-[26px] h-[7px] w-[22px] rounded-full"
        style={{ backgroundColor: palette.line }}
      />
      <div
        className="absolute bottom-[10px] right-3 h-[10px] w-[46px] rounded-full"
        style={{ backgroundColor: palette.accent }}
      />
    </div>
  );
}

function ThemeTile({
  mode,
  label,
  description,
  active,
  onSelect,
}: {
  mode: ThemePreference;
  label: string;
  description: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "group rounded-2xl border p-2.5 text-left transition-colors",
        active
          ? "border-accent bg-accent-soft"
          : "border-line hover:bg-surface-hover",
      )}
    >
      <div
        className="flex h-[58px] w-full overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--line)" }}
      >
        {mode === "system" ? (
          <>
            <ThemePreviewHalf palette={LIGHT_PALETTE} />
            <ThemePreviewHalf palette={DARK_PALETTE} />
          </>
        ) : (
          <ThemePreviewHalf
            palette={mode === "dark" ? DARK_PALETTE : LIGHT_PALETTE}
          />
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span
          className={cn(
            "text-[13px] font-medium",
            active ? "text-accent-soft-fg" : "text-fg",
          )}
        >
          {label}
        </span>
        {active ? (
          <CheckIcon className="ml-auto h-[14px] w-[14px] text-accent" />
        ) : null}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-snug text-muted">
        {description}
      </div>
    </button>
  );
}

export function AppearancePanel({ settings, update }: PanelProps) {
  const themes: Array<{
    mode: ThemePreference;
    label: string;
    description: string;
  }> = [
    {
      mode: "system",
      label: "Follow system",
      description: "Matches your desktop's light or dark preference.",
    },
    { mode: "light", label: "Light", description: "Warm cream and sage." },
    { mode: "dark", label: "Dark", description: "Soft charcoal and sage." },
  ];

  return (
    <>
      <SectionHeading
        title="Appearance"
        description="Breathe follows your desktop by default."
      />
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid grid-cols-3 gap-3"
      >
        {themes.map((theme) => (
          <ThemeTile
            key={theme.mode}
            mode={theme.mode}
            label={theme.label}
            description={theme.description}
            active={settings.theme === theme.mode}
            onSelect={() => {
              void update({ theme: theme.mode });
            }}
          />
        ))}
      </div>
      <p className="mt-5 text-[12.5px] leading-relaxed text-muted">
        <PaletteIcon className="mr-1.5 -mt-0.5 inline h-[14px] w-[14px]" />
        The theme is applied to every Breathe window immediately and is restored
        the next time the app starts.
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Startup                                                                    */
/* -------------------------------------------------------------------------- */

export function StartupPanel({
  settings,
  autostartStatus,
  autostartBusy,
  onToggleAutostart,
}: PanelProps) {
  const enabled = autostartStatus?.enabled ?? settings.startWithSession;
  const windowsStartup = autostartStatus?.mechanism === "Windows Run key";
  const linuxStartup = autostartStatus?.mechanism === "XDG autostart";

  return (
    <>
      <SectionHeading
        title="Startup"
        description="Run Breathe quietly when you log in."
      />
      <Rows>
        <SettingRow
          icon={<PowerIcon className="h-[18px] w-[18px]" />}
          title="Start with user session"
          description="Launches Breathe hidden in the background so reminders begin right away."
          control={
            <Toggle
              label="Start with user session"
              checked={enabled}
              disabled={autostartBusy}
              onChange={onToggleAutostart}
            />
          }
        />
      </Rows>

      <div className="mt-4 space-y-2">
        {autostartStatus ? (
          autostartStatus.enabled ? (
            <Note tone={autostartStatus.sessionReadsStartupEntry ? "success" : "warning"}>
              Startup integration is enabled via{" "}
              <strong>{autostartStatus.mechanism}</strong>
              {autostartStatus.entryPath ? (
                <>
                  {" "}
                  (<Mono>{autostartStatus.entryPath}</Mono>)
                </>
              ) : null}
              .
              {!autostartStatus.sessionReadsStartupEntry
                ? " This session may not read the startup entry, so check the note below."
                : null}
            </Note>
          ) : (
            <Note>Breathe will not start automatically.</Note>
          )
        ) : null}

        {autostartStatus?.notes.map((note) => (
          <Note key={note}>{note}</Note>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-surface-muted px-4 py-3.5">
        <h3 className="text-[13px] font-medium text-fg">Removing autostart</h3>
        {windowsStartup ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            Turn the switch off. This removes the per-user Run value from{" "}
            <Mono>HKCU\Software\Microsoft\Windows\CurrentVersion\Run</Mono> and
            does not require administrator rights.
          </p>
        ) : linuxStartup ? (
          <>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              Turn the switch off, or delete the desktop entry directly:
            </p>
            <p className="mt-2">
              <Mono>rm ~/.config/autostart/Breathe.desktop</Mono>
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              If you instead added Breathe manually, remove the matching{" "}
              <Mono>spawn-at-startup</Mono> line from{" "}
              <Mono>~/.config/niri/config.kdl</Mono>.
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            Startup integration is only available in the desktop app.
          </p>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* About                                                                      */
/* -------------------------------------------------------------------------- */

export function AboutPanel({ appInfo, onQuit }: PanelProps) {
  const version = appInfo?.version ?? "0.1.0";

  return (
    <>
      <SectionHeading title="About" />
      <div className="mt-4 flex items-start gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent-soft">
          <LeafMark className="h-8 w-8 text-accent" />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[16px] font-semibold text-fg">Breathe</h3>
            <span className="text-[12.5px] text-subtle">v{version}</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {appInfo?.description ??
              "A calm, minimal desktop companion that reminds you to take short movement breaks and rest your eyes."}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <Rows>
          <SettingRow
            icon={<InfoIcon className="h-[18px] w-[18px]" />}
            title="Runtime"
            description="Breathe runs a single background scheduler in Rust and only uses the webview for its interface."
            control={
              <span className="text-[12.5px] text-muted">
                Tauri {appInfo?.tauriVersion ?? "2"}
              </span>
            }
          />
          <SettingRow
            icon={<PowerIcon className="h-[18px] w-[18px]" />}
            title="Platform"
            description="Native desktop integration for Linux and Windows. Linux uses XDG conventions; Windows uses the system tray and native toast notifications."
            control={
              <span className="text-[12.5px] text-muted">
                {appInfo?.platform ?? "unknown"}
              </span>
            }
          />
        </Rows>
      </div>

      <div className="mt-5">
        <Note>
          Reminders are deliberately nonintrusive: Breathe never locks the screen,
          grabs focus or opens a blocking window when a break is due.
        </Note>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <SettingRow
          title="Quit Breathe"
          description="Closing the window only hides it. Use this to stop the scheduler and exit."
          control={
            <SecondaryButton onClick={onQuit}>Quit Breathe</SecondaryButton>
          }
        />
      </div>
    </>
  );
}
