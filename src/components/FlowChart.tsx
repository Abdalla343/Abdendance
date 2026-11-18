import { useState } from "react";
import { useI18n } from "../i18n";
import { fmtNum, hourLabel, hourSlots, peakSlot } from "../lib/format";
import type { Summary } from "../types";

const HALF = 104; // px available above and below the baseline

/** Mirrored hourly bars: check-ins rise above the baseline, check-outs hang below it. */
export function FlowChart({ hourly }: { hourly: Summary["hourly"] }) {
  const { t } = useI18n();
  const slots = hourSlots(hourly), peak = peakSlot(slots);
  const [picked, setPicked] = useState<number | null>(null);
  const max = Math.max(1, ...slots.flatMap((s) => [s.checkIns, s.checkOuts]));
  const px = (n: number) => (n ? Math.max(3, Math.round((n / max) * HALF)) : 0);
  const sel = slots.find((s) => s.hour === (picked ?? peak?.hour)) ?? null;

  return (
    <div>
      <div dir="ltr" role="group" aria-label={t("flowTitle")} className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
        {slots.map((s, i) => (
          <button key={s.hour} type="button" onMouseEnter={() => setPicked(s.hour)} onFocus={() => setPicked(s.hour)} onClick={() => setPicked(s.hour)}
            aria-label={t("hourReadout", { h: hourLabel(s.hour), i: s.checkIns, o: s.checkOuts })}
            className={`group flex min-w-0 cursor-pointer flex-col items-stretch border-0 bg-transparent p-0 ${sel?.hour === s.hour ? "bg-ink/[.07]" : "hover:bg-ink/[.05]"}`}>
            <span className="flex items-end" style={{ height: HALF }}><span className="w-full bg-in" style={{ height: px(s.checkIns) }} /></span>
            <span className="h-[2px] bg-ink" />
            <span className="flex items-start" style={{ height: HALF }}><span className="w-full bg-out" style={{ height: px(s.checkOuts) }} /></span>
            <span className={`num pt-1 text-center text-[11px] leading-none text-ink-2 ${i % 2 ? "max-sm:invisible" : ""}`}>{String(s.hour).padStart(2, "0")}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 bg-in" />{t("flowIn")}</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 bg-out" />{t("flowOut")}</span>
        <span className="num ms-auto font-medium" aria-live="polite">{sel && t("hourReadout", { h: hourLabel(sel.hour), i: fmtNum(sel.checkIns), o: fmtNum(sel.checkOuts) })}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">{peak ? t("peak", { h: hourLabel(peak.hour), n: fmtNum(peak.checkIns) }) : t("noTraffic")}</p>
    </div>
  );
}
