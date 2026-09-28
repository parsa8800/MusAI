import { describe, expect, it } from "vitest";
import { pageFillsGuide } from "@/features/piece-studio/pageScanGuide";

function image(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("pageFillsGuide", () => {
  it("sees a bright page with an edge inside the frame", () => {
    const shot = image(80, 100, (x, y) => {
      const page = x >= 10 && x < 70 && y >= 16 && y < 76;
      return page ? [236, 232, 220] : [28, 30, 34];
    });
    expect(pageFillsGuide(shot)).toBe(true);
  });

  it("ignores a flat wall", () => {
    const shot = image(80, 100, () => [180, 180, 180]);
    expect(pageFillsGuide(shot)).toBe(false);
  });

  it("ignores a page that has not reached the frame", () => {
    const shot = image(80, 100, (x, y) => {
      const scrap = x >= 34 && x < 48 && y >= 40 && y < 58;
      return scrap ? [240, 236, 226] : [24, 26, 30];
    });
    expect(pageFillsGuide(shot)).toBe(false);
  });
});
