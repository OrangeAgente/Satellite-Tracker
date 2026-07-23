import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CatalogPanel } from "../../src/mobile/CatalogPanel";
import { useApp } from "../../src/store";
import { mkFilters, mkSat } from "../factory";

const sats = [
  mkSat({ noradId: 1, name: "STARLINK-1", orbitClass: "LEO" }),
  mkSat({ noradId: 2, name: "GPS-2", orbitClass: "GEO" }),
];

beforeEach(() => {
  useApp.setState({ filters: mkFilters(), pinnedIds: [], selectedId: null });
});

describe("CatalogPanel", () => {
  it("renders a row per visible satellite and the total", () => {
    render(<CatalogPanel satellites={sats} visibleIds={new Set([1, 2])} onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByText("STARLINK-1")).toBeInTheDocument();
    expect(screen.getByText("GPS-2")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("toggles a store filter and surfaces the CLEAR control", () => {
    render(<CatalogPanel satellites={sats} visibleIds={new Set([1, 2])} onPick={() => {}} onClose={() => {}} />);
    expect(screen.queryByText(/CLEAR/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "LEO" }));
    expect(useApp.getState().filters.orbitClasses.has("LEO")).toBe(true);
    expect(screen.getByText(/CLEAR · 1/)).toBeInTheDocument();
  });

  it("calls onPick with the satellite id when a row is tapped", () => {
    const onPick = vi.fn();
    render(<CatalogPanel satellites={sats} visibleIds={new Set([1, 2])} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /STARLINK-1/ }));
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("calls onClose when the × is tapped", () => {
    const onClose = vi.fn();
    render(<CatalogPanel satellites={sats} visibleIds={new Set([1, 2])} onPick={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
