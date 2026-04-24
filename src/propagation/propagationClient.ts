import type { Satellite } from "../types";

export interface PropagationSnapshot {
  time: number;
  ids: Int32Array;
  positions: Float32Array;
  statuses: Uint8Array;
}

type Listener = (snap: PropagationSnapshot) => void;

export class PropagationClient {
  private worker: Worker;
  private ids = new Int32Array(0);
  private listeners = new Set<Listener>();
  private ready = false;
  private pendingTick: number | null = null;
  private tickIntervalMs: number;
  private tickTimer: number | null = null;

  constructor(tickIntervalMs = 500) {
    this.tickIntervalMs = tickIntervalMs;
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev) => this.handleMessage(ev);
  }

  private handleMessage(ev: MessageEvent) {
    const msg = ev.data;
    if (msg.type === "ready") {
      this.ids = new Int32Array(msg.ids as ArrayLike<number>);
      this.ready = true;
      this.startTicking();
    } else if (msg.type === "positions") {
      const snap: PropagationSnapshot = {
        time: msg.time,
        ids: this.ids,
        positions: msg.positions,
        statuses: msg.statuses,
      };
      for (const l of this.listeners) l(snap);
      this.pendingTick = null;
    }
  }

  init(satellites: Satellite[]) {
    const tles = satellites.map((s) => ({ noradId: s.noradId, line1: s.tleLine1, line2: s.tleLine2 }));
    this.worker.postMessage({ type: "init", tles });
  }

  updateTles(satellites: { noradId: number; tleLine1: string; tleLine2: string }[]) {
    const tles = satellites.map((s) => ({ noradId: s.noradId, line1: s.tleLine1, line2: s.tleLine2 }));
    this.worker.postMessage({ type: "update", tles });
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  getIds(): Int32Array {
    return this.ids;
  }

  isReady() {
    return this.ready;
  }

  private startTicking() {
    if (this.tickTimer != null) return;
    const tick = () => {
      if (this.pendingTick == null) {
        this.pendingTick = Date.now();
        this.worker.postMessage({ type: "tick", time: this.pendingTick });
      }
    };
    tick();
    this.tickTimer = window.setInterval(tick, this.tickIntervalMs);
  }

  dispose() {
    if (this.tickTimer != null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.worker.terminate();
    this.listeners.clear();
  }
}
