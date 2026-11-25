/** Short beep + vibration so officers get feedback without looking at the screen. */
let ctx: AudioContext | null = null;
export function beep(kind: "ok" | "bad" | "warn", on: boolean) {
  navigator.vibrate?.(kind === "ok" ? 80 : kind === "warn" ? [60, 60, 60] : [200, 80, 200]);
  if (!on) return;
  try {
    ctx ??= new AudioContext(); const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = kind === "ok" ? 880 : kind === "warn" ? 520 : 220; o.type = "sine";
    g.gain.setValueAtTime(0.5, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (kind === "bad" ? 0.5 : 0.18));
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.5);
  } catch { /* audio not available */ }
}
