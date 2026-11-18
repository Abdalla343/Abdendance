import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { OutcomeBadge } from "./Outcome";
import { api, post } from "../api";
import type { Op } from "../types";

export const ScanTable = ({ ops, selection }: { ops: Op[]; selection?: { ids: Set<string>; toggle: (id: string) => void; togglePage: () => void } }) => {
  const { t } = useI18n();
  const th = "py-2 pe-3 text-start text-xs font-medium text-ink-2 sm:text-sm";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[340px] border-collapse">
        <thead><tr className="border-b border-ink">
          {selection && <th className={th}><input type="checkbox" aria-label={t("selectPage")} checked={ops.length > 0 && ops.every((op) => selection.ids.has(op.operationId))} onChange={selection.togglePage} /></th>}
          <th className={th}>{t("colTime")}</th><th className={th}>{t("colWorker")}</th><th className={th}>{t("colId")}</th>
          <th className={`${th} max-sm:hidden`}>{t("colGate")}</th><th className={th}>{t("scannedBy")}</th><th className={th}>{t("operationScan")}</th><th className={th}>{t("colResult")}</th>
        </tr></thead>
        <tbody>
          {ops.map((o) => (
            <tr key={o.operationId} className="rule-row align-top">
              {selection && <td className="py-3 pe-3"><input type="checkbox" aria-label={t("selectOperation", { id: o.operationId })} checked={selection.ids.has(o.operationId)} onChange={() => selection.toggle(o.operationId)} /></td>}
              <td className="num whitespace-nowrap py-2.5 pe-3">{o.time}<div className="text-xs text-ink-2">{o.date}</div><div className="text-xs text-ink-2">{o.direction === "IN" ? t("dirIn") : t("dirOut")}</div></td>
              <td className="py-2.5 pe-3">{o.name ?? <span className="text-ink-2">{t("unknownWorker")}</span>}<div className="text-xs text-ink-2">{o.company}</div></td>
              <td className="num py-2.5 pe-3"><span dir="ltr" className="inline-block">{o.nationalId}</span></td>
              <td className="py-2.5 pe-3 max-sm:hidden">{o.gate}</td>
              <td className="py-2.5 pe-3">{o.scannedBy || o.scannedUsername || "—"}</td>
              <td className="py-2.5 pe-3">{t(o.scanMethod === "SCANNER" ? "scanScanner" : o.scanMethod === "MANUAL" ? "scanManual" : "scanUnknown")}</td>
              <td className="py-2.5"><OutcomeBadge outcome={o.outcome} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export function Recent({ ops, onChange }: { ops: Op[]; onChange?: () => void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false), [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Op[]>([]), [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(new Set<string>()), [removed, setRemoved] = useState(new Set<string>());
  const [confirm, setConfirm] = useState<"selected" | "all" | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!expanded) return;
    const result = await api<{ operations: Op[]; total: number }>(`/api/admin/operations?offset=${offset}&limit=100`, { signal });
    if (signal?.aborted) return;
    setPage(result.operations); setTotal(result.total);
  }, [expanded, offset]);
  useEffect(() => {
    const controller = new AbortController();
    if (expanded) void load(controller.signal).catch(() => { if (!controller.signal.aborted) setError(t("serverDown")); });
    return () => controller.abort();
  }, [load, expanded, t]);
  const shown = (expanded ? page : ops.slice(0, 12)).filter((op) => !removed.has(op.operationId));
  const toggle = (id: string) => setSelected((prior) => {
    const next = new Set(prior);
    if (next.has(id)) next.delete(id); else if (next.size < 500) next.add(id);
    return next;
  });
  async function remove() {
    if (!confirm) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await post<{ deleted: number; excelPending: { pending: number; failed: number } }>("/api/admin/operations/delete",
        confirm === "all" ? { all: true } : { operationIds: [...selected] });
      setRemoved((prior) => new Set([...prior, ...(confirm === "all" ? shown.map((op) => op.operationId) : selected)]));
      setSelected(new Set()); setConfirm(null);
      setMessage(t("operationsDeleted", { n: result.deleted }) + (result.excelPending.pending || result.excelPending.failed ? " " + t("excelDeletePending") : ""));
      onChange?.();
      await load();
    } catch { setError(t("operationDeleteFailed")); }
    finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="recent">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="recent" className="section-title !mb-0 me-auto">{t("recentTitle")}</h2>
        <button className="btn" disabled={busy || !selected.size} onClick={() => setConfirm("selected")}>{t("deleteSelectedOps", { n: selected.size })}</button>
        <button className="btn border-block text-block" disabled={busy} onClick={() => setConfirm("all")}>{t("deleteAllOps")}</button>
      </div>
      {confirm && <div role="alertdialog" aria-label={t("confirmDeleteOps")} className="mb-4 border border-block bg-paper p-4">
        <p>{confirm === "all" ? t("deleteAllWarning") : t("deleteSelectedWarning", { n: selected.size })}</p>
        <div className="flex gap-2"><button className="btn btn-solid" disabled={busy} onClick={() => void remove()}>{t("deleteConfirm")}</button>
          <button className="btn" disabled={busy} onClick={() => setConfirm(null)}>{t("cancel")}</button></div>
      </div>}
      {error && <p role="alert" className="text-block">{error}</p>}
      {message && <p role="status">{message}</p>}
      {shown.length === 0 ? <p className="text-ink-2">{t("noRecent")}</p> :
        <ScanTable ops={shown} selection={{ ids: selected, toggle, togglePage: () => {
          const all = shown.every((op) => selected.has(op.operationId));
          setSelected((prior) => {
            const next = new Set(prior);
            shown.forEach((op) => { if (all) next.delete(op.operationId); else if (next.size < 500) next.add(op.operationId); });
            return next;
          });
        } }} />}
      <div className="mt-3 flex flex-wrap gap-3">
        <button className="btn" disabled={busy} onClick={() => { setExpanded(!expanded); setOffset(0); }}>{t(expanded ? "showRecentOps" : "browseOperations")}</button>
        {expanded && <>
          <button className="btn" disabled={busy || !offset} onClick={() => setOffset(Math.max(0, offset - 100))}>{t("previousPage")}</button>
          <button className="btn" disabled={busy || offset + 100 >= total} onClick={() => setOffset(offset + 100)}>{t("nextPage")}</button>
        </>}
      </div>
    </section>
  );
}
