import Link from "next/link";
import type { MouseEventHandler } from "react";

type Props = {
  /** Destination for the back control. Defaults to practice hub. */
  href?: string;
  /** Visible label. Defaults to "Practice hub". */
  label?: string;
  /** Accessible name; defaults from label. */
  ariaLabel?: string;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

/**
 * Consistent back control for exercise and results routes.
 */
export function PracticeHubBackLink({
  href = "/",
  label = "Practice hub",
  ariaLabel,
  className = "",
  onClick,
}: Props) {
  return (
    <div className={`mb-5 w-fit max-w-full sm:mb-6 ${className}`.trim()}>
      <Link
        href={href}
        onClick={onClick}
        className="group musai-pressable musai-glass inline-flex min-h-10 items-center gap-2.5 rounded-[var(--musai-radius)] py-1.5 pl-1.5 pr-3.5 text-[13px] font-medium text-[var(--musai-muted)] hover:border-[color-mix(in_srgb,var(--musai-accent)_28%,var(--musai-glass-stroke))] hover:text-[var(--musai-ink)]"
        aria-label={ariaLabel ?? `Back to ${label}`}
      >
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[max(0.375rem,calc(var(--musai-radius)-0.35rem))] border border-[var(--musai-glass-stroke)] bg-[color-mix(in_srgb,var(--musai-surface-2)_70%,transparent)] text-[var(--musai-muted)] transition-colors duration-200 group-hover:text-[var(--musai-ink)]"
          aria-hidden
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
        </span>
        <span className="max-sm:hidden">{label}</span>
      </Link>
    </div>
  );
}
