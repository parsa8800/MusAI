/** The on-screen page frame, as fractions of the camera picture. */
export const PAGE_GUIDE = { x: 0.12, y: 0.16, w: 0.76, h: 0.6 };

export type ScanPixels = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

/**
 * True when a brighter sheet with a clear edge sits inside the frame.
 * A flat wall or an empty desk does not count.
 */
export function pageFillsGuide(
  image: ScanPixels,
  guide: { x: number; y: number; w: number; h: number } = PAGE_GUIDE,
): boolean {
  const { width, height, data } = image;
  if (width < 16 || height < 16) return false;

  const x0 = clamp(Math.round(guide.x * width), 1, width - 2);
  const y0 = clamp(Math.round(guide.y * height), 1, height - 2);
  const x1 = clamp(Math.round((guide.x + guide.w) * width), x0 + 2, width - 1);
  const y1 = clamp(Math.round((guide.y + guide.h) * height), y0 + 2, height - 1);
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.05));

  const luma = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
  };

  let inSum = 0;
  let inCount = 0;
  let outSum = 0;
  let outCount = 0;
  for (let y = Math.max(0, y0 - band); y < Math.min(height, y1 + band); y += 1) {
    for (let x = Math.max(0, x0 - band); x < Math.min(width, x1 + band); x += 1) {
      const value = luma(x, y);
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        inSum += value;
        inCount += 1;
      } else {
        outSum += value;
        outCount += 1;
      }
    }
  }

  let edge = 0;
  let edgeCount = 0;
  const step = Math.max(1, Math.round(Math.min(x1 - x0, y1 - y0) / 28));
  for (let x = x0; x < x1; x += step) {
    edge += Math.abs(luma(x, y0) - luma(x, Math.max(0, y0 - 2)));
    edge += Math.abs(luma(x, y1 - 1) - luma(x, Math.min(height - 1, y1 + 1)));
    edgeCount += 2;
  }
  for (let y = y0; y < y1; y += step) {
    edge += Math.abs(luma(x0, y) - luma(Math.max(0, x0 - 2), y));
    edge += Math.abs(luma(x1 - 1, y) - luma(Math.min(width - 1, x1 + 1), y));
    edgeCount += 2;
  }

  const meanIn = inSum / Math.max(1, inCount);
  const meanOut = outSum / Math.max(1, outCount);
  const edgeMean = edge / Math.max(1, edgeCount);
  return meanIn > 68 && meanIn < 246 && meanIn > meanOut + 14 && edgeMean > 16;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
