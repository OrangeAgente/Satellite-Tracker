import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { useAgentConversation } from "../agent/useAgentConversation";

export function SatelliteAgent() {
  const sel = useApp((s) => (s.selectedId != null ? s.getSatellite(s.selectedId) : undefined));
  const { turns, streaming, ready, proxyOnly, apiKey, prompts, send, cancel, reset, setKey } =
    useAgentConversation(sel);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // Clear the input when the selected satellite changes (the hook resets turns).
  useEffect(() => {
    setInput("");
  }, [sel?.noradId]);

  // Autoscroll the thread.
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  });

  if (!sel) return null;

  const submit = (text: string) => {
    send(text);
    setInput("");
  };

  const saveKey = () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    setKey(trimmed, rememberKey);
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
                onClick={() => submit(p)}
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
                  submit(input);
                }
              }}
              placeholder=">> ask about this satellite"
              disabled={streaming}
            />
            {streaming ? (
              <button className="ops-filter-clear" onClick={cancel}>STOP</button>
            ) : (
              <button className="ops-filter-clear" onClick={() => submit(input)} disabled={!input.trim()}>
                SEND
              </button>
            )}
          </div>

          {turns.length > 0 && !streaming && (
            <div className="agent-foot">
              <button className="ops-filter-clear" onClick={reset}>RESET</button>
              {!proxyOnly && apiKey && (
                <button className="ops-filter-clear" onClick={() => setKey(null, false)}>
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
