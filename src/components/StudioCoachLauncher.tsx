/**
 * Shared coach launcher. The panel stays closed until this is pressed so a
 * studio page is not filled by a fixed coach column.
 */
export function StudioCoachLauncher({
  open,
  controlsId,
  onToggle,
}: {
  open: boolean;
  controlsId: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="musai-pressable musai-studio-coach-fab"
      aria-expanded={open}
      aria-controls={controlsId}
      aria-label={open ? "Close coach" : "Open coach"}
      onClick={onToggle}
    >
      {open ? (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3.2 3.6h9.6a1.2 1.2 0 0 1 1.2 1.2v5.2a1.2 1.2 0 0 1-1.2 1.2H7.1L4.2 13.4V11.2H3.2A1.2 1.2 0 0 1 2 10V4.8a1.2 1.2 0 0 1 1.2-1.2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      )}
      Coach
    </button>
  );
}
