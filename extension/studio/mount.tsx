import { render } from "preact";
import type { FeatureHealth, ReaditSettings } from "@readit/schema";
import { StudioApp } from "./StudioApp";

export type StudioApi = {
  getSettings: () => ReaditSettings;
  getHealth: () => Record<string, FeatureHealth>;
};

export type MountedStudio = {
  unmount: () => void;
};

export function mountStudio(
  host: HTMLElement,
  api: StudioApi,
): MountedStudio {
  render(<StudioApp api={api} />, host);
  return {
    unmount() {
      render(null, host);
    },
  };
}
