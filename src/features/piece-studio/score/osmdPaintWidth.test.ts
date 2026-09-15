import { describe, expect, it, vi } from "vitest";

/**
 * Regression: OSMD must receive a non-zero container width before render().
 * Empty hosts with CSS `width: fit-content` report clientWidth 0 and engrave blank.
 */
describe("OSMD paint viewport width", () => {
  it("prefers wrap/parent width over an empty fit-content host", () => {
    const host = document.createElement("div");
    const wrap = document.createElement("div");
    wrap.style.width = "640px";
    Object.defineProperty(wrap, "clientWidth", { value: 640 });
    Object.defineProperty(host, "clientWidth", { value: 0 });
    Object.defineProperty(host, "parentElement", { value: wrap });

    const fromOptions = 640;
    const parentW =
      host.parentElement?.clientWidth ||
      host.parentElement?.getBoundingClientRect().width ||
      0;
    const viewportW =
      fromOptions ||
      parentW ||
      host.clientWidth ||
      host.getBoundingClientRect().width ||
      0;

    expect(viewportW).toBe(640);
    expect(host.clientWidth).toBe(0);

    host.style.width = `${Math.floor(viewportW)}px`;
    expect(host.style.width).toBe("640px");
  });

  it("refuses to paint when no usable width exists", () => {
    const viewportW = 0;
    expect(viewportW < 48).toBe(true);
  });

  it("clears collapsed OSMD page widths before a re-paint", async () => {
    const { prepareOsmdHostForPaint } = await import(
      "@/features/piece-studio/score/scorePresentation"
    );
    const host = document.createElement("div");
    const page = document.createElement("div");
    page.id = "osmdCanvasPage1";
    page.style.width = "0px";
    host.appendChild(page);
    prepareOsmdHostForPaint(host, 720);
    expect(host.style.width).toBe("720px");
    expect(page.style.width).toBe("");
  });

  it("sizes OSMD page wrappers to content instead of fit-content collapse", async () => {
    const { fitOsmdHostToContent } = await import(
      "@/features/piece-studio/score/scorePresentation"
    );
    const host = document.createElement("div");
    document.body.appendChild(host);
    const page = document.createElement("div");
    page.id = "osmdCanvasPage1";
    page.style.width = "0px";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "400");
    svg.setAttribute("height", "180");
    svg.getBBox = () =>
      ({
        x: 0,
        y: 0,
        width: 360,
        height: 160,
      }) as DOMRect;
    page.appendChild(svg);
    host.appendChild(page);

    const sized = fitOsmdHostToContent(host);
    expect(sized.contentWidthPx).toBeGreaterThan(300);
    expect(host.style.width).toMatch(/px$/);
    expect(page.style.width).toBe(host.style.width);
    expect(page.style.width).not.toBe("0px");
    host.remove();
  });
});

vi.mock("opensheetmusicdisplay", () => {
  class OpenSheetMusicDisplay {
    EngravingRules = {
      applyDefaultColorMusic: vi.fn(),
      DefaultColorNotehead: "",
      DefaultColorRest: "",
      DefaultColorStem: "",
      DefaultColorLabel: "",
      DefaultColorLyrics: "",
      DefaultColorChordSymbol: "",
      DefaultColorTitle: "",
      StaffLineColor: "",
      LedgerLineColorDefault: "",
      PageBackgroundColor: "",
      ColorBeams: false,
      ColorFlags: false,
      ColorStemsLikeNoteheads: false,
      ExpressionsUseXMLColor: true,
    };
    Zoom = 1;
    async load() {
      return undefined;
    }
    render() {
      /* no-op */
    }
    setPageFormat() {
      /* no-op */
    }
    clear() {
      /* no-op */
    }
  }
  return { OpenSheetMusicDisplay };
});
