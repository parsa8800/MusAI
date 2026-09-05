"use client";

import type { ReactNode } from "react";
import { useAnimeEntrance } from "@/hooks/useAnimeEntrance";

type Props = {
  children: ReactNode;
  className?: string;
  /** Delay before entrance (ms). */
  delay?: number;
  /** When false, skip anime and render immediately. */
  active?: boolean;
  /** Role / aria for status regions. */
  role?: string;
  "aria-live"?: "off" | "polite" | "assertive";
};

/**
 * Lightweight entrance wrapper. Mark inner nodes with `data-anime-enter`
 * for staggered reveals; otherwise the root fades up.
 */
export function AnimatedReveal({
  children,
  className = "",
  delay = 0,
  active = true,
  role,
  "aria-live": ariaLive,
}: Props) {
  const ref = useAnimeEntrance<HTMLDivElement>({
    delay,
    disabled: !active,
  });

  return (
    <div
      ref={ref}
      className={className}
      role={role}
      aria-live={ariaLive}
    >
      {children}
    </div>
  );
}
