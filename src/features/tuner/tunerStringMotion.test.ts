import { describe, expect, it } from "vitest";
import {
  amplitudeFromEnergy,
  biasFromCents,
  energyFromRms,
  smoothToward,
  standingWavePath,
  visualHzFromPitch,
} from "@/lib/tunerStringMotion";

describe("visualHzFromPitch", () => {
  it("keeps visual speed in a calm range", () => {
    const c = visualHzFromPitch(130.81);
    const a = visualHzFromPitch(440);
    const e = visualHzFromPitch(659.25);
    expect(c).toBeGreaterThanOrEqual(2.3);
    expect(e).toBeLessThanOrEqual(5.5);
    expect(a).toBeGreaterThan(c);
    expect(e).toBeGreaterThan(a);
  });
});

describe("energyFromRms", () => {
  it("treats silence as no energy", () => {
    expect(energyFromRms(0)).toBe(0);
    expect(energyFromRms(0.0004)).toBe(0);
  });

  it("grows with louder input and stays capped", () => {
    expect(energyFromRms(0.08)).toBeGreaterThan(energyFromRms(0.03));
    expect(energyFromRms(1)).toBe(1);
  });
});

describe("amplitudeFromEnergy", () => {
  it("uses a smaller cap when in tune", () => {
    expect(amplitudeFromEnergy(1, true)).toBeLessThan(amplitudeFromEnergy(1, false));
  });
});

describe("biasFromCents", () => {
  it("leans left when flat and right when sharp", () => {
    expect(biasFromCents(-20, false)).toBeLessThan(0);
    expect(biasFromCents(20, false)).toBeGreaterThan(0);
    expect(biasFromCents(8, true)).toBe(0);
  });
});

describe("smoothToward", () => {
  it("approaches the target without overshooting", () => {
    const next = smoothToward(0, 4, 0.28, 0.085, 1 / 60);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(4);
    expect(smoothToward(4, 0, 0.28, 0.085, 1 / 30)).toBeLessThan(
      smoothToward(4, 0, 0.28, 0.085, 1 / 60),
    );
  });
});

describe("standingWavePath", () => {
  it("keeps the nut and bridge fixed", () => {
    const d = standingWavePath(100, 14, 200, 4, -1.2, Math.PI / 2);
    expect(d.startsWith("M 100 14")).toBe(true);
    const parts = d.trim().split(/\s+/);
    expect(Number(parts[parts.length - 2])).toBeCloseTo(100, 1);
    expect(Number(parts[parts.length - 1])).toBeCloseTo(200, 1);
  });

  it("is a straight line when still", () => {
    expect(standingWavePath(80, 14, 200, 0, 0, 1)).toBe("M 80 14 L 80 200");
  });
});
