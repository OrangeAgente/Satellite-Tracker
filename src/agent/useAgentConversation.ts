import { useEffect, useMemo, useRef, useState } from "react";
import type { Satellite } from "../types";
import { getApiKey, isProxyOnly, setApiKey, streamChat, type ChatMessage } from "../llm/cohere";
import { STATIC_PROMPTS, buildDynamicPrompts, buildSystemPrompt } from "./prompts";
import { computeLiveState } from "./liveState";
import { useApp } from "../store";

export interface Turn {
  role: "user" | "assistant";
  text: string;
  error?: string;
}

export interface AgentConversation {
  turns: Turn[];
  streaming: boolean;
  ready: boolean;
  proxyOnly: boolean;
  apiKey: string | null;
  prompts: string[];
  send: (text: string) => void;
  cancel: () => void;
  reset: () => void;
  setKey: (key: string | null, remember: boolean) => void;
}

/**
 * Owns a streaming Cohere conversation about the selected satellite: turn
 * history, streaming state, suggested prompts, and dev-mode API-key handling.
 * The consumer keeps its own text-input value and renders its own markup.
 * Shared by the desktop SatelliteAgent panel and the mobile AgentPanel.
 */
export function useAgentConversation(sat: Satellite | undefined): AgentConversation {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const proxyOnly = isProxyOnly();
  const [apiKey, setApiKeyState] = useState<string | null>(getApiKey());
  const ready = proxyOnly || !!apiKey;
  const abortRef = useRef<AbortController | null>(null);

  const prompts = useMemo(() => {
    if (!sat) return STATIC_PROMPTS;
    const dyn = buildDynamicPrompts(sat);
    return [...dyn, ...STATIC_PROMPTS].slice(0, 5);
  }, [sat]);

  // Reset the conversation when the selected satellite changes.
  useEffect(() => {
    setTurns([]);
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, [sat?.noradId]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming || !ready || !sat) return;

    const nextTurns: Turn[] = [...turns, { role: "user", text: trimmed }, { role: "assistant", text: "" }];
    setTurns(nextTurns);
    setStreaming(true);

    const { simTime, observer } = useApp.getState();
    const live = computeLiveState(sat, observer, simTime ?? Date.now());
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(sat, live) },
      ...nextTurns.slice(0, -1).map<ChatMessage>((t) => ({ role: t.role, content: t.text })),
    ];

    const ac = new AbortController();
    abortRef.current = ac;

    void (async () => {
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
        const errText = ac.signal.aborted
          ? "cancelled"
          : err instanceof Error
            ? err.message
            : String(err);
        setTurns((cur) => {
          const copy = cur.slice();
          copy[copy.length - 1] = { role: "assistant", text: acc, error: errText };
          return copy;
        });
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    })();
  };

  const cancel = () => abortRef.current?.abort();

  const reset = () => {
    abortRef.current?.abort();
    setTurns([]);
  };

  const setKey = (key: string | null, remember: boolean) => {
    setApiKey(key, remember ? "local" : "session");
    setApiKeyState(key);
  };

  return { turns, streaming, ready, proxyOnly, apiKey, prompts, send, cancel, reset, setKey };
}
