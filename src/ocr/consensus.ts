import type { Candidate } from "./parse";

export interface Progress { value: string; hits: number; need: number }
/**
 * Counts how often each value appears in the last frames.
 *  - ready:     seen in 2 frames (digit-only codes: 3). Worth checking against the worker list: a list match is strong evidence.
 *  - confirmed: seen in 3 of the last 6 frames (digit-only codes: 5). Agreed reading, even if the list does not know it.
 */
export class Consensus {
  private frames: Candidate[][] = [];
  constructor(private window = 6, private needStrong = 3, private needWeak = 5) {}

  push(cands: Candidate[]): { ready: Candidate[]; confirmed: Candidate[]; progress: Progress | null } {
    this.frames.push(cands); if (this.frames.length > this.window) this.frames.shift();
    const hits = new Map<string, { c: Candidate; n: number }>();
    for (const f of this.frames) for (const c of new Map(f.map((x) => [x.value, x])).values()) {
      const e = hits.get(c.value); if (e) { e.n++; if (c.strength > e.c.strength) e.c = c; } else hits.set(c.value, { c, n: 1 });
    }
    const ready: Candidate[] = [], confirmed: Candidate[] = []; let best: Progress | null = null;
    for (const { c, n } of [...hits.values()].sort((a, b) => b.c.strength - a.c.strength || b.n - a.n)) {
      const need = c.kind === "NUMERIC" ? this.needWeak : this.needStrong;
      if (!best || n / need > best.hits / best.need) best = { value: c.value, hits: n, need };
      if (n >= need - 1) ready.push(c);
      if (n >= need) confirmed.push(c);
    }
    return { ready, confirmed, progress: best };
  }
  reset() { this.frames = []; }
}
