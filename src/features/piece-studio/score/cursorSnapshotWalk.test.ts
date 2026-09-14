import { describe, expect, it, vi } from "vitest";
import {
  collectCursorSnapshotsFromWalk,
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
});
