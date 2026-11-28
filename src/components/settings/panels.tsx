import { cn } from "@/lib/cn";
import { formatMinutes, reminderLabel } from "@/lib/format";
import { Rich, useT } from "@/i18n/I18nProvider";
import { LANGUAGES } from "@/lib/i18n";
import { snoozeActionLabel } from "@/lib/presentation";
import {
  INTERVAL_OPTIONS,
  SNOOZE_MINUTES,
  type AppInfo,
  type AutostartStatus,
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
  LanguagesIcon,
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
  const t = useT();
  const remindersOff = !settings.eyesEnabled && !settings.movementEnabled;
  // A waiting reminder, a break and a snooze are all part of an active
  // schedule; only an explicit pause stops it.
  const running = snapshot.state !== "paused" && snapshot.state !== "quit";

  return (
    <>
      <SectionHeading
        title={t("settings.general.title")}
        description={t("settings.general.description")}
      />
      <Rows>
        <SettingRow
          icon={<ClockIcon className="h-[18px] w-[18px]" />}
          title={t("interval.label")}
          description={t("settings.general.interval.description")}
          control={
            <SelectField
              className="w-[150px]"
              label={t("interval.label")}
              leadingIcon="none"
              value={String(settings.intervalMinutes)}
              options={INTERVAL_OPTIONS.map((minutes) => ({
                value: String(minutes),
                label: formatMinutes(minutes, t),
              }))}
              onChange={(value) => {
                void update({ intervalMinutes: Number(value) });
              }}
            />
          }
        />
        <SettingRow
          icon={running ? <PauseIcon className="h-[18px] w-[18px]" /> : <PlayIcon className="h-[18px] w-[18px]" />}
          title={t("settings.general.scheduling.title")}
          description={
            running
              ? t("settings.general.scheduling.active")
              : t("settings.general.scheduling.paused")
          }
          control={
            <SecondaryButton
              disabled={remindersOff}
              onClick={() => {
                void update({ startRunning: !running });
              }}
            >
              {running ? t("action.pause") : t("action.start")}
            </SecondaryButton>
          }
        />
        <SettingRow
          icon={<LanguagesIcon className="h-[18px] w-[18px]" />}
          title={t("settings.general.language.title")}
          description={t("settings.general.language.description")}
          control={
            <SelectField
              className="w-[150px]"
              label={t("settings.general.language.title")}
              leadingIcon="none"
              value={settings.language}
              options={LANGUAGES.map((language) => ({
                value: language,
                label: t(`language.${language}`),
              }))}
              onChange={(value) => {
                if (value === "en" || value === "ar") void update({ language: value });
              }}
            />
          }
        />
      </Rows>
      {remindersOff ? (
        <div className="mt-4">
          <Note tone="warning">{t("settings.general.bothOff")}</Note>
        </div>
      ) : null}
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        {t("settings.general.intervalNote")}
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
}: PanelProps) {
  const t = useT();
  const bothEnabled = settings.eyesEnabled && settings.movementEnabled;
  const nextKind = snapshot.nextKind;
  const canSnooze =
    settings.snoozeEnabled &&
    !bothDisabled(settings) &&
    (snapshot.state === "running" ||
      snapshot.state === "snoozed" ||
      snapshot.state === "awaiting");

  return (
    <>
      <SectionHeading
        title={t("settings.reminders.title")}
        description={t("settings.reminders.description")}
      />
      <Rows>
        <SettingRow
          icon={<EyeIcon className="h-[18px] w-[18px]" />}
          title={t("settings.reminders.eyes.title")}
          description={t("settings.reminders.eyes.description")}
          control={
            <Toggle
              label={t("settings.reminders.eyes.title")}
              checked={settings.eyesEnabled}
              onChange={(next) => {
                void update({ eyesEnabled: next });
              }}
            />
          }
        />
        <SettingRow
          icon={<MovementIcon className="h-[18px] w-[18px]" />}
          title={t("settings.reminders.movement.title")}
          description={t("settings.reminders.movement.description")}
          control={
            <Toggle
              label={t("settings.reminders.movement.title")}
              checked={settings.movementEnabled}
              onChange={(next) => {
                void update({ movementEnabled: next });
              }}
            />
          }
        />
        <SettingRow
          icon={<BellIcon className="h-[18px] w-[18px]" />}
          title={t("settings.reminders.snooze.title")}
          description={t("settings.reminders.snooze.description", { count: SNOOZE_MINUTES })}
          control={
            <Toggle
              label={t("settings.reminders.snooze.title")}
              checked={settings.snoozeEnabled}
              onChange={(next) => {
                void update({ snoozeEnabled: next });
              }}
            />
          }
        />
        <SettingRow
          icon={<BellIcon className="h-[18px] w-[18px]" />}
          title={t("settings.reminders.sound.title")}
          description={t("settings.reminders.sound.description")}
          control={
            <Toggle
              label={t("settings.reminders.sound.title")}
              checked={settings.soundEnabled}
              onChange={(next) => {
                void update({ soundEnabled: next });
              }}
            />
          }
        />
      </Rows>

      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        {bothEnabled
          ? t("settings.reminders.alternating", { kind: reminderLabel(nextKind, t) })
          : settings.eyesEnabled
            ? t("settings.reminders.onlyEyes")
            : settings.movementEnabled
              ? t("settings.reminders.onlyMovement")
              : t("settings.reminders.none")}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SecondaryButton onClick={onTest} disabled={testing}>
          <BellIcon className="h-[15px] w-[15px]" />
          {testing ? t("settings.reminders.testing") : t("settings.reminders.test")}
        </SecondaryButton>
        <SecondaryButton onClick={onSnooze} disabled={!canSnooze}>
          <ClockIcon className="h-[15px] w-[15px]" />
          {snoozeActionLabel(t)}
        </SecondaryButton>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-subtle">
        {t("settings.reminders.testNote", { count: SNOOZE_MINUTES })}
      </p>

      <div className="mt-3 space-y-2">
        {testResult ? (
          <Note tone={testResult.delivered ? "success" : "warning"}>
            {testResult.delivered
              ? t("settings.reminders.testShown")
              : t("settings.reminders.testFailed", { error: testResult.error ?? "" })}
          </Note>
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
        className="absolute start-3 top-1/2 h-[26px] w-[26px] -translate-y-1/2 rounded-full"
        style={{
          border: `3px solid ${palette.arc}`,
          borderRightColor: palette.track,
          borderBottomColor: palette.track,
        }}
      />
      <div
        className="absolute end-3 top-[13px] h-[7px] w-[34px] rounded-full"
        style={{ backgroundColor: palette.line }}
      />
      <div
        className="absolute end-3 top-[26px] h-[7px] w-[22px] rounded-full"
        style={{ backgroundColor: palette.line }}
      />
      <div
        className="absolute bottom-[10px] end-3 h-[10px] w-[46px] rounded-full"
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
        "group rounded-2xl border p-2.5 text-start transition-colors",
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
          <CheckIcon className="ms-auto h-[14px] w-[14px] text-accent" />
        ) : null}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-snug text-muted">
        {description}
      </div>
    </button>
  );
}

