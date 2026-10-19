import { useBreathe } from "@/hooks/useBreathe";
import { MainWindow } from "@/components/MainWindow";
import { SettingsWindow } from "@/components/settings/SettingsWindow";

/**
 * Both windows load the same bundle and route on the Tauri window label. The
 * settings window is created lazily by Rust the first time it is opened.
 */
export default function App() {
  const controller = useBreathe();

  if (!controller.ready || !controller.settings || !controller.snapshot) {
    // Keep the frame painted in the right colour while state loads, so the
    // window never flashes white.
    return <div className="h-full w-full bg-app" />;
  }

  if (controller.windowLabel === "settings") {
    return <SettingsWindow controller={controller} />;
  }

  return (
    <MainWindow
      settings={controller.settings}
      snapshot={controller.snapshot}
      actions={{
        onPause: () => {
          void controller.pause();
        },
        onResume: () => {
          void controller.resume();
        },
        onSetInterval: (minutes: number) => {
          void controller.update({ intervalMinutes: minutes });
        },
        onOpenSettings: () => {
          void controller.openSettings();
        },
        onHide: () => {
          void controller.hide();
        },
        onMinimize: () => {
          void controller.minimize();
        },
      }}
    />
  );
}
