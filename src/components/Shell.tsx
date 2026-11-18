import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { SearchBox } from "./SearchDialog";

export function LangButton() {
  const { t, toggle } = useI18n();
  return <button type="button" className="btn" onClick={toggle} lang={t("otherLang") === "English" ? "en" : "ar"}>{t("otherLang")}</button>;
}

export function Shell({ children, search, flush }: { children: ReactNode; search?: boolean; flush?: boolean }) {
  const { t } = useI18n(); const { user, logout } = useAuth(); const admin = user?.role === "ADMIN";
  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header className="border-b-2 border-ink bg-paper pt-[env(safe-area-inset-top)]">
        <div className={`mx-auto flex max-w-6xl items-center gap-x-4 gap-y-2 px-4 ${flush ? "h-14" : "flex-wrap py-3"}`}>
          <span className="text-lg font-semibold">{t("appName")}</span>
          {admin && <nav className="flex flex-wrap gap-1" aria-label="main">
            {([["/", t("navDashboard")], ["/onsite", t("onSiteNow")], ["/users", t("usersTitle")], ["/scan", t("navScanner")]] as const).map(([to, label]) => (
              <NavLink key={to} to={to} end className={({ isActive }) => `rounded-[3px] px-3 py-1.5 text-sm font-medium ${isActive ? "bg-ink text-paper" : "text-ink hover:bg-ink/10"}`}>{label}</NavLink>))}
          </nav>}
          {search && <SearchBox />}
          <div className="ms-auto flex items-center gap-2">
            <span className="hidden text-sm text-ink-2 sm:inline">{user?.displayName || user?.username}</span>
            <LangButton />
            <button type="button" className="btn" onClick={logout}>{t("signOut")}</button>
          </div>
        </div>
      </header>
      {flush ? <main>{children}</main> : <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>}
    </div>
  );
}
