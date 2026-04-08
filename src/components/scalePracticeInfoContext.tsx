"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Ctx = {
  activeId: string | null;
  openOrToggle: (id: string) => void;
  close: () => void;
  isOpen: (id: string) => boolean;
};

const Context = createContext<Ctx | null>(null);

export function ScalePracticeInfoProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const openOrToggle = useCallback((id: string) => {
    setActiveId((prev) => (prev === id ? null : id));
  }, []);

  const close = useCallback(() => setActiveId(null), []);

  useEffect(() => {
    if (!activeId) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target as Node;
      const root = document.querySelector(
        `[data-scale-info-root="${activeId}"]`,
      );
      if (root?.contains(el)) return;
      setActiveId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveId(null);
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [activeId]);

  const value = useMemo(
    () => ({
      activeId,
      openOrToggle,
      close,
      isOpen: (id: string) => activeId === id,
    }),
    [activeId, openOrToggle, close],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useScalePracticeInfo(): Ctx {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useScalePracticeInfo must be used within ScalePracticeInfoProvider");
  }
  return ctx;
}
