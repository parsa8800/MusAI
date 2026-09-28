/**
 * The one loading mark for the app. A dot travels the three notes at a
 * steady pace. When `progress` is set, that bar is the only bar.
 */
export function MusaiLoadingMark({
  compact = false,
  progress,
}: {
  compact?: boolean;
  progress?: number;
}) {
  const overall =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, progress))
      : null;
  return (
    <div
      className={compact ? "musai-load musai-load--compact" : "musai-load"}
      aria-hidden={overall == null ? true : undefined}
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
        <LoadNote cx={52} cy={58} className="musai-piece-load__note" />
        <LoadNote cx={120} cy={48} className="musai-piece-load__note" />
        <LoadNote cx={188} cy={38} className="musai-piece-load__note" />
        <LoadNote
          cx={52}
          cy={58}
          className="musai-piece-load__glow musai-piece-load__glow--1"
        />
        <LoadNote
          cx={120}
          cy={48}
          className="musai-piece-load__glow musai-piece-load__glow--2"
        />
        <LoadNote
          cx={188}
          cy={38}
          className="musai-piece-load__glow musai-piece-load__glow--3"
        />
        <circle className="musai-piece-load__dot" cx="0" cy="0" r="4.4" />
      </svg>
      {overall == null ? (
        <div className="musai-load__track">
          <span className="musai-load__fill" />
        </div>
      ) : (
        <div
          className="musai-load__overall"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(overall)}
          aria-label="Converting the score"
        >
          <span style={{ width: `${overall}%` }} />
        </div>
      )}
    </div>
  );
}

function LoadNote({
  cx,
  cy,
  className,
}: {
  cx: number;
  cy: number;
  className: string;
}) {
  const stemX = cx + 6.4;
  return (
    <g className={className}>
      <ellipse
        cx={cx}
        cy={cy}
        rx="7.2"
        ry="5"
        transform={`rotate(-16 ${cx} ${cy})`}
      />
      <path d={`M${stemX} ${cy - 1.6}V${cy - 24}`} />
    </g>
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
