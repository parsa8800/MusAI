import Link from "next/link";
import type { MouseEventHandler } from "react";

function HubNote({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 52 32" className={className}>
      <ellipse
        cx="34"
        cy="20.75"
        rx="4.35"
        ry="2.85"
        transform="rotate(-18 34 20.75)"
      />
      <path d="M37.6 18.7V6.1" />
      <path d="M37.6 6.1c5.4 1.7 7.1 5.1 4.6 8.6" />
    </svg>
  );
}

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
    <div className={`musai-hub-back-wrap mb-5 w-fit max-w-full sm:mb-6 ${className}`.trim()}>
      <Link
        href={href}
        onClick={onClick}
        className="musai-pressable musai-hub-back"
        aria-label={ariaLabel ?? `Back to ${label}`}
      >
        <span className="musai-hub-back__mark" aria-hidden>
          <span className="musai-hub-back__arrow-wrap">
            <svg viewBox="0 0 24 24" className="musai-hub-back__arrow">
              <path d="M14.5 5.5 6.2 12l8.3 6.5" />
            </svg>
          </span>
          <span className="musai-hub-back__stage">
            <svg viewBox="0 0 52 32" className="musai-hub-back__note">
              <g className="musai-hub-back__staff">
                <path d="M1 6.5h50M1 11.25h50M1 16h50M1 20.75h50M1 25.5h50" />
              </g>
            </svg>
            <HubNote className="musai-hub-back__note musai-hub-back__ghost" />
            <HubNote className="musai-hub-back__note musai-hub-back__mover" />
          </span>
        </span>
        <span className="musai-hub-back__label">{label}</span>
      </Link>
    </div>
  );
}
