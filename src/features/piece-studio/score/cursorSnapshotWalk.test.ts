import { describe, expect, it, vi } from "vitest";
import {
  collectCursorSnapshotsFromWalk,
  collectCursorWalkSamples,
  poseFromOsmdCursorElement,
  PIECE_CURSOR_SNAPSHOT_MAX_STEPS,
  type CursorWalkHandle,
} from "@/features/piece-studio/score/cursorSnapshotWalk";

function mockWrap(): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: 400,
      bottom: 200,
      width: 400,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    scrollLeft: 0,
    scrollTop: 0,
  } as HTMLElement;
}

function makeCursor(times: number[]): CursorWalkHandle {
  let index = 0;
  const it = {
    EndReached: false,
    CurrentSourceTimestamp: { RealValue: times[0] ?? 0 },
  };
  const el = {
    getBoundingClientRect: () => ({
      left: 10 + index,
      top: 20,
      right: 12 + index,
      bottom: 60,
      width: 2,
      height: 40,
      x: 10 + index,
      y: 20,
      toJSON: () => ({}),
    }),
  } as HTMLElement;

  return {
    reset: () => {
      index = 0;
      it.EndReached = false;
      it.CurrentSourceTimestamp.RealValue = times[0] ?? 0;
    },
    show: () => {},
    hide: () => {},
    update: () => {},
    next: () => {
      index += 1;
      if (index >= times.length) {
        it.EndReached = true;
        return;
      }
      it.CurrentSourceTimestamp.RealValue = times[index]!;
    },
    cursorElement: el,
    Iterator: it,
  };
}

