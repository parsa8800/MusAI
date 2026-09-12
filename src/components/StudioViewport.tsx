"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Full-viewport practice shells (Scale Studio) — lock body scroll and cover the
 * site footer so phone Safari chrome doesn’t leave a clipped half-screen.
 */
export function StudioViewport({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    html.dataset.studioViewport = "1";
    body.style.overflow = "hidden";
    return () => {
      delete html.dataset.studioViewport;
      body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[5] flex h-dvh max-h-dvh flex-col overflow-hidden bg-[var(--musai-bg)] pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      {children}
    </div>
  );
}
