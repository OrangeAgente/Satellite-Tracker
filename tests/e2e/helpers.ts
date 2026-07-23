/** A fake Cohere stream body (newline-delimited events, as the proxy emits).
 * Long enough that the agent thread overflows and must scroll. */
const LINE = "This satellite is in low Earth orbit and completes many revolutions per day. ";

export function agentStreamBody(): string {
  const events = [
    `{"type":"content-start","index":0,"delta":{"message":{"content":{"type":"text","text":""}}}}`,
  ];
  for (let i = 0; i < 14; i++) {
    events.push(
      `{"type":"content-delta","index":0,"delta":{"message":{"content":{"text":${JSON.stringify(LINE)}}}}}`,
    );
  }
  events.push(`{"type":"message-end","delta":{"finish_reason":"COMPLETE"}}`);
  return events.join("\n") + "\n";
}
