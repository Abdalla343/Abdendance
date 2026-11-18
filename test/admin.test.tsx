import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../src/i18n";
import { AuthProvider } from "../src/auth";
import OnSite from "../src/pages/OnSite";
import Users from "../src/pages/Users";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { localStorage.clear(); localStorage.setItem("att.lang", "en"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("live on-site list", () => {
  it("updates after check-out, searches and retains received data on a failed refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let inside = true, fail = false;
    const f = vi.fn(async (_url: RequestInfo | URL) => {
      if (fail) throw new Error("offline");
      return json({ total: inside ? 1 : 0, filtered: inside ? 1 : 0, serverNow: new Date().toISOString(),
        employees: inside ? [{ nationalId: "29501010100001", employeeId: "A001", name: "Omar", company: "Nile",
          checkInTime: "08:00", checkInDate: "17-11-2026", secondsInside: 3600, scannedBy: "Ahmed Gate", scannedUsername: "gate1" }] : [] });
    });
    vi.stubGlobal("fetch", f);
    render(<I18nProvider><OnSite /></I18nProvider>);
    await screen.findByText("Omar");
    expect(screen.getByText("Ahmed Gate")).toBeInTheDocument();
    expect(screen.getByText("29501010100001")).toBeInTheDocument();
    expect(screen.getByText("1h 00m")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search name, ID or company"), { target: { value: "Nile" } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(f.mock.calls.some((call) => String(call[0]).includes("search=Nile"))).toBe(true);
    fail = true;
    await act(() => vi.advanceTimersByTimeAsync(2100));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
    expect(screen.getByText("Omar")).toBeInTheDocument();
    fail = false; inside = false;
    await act(() => vi.advanceTimersByTimeAsync(2100));
    expect(screen.queryByText("Omar")).toBeNull();
    expect(screen.getByText("No employees currently inside match this search.")).toBeInTheDocument();
  });
});

describe("user administration", () => {
  it("creates a security user and deletes it only after the delete confirmation", async () => {
    const records = [{ id: 1, username: "boss", displayName: "Boss", role: "ADMIN", active: 1 }];
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body).toMatchObject({ username: "gate2", displayName: "Ahmed", role: "USER" });
        records.push({ id: 2, ...body, active: 1 });
        return json({ user: records[1] }, 201);
      }
      if (init?.method === "DELETE") { records.pop(); return json({ deleted: 2 }); }
      return json({ users: records });
    });
    vi.stubGlobal("fetch", f);
    render(<I18nProvider><AuthProvider><Users /></AuthProvider></I18nProvider>);
    await screen.findByText("Boss");
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "gate2" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ahmed" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password-123" } });
    fireEvent.click(screen.getByText("Create security user"));
    await screen.findByText("Ahmed");
    const deleteButtons = screen.getAllByRole("button", { name: "Delete user" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]!);
    expect(f.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByText("Confirm deletion"));
    await waitFor(() => expect(screen.queryByText("Ahmed")).toBeNull());
  });
});

describe("recent scan deletion controls", () => {
  it("selects an operation, shows its scan source and requires confirmation before deleting", async () => {
    const { Recent } = await import("../src/components/Recent");
    const f = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ operationIds: ["op-one"] });
      return json({ deleted: 1, excelPending: { pending: 0, failed: 0 } });
    });
    vi.stubGlobal("fetch", f);
    const onChange = vi.fn();
    render(<I18nProvider><Recent onChange={onChange} ops={[{
      operationId: "op-one", date: "18-11-2026", time: "09:00", direction: "IN", outcome: "APPROVED", state: "COMPLETED",
      name: "Employee One", nationalId: "29501010100001", company: "Nile", gate: "Gate One", scanMethod: "MANUAL",
    }]} /></I18nProvider>);
    expect(screen.getByText("Manual ID Entry")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Select operation op-one"));
    fireEvent.click(screen.getByText("Delete selected (1)"));
    expect(f).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Delete operations"));
    await screen.findByText("Deleted 1 operations.");
    expect(screen.queryByText("Employee One")).toBeNull();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("makes the all-dates scope explicit and leaves data alone when cancelled", async () => {
    const { Recent } = await import("../src/components/Recent");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    render(<I18nProvider><Recent ops={[]} /></I18nProvider>);
    fireEvent.click(screen.getByText("Delete all operations (all dates)"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("across all dates");
    fireEvent.click(screen.getByText("Cancel"));
    expect(f).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
