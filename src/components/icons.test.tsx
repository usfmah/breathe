import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AlertIcon,
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  EyeIcon,
  InfoIcon,
  LeafMark,
  MinusIcon,
  MovementIcon,
  PaletteIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  SettingsIcon,
} from "./icons";

const functionalIcons = {
  AlertIcon,
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  EyeIcon,
  InfoIcon,
  MinusIcon,
  MovementIcon,
  PaletteIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  SettingsIcon,
};

describe("icon set", () => {
  it("draws functional icons as decorative, themeable Lucide SVGs", () => {
    const { container } = render(<BellIcon className="h-[18px] w-[18px]" />);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(svg!.getAttribute("focusable")).toBe("false");
    expect(svg!.getAttribute("class")).toContain("h-[18px]");
    // `currentColor` is what lets every glyph follow the light/dark tokens.
    expect(svg!.getAttribute("stroke")).toBe("currentColor");
    expect(svg!.getAttribute("stroke-width")).toBe("1.7");
  });

  it("lets a caller override the stroke width", () => {
    const { container } = render(<MinusIcon strokeWidth={2.2} />);
    expect(container.querySelector("svg")!.getAttribute("stroke-width")).toBe(
      "2.2",
    );
  });

  it("keeps the bespoke two-tone leaf mark", () => {
    const { container } = render(<LeafMark />);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("viewBox")).toBe("0 0 24 24");
    // The brand mark is a stem plus two filled leaves; Lucide glyphs are strokes.
    expect(svg!.querySelectorAll('path[fill="currentColor"]')).toHaveLength(2);
  });

  it("exports every glyph the windows use", () => {
    for (const [name, Icon] of Object.entries(functionalIcons)) {
      const { container, unmount } = render(<Icon />);
      expect(container.querySelector("svg"), name).not.toBeNull();
      unmount();
    }
  });
});
