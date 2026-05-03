import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store";
import type { Satellite } from "../types";
import { inferUsage } from "../data/usage";
import { getApiKey, isProxyOnly, setApiKey, streamChat, type ChatMessage } from "../llm/cohere";

const STATIC_PROMPTS: string[] = [
  "Tell me more about this satellite",
  "What does this satellite do?",
  "Describe the launch",
  "What's its orbital regime?",
  "Who operates it?",
];

function buildDynamicPrompts(sat: Satellite): string[] {
  const out: string[] = [];
  const cats = sat.categories;
  const name = sat.name;
  if (cats.includes("starlink")) out.push("How does this fit into the Starlink constellation?");
  if (cats.includes("gps-ops")) out.push("What's its role in the GPS constellation?");
  if (cats.includes("galileo")) out.push("Where does it sit in the Galileo constellation?");
  if (cats.includes("weather") || cats.includes("noaa") || cats.includes("goes")) {
    out.push("What weather products does it provide?");
  }
  if (cats.includes("amateur")) out.push("How can I work this satellite with amateur radio?");
  if (cats.includes("stations") || /ISS|TIANGONG|ZARYA/i.test(name)) {
    out.push("Who's currently aboard?");
  }
  if (sat.objectType === "DEB") out.push("What event created this debris?");
  if (sat.objectType === "R/B") out.push("What was the upper stage's mission?");
  if (sat.orbitClass === "GEO") out.push("What's the operational slot longitude?");
  if (cats.includes("military")) out.push("What's publicly known about its mission?");
  return out;
}

function buildSystemPrompt(sat: Satellite): string {
  const ucs = sat.ucs;
  const usage = [...inferUsage(sat)].join(", ");
  const lines: string[] = [
    "You are SATCOM·OPS, an expert in satellites, orbital mechanics, and space situational awareness.",
    "Answer questions about a specific satellite the user is observing. Be precise, concise, and grounded in the facts below.",
    "When uncertain, say so plainly. Distinguish public, well-documented facts from informed inference.",
    "Use SI units and standard orbital terminology. Format short answers tightly; use bullets only when helpful.",
    "",
    "SELECTED SATELLITE",
    `  name: ${sat.name}`,
    `  norad id: ${sat.noradId}`,
    `  intl designator: ${sat.intlDes || "unknown"}`,
    `  object type: ${sat.objectType}`,
    `  country: ${sat.country || "unknown"}`,
    `  orbit class: ${sat.orbitClass}`,
    sat.periodMin != null ? `  period: ${sat.periodMin.toFixed(1)} min` : "  period: unknown",
    sat.inclinationDeg != null ? `  inclination: ${sat.inclinationDeg.toFixed(2)}°` : "  inclination: unknown",
    sat.apogeeKm != null ? `  apogee: ${sat.apogeeKm} km` : "  apogee: unknown",
    sat.perigeeKm != null ? `  perigee: ${sat.perigeeKm} km` : "  perigee: unknown",
    `  launch date: ${sat.launchDate || "unknown"}`,
    `  inferred usage: ${usage}`,
    sat.categories.length > 0 ? `  categories: ${sat.categories.join(", ")}` : "",
  ];
  if (ucs) {
    lines.push("");
    lines.push("UCS METADATA");
    if (ucs.operator) lines.push(`  operator: ${ucs.operator}`);
    if (ucs.operatorCountry) lines.push(`  operator country: ${ucs.operatorCountry}`);
    if (ucs.users) lines.push(`  users: ${ucs.users}`);
    if (ucs.purpose) lines.push(`  purpose: ${ucs.purpose}`);
    if (ucs.detailedPurpose) lines.push(`  detailed purpose: ${ucs.detailedPurpose}`);
    if (ucs.contractor) lines.push(`  contractor: ${ucs.contractor}`);
    if (ucs.launchMassKg) lines.push(`  launch mass: ${ucs.launchMassKg} kg`);
    if (ucs.dryMassKg) lines.push(`  dry mass: ${ucs.dryMassKg} kg`);
    if (ucs.powerW) lines.push(`  power: ${ucs.powerW} W`);
    if (ucs.expectedLifetimeYears) lines.push(`  expected lifetime: ${ucs.expectedLifetimeYears} yr`);
    if (ucs.launchSite) lines.push(`  launch site: ${ucs.launchSite}`);
    if (ucs.launchVehicle) lines.push(`  launch vehicle: ${ucs.launchVehicle}`);
  }
  return lines.filter(Boolean).join("\n");
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  error?: string;
}