export function AppearancePanel({ settings, update }: PanelProps) {
  const t = useT();
  const themes: ThemePreference[] = ["system", "light", "dark"];

  return (
    <>
      <SectionHeading
        title={t("settings.appearance.title")}
        description={t("settings.appearance.description")}
      />
      <div
        role="radiogroup"
        aria-label={t("settings.appearance.themeAria")}
        className="grid grid-cols-3 gap-3"
      >
        {themes.map((mode) => (
          <ThemeTile
            key={mode}
            mode={mode}
            label={t(`settings.appearance.${mode}.label`)}
            description={t(`settings.appearance.${mode}.description`)}
            active={settings.theme === mode}
            onSelect={() => {
              void update({ theme: mode });
            }}
          />
        ))}
      </div>
      <p className="mt-5 text-[12.5px] leading-relaxed text-muted">
        <PaletteIcon className="me-1.5 -mt-0.5 inline h-[14px] w-[14px]" />
        {t("settings.appearance.note")}
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
  const t = useT();
  const enabled = autostartStatus?.enabled ?? settings.startWithSession;
  const windowsStartup = autostartStatus?.mechanism === "Windows Run key";
  const linuxStartup = autostartStatus?.mechanism === "XDG autostart";
  const macStartup = autostartStatus?.mechanism === "macOS LaunchAgent";

  return (
    <>
      <SectionHeading
        title={t("settings.startup.title")}
        description={t("settings.startup.description")}
      />
      <Rows>
        <SettingRow
          icon={<PowerIcon className="h-[18px] w-[18px]" />}
          title={t("settings.startup.toggle.title")}
          description={t("settings.startup.toggle.description")}
          control={
            <Toggle
              label={t("settings.startup.toggle.title")}
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
              <Rich
                text={t("settings.startup.enabledVia")}
                parts={{ mechanism: <strong>{autostartStatus.mechanism}</strong> }}
              />
              {autostartStatus.entryPath ? (
                <span className="mt-1 block">
                  <Mono>{autostartStatus.entryPath}</Mono>
                </span>
              ) : null}
              {!autostartStatus.sessionReadsStartupEntry ? (
                <span className="mt-1 block">{t("settings.startup.mayNotRead")}</span>
              ) : null}
            </Note>
          ) : (
            <Note>{t("settings.startup.disabled")}</Note>
          )
        ) : null}

        {autostartStatus?.notes.map((note) => (
          <Note key={note}>{note}</Note>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-line bg-surface-muted px-4 py-3.5">
        <h3 className="text-[13px] font-medium text-fg">
          {t("settings.startup.remove.title")}
        </h3>
        {windowsStartup ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            <Rich
              text={t("settings.startup.remove.windows")}
              parts={{
                path: <Mono>HKCU\Software\Microsoft\Windows\CurrentVersion\Run</Mono>,
              }}
            />
          </p>
        ) : macStartup ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            <Rich
              text={t("settings.startup.remove.macos")}
              parts={{ path: <Mono>~/Library/LaunchAgents/Breathe.plist</Mono> }}
            />
          </p>
        ) : linuxStartup ? (
          <>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
              {t("settings.startup.remove.linux")}
            </p>
            <p className="mt-2">
              <Mono>rm ~/.config/autostart/Breathe.desktop</Mono>
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              <Rich
                text={t("settings.startup.remove.niri")}
                parts={{
                  line: <Mono>spawn-at-startup</Mono>,
                  file: <Mono>~/.config/niri/config.kdl</Mono>,
                }}
              />
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            {t("settings.startup.remove.desktopOnly")}
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
  const t = useT();
  const version = appInfo?.version ?? "0.1.0";

  return (
    <>
      <SectionHeading title={t("settings.about.title")} />
      <div className="mt-4 flex items-start gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent-soft">
          <LeafMark className="h-8 w-8 text-accent" />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[16px] font-semibold text-fg">{t("app.name")}</h3>
            <span className="text-[12.5px] text-subtle">v{version}</span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {t("settings.about.description")}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <Rows>
          <SettingRow
            icon={<InfoIcon className="h-[18px] w-[18px]" />}
            title={t("settings.about.runtime.title")}
            description={t("settings.about.runtime.description")}
            control={
              <span className="text-[12.5px] text-muted">
                Tauri {appInfo?.tauriVersion ?? "2"}
              </span>
            }
          />
          <SettingRow
            icon={<PowerIcon className="h-[18px] w-[18px]" />}
            title={t("settings.about.platform.title")}
            description={t("settings.about.platform.description")}
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
          {t("settings.about.nonintrusive")}
        </Note>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <SettingRow
          title={t("settings.about.quit.title")}
          description={t("settings.about.quit.description")}
          control={
            <SecondaryButton onClick={onQuit}>{t("settings.about.quit.button")}</SecondaryButton>
          }
        />
      </div>
    </>
  );
}
