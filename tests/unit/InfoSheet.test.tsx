import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InfoSheet } from "../../src/mobile/InfoSheet";
import { ISS_TLE1, mkSat } from "../factory";

function renderSheet(props: Partial<Parameters<typeof InfoSheet>[0]> = {}) {
  const onAgent = vi.fn();
  const view = render(
    <InfoSheet
      sat={mkSat({ name: "OSCAR 7", noradId: 7530 })}
      expanded={false}
      onToggle={() => {}}
      onExpand={() => {}}
      onClose={() => {}}
      pinned={false}
      onPin={() => {}}
      tracking={false}
      onTrack={() => {}}
      onAgent={onAgent}
      atMs={Date.UTC(2020, 0, 29, 13, 0, 0)}
      {...props}
    />,
  );
  return { ...view, onAgent };
}

describe("InfoSheet", () => {
  it("renders the satellite identity and stat grid", () => {
    renderSheet();
    expect(screen.getByText("OSCAR 7")).toBeInTheDocument();
    expect(screen.getByText(/#7530/)).toBeInTheDocument();
  });

  it("puts the action row above the ground track (visible while collapsed)", () => {
    const { container } = renderSheet();
    const scroll = container.querySelector(".m-sheet-scroll")!;
    const actions = scroll.querySelector(".m-actions")!;
    const gt = scroll.querySelector(".m-gt")!;
    // actions must come before the ground track in DOM order
    expect(actions.compareDocumentPosition(gt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Ground track")).toBeInTheDocument();
  });

  it("lights up INFO only while expanded", () => {
    const { rerender } = renderSheet({ expanded: false });
    expect(screen.getByRole("button", { name: "INFO" })).not.toHaveClass("on");
    rerender(
      <InfoSheet
        sat={mkSat({ name: "OSCAR 7", noradId: 7530 })}
        expanded
        onToggle={() => {}} onExpand={() => {}} onClose={() => {}}
        pinned={false} onPin={() => {}} tracking={false} onTrack={() => {}}
        onAgent={() => {}} atMs={0}
      />,
    );
    expect(screen.getByRole("button", { name: "INFO" })).toHaveClass("on");
  });

  it("reveals the real TLE lines when TLE is tapped", () => {
    const { container } = renderSheet({ expanded: true });
    expect(container.querySelector(".m-tle")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "TLE" }));
    expect(container.querySelector(".m-tle pre")!.textContent).toContain(ISS_TLE1);
  });

  it("calls onAgent from the QUERY button", () => {
    const { onAgent } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /QUERY THIS SATELLITE/ }));
    expect(onAgent).toHaveBeenCalled();
  });
});
