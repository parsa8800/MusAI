import type { ReactNode } from "react";

export function StepShell({
  step,
  title,
  subtitle,
  accent: _accent,
  cornerAction,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  accent: "emerald" | "sky" | "violet";
  /** e.g. help (i) control anchored to the step card */
  cornerAction?: ReactNode;
  children: ReactNode;
}) {
  void _accent;

  return (
    <section className="musai-glass-surface relative overflow-visible">
      <div
        className="pointer-events-none absolute bottom-5 left-0 top-5 w-[2px] rounded-full bg-[var(--musai-accent)] opacity-70"
        aria-hidden
      />
      <div
        className={
          cornerAction
            ? "relative z-[2] px-5 pb-14 pt-6 sm:px-7 sm:pb-16 sm:pt-7"
            : "relative z-[2] px-5 py-6 sm:px-7 sm:py-7"
        }
      >
        <div className="flex gap-3 pl-0.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--musai-radius)] border border-[var(--musai-border)] bg-[var(--musai-surface-2)] text-xs font-bold tabular-nums text-[var(--musai-ink)]">
            {step}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="font-display text-sm font-semibold tracking-tight text-[var(--musai-ink)]">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--musai-muted)]">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6">{children}</div>
      </div>
      {cornerAction ? (
        <div className="absolute bottom-3 right-3 z-20 sm:bottom-4 sm:right-4">
          {cornerAction}
        </div>
      ) : null}
    </section>
  );
}
