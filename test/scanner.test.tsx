import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import { AuthProvider } from "../src/auth";
import { ManualEntry } from "../src/components/ManualEntry";
import { ResultPanel } from "../src/components/ResultPanel";
import { submitScan, type ScanView } from "../src/lib/scanApi";
import type { Candidate } from "../src/ocr/parse";

// --- Scanner page with the camera / OCR replaced by fakes, so the decision logic is what is tested ---
let winner: ((ready: Candidate[], confirmed: Candidate[]) => void) | null = null;
vi.mock("../src/lib/useScanLoop", () => ({ GUIDE: { x: 0.04, w: 0.92, h: 0.26, cy: 0.44 }, useScanLoop: (o: { onCandidates: (r: Candidate[], c: Candidate[]) => void }) => { winner = o.onCandidates; return null; } }));
vi.mock("../src/lib/useCamera", () => ({ useCamera: () => ({ videoRef: { current: null }, state: "ready", torchSupported: false, torchOn: false, toggleTorch: () => {}, retry: () => {} }) }));
vi.mock("../src/ocr/engine", () => ({ OcrEngine: class { load() { return Promise.resolve({}); } dispose() { return Promise.resolve(); } } }));
vi.mock("../src/ocr/reader", () => ({ FrameReader: class {} }));
import Scanner from "../src/pages/Scanner";

const worker = { nationalId: "29501010100001", workerId: "ZTC535", name: "Omar Saad", jobTitle: "Welder", company: "Nile Builders", status: "VALID" };
const view = (over: Partial<ScanView> = {}): ScanView => ({ operationId: "x", state: "COMPLETED", direction: "IN", date: "14-11-2026", time: "07:05", outcome: "APPROVED", worker, ...over });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const cand = (value: string, kind: Candidate["kind"] = "CODE"): Candidate => ({ value, kind, strength: 80 });

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
function mockApi(route: Route) { const f = vi.fn(async (u: RequestInfo | URL, i?: RequestInit) => route(String(u), i)); vi.stubGlobal("fetch", f); return f; }
const scanBodies = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter(([u, i]) => String(u) === "/api/scans" && (i as RequestInit)?.method === "POST").map(([, i]) => JSON.parse(String((i as RequestInit).body)));

