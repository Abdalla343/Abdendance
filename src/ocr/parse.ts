/**
 * Turns raw OCR text into ID candidates. Two formats are supported:
 *  1. Egyptian National ID: 14 digits (Western or Arabic-Indic).
 *  2. Company worker codes: letters + digits, e.g. IR1234, ZTC535, HC123456 (or digits only, e.g. 5001).
 * Everything is normalized to Western digits and UPPER CASE before it is searched or saved.
 */
export type CandidateKind = "NATIONAL_ID" | "CODE" | "NUMERIC";
export interface Candidate { value: string; kind: CandidateKind; strength: number; semanticOk?: boolean }

const AR = /[\u0660-\u0669]/g, FA = /[\u06F0-\u06F9]/g;
export const toWesternDigits = (s: string) =>
  s.replace(AR, (c) => String(c.charCodeAt(0) - 0x0660)).replace(FA, (c) => String(c.charCodeAt(0) - 0x06f0));

/** Canonical form of a typed/scanned value: Western digits, upper case, no spaces or separators. Same rule as the server. */
export const normalizeId = (raw: string) => toWesternDigits(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
export const isNationalIdFormat = (s: string) => /^\d{14}$/.test(s);

const GOV = new Set(["01","02","03","04","11","12","13","14","15","16","17","18","19","21","22","23","24","25","26","27","28","29","31","32","33","34","35","88"]);
/** Century digit, real birth date, governorate code. (No public checksum exists, so this cannot prove a number is genuine.) */
export function nationalIdSemanticOk(n: string, now = new Date()): boolean {
  if (!isNationalIdFormat(n) || (n[0] !== "2" && n[0] !== "3")) return false;
  const y = (n[0] === "2" ? 1900 : 2000) + Number(n.slice(1, 3)), m = Number(n.slice(3, 5)), d = Number(n.slice(5, 7));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && dt.getTime() <= now.getTime() && GOV.has(n.slice(7, 9));
}

/** In a token that is almost all digits, fix letters OCR commonly confuses with digits. */
const CONFUSED: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", "|": "1", Z: "2", S: "5", B: "8" };
function repairDigits(tok: string): string {
  const digits = (tok.match(/\d/g) ?? []).length;
  if (tok.length < 14 || digits < 8) return tok; // mostly digits already
  return tok.replace(/[OQDILZSB|]/g, (c) => CONFUSED[c] ?? c);
}

export function extractCandidates(text: string, now = new Date()): Candidate[] {
  const found = new Map<string, Candidate>();
  const add = (c: Candidate) => { const o = found.get(c.value); if (!o || c.strength > o.strength) found.set(c.value, c); };
  const addNid = (v: string) => { const ok = nationalIdSemanticOk(v, now); add({ value: v, kind: "NATIONAL_ID", semanticOk: ok, strength: ok ? 100 : 60 }); };

  for (const rawLine of toWesternDigits(text).toUpperCase().split(/\r?\n/)) {
    const line = rawLine.replace(/[\u200e\u200f\u061c]/g, "");
    // 1) National ID: digit groups (possibly split by OCR spaces) that make 14 digits; windows inside longer runs must be valid.
    for (const m of line.matchAll(/[0-9OQDILZSB|][0-9OQDILZSB| ]{11,30}[0-9OQDILZSB|]/g)) {
      const orig = m[0].replace(/ /g, ""); let run = repairDigits(orig);
      // A repaired number (letters turned into digits) is only trusted if it is a plausible National ID.
      if (run !== orig && !(run.length === 14 && nationalIdSemanticOk(run, now))) run = orig;
      if (!/^\d+$/.test(run)) continue;
      if (run.length === 14) addNid(run);
      else if (run.length > 14 && run.length <= 24)
        for (let i = 0; i + 14 <= run.length; i++) { const w = run.slice(i, i + 14); if (nationalIdSemanticOk(w, now)) addNid(w); }
    }
    // 2) Company codes: 1-5 letters + 2-10 digits (optionally separated by one space or hyphen), or any 4-12 letter+digit mix.
    for (const m of line.matchAll(/(?<![A-Z0-9])([A-Z]{1,5})[ \-]?(\d{2,10})(?![A-Z0-9])/g)) add({ value: m[1]! + m[2]!, kind: "CODE", strength: 80 });
    for (const m of line.matchAll(/(?<![A-Z0-9])(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{4,12}(?![A-Z0-9])/g)) add({ value: m[0], kind: "CODE", strength: 70 });
    // 3) Digits-only codes (e.g. 5001): weak, they must also pass the worker-list lookup.
    for (const m of line.matchAll(/(?<![A-Z0-9])\d{4,10}(?![A-Z0-9])/g)) add({ value: m[0], kind: "NUMERIC", strength: 30 });
  }
  // A 14-digit National ID also contains shorter digit runs: drop NUMERIC candidates that are part of one.
  const nids = [...found.values()].filter((c) => c.kind === "NATIONAL_ID").map((c) => c.value);
  return [...found.values()].filter((c) => !(c.kind !== "NATIONAL_ID" && nids.some((n) => n.includes(c.value)))).sort((a, b) => b.strength - a.strength);
}
