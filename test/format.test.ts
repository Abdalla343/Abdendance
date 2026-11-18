import { describe, expect, it } from "vitest";
import { fmtBytes, fmtDay, fmtNum, hourLabel, hourSlots, peakSlot, shiftDay } from "../src/lib/format";
import { ar, en } from "../src/i18n";

describe("format helpers", () => {
  it("shifts days across month and year boundaries", () => {
    expect(shiftDay("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("formats numbers, sizes and dates with Western digits in both languages", () => {
    expect(fmtNum(1380)).toBe("1,380");
    expect(fmtBytes(13_400)).toBe("13 KB");
    expect(fmtDay("2026-11-14", "en")).toBe("Saturday, 14 November 2026");
    expect(fmtDay("2026-11-14", "ar")).toMatch(/14/); expect(fmtDay("2026-11-14", "ar")).not.toMatch(/[\u0660-\u0669]/);
  });
  it("hour slots cover 06-18 by default and widen for night shifts", () => {
    expect(hourSlots([]).map((s) => s.hour)).toEqual(Array.from({ length: 13 }, (_, i) => i + 6));
    const night = hourSlots([{ hour: "02", checkIns: 5, checkOuts: 0 }, { hour: "22", checkIns: 1, checkOuts: 9 }]);
    expect(night[0]!.hour).toBe(2); expect(night.at(-1)!.hour).toBe(22); expect(night.find((s) => s.hour === 22)!.checkOuts).toBe(9);
  });
  it("finds the busiest check-in hour, or none", () => {
    expect(peakSlot(hourSlots([]))).toBeNull();
    expect(peakSlot(hourSlots([{ hour: "07", checkIns: 41, checkOuts: 0 }, { hour: "08", checkIns: 28, checkOuts: 3 }]))!.hour).toBe(7);
    expect(hourLabel(7)).toBe("07:00");
  });
});

describe("translations", () => {
  it("English and Arabic define exactly the same keys with the same {placeholders}", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(ar[k]), k).toBe(ph(en[k]));
  });
});
