"use client";

import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import {
  useTheme,
  type ThemePreference,
} from "@/components/ThemeProvider";
import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";

/**
 * App settings — appearance for now; room to grow.
 */
export function SettingsView() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <PracticeHubBackLink />

      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--musai-ink)]">
          Settings
        </h1>
      </header>

      <section
        className="musai-glass-panel space-y-4 px-5 py-5 sm:px-6"
        aria-labelledby="settings-appearance-heading"
      >
        <h2
          id="settings-appearance-heading"
          className="text-[15px] font-semibold text-[var(--musai-ink)]"
        >
          Appearance
        </h2>

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
