import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScorePlaybackPlayhead } from "@/features/piece-studio/score/ScorePlaybackPlayhead";
import type { CursorPose } from "@/features/piece-studio/score/cursorTrack";

const snaps: CursorPose[] = [
  { tSec: 0, x: 80, y: 24, height: 40 },
  { tSec: 1, x: 160, y: 24, height: 40 },
];

function mockScrollHost() {
  const scroll = document.createElement("div");
  scroll.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 400,
      height: 200,
      right: 400,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return scroll;
}

describe("ScorePlaybackPlayhead", () => {
  it("renders a vertical playhead with no note-dot marker", () => {
    const scroll = { current: document.createElement("div") };
    render(
      <ScorePlaybackPlayhead
        active
        snapsRef={{ current: snaps }}
        staffBandsRef={{ current: [] }}
        scrollParentRef={scroll}
        getPlaybackTime={() => 0}
      />,
    );
    const el = screen.getByTestId("piece-score-playhead");
    expect(el).toHaveClass("musai-score-playhead");
    expect(el.querySelector(".musai-piece-note-plate__marker")).toBeNull();
    expect(
      screen.queryByTestId("piece-score-cursor"),
    ).not.toBeInTheDocument();
    expect(el.style.transform).toContain("px");
    expect(el.style.height).not.toBe("");
    expect(Number.parseFloat(el.style.height)).toBeGreaterThan(
      Number.parseFloat(el.style.width || "3"),
    );
  });

  it("stays hidden when playback follow is off", () => {
    const scroll = { current: document.createElement("div") };
    render(
      <ScorePlaybackPlayhead
        active={false}
        snapsRef={{ current: snaps }}
        staffBandsRef={{ current: [] }}
        scrollParentRef={scroll}
      />,
    );
    expect(screen.getByTestId("piece-score-playhead")).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("previews silently while dragging and commits on pointer up", () => {
    const scroll = mockScrollHost();
    const onScrubPreview = vi.fn();
    const onScrubCommit = vi.fn();
    const onScrubGesture = vi.fn();

    render(
      <ScorePlaybackPlayhead
        active
        snapsRef={{ current: snaps }}
        staffBandsRef={{ current: [] }}
        scrollParentRef={{ current: scroll }}
        getPlaybackTime={() => 0}
        scrubEnabled
        getPlaying={() => true}
        onScrubPreview={onScrubPreview}
        onScrubCommit={onScrubCommit}
        onScrubGesture={onScrubGesture}
      />,
    );

    const playhead = screen.getByTestId("piece-score-playhead");
    fireEvent.pointerDown(playhead, { clientX: 80, clientY: 40, button: 0 });
    fireEvent.pointerMove(playhead, { clientX: 140, clientY: 40 });
    fireEvent.pointerUp(playhead, { clientX: 140, clientY: 40 });

    expect(onScrubPreview).toHaveBeenCalled();
    expect(onScrubCommit).toHaveBeenCalledWith(1, true);
    expect(onScrubGesture).toHaveBeenCalled();
  });

  it("commits a paused scrub without starting playback", () => {
    const scroll = mockScrollHost();
    const onScrubPreview = vi.fn();
    const onScrubCommit = vi.fn();

    render(
      <ScorePlaybackPlayhead
        active
        snapsRef={{ current: snaps }}
        staffBandsRef={{ current: [] }}
        scrollParentRef={{ current: scroll }}
        getPlaybackTime={() => 0}
        scrubEnabled
        getPlaying={() => false}
        onScrubPreview={onScrubPreview}
        onScrubCommit={onScrubCommit}
      />,
    );

    const playhead = screen.getByTestId("piece-score-playhead");
    fireEvent.pointerDown(playhead, { clientX: 80, clientY: 40, button: 0 });
    fireEvent.pointerMove(playhead, { clientX: 140, clientY: 40 });
    fireEvent.pointerUp(playhead, { clientX: 140, clientY: 40 });

    expect(onScrubCommit).toHaveBeenCalledWith(1, false);
  });

  it("follows the pointer onto the next line", () => {
    const scroll = mockScrollHost();
    const onScrubCommit = vi.fn();
    const lines: CursorPose[] = [
      { tSec: 0, x: 80, y: 24, height: 40 },
      { tSec: 1, x: 160, y: 24, height: 40 },
      { tSec: 2, x: 90, y: 160, height: 40 },
    ];

    render(
      <ScorePlaybackPlayhead
        active
        snapsRef={{ current: lines }}
        staffBandsRef={{ current: [] }}
        scrollParentRef={{ current: scroll }}
        getPlaybackTime={() => 0}
        scrubEnabled
        getPlaying={() => false}
        onScrubPreview={vi.fn()}
        onScrubCommit={onScrubCommit}
      />,
    );

    const playhead = screen.getByTestId("piece-score-playhead");
    fireEvent.pointerDown(playhead, { clientX: 80, clientY: 40, button: 0 });
    fireEvent.pointerMove(playhead, { clientX: 90, clientY: 170 });
    fireEvent.pointerUp(playhead, { clientX: 90, clientY: 170 });

    expect(onScrubCommit).toHaveBeenCalledWith(2, false);
  });

  it("moves the pointer when the score itself is pressed", () => {
    const scroll = mockScrollHost();
    const onScrubCommit = vi.fn();
    const onScrubGesture = vi.fn();

    render(
      <ScorePlaybackPlayhead
        active
        snapsRef={{ current: snaps }}
        staffBandsRef={{ current: [] }}
        scrollParentRef={{ current: scroll }}
        getPlaybackTime={() => 0}
        scrubEnabled
        scrubFromScore
        getPlaying={() => true}
        onScrubPreview={vi.fn()}
        onScrubCommit={onScrubCommit}
        onScrubGesture={onScrubGesture}
      />,
    );

    fireEvent.pointerDown(scroll, { clientX: 160, clientY: 40, button: 0 });
    fireEvent.pointerUp(scroll, { clientX: 160, clientY: 40, button: 0 });

    expect(onScrubCommit).toHaveBeenCalledWith(1, true);
    expect(onScrubGesture).toHaveBeenCalled();
  });

  it("leaves a rhythm highlight press for the coach", () => {
    const scroll = mockScrollHost();
    const heat = document.createElement("button");
    heat.dataset.testid = "piece-score-heat";
    scroll.appendChild(heat);
    const onScrubCommit = vi.fn();
    const onScrubPreview = vi.fn();

    render(
      <ScorePlaybackPlayhead
        active
        snapsRef={{ current: snaps }}
        staffBandsRef={{ current: [] }}
        scrollParentRef={{ current: scroll }}
        getPlaybackTime={() => 0}
        scrubEnabled
        scrubFromScore
        onScrubPreview={onScrubPreview}
        onScrubCommit={onScrubCommit}
      />,
    );

    fireEvent.pointerDown(heat, { clientX: 160, clientY: 40, button: 0 });
    fireEvent.pointerUp(heat, { clientX: 160, clientY: 40, button: 0 });

    expect(onScrubPreview).not.toHaveBeenCalled();
    expect(onScrubCommit).not.toHaveBeenCalled();
  });
});
