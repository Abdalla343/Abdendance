import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import type { Op } from "../types";
import { ScanTable } from "./Recent";

/** Header search box + results dialog (ADMIN). Full IDs are returned only to authenticated admins. */
export function SearchBox() {
  const { t } = useI18n(); const dlg = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState(""); const [asked, setAsked] = useState(""); const [rows, setRows] = useState<Op[] | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => { if (rows && dlg.current && !dlg.current.open) dlg.current.showModal?.(); }, [rows]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); const id = q.trim(); if (!id) return;
    setAsked(id); setRows([]); setBusy(true);
    try { setRows((await api<{ results: Op[] }>(`/api/attendance/search?id=${encodeURIComponent(id)}`)).results); } catch { setRows([]); }
    finally { setBusy(false); }
  }
  return (
    <>
      <form onSubmit={submit} role="search" className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xs">
        <input className="field" dir="ltr" inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} />
      </form>
      <dialog ref={dlg} onClose={() => setRows(null)} className="m-auto w-[min(56rem,calc(100vw-1.5rem))] rounded-[3px] border-0 bg-paper p-5">
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="m-0 text-lg font-semibold">{t("searchTitle", { id: asked })}</h2>
          <button type="button" className="btn ms-auto" onClick={() => dlg.current?.close()}>{t("close")}</button>
        </div>
        {rows && rows.length ? <ScanTable ops={rows} /> : <p className="text-ink-2">{busy ? t("searching") : t("searchNone")}</p>}
      </dialog>
    </>
  );
}
