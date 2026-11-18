import { describe, expect, it } from "vitest";
import { extractCandidates, nationalIdSemanticOk, normalizeId, toWesternDigits } from "../src/ocr/parse";
import { Consensus } from "../src/ocr/consensus";
import { meanOf, preprocess, roiToVideo, sharpen, stretchContrast, toGray } from "../src/ocr/preprocess";

const NID = "29501010100001";
const top = (t: string) => extractCandidates(t)[0];
const vals = (t: string) => extractCandidates(t).map((c) => c.value);

describe("digit normalization", () => {
  it("converts Arabic-Indic and Persian digits to Western", () => {
    expect(toWesternDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(toWesternDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(toWesternDigits("٢٩٥٠١٠١٠١٠٠٠٠١")).toBe(NID);
  });
  it("normalizeId matches the server's rule: Western digits, upper case, letters/digits only", () => {
    expect(normalizeId(" ir-١٢٣٤ ")).toBe("IR1234");
    expect(normalizeId("ztc 535")).toBe("ZTC535");
    expect(normalizeId("٢٩٥ ٠١٠١٠١٠٠٠٠١")).toBe(NID);
  });
});

describe("National ID (14 digits)", () => {
  it("reads Western and Arabic-Indic digits to the same value", () => {
    expect(top(NID)).toMatchObject({ value: NID, kind: "NATIONAL_ID", semanticOk: true });
    expect(top("٢٩٥٠١٠١٠١٠٠٠٠١")).toMatchObject({ value: NID, kind: "NATIONAL_ID", semanticOk: true });
    expect(top("الرقم القومي ٢٩٥٠١٠١٠١٠٠٠٠١")!.value).toBe(NID);
  });
  it("joins digit groups that OCR split with spaces", () => {
    expect(top("2950101 0100001")!.value).toBe(NID);
    expect(top("٢٩٥ ٠١٠١ ٠١٠٠ ٠٠١")!.value).toBe(NID);
  });
  it("repairs letters that OCR confuses with digits, only inside near-all-digit tokens", () => {
    expect(top("2950101O1OOOO1")!.value).toBe(NID);
    expect(top("29S0101010000l")!.value).toBe(NID);
  });
  it("finds a valid ID inside a longer digit run, and flags impossible dates as not semantically valid", () => {
    expect(vals("0" + NID + "5")).toContain(NID);
    expect(top("29513320100001")).toMatchObject({ kind: "NATIONAL_ID", semanticOk: false, strength: 60 });
    expect(nationalIdSemanticOk(NID)).toBe(true); expect(nationalIdSemanticOk("19501010100001")).toBe(false);
  });
});

describe("company codes (letters + digits)", () => {
  it.each(["IR1234", "ZTC535", "HC123456"])("reads %s", (code) => {
    expect(top(code)).toMatchObject({ value: code, kind: "CODE" });
    expect(top(`ID: ${code}`)!.value).toBe(code);
  });
  it("tolerates a space or hyphen inside the code, lower case, and Arabic digits", () => {
    expect(top("IR 1234")!.value).toBe("IR1234");
    expect(top("HC-123456")!.value).toBe("HC123456");
    expect(top("ztc535")!.value).toBe("ZTC535");
    expect(top("IR١٢٣٤")!.value).toBe("IR1234");
  });
  it("finds a code among other words, and ignores letter-only or label words", () => {
    expect(vals("WORKER NAME\nAhmed Saad\nZTC535\nCOMPANY")).toEqual(["ZTC535"]);
    expect(vals("NAME COMPANY")).toEqual([]);
  });
  it("digit-only codes are weak candidates; a National ID is not also reported as a short numeric", () => {
    expect(top("5001")).toMatchObject({ value: "5001", kind: "NUMERIC", strength: 30 });
    expect(vals(NID)).toEqual([NID]);
  });
  it("returns the strongest candidate first when a card shows both", () => {
    expect(vals(`${NID}\nIR1234`)).toEqual([NID, "IR1234"]);
  });
});

describe("consensus", () => {
  const nid = extractCandidates(NID), code = extractCandidates("IR1234"), wrong = extractCandidates("29501010100002");
  it("a value becomes 'ready' (worth checking against the worker list) on its 2nd sighting, 'confirmed' on its 3rd", () => {
    const c = new Consensus();
    let r = c.push(nid); expect(r.ready).toEqual([]); expect(r.confirmed).toEqual([]);
    r = c.push(wrong); expect(r.ready).toEqual([]);
    r = c.push(nid); expect(r.ready.map((x) => x.value)).toEqual([NID]); expect(r.confirmed).toEqual([]);
    r = c.push(nid); expect(r.confirmed.map((x) => x.value)).toEqual([NID]);
  });
  it("a single misread frame never becomes ready, and noise frames do not erase earlier hits", () => {
    const c = new Consensus(); c.push(code); c.push([]); expect(c.push(wrong).ready).toEqual([]);
    expect(c.push(code).ready.map((x) => x.value)).toEqual(["IR1234"]);
  });
  it("two different readings can both qualify (e.g. two OCR paths disagree): both are offered, strongest first", () => {
    const c = new Consensus(); c.push([...nid, ...wrong]); const r = c.push([...nid, ...wrong]);
    expect(r.ready.map((x) => x.value).sort()).toEqual([NID, "29501010100002"].sort());
  });
  it("digit-only codes need more sightings (ready at 4, confirmed at 5)", () => {
    const c = new Consensus(), w = extractCandidates("5001"); for (let i = 0; i < 3; i++) expect(c.push(w).ready).toEqual([]);
    expect(c.push(w).ready.map((x) => x.value)).toEqual(["5001"]); expect(c.push(w).confirmed.map((x) => x.value)).toEqual(["5001"]);
  });
  it("reports progress for the live readout and can be reset", () => {
    const c = new Consensus(); expect(c.push(code).progress).toEqual({ value: "IR1234", hits: 1, need: 3 });
    c.reset(); expect(c.push([]).progress).toBeNull();
  });
});

describe("preprocessing", () => {
  const px = (v: number[]) => Uint8ClampedArray.from(v.flatMap((g) => [g, g, g, 255]));
  it("grays and stretches a low-contrast image to the full range", () => {
    const g = toGray(px([100, 110, 120, 130, 140, 150, 100, 150]));
    const s = stretchContrast(g, 0, 1); expect(Math.min(...s)).toBe(0); expect(Math.max(...s)).toBe(255);
  });
  it("leaves a flat image alone instead of amplifying noise", () => {
    const g = Uint8ClampedArray.from([120, 121, 120, 122]); expect(stretchContrast(g)).toBe(g);
  });
  it("sharpening raises the edge contrast and keeps flat areas flat", () => {
    const w = 5, h = 5, g = new Uint8ClampedArray(25).fill(100); for (let y = 0; y < 5; y++) for (let x = 3; x < 5; x++) g[y * w + x] = 160;
    const s = sharpen(g, w, h); expect(s[2 * w + 3]!).toBeGreaterThan(160); expect(s[2 * w + 2]!).toBeLessThan(100); expect(s[2 * w + 1]!).toBe(100);
  });
  it("inverts light-on-dark cards so text is always dark on light", () => {
    const w = 8, h = 4, rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { const v = i % 8 < 2 ? 230 : 20; rgba.set([v, v, v, 255], i * 4); }
    const out = preprocess(rgba, w, h); const g = toGray(out); expect(meanOf(g)).toBeGreaterThan(128);
  });
  it("maps the on-screen guide box to video pixels under object-fit: cover", () => {
    // 400x800 portrait view of a 1280x720 landscape stream: height-limited, sides are cropped.
    const r = roiToVideo({ x: 20, y: 300, w: 360, h: 200 }, { w: 400, h: 800 }, { w: 1280, h: 720 });
    const s = 800 / 720, crop = (720 * s * (1280 / 720) - 400) / 2;
    expect(r.y).toBeCloseTo(300 / s, 3); expect(r.h).toBeCloseTo(200 / s, 3); expect(r.x).toBeCloseTo((20 + crop) / s, 3);
    expect(r.x + r.w).toBeLessThanOrEqual(1280);
  });
});
