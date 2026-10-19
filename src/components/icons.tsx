import type { SVGProps } from "react";

/**
 * A single, consistent 24px stroke icon set. Keeping these inline avoids an icon
 * dependency and lets every glyph inherit `currentColor` for theming.
 */

type IconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number };

function Svg({ strokeWidth = 1.7, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

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

export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 6.5v11M14.5 6.5v11" strokeWidth={2.2} />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.5 5.8v12.4l10-6.2-10-6.2Z" fill="currentColor" strokeWidth={1.4} />
    </Svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 14.2a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.05-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.46V20a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.05a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-.97H4a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.05.06a1.6 1.6 0 0 0 1.77.32H9.8a1.6 1.6 0 0 0 .97-1.46V4a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.05-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.05a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.46.97H20a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.46.97Z" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.6V12l2.9 1.9" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.6 12S6 5.9 12 5.9 21.4 12 21.4 12 18 18.1 12 18.1 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="2.9" />
    </Svg>
  );
}

export function MovementIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12.4" cy="4.6" r="1.9" />
      <path d="M12.9 8.3 9.6 11l2.6 2.4.5 5.3" />
      <path d="M12.2 13.4 8.2 19" />
      <path d="M9.6 11 6 12.9M13.6 9.2l3.8 2.2" />
    </Svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18.1 15.6c-.8-1-1.3-1.9-1.3-4.1a4.8 4.8 0 1 0-9.6 0c0 2.2-.5 3.1-1.3 4.1-.4.5 0 1.2.6 1.2h11c.6 0 1-.7.6-1.2Z" />
      <path d="M9.9 19.3a2.2 2.2 0 0 0 4.2 0" />
    </Svg>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2a8.8 8.8 0 0 0 0 17.6c1.3 0 1.9-.9 1.9-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.9.8-1.6 1.7-1.6h1.6a4 4 0 0 0 4-4c0-4.2-3.7-7.7-8.2-7.7Z" />
      <circle cx="8.1" cy="10.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.9" cy="10.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.6" cy="14.6" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function PowerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6V12" />
      <path d="M7.4 6.3a7.6 7.6 0 1 0 9.2 0" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.2" />
      <circle cx="12" cy="8.1" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 10l5 5 5-5" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.8 9.4 17 19 7.4" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.8v4.8" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}