beforeEach(() => { localStorage.clear(); localStorage.setItem("att.lang", "en"); localStorage.setItem("att.token", "t"); winner = null; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("submitScan", () => {
  it("returns done on 200 and sends the operationId, direction and gate", async () => {
    const f = mockApi(() => json(view()));
    const r = await submitScan("op-1", "ZTC535", "OUT", "Gate 2", () => {});
    expect(r.kind).toBe("done"); expect(scanBodies(f)[0]).toEqual({ operationId: "op-1", idNumber: "ZTC535", direction: "OUT", gateId: "Gate 2" });
  });
  it("keeps polling a queued scan (202) and only reports success once COMPLETED", async () => {
    let polls = 0; const saving = vi.fn();
    mockApi((u) => u === "/api/scans" ? json(view({ state: "PENDING" }), 202) : json(view({ state: ++polls < 2 ? "PROCESSING" : "COMPLETED" }), polls < 2 ? 202 : 200));
    const r = await submitScan("op-2", "ZTC535", "IN", "", saving);
    expect(r.kind).toBe("done"); expect(saving).toHaveBeenCalledOnce(); expect(polls).toBe(2);
  });
  it("reports FAILED (500) and network errors as retryable, never as success", async () => {
    mockApi(() => json(view({ state: "FAILED" }), 500)); expect((await submitScan("a", "x", "IN", "", () => {})).kind).toBe("failed");
    mockApi(() => { throw new TypeError("offline"); }); expect((await submitScan("a", "x", "IN", "", () => {})).kind).toBe("network");
  });
});

describe("ResultPanel", () => {
  const show = (v: ScanView, value = "ZTC535") => render(<I18nProvider><ResultPanel shown={{ kind: "result", view: v, value }} onNext={() => {}} onRetry={() => {}} /></I18nProvider>);
  it("APPROVED shows name, company, entry time, and displays the full National ID", () => {
    show(view()); expect(screen.getByText("APPROVED")).toBeInTheDocument(); expect(screen.getByText("Omar Saad")).toBeInTheDocument();
    expect(screen.getByText("Entry recorded at 07:05")).toBeInTheDocument(); expect(screen.getByText(/29501010100001/)).toBeInTheDocument(); expect(document.body.textContent).not.toContain("295********001");
  });
  it("explains a rejected check-out with no active check-in", () => {
    show(view({ outcome: "NOT_APPROVED", direction: "OUT", rejectionReason: "NO_CHECK_IN" }));
    expect(screen.getByText("Check-out rejected. This employee has no completed active check-in.")).toBeInTheDocument();
    expect(screen.queryByText(/Exit recorded/)).toBeNull();
  });
  it("BLOCKED shows the reason; NOT FOUND and ALREADY REGISTERED are distinct", () => {
    show(view({ outcome: "NOT_APPROVED", worker: { ...worker, status: "TERMINATED", terminationReason: "Contract ended" } }));
    expect(screen.getByText("BLOCKED")).toBeInTheDocument(); expect(screen.getByText("Reason: Contract ended")).toBeInTheDocument(); cleanup();
    show(view({ outcome: "NOT_FOUND", worker: undefined }), "IR9999"); expect(screen.getByText("NOT FOUND")).toBeInTheDocument(); cleanup();
    show(view({ outcome: "ALREADY_REGISTERED", previous: "IN 06:50" })); expect(screen.getByText("ALREADY REGISTERED")).toBeInTheDocument(); expect(screen.getByText(/Already registered \(In 06:50\)/)).toBeInTheDocument();
  });
  it("system error offers Retry", () => {
    const retry = vi.fn(); render(<I18nProvider><ResultPanel shown={{ kind: "error", why: "network", value: "ZTC535" }} onNext={() => {}} onRetry={retry} /></I18nProvider>);
    fireEvent.click(screen.getByText("Retry")); expect(retry).toHaveBeenCalled(); expect(screen.getByText("SYSTEM ERROR")).toBeInTheDocument();
  });
});

describe("ManualEntry", () => {
  const open = (onSubmit = vi.fn()) => { render(<I18nProvider><ManualEntry initial="" notFound={false} onSubmit={onSubmit} onCancel={() => {}} onRecordNotFound={() => {}} /></I18nProvider>); return onSubmit; };
  it("normalizes Arabic digits, lower case and separators before submitting", () => {
    const submit = open(); const input = screen.getByLabelText("ID number");
    fireEvent.change(input, { target: { value: "٢٩٥٠١٠١٠١٠٠٠٠١" } }); expect(screen.getByText("Read as 29501010100001")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Check and record")); expect(submit).toHaveBeenCalledWith("29501010100001");
    fireEvent.change(input, { target: { value: "ir-١٢٣٤" } }); fireEvent.click(screen.getByText("Check and record")); expect(submit).toHaveBeenLastCalledWith("IR1234");
  });
  it("will not submit an empty value", () => { const submit = open(); expect(screen.getByText("Check and record")).toBeDisabled(); expect(submit).not.toHaveBeenCalled(); });
});

describe("Scanner page", () => {
  const mount = () => render(<MemoryRouter><I18nProvider><AuthProvider><Scanner /></AuthProvider></I18nProvider></MemoryRouter>);
  const auth: Route = (u) => u === "/api/auth/me" ? json({ user: { id: 1, username: "gate1", role: "USER" } }) : json({}, 404);
  const ready = async () => { mount(); await waitFor(() => expect(winner).not.toBeNull()); await screen.findByText("Put the ID number inside the frame"); };

  it("a recognised worker is looked up first, then recorded, and APPROVED is shown", async () => {
    const f = mockApi((u, i) => u.startsWith("/api/workers/lookup") ? json({ found: true, approved: true, worker }) : u === "/api/scans" ? json(view()) : auth(u, i));
    await ready(); await act(async () => { winner!([cand("ZTC535")], []); });
    expect(await screen.findByText("APPROVED")).toBeInTheDocument();
    const urls = f.mock.calls.map(([u]) => String(u)); expect(urls.findIndex((u) => u.startsWith("/api/workers/lookup?id=ZTC535"))).toBeLessThan(urls.indexOf("/api/scans"));
    expect(scanBodies(f)).toHaveLength(1); expect(scanBodies(f)[0]).toMatchObject({ idNumber: "ZTC535", direction: "IN", scanMethod: "SCANNER" });
  });
  it("an unknown OCR reading is NOT saved: it opens manual correction pre-filled", async () => {
    const f = mockApi((u, i) => u.startsWith("/api/workers/lookup") ? json({ found: false }) : auth(u, i));
    await ready(); await act(async () => { winner!([cand("IR1243")], [cand("IR1243")]); });
    expect(await screen.findByText(/IR1243 is not in the worker list/)).toBeInTheDocument();
    expect(scanBodies(f)).toHaveLength(0); expect((screen.getByLabelText("ID number") as HTMLInputElement).value).toBe("IR1243");
  });
  it("offers 'did you mean' near-matches; choosing one records THAT worker (nothing is automatic)", async () => {
    const f = mockApi((u, i) => u.startsWith("/api/workers/lookup") ? json({ found: false }) : u.startsWith("/api/workers/similar") ? json({ matches: [worker] }) : u === "/api/scans" ? json(view()) : auth(u, i));
    await ready(); await act(async () => { winner!([cand("LZTC535")], [cand("LZTC535")]); });
    expect(await screen.findByText("Omar Saad")).toBeInTheDocument(); expect(scanBodies(f)).toHaveLength(0);
    fireEvent.click(screen.getByText("Use this one"));
    expect(await screen.findByText("APPROVED")).toBeInTheDocument(); expect(scanBodies(f)[0]).toMatchObject({ idNumber: "ZTC535" });
  });
  it("the officer can correct the number, and the corrected value is what gets recorded", async () => {
    const f = mockApi((u, i) => u.startsWith("/api/workers/lookup") ? json({ found: false }) : u === "/api/scans" ? json(view()) : auth(u, i));
    await ready(); await act(async () => { winner!([cand("IR1243")], [cand("IR1243")]); }); await screen.findByLabelText("ID number");
    fireEvent.change(screen.getByLabelText("ID number"), { target: { value: "ir 1234" } }); fireEvent.click(screen.getByText("Check and record"));
    expect(await screen.findByText("APPROVED")).toBeInTheDocument(); expect(scanBodies(f)[0]).toMatchObject({ idNumber: "IR1234", scanMethod: "MANUAL" });
  });
  it("'record as not found' stores the attempt for an unknown ID, on the officer's decision", async () => {
    const f = mockApi((u, i) => u.startsWith("/api/workers/lookup") ? json({ found: false }) : u === "/api/scans" ? json(view({ outcome: "NOT_FOUND", worker: undefined })) : auth(u, i));
    await ready(); await act(async () => { winner!([cand("IR9999")], [cand("IR9999")]); }); fireEvent.click(await screen.findByText("Record as not found"));
    expect(await screen.findByText("NOT FOUND")).toBeInTheDocument(); expect(scanBodies(f)).toHaveLength(1);
  });
  it("when two readings qualify, each is checked against the list and the one that matches is recorded", async () => {
    const f = mockApi((u, i) => u.startsWith("/api/workers/lookup") ? json(u.includes("id=29501010100087") ? { found: false } : { found: true, approved: true, worker }) : u === "/api/scans" ? json(view()) : auth(u, i));
    await ready(); await act(async () => { winner!([cand("29501010100087", "NATIONAL_ID"), cand("29501010100001", "NATIONAL_ID")], []); });
    expect(await screen.findByText("APPROVED")).toBeInTheDocument(); expect(scanBodies(f)).toHaveLength(1); expect(scanBodies(f)[0]).toMatchObject({ idNumber: "29501010100001" });
  });
  it("a reading that is only 'ready' (2 sightings) and unknown does NOT interrupt the officer", async () => {
    const f = mockApi((u, i) => u.startsWith("/api/workers/lookup") ? json({ found: false }) : auth(u, i));
    await ready(); await act(async () => { winner!([cand("QQ1111")], []); });
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes("lookup?id=QQ1111"))).toBe(true));
    expect(screen.queryByLabelText("ID number")).toBeNull(); expect(scanBodies(f)).toHaveLength(0); expect(screen.getByText("Put the ID number inside the frame")).toBeInTheDocument();
  });
  it("opens blank manual review for a contested ID without a lookup or automatic save", async () => {
    const f = mockApi((u, i) => u.startsWith("/api/workers/lookup") ? json({ found: true, worker }) : auth(u, i));
    await ready();
    await act(async () => { winner!([], [cand("29501010100001", "NATIONAL_ID")]); });
    expect(await screen.findByLabelText("ID number")).toHaveValue("");
    expect(f.mock.calls.some(([url]) => String(url).startsWith("/api/workers/lookup"))).toBe(false);
    expect(scanBodies(f)).toHaveLength(0);
  });
  it("Exit mode is remembered and used for scans", async () => {
    const f = mockApi((u, i) => u.startsWith("/api/workers/lookup") ? json({ found: true, approved: true, worker }) : u === "/api/scans" ? json(view({ direction: "OUT" })) : auth(u, i));
    await ready(); fireEvent.click(screen.getByRole("radio", { name: "Exit" })); expect(localStorage.getItem("att.mode")).toBe('"OUT"');
    await act(async () => { winner!([cand("ZTC535")], []); }); await screen.findByText("APPROVED"); expect(scanBodies(f)[0]).toMatchObject({ direction: "OUT" });
  });
  it("on a network failure Retry re-sends the SAME operationId (no duplicate)", async () => {
    let fail = true;
    const f = mockApi((u, i) => { if (u.startsWith("/api/workers/lookup")) return json({ found: true, worker }); if (u === "/api/scans") { if (fail) throw new TypeError("offline"); return json(view()); } return auth(u, i); });
    await ready(); await act(async () => { winner!([cand("ZTC535")], []); }); expect(await screen.findByText("SYSTEM ERROR")).toBeInTheDocument();
    fail = false; fireEvent.click(screen.getByText("Retry")); expect(await screen.findByText("APPROVED")).toBeInTheDocument();
    const ids = scanBodies(f).map((b) => b.operationId); expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]); expect(scanBodies(f).every((body) => body.scanMethod === "SCANNER")).toBe(true);
  });
});
