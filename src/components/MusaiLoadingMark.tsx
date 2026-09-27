/**
 * The one loading mark for the app. A dot hops across three notes, and a
 * bar fills underneath without a time or a percent.
 */
export function MusaiLoadingMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? "musai-load musai-load--compact" : "musai-load"}
      aria-hidden
    >
      <svg
        className="musai-piece-load__staff"
        viewBox="0 0 240 88"
      >
        <g className="musai-piece-load__lines">
          <line x1="16" y1="28" x2="224" y2="28" />
          <line x1="16" y1="38" x2="224" y2="38" />
          <line x1="16" y1="48" x2="224" y2="48" />
          <line x1="16" y1="58" x2="224" y2="58" />
          <line x1="16" y1="68" x2="224" y2="68" />
        </g>
        <g className="musai-piece-load__note musai-piece-load__note--1">
          <ellipse cx="52" cy="58" rx="7.2" ry="5" transform="rotate(-16 52 58)" />
          <path d="M58.4 56.4V34" />
        </g>
        <g className="musai-piece-load__note musai-piece-load__note--2">
          <ellipse cx="120" cy="48" rx="7.2" ry="5" transform="rotate(-16 120 48)" />
          <path d="M126.4 46.4V24" />
        </g>
        <g className="musai-piece-load__note musai-piece-load__note--3">
          <ellipse cx="188" cy="38" rx="7.2" ry="5" transform="rotate(-16 188 38)" />
          <path d="M194.4 36.4V14" />
        </g>
        <circle className="musai-piece-load__dot" cx="52" cy="58" r="4.4" />
      </svg>
      <div className="musai-load__track">
        <span className="musai-load__fill" />
      </div>
    </div>
  );
}

/** Full-page wait. Same mark as every other loading screen. */
export function MusaiLoadingScreen({
  label = "Loading",
}: {
  label?: string;
}) {
  return (
    <div
      className="musai-load-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <MusaiLoadingMark />
      <p className="musai-load-screen__copy">{label}</p>
    </div>
  );
}
