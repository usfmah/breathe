import { useEffect, useState } from "react";
import { loadLatestRelease, type LatestReleaseState } from "./release";

export function useLatestRelease(): LatestReleaseState {
  const [state, setState] = useState<LatestReleaseState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);

    void loadLatestRelease(fetch, controller.signal)
      .then((next) => {
        if (active) setState(next);
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return state;
}
