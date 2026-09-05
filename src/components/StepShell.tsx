import type { ReactNode } from "react";

export function StepShell({
  step,
  title,
  subtitle,
  accent,
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
  const bar =
    accent === "emerald"
      ? "from-emerald-400/75 to-teal-600/15"
      : accent === "sky"
        ? "from-sky-400/75 to-blue-600/15"
        : "from-violet-400/75 to-purple-600/15";

  return (
    <section className="musai-glass-surface relative overflow-visible">
      <div
        className={`pointer-events-none absolute bottom-5 left-0 top-5 w-[2px] rounded-full bg-gradient-to-b ${bar}`}
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
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-xs font-bold tabular-nums text-white ring-1 ring-white/[0.1]">
            {step}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-sm font-semibold tracking-tight text-white">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
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
