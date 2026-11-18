import { useI18n } from "../i18n";
import { fmtNum } from "../lib/format";
import type { Summary } from "../types";

export function Companies({ s }: { s: Summary }) {
  const { t } = useI18n();
  const by = new Map(s.byCompany.map((c) => [c.company, c]));
  const names = new Set([...Object.keys(s.workersByCompany), ...by.keys()]);
  const rows = [...names].map((name) => ({ name, active: s.workersByCompany[name]?.valid ?? 0, in: by.get(name)?.checkIns ?? 0, out: by.get(name)?.checkOuts ?? 0, on: by.get(name)?.onSite ?? 0 }))
    .sort((a, b) => b.on - a.on || b.in - a.in || a.name.localeCompare(b.name));
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const th = "py-2 align-bottom text-start text-xs font-medium leading-tight text-ink-2 sm:text-sm";
  const td = "num py-2.5 ps-2 text-end";

  return (
    <section aria-labelledby="companies">
      <h2 id="companies" className="section-title">{t("companiesTitle")}</h2>
      {rows.length === 0 ? <p className="text-ink-2">{t("noCompanies")}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse">
            <thead><tr className="border-b border-ink">
              <th className={th}>{t("colCompany")}</th>
              <th className={`${th} !text-end`}>{t("colActive")}</th><th className={`${th} !text-end`}>{t("colIn")}</th>
              <th className={`${th} !text-end`}>{t("colOut")}</th><th className={`${th} !text-end`}>{t("colOnSite")}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="rule-row">
                  <td className="py-2.5 pe-2 text-[15px] leading-snug">{r.name}</td>
                  <td className={td}>{fmtNum(r.active)}</td><td className={td}>{fmtNum(r.in)}</td><td className={td}>{fmtNum(r.out)}</td>
                  <td className={`${td} font-semibold`}>{fmtNum(r.on)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-ink font-semibold">
              <td className="py-2.5">{t("total")}</td>
              <td className={td}>{fmtNum(sum((r) => r.active))}</td><td className={td}>{fmtNum(sum((r) => r.in))}</td>
              <td className={td}>{fmtNum(sum((r) => r.out))}</td><td className={td}>{fmtNum(sum((r) => r.on))}</td>
            </tr></tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