describe("collectCursorSnapshotsFromWalk", () => {
  it("skips clef/time-sig stops that have no sounding notes", () => {
    let index = 0;
    // First stop = meter (no notes); then two sounding notes.
    const times = [0, 0.25, 0.5];
    const sounding = [false, true, true];
    const it = {
      EndReached: false,
      CurrentSourceTimestamp: { RealValue: times[0]! },
    };
    const el = {
      getBoundingClientRect: () => ({
        left: 10 + index * 20,
        top: 20,
        right: 12 + index * 20,
        bottom: 60,
        width: 2,
        height: 40,
        x: 10 + index * 20,
        y: 20,
        toJSON: () => ({}),
      }),
    } as HTMLElement;
    const cursor: CursorWalkHandle = {
      reset: () => {
        index = 0;
        it.EndReached = false;
        it.CurrentSourceTimestamp.RealValue = times[0]!;
      },
      show: () => {},
      hide: () => {},
      update: () => {},
      next: () => {
        index += 1;
        if (index >= times.length) {
          it.EndReached = true;
          return;
        }
        it.CurrentSourceTimestamp.RealValue = times[index]!;
      },
      cursorElement: el,
      Iterator: it,
      NotesUnderCursor: () => (sounding[index] ? [{}] : []),
    };
    const samples = collectCursorWalkSamples(cursor, mockWrap(), {
      paintWidthPx: 0,
    });
    expect(samples).toHaveLength(2);
    expect(samples[0]?.x).toBe(30);
    expect(samples[1]?.x).toBe(50);
  });

  it("stops at EndReached without hitting the hard cap", () => {
    const cursor = makeCursor([0, 0.25, 0.5, 0.75]);
    const snaps = collectCursorSnapshotsFromWalk(
      cursor,
      mockWrap(),
      (wn) => wn * 4,
    );
    expect(snaps.length).toBeGreaterThan(0);
    expect(snaps.length).toBeLessThan(PIECE_CURSOR_SNAPSHOT_MAX_STEPS);
  });

  it("terminates when the iterator never sets EndReached", () => {
    let step = 0;
    const it = {
      EndReached: false,
      CurrentSourceTimestamp: { RealValue: 0 },
    };
    const cursor: CursorWalkHandle = {
      reset: () => {
        step = 0;
        it.CurrentSourceTimestamp.RealValue = 0;
      },
      show: () => {},
      hide: () => {},
      update: () => {},
      next: () => {
        step += 1;
        // Time stalls after a few steps — classic broken OSMD walk.
        it.CurrentSourceTimestamp.RealValue = step < 5 ? step * 0.25 : 1;
      },
      cursorElement: {
        getBoundingClientRect: () => ({
          left: 10,
          top: 20,
          right: 12,
          bottom: 60,
          width: 2,
          height: 40,
          x: 10,
          y: 20,
          toJSON: () => ({}),
        }),
      } as HTMLElement,
      Iterator: it,
    };

    const nextSpy = vi.spyOn(cursor, "next");
    const snaps = collectCursorSnapshotsFromWalk(
      cursor,
      mockWrap(),
      (wn) => wn * 4,
    );
    expect(nextSpy.mock.calls.length).toBeLessThan(40);
    expect(snaps.length).toBeLessThan(40);
  });

  it("shows the cursor before measuring (OSMD update is a no-op while hidden)", () => {
    const order: string[] = [];
    let hidden = true;
    let index = 0;
    const times = [0, 0.25, 0.5];
    const it = {
      EndReached: false,
      CurrentSourceTimestamp: { RealValue: 0 },
    };
    const el = {
      style: { height: "" },
      offsetHeight: 0,
      getBoundingClientRect: () => {
        if (hidden) {
          return {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          };
        }
        return {
          left: 10 + index * 20,
          top: 30,
          right: 12 + index * 20,
          bottom: 70,
          width: 2,
          height: 40,
          x: 10 + index * 20,
          y: 30,
          toJSON: () => ({}),
        };
      },
    } as unknown as HTMLElement;

    const cursor: CursorWalkHandle = {
      reset: () => {
        order.push("reset");
        index = 0;
        it.EndReached = false;
        it.CurrentSourceTimestamp.RealValue = times[0]!;
        // Mirror OSMD: update while hidden does nothing.
        if (!hidden) order.push("update-from-reset");
      },
      show: () => {
        order.push("show");
        hidden = false;
      },
      hide: () => {
        order.push("hide");
        hidden = true;
      },
      update: () => {
        if (hidden) {
          order.push("update-skipped");
          return;
        }
        order.push("update");
      },
      next: () => {
        order.push("next");
        index += 1;
        if (index >= times.length) {
          it.EndReached = true;
          return;
        }
        it.CurrentSourceTimestamp.RealValue = times[index]!;
      },
      cursorElement: el,
      Iterator: it,
    };

    const snaps = collectCursorSnapshotsFromWalk(
      cursor,
      mockWrap(),
      (wn) => wn * 4,
    );
    expect(order[0]).toBe("show");
    expect(snaps.length).toBeGreaterThanOrEqual(3);
    expect(snaps.every((s) => s.height >= 40)).toBe(true);
  });

  it("falls back to style height when getBoundingClientRect height is 0", () => {
    const it = {
      EndReached: false,
      CurrentSourceTimestamp: { RealValue: 0 },
    };
    const el = {
      style: { height: "36px" },
      offsetHeight: 0,
      getBoundingClientRect: () => ({
        left: 40,
        top: 50,
        right: 42,
        bottom: 50,
        width: 2,
        height: 0,
        x: 40,
        y: 50,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement;
    const cursor: CursorWalkHandle = {
      reset: () => {
        it.EndReached = false;
        it.CurrentSourceTimestamp.RealValue = 0;
      },
      show: () => {},
      hide: () => {},
      update: () => {},
      next: () => {
        it.EndReached = true;
      },
      cursorElement: el,
      Iterator: it,
    };
    const snaps = collectCursorSnapshotsFromWalk(
      cursor,
      mockWrap(),
      (wn) => wn * 4,
    );
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.height).toBe(36);
  });

  it("scales engraver-space cursor left into the displayed SVG", () => {
    const wrap = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 200,
        width: 1000,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
      scrollLeft: 0,
      scrollTop: 0,
      querySelector: (sel: string) => (sel === "svg" ? svg : null),
    } as unknown as HTMLElement;

    const svg = {
      getBoundingClientRect: () => ({
        left: 200,
        top: 10,
        right: 700,
        bottom: 110,
        width: 500,
        height: 100,
        x: 200,
        y: 10,
        toJSON: () => ({}),
      }),
    } as unknown as SVGSVGElement;

    const page = {
      getBoundingClientRect: () => ({
        left: 200,
        top: 10,
        right: 700,
        bottom: 110,
        width: 500,
        height: 100,
        x: 200,
        y: 10,
        toJSON: () => ({}),
      }),
    } as unknown as HTMLElement;

    const el = {
      style: { left: "900px", top: "20px", height: "80px" },
      getBoundingClientRect: () => ({
        // Unscaled overflow position (paint width 1000).
        left: 200 + 900,
        top: 10 + 20,
        right: 200 + 902,
        bottom: 10 + 100,
        width: 2,
        height: 80,
        x: 1100,
        y: 30,
        toJSON: () => ({}),
      }),
      closest: (sel: string) => {
        if (sel === '[id^="osmdCanvasPage"]') return page;
        if (sel === ".musai-piece-osmd") {
          return {
            querySelector: (s: string) => (s === "svg" ? svg : null),
          };
        }
        return null;
      },
      querySelectorAll: () => [],
      firstElementChild: null,
    } as unknown as HTMLElement;

    const pose = poseFromOsmdCursorElement(el, wrap, 1000);
    expect(pose).not.toBeNull();
    // 200 + 900 * (500/1000) = 650 — inside the 200..700 SVG.
    expect(pose!.x).toBeCloseTo(650, 5);
    expect(pose!.x).toBeLessThanOrEqual(700);
    expect(pose!.y).toBeCloseTo(20, 5);
    expect(pose!.height).toBeCloseTo(40, 5);
  });
});
