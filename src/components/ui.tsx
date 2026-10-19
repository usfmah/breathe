import type { ChangeEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertIcon, BellIcon, ChevronDownIcon, ClockIcon, CheckIcon } from "./icons";

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  /** Overrides the accessible name, e.g. "Pause reminders" for a "Pause" label. */
  ariaLabel?: string;
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
  title,
  ariaLabel,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        "flex h-11 w-full items-center justify-center gap-2.5 rounded-[14px]",
        "bg-accent text-[14px] font-medium text-accent-fg",
        "transition-colors hover:bg-accent-hover active:bg-accent",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  className,
  title,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-line",
        "bg-surface px-3.5 text-[13px] font-medium text-fg transition-colors",
        "hover:bg-surface-hover active:bg-line",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  label,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-line",
        "bg-surface text-muted transition-colors",
        "hover:bg-surface-hover hover:text-fg active:bg-line",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Toggle                                                                     */
/* -------------------------------------------------------------------------- */

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[26px] w-[46px] shrink-0 rounded-full border transition-colors",
        checked
          ? "border-transparent bg-accent"
          : "border-line-strong bg-transparent hover:bg-surface-hover",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 block h-[19px] w-[19px] -translate-y-1/2 rounded-full shadow-sm transition-all",
          checked
            ? "left-[23px] bg-accent-fg"
            : "left-[3px] bg-line-strong",
        )}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Select                                                                     */
/* -------------------------------------------------------------------------- */

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  label: string;
  leadingIcon?: "clock" | "none";
  className?: string;
}

export function SelectField({
  value,
  options,
  onChange,
  label,
  leadingIcon = "clock",
  className,
}: SelectFieldProps) {
  return (
    <div className={cn("relative", className)}>
      {leadingIcon === "clock" ? (
        <ClockIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-muted" />
      ) : null}
      <select
        aria-label={label}
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value)
        }
        className={cn(
          "h-11 w-full cursor-pointer appearance-none rounded-[14px] border border-line",
          "bg-surface text-[13.5px] font-medium text-fg transition-colors",
          "hover:bg-surface-hover",
          leadingIcon === "clock" ? "pl-10" : "pl-3.5",
          "pr-9",
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-muted" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                             */
/* -------------------------------------------------------------------------- */

export function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-1">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-fg">
        {title}
      </h2>
      {description ? (
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>
      ) : null}
    </div>
  );
}

interface SettingRowProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  control: ReactNode;
  /** Stacks the control under the text, for wide controls like theme pickers. */
  stacked?: boolean;
}

export function SettingRow({
  icon,
  title,
  description,
  control,
  stacked = false,
}: SettingRowProps) {
  return (
    <div
      className={cn(
        "flex gap-3.5 py-4",
        stacked ? "flex-col" : "items-center",
      )}
    >
      <div className={cn("flex items-center gap-3.5", stacked ? "" : "min-w-0 flex-1")}>
        {icon ? (
          <span className="shrink-0 text-muted" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-fg">{title}</div>
          {description ? (
            <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      <div className={cn("shrink-0", stacked && "w-full")}>{control}</div>
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>;
}

export function Note({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warning" | "success";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed",
        tone === "neutral" && "border-line bg-surface-muted text-muted",
        tone === "warning" && "border-danger/35 bg-danger/10 text-danger",
        tone === "success" && "border-accent/35 bg-accent-soft text-accent-soft-fg",
      )}
    >
      <span className="mt-[1px] shrink-0" aria-hidden="true">
        {tone === "success" ? (
          <CheckIcon className="h-[15px] w-[15px]" />
        ) : tone === "warning" ? (
          <AlertIcon className="h-[15px] w-[15px]" />
        ) : (
          <BellIcon className="h-[15px] w-[15px]" />
        )}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-line/60 px-1.5 py-0.5 font-mono text-[11.5px] break-all">
      {children}
    </code>
  );
}
