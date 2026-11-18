import type { Summary } from "../types";
export type Lang = "en" | "ar";

export const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(n);
export const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < 1_048_576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1_048_576).toFixed(1)} MB`);

/** Long date for a YYYY-MM-DD day. Western digits and Gregorian calendar in both languages. */
export function fmtDay(day: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn-ca-gregory" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T12:00:00Z`));
}
export function shiftDay(day: string, delta: number) {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + delta); return d.toISOString().slice(0, 10);
}
export const fmtClock = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const fmtStamp = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(lang === "ar" ? "ar-EG-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export interface HourSlot { hour: number; checkIns: number; checkOuts: number }
/** Hour slots to draw: at least 06:00-18:00, widened to include any activity outside it. */
export function hourSlots(hourly: Summary["hourly"]): HourSlot[] {
  const by = new Map(hourly.map((h) => [Number(h.hour), h]));
  const active = [...by.keys()];
  const lo = Math.min(6, ...active), hi = Math.max(18, ...active);
  return Array.from({ length: hi - lo + 1 }, (_, i) => {
    const h = lo + i, v = by.get(h);
    return { hour: h, checkIns: v?.checkIns ?? 0, checkOuts: v?.checkOuts ?? 0 };
  });
}
export function peakSlot(slots: HourSlot[]): HourSlot | null {
  let best: HourSlot | null = null;
  for (const s of slots) if (s.checkIns > 0 && (!best || s.checkIns > best.checkIns)) best = s;
  return best;
}
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Retained export name for existing callers. Full identifiers are displayed. */
export const maskId = (id: string) => id;
