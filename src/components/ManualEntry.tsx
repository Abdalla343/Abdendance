import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { maskId } from "../lib/format";
import type { WorkerView } from "../lib/scanApi";
import { useI18n } from "../i18n";
import { normalizeId } from "../ocr/parse";

/** Manual correction. Typed Arabic digits and lower case are normalized exactly like scanned values. */
export function ManualEntry({ initial, notFound, review, onSubmit, onCancel, onRecordNotFound }:
  { initial: string; notFound: boolean; review?: boolean; onSubmit: (v: string) => void; onCancel: () => void; onRecordNotFound: (v: string) => void }) {
  const { t } = useI18n(); const [v, setV] = useState(initial); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const norm = normalizeId(v), ok = norm.length >= 3;
  // Near misses of an unknown reading: OCR errors are usually one character. The officer decides; nothing is chosen automatically.
  const [similar, setSimilar] = useState<WorkerView[]>([]);
  useEffect(() => {
    if (!notFound || !initial) return; let live = true;
    api<{ matches: WorkerView[] }>(`/api/workers/similar?id=${encodeURIComponent(initial)}`).then((r) => { if (live) setSimilar(r.matches); }).catch(() => {});
    return () => { live = false; };
  }, [initial, notFound]);
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-paper p-5">
      <form onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(norm); }} className="mx-auto max-w-md">
        <h2 className="mb-1 mt-2 text-2xl font-semibold">{t("manualTitle")}</h2>
        <p className="mb-4 mt-0 text-ink-2">{notFound ? t("manualNotFound", { v: initial }) : review ? t("manualReview") : t("manualHint")}</p>
        {similar.length > 0 && (
          <div className="mb-5 border-s-4 border-in bg-ground p-3">
            <p className="m-0 mb-2 font-medium">{t("didYouMean")}</p>
            {similar.map((w) => (
              <div key={w.nationalId} className="flex items-center gap-3 border-t border-rule py-2">
                <div className="min-w-0 flex-1"><div className="font-semibold">{w.name}</div><div className="text-sm text-ink-2">{w.company}</div>
                  <div dir="ltr" className="num text-sm text-ink-2">{maskId(w.nationalId)}{w.workerId ? `  ${w.workerId}` : ""}</div></div>
                <button type="button" className="btn btn-solid" onClick={() => onSubmit(w.workerId || w.nationalId)}>{t("useThis")}</button>
              </div>
            ))}
          </div>
        )}
        <label htmlFor="manual-id" className="mb-1 block text-sm font-medium">{t("manualLabel")}</label>
        <input id="manual-id" ref={ref} className="field !min-h-14 text-2xl" dir="ltr" inputMode="text" autoCapitalize="characters" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} />
        <p className="num mb-5 mt-1 min-h-6 text-sm text-ink-2" dir="ltr">{norm && norm !== v ? t("readAs", { v: norm }) : ""}</p>
        <button type="submit" className="btn btn-solid !min-h-14 w-full text-lg" disabled={!ok}>{t("manualRecord")}</button>
        {notFound && <button type="button" className="btn mt-3 w-full" disabled={!ok} onClick={() => onRecordNotFound(norm)}>{t("manualRecordNotFound")}</button>}
        <button type="button" className="btn mt-3 w-full" onClick={onCancel}>{t("cancel")}</button>
      </form>
    </div>
  );
}
