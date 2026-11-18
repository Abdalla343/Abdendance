import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "../src/pages/Dashboard";
import { I18nProvider } from "../src/i18n";
import { AuthProvider } from "../src/auth";
import type { Summary } from "../src/types";

const summary = (over: Partial<Summary> = {}): Summary => ({
  day: "2026-11-14", workers: { loadedAt: "2026-11-14T05:00:00Z", source: "upload", total: 160, valid: 154, terminated: 6, warningCount: 0 },
  workersByCompany: { "Nile Builders": { valid: 30, terminated: 1 } }, checkIns: 110, checkOuts: 59, onSite: 51,
  rejected: { notApproved: 3, notFound: 5, alreadyRegistered: 7 }, queue: { pending: 0, failed: 0 },
  byCompany: [{ company: "Nile Builders", checkIns: 22, checkOuts: 11, onSite: 11 }], hourly: [{ hour: "07", checkIns: 41, checkOuts: 0 }],
  files: { checkIn: { exists: true, bytes: 13000, modified: "2026-11-14T06:00:00Z" }, checkOut: { exists: false } },
  recent: [{ operationId: "a", time: "07:01", date: "14-11-2026", direction: "IN", outcome: "APPROVED", state: "COMPLETED", nationalId: "29501010100001", name: "Ahmed Saad", company: "Nile Builders", gate: "Gate 1" }],
  ...over,
});
const mount = () => render(<MemoryRouter><I18nProvider><AuthProvider><Dashboard /></AuthProvider></I18nProvider></MemoryRouter>);
const respond = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })));

beforeEach(() => { localStorage.clear(); localStorage.setItem("att.lang", "en"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Dashboard", () => {
  it("shows the numbers from the server", async () => {
    respond(summary()); mount();
    expect(await screen.findByText("51")).toBeInTheDocument();
    expect(screen.getByText("of 110 who checked in")).toBeInTheDocument();
    expect(screen.getByText("Ahmed Saad")).toBeInTheDocument();
    expect(screen.getByText("Busiest hour: 07:00, with 41 checked in.")).toBeInTheDocument();
    expect(screen.getByText("Not created yet")).toBeInTheDocument(); // missing check-out file
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("warns when the worker list is not loaded and when saves have failed", async () => {
    respond(summary({ workers: null, queue: { pending: 2, failed: 4 } })); mount();
    expect(await screen.findByText(/worker list is not loaded/i)).toBeInTheDocument();
    expect(screen.getByText("4 scans could not be saved to Excel. Check that the daily files are closed, then retry.")).toBeInTheDocument();
  });
  it("keeps the last data and says so when the server cannot be reached", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const f = vi.fn(async () => new Response(JSON.stringify(summary()), { status: 200 })); vi.stubGlobal("fetch", f); mount();
    await screen.findByText("51");
    f.mockImplementation(async () => { throw new TypeError("network"); }); // the next 10 s refresh fails
    await vi.advanceTimersByTimeAsync(10_500);
    expect(await screen.findByText(/Can't reach the server/)).toBeInTheDocument();
    expect(screen.getByText("51")).toBeInTheDocument(); // last data still shown
    vi.useRealTimers();
  });
  it("renders in Arabic with right-to-left direction", async () => {
    localStorage.setItem("att.lang", "ar"); respond(summary()); mount();
    expect(await screen.findByText("داخل الموقع الآن")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
  });
});
