"use client";

import { PracticeHubBackLink } from "@/components/PracticeHubBackLink";
import { useInstrument } from "@/components/InstrumentProvider";
import { MusaiSegmentedControl } from "@/components/MusaiSegmentedControl";
import {
  useTheme,
  type ThemePreference,
} from "@/components/ThemeProvider";
import { useAnimeEntrance } from "@/hooks/useAnimeEntrance";
import { INSTRUMENT_IDS, getInstrument, type InstrumentId } from "@/lib/instrument";

/**
 * App settings — instrument and appearance, one centred column.
 */
export function SettingsView() {
  const { preference, setPreference } = useTheme();
  const { instrumentId, setInstrumentId } = useInstrument();
  const entranceRef = useAnimeEntrance<HTMLDivElement>({ delay: 40 });

  return (
    <div ref={entranceRef} className="musai-settings">
      <div className="musai-settings__nav" data-anime-enter>
        <PracticeHubBackLink className="musai-settings__back" />
      </div>

      <div className="musai-settings__stage">
        <header className="musai-settings__header" data-anime-enter>
          <h1 className="musai-settings__title font-display">Settings</h1>
        </header>

        <section
          className="musai-settings__panel"
          data-anime-enter
          aria-label="Preferences"
        >
          <div className="musai-settings__group">
            <p className="musai-settings__label">Instrument</p>
            <div className="musai-settings__control">
              <MusaiSegmentedControl<InstrumentId>
                ariaLabel="Instrument"
                value={instrumentId}
                onChange={setInstrumentId}
                options={INSTRUMENT_IDS.map((id) => ({
                  value: id,
                  label: getInstrument(id).name,
                }))}
                className="musai-settings__segmented"
              />
            </div>
          </div>

          <div className="musai-settings__group">
            <p className="musai-settings__label">Appearance</p>
            <div className="musai-settings__control">
              <MusaiSegmentedControl<ThemePreference>
                ariaLabel="Colour theme"
                value={preference}
                onChange={setPreference}
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                  { value: "system", label: "System" },
                ]}
                className="musai-settings__segmented"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
