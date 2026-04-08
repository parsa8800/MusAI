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
      ? "from-emerald-400/90 to-teal-600/20"
      : accent === "sky"
        ? "from-sky-400/90 to-blue-600/20"
        : "from-violet-400/90 to-purple-600/20";

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/[0.1] bg-white/[0.035] shadow-[0_12px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
      <div
        className={`pointer-events-none absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b ${bar}`}
        aria-hidden
      />
      <div
        className={
          cornerAction
            ? "px-5 pb-14 pt-6 sm:px-7 sm:pb-16 sm:pt-7"
            : "px-5 py-6 sm:px-7 sm:py-7"
        }
      >
        <div className="flex gap-3 pl-0.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-xs font-bold tabular-nums text-white ring-1 ring-white/[0.12]">
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

