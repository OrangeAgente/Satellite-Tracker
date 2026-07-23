import { useEffect, useRef, useState } from "react";
import type { Satellite } from "../types";
import { useAgentConversation } from "../agent/useAgentConversation";

export function AgentPanel({ sat }: { sat: Satellite | undefined }) {
  const { turns, streaming, ready, proxyOnly, apiKey, prompts, send, cancel, reset, setKey } =
    useAgentConversation(sat);
  const [input, setInput] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(""); }, [sat?.noradId]);
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  });

  if (!sat) {
    return (
      <section className="m-panel">
        <div className="m-panel-h"><span>Agent</span></div>
        <div className="m-agent-empty">
          Select a satellite on the globe or in the catalog to query SATCOM·OPS about it.
        </div>
      </section>
    );
  }

  const submit = (text: string) => { send(text); setInput(""); };

  const saveKey = () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    setKey(trimmed, rememberKey);
    setKeyDraft("");
  };

  return (
    <section className="m-panel">
      <div className="m-panel-h">
        <span>Agent · {sat.name}</span>
        {turns.length > 0 && <button className="m-clear" onClick={reset}>RESET</button>}
      </div>

      {!ready && !proxyOnly ? (
        <div className="m-agent-key">
          <div className="note">
            Cohere API key required (dev mode). Stored only in your browser; sent directly to
            api.cohere.com from this page. Don't paste a key on a shared device.
          </div>
          <div className="row">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="cohere api key"
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              autoComplete="off"
              spellCheck={false}
            />
            <button className="m-clear" onClick={saveKey}>SAVE</button>
          </div>
          <label>
            <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} />
            Remember on this device
          </label>
        </div>
      ) : (
        <>
          <div className="m-agent-suggest">
            {prompts.map((p) => (
              <button key={p} className="m-pill" disabled={streaming} onClick={() => submit(p)}>{p}</button>
            ))}
          </div>

          <div className="m-thread" ref={threadRef}>
            {turns.length === 0 && (
              <div className="m-agent-empty">
                Ask about orbit, mission, operator, or launch. Grounded in the catalog + UCS metadata.
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={"m-turn " + t.role}>
                <div className="tr-role">
                  {t.role === "user" ? "› YOU" : "▮ AGENT"}
                  {t.error && <span className="tr-err"> · {t.error}</span>}
                </div>
                <div className="tr-text">
                  {t.text}
                  {streaming && i === turns.length - 1 && t.role === "assistant" && !t.error && (
                    <span className="cursor">▍</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="m-agent-input">
            <input
              value={input}
              placeholder=">> ask about this satellite"
              disabled={streaming}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit(input)}
            />
            {streaming ? (
              <button className="m-clear" onClick={cancel}>STOP</button>
            ) : (
              <button className="m-clear" disabled={!input.trim()} onClick={() => submit(input)}>SEND</button>
            )}
          </div>

          {!proxyOnly && apiKey && (
            <div className="m-agent-input" style={{ borderTop: "none", paddingTop: 0 }}>
              <button className="m-clear" onClick={() => setKey(null, false)}>FORGET KEY</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
