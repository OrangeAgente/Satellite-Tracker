import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentPanel } from "../../src/mobile/AgentPanel";
import { mkSat } from "../factory";

// Mutable mock state (hoisted so the vi.mock factory can read it).
const h = vi.hoisted(() => ({ proxyOnly: false, key: null as string | null, chunks: [] as string[] }));

vi.mock("../../src/llm/cohere", () => ({
  isProxyOnly: () => h.proxyOnly,
  getApiKey: () => h.key,
  setApiKey: () => {},
  // eslint-disable-next-line require-yield
  streamChat: async function* stream() {
    for (const c of h.chunks) yield c;
  },
}));

beforeEach(() => {
  h.proxyOnly = false;
  h.key = null;
  h.chunks = [];
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("AgentPanel", () => {
  it("shows an empty state (and a close button) with no satellite", () => {
    render(<AgentPanel sat={undefined} onClose={() => {}} />);
    expect(screen.getByText(/Select a satellite/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("prompts for a Cohere key in dev mode when none is set", () => {
    render(<AgentPanel sat={mkSat()} onClose={() => {}} />);
    expect(screen.getByPlaceholderText("cohere api key")).toBeInTheDocument();
  });

  it("streams an answer when ready (proxy mode)", async () => {
    h.proxyOnly = true;
    h.chunks = ["Hello ", "world."];
    render(<AgentPanel sat={mkSat({ name: "STARLINK-1", categories: ["starlink"] })} onClose={() => {}} />);

    // dynamic suggestion pill is present
    expect(screen.getByRole("button", { name: /Starlink constellation/i })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(">> ask about this satellite"), {
      target: { value: "what is this?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "SEND" }));

    expect(screen.getByText("what is this?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Hello world\./)).toBeInTheDocument());
  });
});