export function SatelliteAgent() {
  const sel = useApp((s) => (s.selectedId != null ? s.getSatellite(s.selectedId) : undefined));
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const proxyOnly = isProxyOnly();
  const [apiKey, setKey] = useState<string | null>(getApiKey());
  const [keyDraft, setKeyDraft] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const ready = proxyOnly || !!apiKey;
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const prompts = useMemo(() => {
    if (!sel) return STATIC_PROMPTS;
    const dyn = buildDynamicPrompts(sel);
    return [...dyn, ...STATIC_PROMPTS].slice(0, 5);
  }, [sel]);

  // Reset conversation when the selected satellite changes.
  useEffect(() => {
    setTurns([]);
    setInput("");
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, [sel?.noradId]);

  // Autoscroll the thread.
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  });

  if (!sel) return null;

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    if (!ready) return;

    const nextTurns: Turn[] = [...turns, { role: "user", text: trimmed }, { role: "assistant", text: "" }];
    setTurns(nextTurns);
    setInput("");
    setStreaming(true);

    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(sel) },
      ...nextTurns
        .slice(0, -1)
        .map<ChatMessage>((t) => ({ role: t.role, content: t.text })),
    ];

    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    try {
      for await (const chunk of streamChat({ messages, apiKey: apiKey ?? undefined, signal: ac.signal })) {
        acc += chunk;
        setTurns((cur) => {
          const copy = cur.slice();
          copy[copy.length - 1] = { role: "assistant", text: acc };
          return copy;
        });
      }
    } catch (err) {
      if (ac.signal.aborted) {
        setTurns((cur) => {
          const copy = cur.slice();
          copy[copy.length - 1] = { role: "assistant", text: acc, error: "cancelled" };
          return copy;
        });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setTurns((cur) => {
          const copy = cur.slice();
          copy[copy.length - 1] = { role: "assistant", text: acc, error: message };
          return copy;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();
  const reset = () => {
    abortRef.current?.abort();
    setTurns([]);
    setInput("");
  };

  const saveKey = () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    setApiKey(trimmed, rememberKey ? "local" : "session");
    setKey(trimmed);
    setKeyDraft("");
    setOpen(true);
  };

  return (
    <section className="ops-section">
      <div className="ops-section-h">
        <span>Agent</span>
        {open ? (
          <button className="ops-filter-clear" onClick={() => setOpen(false)}>HIDE</button>
        ) : (
          <button className="ops-filter-clear" onClick={() => setOpen(true)}>
            QUERY THIS SATELLITE
          </button>
        )}
      </div>

      {open && !proxyOnly && !apiKey && (
        <div className="agent-keyform">
          <div className="dim" style={{ fontSize: 10, marginBottom: 6, lineHeight: 1.5 }}>
            Cohere API key required (dev mode). Stored only in your browser;
            sent directly to api.cohere.com from this page. <strong>Don't paste
            a key on a shared or public computer</strong> — any script on this
            page can read it.
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="cohere api key"
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              style={{ flex: 1 }}
            />
            <button className="ops-filter-clear" onClick={saveKey}>SAVE</button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, marginTop: 6, color: "var(--ops-fg-dim)" }}>
            <input
              type="checkbox"
              checked={rememberKey}
              onChange={(e) => setRememberKey(e.target.checked)}
            />
            Remember on this device (otherwise cleared when you close the tab)
          </label>
        </div>
      )}

      {open && ready && (
        <div className="agent">
          <div className="agent-suggest">
            {prompts.map((p) => (
              <button
                key={p}
                className="ops-pill"
                disabled={streaming}
                onClick={() => send(p)}
              >
                {p}
              </button>
            ))}
          </div>

          {turns.length > 0 && (
            <div className="agent-thread" ref={threadRef}>
              {turns.map((t, i) => (
                <div key={i} className={`agent-turn ${t.role}`}>
                  <div className="agent-turn-role">
                    {t.role === "user" ? "›" : "▮"} {t.role === "user" ? "YOU" : "AGENT"}
                    {t.error && <span className="agent-err"> · {t.error}</span>}
                  </div>
                  <div className="agent-turn-text">
                    {t.text}
                    {streaming && i === turns.length - 1 && t.role === "assistant" && !t.error && (
                      <span className="agent-cursor">▍</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="agent-input">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder=">> ask about this satellite"
              disabled={streaming}
            />
            {streaming ? (
              <button className="ops-filter-clear" onClick={cancel}>STOP</button>
            ) : (
              <button className="ops-filter-clear" onClick={() => send(input)} disabled={!input.trim()}>
                SEND
              </button>
            )}
          </div>

          {turns.length > 0 && !streaming && (
            <div className="agent-foot">
              <button className="ops-filter-clear" onClick={reset}>RESET</button>
              {!proxyOnly && apiKey && (
                <button className="ops-filter-clear" onClick={() => { setApiKey(null); setKey(null); }}>
                  FORGET KEY
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
