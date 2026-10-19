import {
  Bell,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  Eye,
  Info,
  Minus,
  Palette,
  Pause,
  PersonStanding,
  Play,
  Power,
  Settings,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { SVGProps } from "react";

/**
 * Breathe's icon set.
 *
 * Functional glyphs come from lucide-react, whose 24px grid, rounded joins and
 * 1.7px strokes are exactly the visual language the hand-drawn set was already
 * imitating. Using the library keeps every glyph consistent, gives us the full
 * catalogue for future settings, and removes a pile of hand-maintained paths.
 *
 * The brand leaf is the one deliberate exception: it is a custom two-tone mark
 * (stem plus a lighter second leaf) used in the title bar, the countdown and
 * About, and has no equivalent in a general-purpose icon set.
 */

type IconProps = Omit<LucideProps, "ref">;

function icon(Glyph: LucideIcon) {
  return function BreatheIcon({ strokeWidth = 1.7, ...props }: IconProps) {
    return (
      <Glyph
        strokeWidth={strokeWidth}
        aria-hidden="true"
        focusable="false"
        {...props}
      />
    );
  };
}

export const MinusIcon = icon(Minus);
export const CloseIcon = icon(X);
export const PauseIcon = icon(Pause);
export const PlayIcon = icon(Play);
export const SettingsIcon = icon(Settings);
export const ClockIcon = icon(Clock);
export const EyeIcon = icon(Eye);
export const MovementIcon = icon(PersonStanding);
export const BellIcon = icon(Bell);
export const PaletteIcon = icon(Palette);
export const PowerIcon = icon(Power);
export const InfoIcon = icon(Info);
export const ChevronDownIcon = icon(ChevronDown);
export const CheckIcon = icon(Check);
export const AlertIcon = icon(CircleAlert);

export function LeafMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <path
        d="M12 20.43V14.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 14.9c0-5.15 3.1-8.4 8.1-8.4 0 5.1-3 8.4-8.1 8.4Z"
        fill="currentColor"
      />
      <path
        d="M11.72 16.97c0-2.86-3-5.52-6.72-5.52 0 2.9 3 5.55 6.72 5.55Z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}
