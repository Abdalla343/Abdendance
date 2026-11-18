import { useI18n, type Key } from "../i18n";
import type { Outcome } from "../types";

const META: Record<Outcome, { key: Key; text: string; border: string }> = {
  APPROVED: { key: "approved", text: "text-ok", border: "border-ok" },
  NOT_APPROVED: { key: "blockedL", text: "text-block", border: "border-block" },
  NOT_FOUND: { key: "notFoundL", text: "text-notfound", border: "border-notfound" },
  ALREADY_REGISTERED: { key: "alreadyL", text: "text-warn", border: "border-warn" },
};
export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const { t } = useI18n(); const m = META[outcome];
  return <span className={`inline-block whitespace-nowrap rounded-[3px] border px-2 py-0.5 text-xs font-semibold ${m.text} ${m.border}`}>{t(m.key)}</span>;
}
