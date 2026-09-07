"use client";

import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import {
  useTheme,
  type ThemePreference,
} from "@/components/ThemeProvider";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { useAnimeEntrance } from "@/hooks/useAnimeEntrance";

/**
 * App settings — appearance for now; room to grow.
 */
export function SettingsView() {
  const { preference, setPreference } = useTheme();
  const entranceRef = useAnimeEntrance<HTMLDivElement>({ delay: 40 });

  return (
    <div
      ref={entranceRef}
      className="mx-auto flex w-full max-w-lg flex-col gap-8 px-5 pb-[max(5rem,env(safe-area-inset-bottom))] pt-10 sm:px-8 sm:pt-14"
    >
      <PracticeHubBackLink />

      <header data-anime-enter>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--musai-ink)]">
          Settings
        </h1>
      </header>

      <section
        data-anime-enter
        className="musai-glass-panel px-5 py-5 sm:px-6"
        aria-label="Theme"
      >
        <MusaiSegmentedControl<ThemePreference>
          ariaLabel="Colour theme"
          value={preference}
          onChange={setPreference}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
          className="max-w-none"
        />
      </section>
    </div>
  );
}
