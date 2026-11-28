import { useState, type ComponentType, type ReactElement } from "react";
import type { BreatheController } from "@/hooks/useBreathe";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { TitleBar } from "../TitleBar";
import {
  BellIcon,
  ClockIcon,
  InfoIcon,
  PaletteIcon,
  PowerIcon,
} from "../icons";
import { Note } from "../ui";
import {
  AboutPanel,
  AppearancePanel,
  GeneralPanel,
  RemindersPanel,
  StartupPanel,
} from "./panels";

type SectionId = "general" | "reminders" | "appearance" | "startup" | "about";

interface NavItem {
  id: SectionId;
  Icon: ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { id: "general", Icon: ClockIcon },
  { id: "reminders", Icon: BellIcon },
  { id: "appearance", Icon: PaletteIcon },
  { id: "startup", Icon: PowerIcon },
  { id: "about", Icon: InfoIcon },
];

interface SettingsWindowProps {
  controller: BreatheController;
}

export function SettingsWindow({ controller }: SettingsWindowProps) {
  const t = useT();
  const [active, setActive] = useState<SectionId>("general");
  const { settings, snapshot } = controller;

  if (!settings || !snapshot) return null;

  const panelProps = {
    settings,
    snapshot,
    update: controller.update,
    testing: controller.testing,
    testResult: controller.testResult,
    onTest: () => {
      void controller.sendTest();
    },
    onSnooze: () => {
      void controller.snooze();
    },
    autostartStatus: controller.autostartStatus,
    autostartBusy: controller.autostartBusy,
    onToggleAutostart: (enabled: boolean) => {
      void controller.toggleAutostart(enabled);
    },
    appInfo: controller.appInfo,
    onQuit: () => {
      void controller.quit();
    },
  };

  const panels: Record<SectionId, ReactElement> = {
    general: <GeneralPanel {...panelProps} />,
    reminders: <RemindersPanel {...panelProps} />,
    appearance: <AppearancePanel {...panelProps} />,
    startup: <StartupPanel {...panelProps} />,
    about: <AboutPanel {...panelProps} />,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app">
      <TitleBar
        onHide={() => {
          void controller.hide();
        }}
        hideLabel={t("titlebar.closeSettings")}
      />

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label={t("settings.nav.aria")}
          className="flex w-[204px] shrink-0 flex-col gap-1 px-3.5 pb-4"
        >
          {NAV.map(({ id, Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActive(id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-start text-[13.5px] transition-colors",
                  isActive
                    ? "bg-accent-soft font-medium text-accent-soft-fg"
                    : "text-muted hover:bg-surface-hover hover:text-fg",
                )}
              >
                <Icon className="h-[17px] w-[17px] shrink-0" />
                {t(`settings.nav.${id}`)}
              </button>
            );
          })}
        </nav>

        <div className="settings-scroll scroll-block min-w-0 flex-1 overflow-y-auto px-7 pb-8 pt-1">
          <div className="mx-auto max-w-[470px]">
            {panels[active]}

            {controller.lastError ? (
              <div className="mt-6">
                <Note tone="warning">
                  <div className="flex items-start gap-3">
                    <span className="flex-1">{controller.lastError}</span>
                    <button
                      type="button"
                      onClick={controller.clearError}
                      className="shrink-0 text-[12px] font-medium underline decoration-dotted"
                    >
                      {t("action.dismiss")}
                    </button>
                  </div>
                </Note>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
