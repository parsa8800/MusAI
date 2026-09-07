import Link from "next/link";

type Props = {
  /** Destination for the back control. Defaults to practice hub. */
  href?: string;
  /** Visible label. Defaults to "Practice hub". */
  label?: string;
  /** Accessible name; defaults from label. */
  ariaLabel?: string;
  className?: string;
};

/**
 * Consistent back control for exercise and results routes.
 */
export function PracticeHubBackLink({
  href = "/",
  label = "Practice hub",
  ariaLabel,
  className = "",
}: Props) {
  return (
    <div className={`mb-5 w-full sm:mb-6 ${className}`.trim()}>
      <Link
        href={href}
        className="group inline-flex items-center gap-2.5 rounded-[var(--musai-radius)] border border-[var(--musai-border)] bg-[var(--musai-surface)] py-1.5 pl-1.5 pr-3.5 text-[13px] font-medium text-[var(--musai-muted)] shadow-[var(--musai-shadow)] transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--musai-accent)_28%,var(--musai-border))] hover:text-[var(--musai-ink)] active:scale-[0.98] motion-reduce:active:scale-100"
        aria-label={ariaLabel ?? `Back to ${label}`}
      >
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[calc(var(--musai-radius)-2px)] border border-[var(--musai-border)] bg-[var(--musai-surface-2)] text-[var(--musai-muted)] transition-colors duration-200 group-hover:text-[var(--musai-ink)]"
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
        <span>{label}</span>
      </Link>
    </div>
  );
}
