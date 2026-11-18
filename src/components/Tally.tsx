import { useI18n } from "../i18n";
import { fmtNum } from "../lib/format";
import type { Summary } from "../types";

export function Tally({ s }: { s: Summary }) {
  const { t } = useI18n();
  const rows: [string, number, string][] = [
    [t("checkedIn"), s.checkIns, "bg-in"], [t("checkedOut"), s.checkOuts, "bg-out"],
    [t("blocked"), s.rejected.notApproved, "bg-block"], [t("notFound"), s.rejected.notFound, "bg-notfound"],
    [t("repeatScans"), s.rejected.alreadyRegistered, "bg-warn"],
  ];
  return (
    <section aria-labelledby="tally">
      <h2 id="tally" className="section-title">{t("tallyTitle")}</h2>
      <dl className="m-0">
        {rows.map(([label, n, color]) => (
          <div key={label} className="rule-row flex items-baseline gap-3 py-2.5">
            <i className={`inline-block size-2.5 shrink-0 ${color}`} />
            <dt className="text-[15px]">{label}</dt>
            <dd className="num m-0 ms-auto text-2xl font-light">{fmtNum(n)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
