import { useRef, useState } from "react";
import { ApiError, api } from "../api";
import { useI18n } from "../i18n";
import { fmtNum } from "../lib/format";

interface Issue { row: number; field: string; message: string }
type Result = { ok: true; total: number; warnings: number } | { ok: false; errors: Issue[]; count: number; offline?: boolean } | null;

export function WorkersUpload({ onDone }: { onDone: () => void }) {
  const { t } = useI18n(); const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<Result>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setRes(null);
    try {
      const r = await api<{ meta: { total: number; warningCount: number } }>("/api/admin/workers/upload", { method: "POST", body: await file.arrayBuffer(), headers: { "Content-Type": "application/octet-stream" } });
      setRes({ ok: true, total: r.meta.total, warnings: r.meta.warningCount }); onDone();
    } catch (e) {
      const b = e instanceof ApiError ? e.body : null;
      setRes({ ok: false, errors: b?.errors ?? [{ row: 0, field: "file", message: b?.error ?? "network" }], count: b?.errorCount ?? 1 });
    } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return (
    <div>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? t("uploading") : t("upload")}</button>
      <div role="status" aria-live="polite" className="mt-2 text-sm">
        {res?.ok && <p className="m-0 text-ok">{t("uploadOk", { n: fmtNum(res.total) })} {res.warnings > 0 && t("uploadWarn", { n: fmtNum(res.warnings) })}</p>}
        {res && !res.ok && <div className="text-block">
          <p className="m-0 font-semibold">{t("uploadFail")}</p>
          <ul className="m-0 mt-1 list-disc ps-5">{res.errors.slice(0, 8).map((x, i) => <li key={i}>{t("rowErr", { row: x.row, field: x.field, message: x.message })}</li>)}</ul>
          {res.count > 8 && <p className="m-0 mt-1">{t("moreErrors", { n: res.count - 8 })}</p>}
        </div>}
      </div>
    </div>
  );
}
