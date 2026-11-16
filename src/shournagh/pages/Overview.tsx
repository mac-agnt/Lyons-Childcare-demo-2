/* Overview: the owner's executive scorecard and each site manager's dashboard.
   Every figure is derived from the demo store and names its denominator and
   period, so counts stay coherent after any action elsewhere in the demo.
   The executive view shows aggregates only; personal records stay inside each
   registered service and are opened from the site tabs. */
import { useEffect, useState, type ReactNode } from "react";
import {
  useDemo, metrics, effectiveSite, inSite, roleDef, personName, staffById, roomById, siteById, childById, euro, activeTab, setTab,
  navigate, openDrawer, decide, setTaskStatus, completeCleaning, readHandover, update, logEvent, toast, nowLabel, briefingLine,
  setSite, approveCareLog, approveProgress, moveEnquiry, type DemoState,
} from "../store";
import { ROOMS, WEEKDAYS, TODAY_IDX, TODAY_LABEL, DEMO_DATE, siteName, dayLabel } from "../seed";
import type { SiteId, SiteFilter, Child, Policy, Staff, StaffStatus, Task, Programme, CleaningItem, Handover, Room } from "../types";
import {
  Page, PageHead, Grid, Card, Stat, Chip, DemoTag, SiteChip, Bar, Btn, Segmented, Table, Note, RecordLink, HBars, Restricted,
  Icon, IC, Avatar, type Tone, type Col,
} from "../ui";
import "./overview.css";

type M = ReturnType<typeof metrics>;

/* ── Small helpers ─────────────────────────────────────────────────────────── */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86400000;
const TODAY0 = new Date(DEMO_DATE.getFullYear(), DEMO_DATE.getMonth(), DEMO_DATE.getDate()).getTime();

function toMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const nowMin = () => toMin(nowLabel()) ?? 0;
const dueRank = (due: string) => toMin(due) ?? (due === "Today" ? 1200 : due === "Yesterday" ? -1 : 2000);
const short = (c: Child) => c.first + " " + c.last.charAt(0) + ".";
const sitesOf = (f: SiteFilter): SiteId[] => (f === "all" ? ["elm", "bal"] : [f]);
const initialsOf = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const actor = (s: DemoState) => roleDef(s.role).person;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const reduced = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });

const cleanOverdue = (c: CleaningItem) => !c.done && (c.due === "Yesterday" || (toMin(c.due) ?? 99999) < nowMin());
const PROGRAMME: Record<Programme, string> = {
  babies: "Full day", wobblers: "Full day", toddlers: "Full day", preschool: "Full day and ECCE", ecce: "ECCE sessional", afterschool: "School-age, TU2021CC067SA",
};

function parseDay(label: string): Date | null {
  const m = /^(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))?/.exec(label.trim());
  if (!m) return null;
  const mi = MONTHS.indexOf(m[2]);
  if (mi < 0) return null;
  return new Date(m[3] ? Number(m[3]) : DEMO_DATE.getFullYear(), mi, Number(m[1]));
}
/** Review state of a policy. Labels carry no year, so a review date that falls on
    or before the effective date is read as next year's review. */
function reviewState(p: Policy): { overdue: boolean; days: number } {
  const next = parseDay(p.nextReview);
  if (!next) return { overdue: false, days: 0 };
  const d = Math.round((next.getTime() - TODAY0) / DAY_MS);
  if (d >= 0) return { overdue: false, days: d };
  let eff = parseDay(p.effective);
  if (eff && eff.getTime() > TODAY0) eff = new Date(eff.getFullYear() - 1, eff.getMonth(), eff.getDate());
  if (p.nextReview === p.effective && p.status === "Published") return { overdue: false, days: d + 365 };
  if (eff && eff.getTime() > next.getTime()) return { overdue: false, days: d + 365 };
  return { overdue: true, days: -d };
}

function roomLive(s: DemoState, roomId: string) {
  const kids = s.children.filter((c) => c.room === roomId);
  const expected = kids.filter((c) => c.attendingToday);
  const notYet = expected.filter((c) => !c.checkedIn);
  const staff = s.staff.filter((x) => x.room === roomId);
  return {
    booked: kids.length,
    expected: expected.length,
    inNow: expected.filter((c) => c.checkedIn && !c.checkedOut).length,
    collected: expected.filter((c) => c.checkedOut).length,
    notYet: notYet.length,
    late: notYet.filter((c) => (toMin(c.expected) ?? 99999) <= nowMin()).length,
    staff,
    onDuty: staff.filter((x) => x.status === "on"),
  };
}

/* Shared actions (wrap store actions with toasts and audit entries) */
function signOff(s: DemoState, id: string) {
  const c = s.cleaning.find((x) => x.id === id);
  if (!c || c.done) return;
  completeCleaning(id);
  if (id === "cl1") { const t = s.tasks.find((x) => x.id === "t-clean-tod"); if (t && t.status !== "done") setTaskStatus("t-clean-tod", "done"); }
  toast(c.area + " signed off at " + nowLabel() + ". Recorded in the audit trail.");
}
function markHandoverRead(s: DemoState, h: Handover) {
  readHandover(h.id);
  logEvent({ actor: actor(s), actorKind: "person", action: "marked handover read", target: (roomById(h.room)?.name || h.room) + ", " + h.kind.toLowerCase() + " from " + personName(h.from, s), kind: "people", site: roomById(h.room)?.site || "elm", story: null });
  toast("Handover marked read.");
}
function clearOutstanding(s: DemoState, h: Handover) {
  update("handovers", h.id, { outstanding: null, read: true });
  logEvent({ actor: actor(s), actorKind: "person", action: "closed handover follow-up", target: (roomById(h.room)?.name || h.room) + ": " + (h.outstanding || ""), kind: "people", site: roomById(h.room)?.site || "elm", story: null });
  toast("Follow-up closed and logged.");
}
/** When the last Toddlers observation is reviewed, the weekly review task closes itself. */
function afterReview(s: DemoState, logId: string) {
  const l = s.careLogs.find((x) => x.id === logId);
  const room = l ? childById(l.child, s)?.room : undefined;
  if (!l || l.kind !== "observation" || room !== "elm-toddlers") return;
  const left = s.careLogs.filter((x) => x.id !== logId && x.kind === "observation" && x.status === "pending-review" && childById(x.child, s)?.room === room).length;
  const t = s.tasks.find((x) => x.id === "t-obs-tod");
  if (!left && t && t.status !== "done") setTaskStatus("t-obs-tod", "done");
}
function completeTask(t: Task) {
  setTaskStatus(t.id, "done");
  toast("Done: " + t.title + ".");
}
function approve(id: string) { decide(id, "approved"); }
/** The right action for a task: approvals, enquiries and collections go through their own flow. */
function TaskAction({ s, t, label = "Complete" }: { s: DemoState; t: Task; label?: string }) {
  if (t.status === "done") return <span className="sh-faint" style={{ fontSize: 11.5 }}>Logged</span>;
  if (t.status === "blocked") return <Btn size="sm" onClick={() => openDrawer("task", t.id)} title="See the task for what it is waiting on">Why blocked</Btn>;
  const ap = t.link?.type === "approval" ? s.approvals.find((a) => a.id === t.link?.id) : undefined;
  if (ap && ap.status === "pending") return <Btn size="sm" kind="primary" icon={IC.check} onClick={() => approve(ap.id)} title={ap.title}>Approve</Btn>;
  if (t.link?.type === "enquiry") {
    const e = s.enquiries.find((x) => x.id === t.link?.id);
    if (e && e.status === "new") return <Btn size="sm" icon={IC.phone} onClick={() => { moveEnquiry(e.id, "contacted"); toast("Call logged. " + e.parent + " moved to Contacted."); }}>Log call</Btn>;
  }
  if (t.id === "t-clean-tod" && s.cleaning.some((c) => c.id === "cl1" && !c.done)) return <Btn size="sm" icon={IC.check} onClick={() => signOff(s, "cl1")}>Sign off</Btn>;
  if (t.id === "t-obs-tod") return <Btn size="sm" icon={IC.eye} onClick={() => navigate("Centres", "curriculum")}>Review</Btn>;
  if (t.link?.type === "child") {
    const c = childById(t.link.id, s);
    if (c && c.checkedIn && !c.checkedOut) return <Btn size="sm" icon={IC.door} onClick={() => navigate("Centres", "attendance")}>Handover</Btn>;
  }
  return <Btn size="sm" icon={IC.check} onClick={() => completeTask(t)}>{label}</Btn>;
}
function decline(id: string) { decide(id, "declined"); }

/* ── Visual primitives ─────────────────────────────────────────────────────── */
function Band({ children }: { children: ReactNode }) {
  return <div className="ov-bandwrap"><div className="ov-band">{children}</div></div>;
}
const Of = ({ n }: { n: ReactNode }) => <span className="ov-of">/{n}</span>;

interface Part { label: string; value: number; color: string; opacity?: number }
function Stack({ parts, total, height = 10 }: { parts: Part[]; total: number; height?: number }) {
  return (
    <div className="ov-stack" style={{ height }} role="img" aria-label={parts.map((p) => p.label + " " + p.value).join(", ")}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <span key={p.label} title={p.label + ": " + p.value} style={{ width: (total > 0 ? (p.value / total) * 100 : 0) + "%", background: p.color, opacity: p.opacity ?? 1 }} />
      ))}
    </div>
  );
}
function Legend({ parts, values = true }: { parts: Part[]; values?: boolean }) {
  return (
    <div className="ov-legend">
      {parts.map((p) => <span key={p.label}><i style={{ background: p.color, opacity: p.opacity ?? 1 }} />{p.label}{values && <b className="sh-num">{p.value}</b>}</span>)}
    </div>
  );
}
function Layers({ booked, expected, inNow, max }: { booked: number; expected: number; inNow: number; max: number }) {
  const pct = (v: number) => (max > 0 ? Math.min(100, (v / max) * 100) : 0) + "%";
  return (
    <div className="ov-layers" role="img" aria-label={inNow + " in now, " + expected + " expected today, " + booked + " holding a booking"}>
      <span style={{ width: pct(booked), opacity: 0.2 }} />
      <span style={{ width: pct(expected), opacity: 0.45 }} />
      <span style={{ width: pct(inNow) }} />
    </div>
  );
}
const LAYER_LEGEND: Part[] = [
  { label: "In now", value: 0, color: "var(--accent)" },
  { label: "Expected today", value: 0, color: "var(--accent)", opacity: 0.45 },
  { label: "Holding a booking", value: 0, color: "var(--accent)", opacity: 0.2 },
];
function Sec({ children, n }: { children: ReactNode; n?: ReactNode }) {
  return <div className="ov-sec">{children}{n !== undefined && <span className="n">{n}</span>}</div>;
}
function RowBtn({ onClick, children, title }: { onClick: () => void; children: ReactNode; title?: string }) {
  return <button type="button" className="ov-rowbtn" onClick={onClick} title={title}>{children}</button>;
}
const Chev = () => <Icon d={IC.chevron} size={14} style={{ color: "var(--faint)" }} />;

const STATUS_PARTS: { id: StaffStatus; label: string; color: string }[] = [
  { id: "on", label: "On duty", color: "var(--accent)" },
  { id: "training", label: "Training", color: "var(--gold)" },
  { id: "leave", label: "Leave", color: "var(--mid)" },
  { id: "off", label: "Rostered off", color: "var(--neutral)" },
  { id: "onboarding", label: "Induction", color: "var(--accent-line)" },
  { id: "sick", label: "Sick", color: "var(--bad)" },
];

function ExceptionState({ status }: { status: "assigned" | "needs-owner" | "resolved" }) {
  return status === "needs-owner" ? <Chip tone="gold" dot>Needs Edel</Chip> : status === "assigned" ? <Chip tone="accent">Owned by manager</Chip> : <Chip tone="ok">Resolved</Chip>;
}
function TaskState({ t }: { t: Task }) {
  return t.status === "done" ? <Chip tone="ok">Done {t.doneAt || ""}</Chip> : t.status === "blocked" ? <Chip tone="bad">Blocked</Chip> : t.status === "doing" ? <Chip tone="gold">In progress</Chip> : <Chip tone="neutral">To do</Chip>;
}

/* ═════════════════════════════════════════════════════════════════════════════
   EXECUTIVE
   ═════════════════════════════════════════════════════════════════════════════ */
interface ScoreRow { id: string; label: string; def: string; go: [string, string]; ratio?: (m: M) => [number, number]; text?: (m: M) => string; warn?: (m: M) => boolean }
const SCORE: ScoreRow[] = [
  { id: "in", label: "Children checked in", def: "In now, of children expected today", go: ["Centres", "attendance"], ratio: (m) => [m.checkedIn, m.attending] },
  { id: "exp", label: "Expected today", def: "Of children holding a current booking, today", go: ["Centres", "today"], ratio: (m) => [m.attending, m.booked] },
  { id: "staff", label: "Staff on duty", def: "Of staff on the site roster, today", go: ["People", "rota"], ratio: (m) => [m.onDuty, m.staffTotal] },
  { id: "rooms", label: "Rooms covered", def: "Rooms with no coverage watch against the approved roster, today", go: ["People", "leave"], ratio: (m) => [m.roomsCovered, m.roomsTotal], warn: (m) => m.coverageWatch > 0 },
  { id: "sleep", label: "Safe Sleep v4.0 signed", def: "Staff signatures on the current version", go: ["Policies", "versions"], ratio: (m) => [m.safeSleepSigned, m.safeSleepTotal], warn: (m) => m.safeSleepSigned < m.safeSleepTotal },
  { id: "fees", label: "Overdue invoices", def: "Past their due date, as at today", go: ["Finance", "outstanding"], text: (m) => m.overdueCount + " invoices, " + euro(m.overdueTotal), warn: (m) => m.overdueCount > 0 },
  { id: "fund", label: "Funding exceptions open", def: "Of this month's NCS and ECCE mismatches", go: ["Finance", "reconciliation"], text: (m) => m.fundingOpen + " open of " + m.fundingCount + ", " + euro(m.fundingOpenTotal), warn: (m) => m.fundingOpen > 0 },
  { id: "appr", label: "Approvals waiting", def: "Pending decisions, now", go: ["Work", "approvals"], text: (m) => String(m.approvalsPending) },
  { id: "tasks", label: "Tasks closed", def: "Done so far, of tasks on the team board", go: ["Work", "board"], ratio: (m) => [m.tasksDoneToday, m.tasksDoneToday + m.tasksOpen] },
  { id: "urgent", label: "Urgent notices unacknowledged", def: "Of urgent parent notices sent today", go: ["Families", "messaging"], text: (m) => m.urgentAwaitingAck + " of " + m.urgentSent, warn: (m) => m.urgentAwaitingAck > 0 },
  { id: "enq", label: "New enquiries", def: "Not yet contacted, now", go: ["Families", "enquiries"], text: (m) => String(m.enquiriesNew) },
];

function ExecBand({ s, m }: { s: DemoState; m: M }) {
  return (
    <Band>
      <Stat label="Children in now" value={<>{m.checkedIn}<Of n={m.attending} /></>} sub={"Checked in, of " + m.attending + " expected today"} onClick={() => navigate("Centres", "attendance")} />
      <Stat label="Staff on duty" value={<>{m.onDuty}<Of n={m.staffTotal} /></>} sub={m.away + " away today: leave, sick, off, training"} onClick={() => navigate("People", "rota")} />
      <Stat label="Safe Sleep v4.0" value={<>{m.safeSleepSigned}<Of n={m.safeSleepTotal} /></>} sub="Staff signatures, current version" tone={m.safeSleepSigned < m.safeSleepTotal ? "gold" : "ok"} onClick={() => navigate("Policies", "versions")} />
      <Stat label="Overdue fees" value={euro(m.overdueTotal)} sub={m.overdueCount + " invoices past due, " + m.overdueToReview + " not yet reviewed"} onClick={() => navigate("Finance", "outstanding")} />
      <Stat label="Funding exceptions" value={<>{m.fundingOpen}<Of n={m.fundingCount} /></>} sub={euro(m.fundingOpenTotal) + " open in this month's NCS/ECCE check"} onClick={() => navigate("Finance", "reconciliation")} />
      <Stat label="Open exceptions" value={m.exceptionsOpen} sub={m.exceptionsAssigned + " owned by managers, " + m.exceptionsOwner + " need" + (m.exceptionsOwner === 1 ? "s" : "") + " Edel"} tone={m.exceptionsOwner ? "gold" : undefined} onClick={() => jump("ov-exceptions")} />
      {s.away && null}
    </Band>
  );
}

function Scorecard({ s, site }: { s: DemoState; site: SiteFilter }) {
  const keys: SiteFilter[] = site === "all" ? ["elm", "bal", "all"] : [site];
  const ms: Record<string, M> = {};
  keys.forEach((k) => { ms[k] = metrics(s, k); });
  const head = (k: SiteFilter) => (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <span style={{ color: "var(--body)" }}>{k === "all" ? "Both services" : siteName(k)}</span>
      <span style={{ fontSize: 10.5, color: "var(--faint)", fontWeight: 400 }}>{k === "all" ? "Each item counted once" : k === "elm" ? "TU2015CC365" : "TU2015CC366 and TU2021CC067SA"}</span>
    </span>
  );
  const cell = (r: ScoreRow, m: M) => {
    const warn = r.warn ? r.warn(m) : false;
    if (r.ratio) {
      const [a, b] = r.ratio(m);
      return (
        <div className="ov-cell">
          <span className="sh-num" style={{ color: warn ? "var(--warn)" : "var(--ink)" }}>{a} of {b}</span>
          <Bar value={a} max={b} tone={warn ? "gold" : "accent"} />
        </div>
      );
    }
    return <span className="sh-num" style={{ color: warn ? "var(--warn)" : "var(--ink)" }}>{r.text ? r.text(m) : ""}</span>;
  };
  const cols: Col<ScoreRow>[] = [
    { key: "m", label: "Measure", width: "34%", render: (r) => <div><div className="strong" style={{ color: "var(--ink)", fontWeight: 500 }}>{r.label}</div><div className="ov-def">{r.def}</div></div> },
    ...keys.map((k): Col<ScoreRow> => ({ key: k, label: head(k), render: (r) => cell(r, ms[k]) })),
    { key: "go", label: "", width: 28, render: () => <Chev /> },
  ];
  return (
    <Card title="Operational scorecard" sub={"Today, " + TODAY_LABEL + ". Each row states what it counts and against what."} right={<DemoTag />} pad={false}>
      <div style={{ padding: "8px 4px 4px" }}>
        <Table cols={cols} rows={SCORE} rowKey={(r) => r.id} onRow={(r) => navigate(r.go[0], r.go[1])} />
      </div>
      {site === "all" && <div style={{ padding: "4px 18px 16px", fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>Items that span both centres, such as the Safe Sleep reminder, appear under each site and once under Both services. Registered capacity is a reference figure and is never used as a count of children.</div>}
    </Card>
  );
}

function ExceptionsCard({ s, site }: { s: DemoState; site: SiteFilter }) {
  const ex = s.exceptions.filter((e) => inSite(site, e.site));
  const open = ex.filter((e) => e.status !== "resolved");
  const owners = Array.from(new Set(open.map((e) => e.owner)));
  const cols: (SiteId | "both")[] = ["elm", "bal", "both"];
  return (
    <div className="sh-stack">
      <Card id="ov-exceptions" title="Exceptions today" sub="What needs attention, who owns it, where it stands" right={<Chip tone={open.some((e) => e.status === "needs-owner") ? "gold" : "ok"}>{open.length} open of {ex.length}</Chip>}>
        <div className="ov-list">
          {ex.map((e) => {
            const owner = personName(e.owner, s);
            return (
              <RowBtn key={e.id} onClick={() => navigate(e.page, e.tab)} title={"Open " + e.page}>
                <Avatar initials={initialsOf(owner)} tone={e.status === "needs-owner" ? "gold" : e.status === "resolved" ? "ok" : "accent"} />
                <span style={{ flex: 1, minWidth: 0, opacity: e.status === "resolved" ? 0.62 : 1 }}>
                  <span className="ov-t" style={{ display: "block", fontWeight: 500 }}>{e.title}</span>
                  <span className="ov-s" style={{ display: "block" }}>{e.detail}</span>
                  <span className="sh-row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <SiteChip site={e.site} />
                    <span className="ov-s" style={{ marginTop: 0 }}>Owner: {owner}</span>
                  </span>
                </span>
                <ExceptionState status={e.status} />
                <Chev />
              </RowBtn>
            );
          })}
        </div>
      </Card>
      <Card title="Open exceptions by owner and site" sub="Count of open items, now">
        {owners.length ? (
          <table className="ov-matrix">
            <thead><tr><th>Owner</th><th>Elmgrove</th><th>Ballyneety</th><th>Both</th><th>Total</th></tr></thead>
            <tbody>
              {owners.map((o) => {
                const mine = open.filter((e) => e.owner === o);
                return (
                  <tr key={o} onClick={() => navigate("Work", "board")} title="Open the team board">
                    <td><span className="sh-row" style={{ gap: 8 }}><Avatar initials={initialsOf(personName(o, s))} size={22} />{personName(o, s)}</span></td>
                    {cols.map((c) => { const n = mine.filter((e) => e.site === c).length; return <td key={c} className={"sh-num " + (n ? "" : "ov-zero")}>{n}</td>; })}
                    <td className="sh-num" style={{ color: "var(--ink)", fontWeight: 500 }}>{mine.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="ov-s">No open exceptions. Both centres are running on their own routines.</div>}
      </Card>
    </div>
  );
}

function ChildrenByRoom({ s, site }: { s: DemoState; site: SiteFilter }) {
  const rooms = ROOMS.filter((r) => inSite(site, r.site));
  const live = rooms.map((r) => ({ r, l: roomLive(s, r.id) }));
  const max = Math.max(1, ...live.map((x) => x.l.booked));
  return (
    <Card title="Children by room" sub="In now, expected today and holding a booking. Bars share one scale." right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("Centres", "today")}>Centres</Btn>}>
      {sitesOf(site).map((sid) => {
        const rs = live.filter((x) => x.r.site === sid);
        const tot = rs.reduce((n, x) => ({ b: n.b + x.l.booked, e: n.e + x.l.expected, i: n.i + x.l.inNow }), { b: 0, e: 0, i: 0 });
        return (
          <div key={sid}>
            <Sec n={tot.i + " in, " + tot.e + " expected, " + tot.b + " booked"}>{siteName(sid)}</Sec>
            <div className="ov-list">
              {rs.map(({ r, l }) => (
                <RowBtn key={r.id} onClick={() => openDrawer("room", r.id)}>
                  <span style={{ width: 128, flex: "none", minWidth: 0 }}>
                    <span className="ov-t" style={{ display: "block" }}>{r.name}</span>
                    <span className="ov-s sh-trunc" style={{ display: "block", marginTop: 1 }}>{PROGRAMME[r.programme]}</span>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}><Layers booked={l.booked} expected={l.expected} inNow={l.inNow} max={max} /></span>
                  <span className="sh-num" style={{ fontSize: 12, color: "var(--body)", width: 92, textAlign: "right", flex: "none" }}>{l.inNow} <span className="sh-faint">/ {l.expected} / {l.booked}</span></span>
                </RowBtn>
              ))}
            </div>
          </div>
        );
      })}
      <Legend parts={LAYER_LEGEND} values={false} />
      {inSite(site, "bal") && <div className="ov-s" style={{ marginTop: 8 }}>After-school children are counted under the school-age registration TU2021CC067SA and arrive from 13:35.</div>}
    </Card>
  );
}

function StaffBySite({ s, site }: { s: DemoState; site: SiteFilter }) {
  return (
    <Card title="Staff scheduled and away" sub="Today, by site. Denominator: staff on each site roster." right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("People", "rota")}>Rota</Btn>}>
      {sitesOf(site).map((sid) => {
        const st = s.staff.filter((x) => x.site === sid);
        const parts: Part[] = STATUS_PARTS.map((p) => ({ label: p.label, color: p.color, value: st.filter((x) => x.status === p.id).length }));
        const on = parts[0].value;
        return (
          <RowBtn key={sid} onClick={() => navigate("People", "rota")}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="sh-row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <span className="ov-t" style={{ fontWeight: 500 }}>{siteName(sid)}</span>
                <span className="sh-num" style={{ fontSize: 12, color: "var(--body)" }}>{on} on duty of {st.length}</span>
              </span>
              <Stack parts={parts} total={st.length} />
              <Legend parts={parts.filter((p) => p.value > 0)} />
            </span>
          </RowBtn>
        );
      })}
      <Sec>On duty by room, of staff allocated</Sec>
      <div className="ov-list">
        {ROOMS.filter((r) => inSite(site, r.site)).map((r) => {
          const l = roomLive(s, r.id);
          const extra = r.programme === "afterschool" && s.coverConfirmed ? 1 : 0;
          const watch = r.programme === "afterschool" && !s.coverConfirmed;
          return (
            <RowBtn key={r.id} onClick={() => openDrawer("room", r.id)}>
              <span className="ov-t" style={{ width: 110, flex: "none" }}>{r.name}</span>
              <span style={{ flex: 1, minWidth: 0 }}><Bar value={l.onDuty.length + extra} max={Math.max(1, l.staff.length + extra)} tone={watch ? "gold" : "accent"} /></span>
              <span className="sh-num" style={{ fontSize: 12, width: 52, textAlign: "right", flex: "none" }}>{l.onDuty.length + extra} <span className="sh-faint">/ {l.staff.length + extra}</span></span>
              {watch ? <Chip tone="warn">Watch</Chip> : <span style={{ width: 0 }} />}
            </RowBtn>
          );
        })}
      </div>
      <div className="ov-s" style={{ marginTop: 8 }}>Floaters, the cook and office staff are not allocated to a room. Coverage is watched against the approved roster. It is not a statutory ratio calculation.</div>
    </Card>
  );
}

function ApprovalsCard({ s, site }: { s: DemoState; site: SiteFilter }) {
  const pend = s.approvals.filter((a) => a.status === "pending" && inSite(site, a.site));
  const approvers = Array.from(new Set(pend.map((a) => a.approver)));
  return (
    <Card title="Approvals waiting" sub={pend.length + " pending, by approver, now"}>
      {pend.length ? (
        <>
          <HBars rows={approvers.map((a) => ({ label: personName(a, s), value: pend.filter((x) => x.approver === a).length }))} />
          <div className="ov-list" style={{ marginTop: 10 }}>
            {pend.slice(0, 5).map((a) => (
              <RowBtn key={a.id} onClick={() => openDrawer("approval", a.id)}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ov-t sh-trunc" style={{ display: "block" }}>{a.title}</span>
                  <span className="ov-s" style={{ display: "block" }}>{a.kind} · {a.site === "both" ? "Both sites" : siteName(a.site)}</span>
                </span>
                <Chev />
              </RowBtn>
            ))}
          </div>
        </>
      ) : <div className="ov-s">Nothing waiting. Every request has a decision.</div>}
      <Btn size="sm" kind="ghost" icon={IC.arrow} style={{ marginTop: 8 }} onClick={() => navigate("Work", "approvals")}>All approvals</Btn>
    </Card>
  );
}

function FeesCard({ s, site }: { s: DemoState; site: SiteFilter }) {
  const inv = s.invoices.filter((i) => inSite(site, i.site));
  const total = inv.reduce((n, i) => n + i.amount, 0);
  const buckets: Part[] = [
    { label: "Under 15 days", value: inv.filter((i) => i.daysOverdue < 15).length, color: "var(--accent)", opacity: 0.45 },
    { label: "15 to 29 days", value: inv.filter((i) => i.daysOverdue >= 15 && i.daysOverdue < 30).length, color: "var(--gold)" },
    { label: "30 days or more", value: inv.filter((i) => i.daysOverdue >= 30).length, color: "var(--bad)" },
  ];
  const stages: Part[] = [
    { label: "Not reviewed", value: inv.filter((i) => i.status === "overdue").length, color: "var(--neutral)" },
    { label: "Reminder drafted", value: inv.filter((i) => i.status === "reminder-drafted").length, color: "var(--gold)" },
    { label: "Reminder approved", value: inv.filter((i) => i.status === "reminder-approved").length, color: "var(--accent)", opacity: 0.6 },
    { label: "Reviewed", value: inv.filter((i) => i.status === "reviewed").length, color: "var(--ok)" },
  ];
  return (
    <Card title="Fees overdue" sub={inv.length + " invoices, " + euro(total) + ", as at today"}>
      <div className="ov-list">
        {sitesOf(site).map((sid) => {
          const own = inv.filter((i) => i.site === sid);
          const sum = own.reduce((n, i) => n + i.amount, 0);
          return (
            <RowBtn key={sid} onClick={() => navigate("Finance", "outstanding")}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="sh-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="ov-t">{siteName(sid)}</span>
                  <span className="sh-num" style={{ fontSize: 12.5, color: "var(--ink)" }}>{euro(sum)} <span className="sh-faint">· {own.length}</span></span>
                </span>
                <Bar value={sum} max={Math.max(1, total)} tone="gold" />
              </span>
            </RowBtn>
          );
        })}
      </div>
      <Sec>Age, by invoice count</Sec>
      <Stack parts={buckets} total={inv.length} height={8} />
      <Legend parts={buckets} />
      <Sec>Where each one stands</Sec>
      <Stack parts={stages} total={inv.length} height={8} />
      <Legend parts={stages.filter((p) => p.value > 0)} />
    </Card>
  );
}

function FundingCard({ s, site }: { s: DemoState; site: SiteFilter }) {
  const f = s.funding.filter((x) => inSite(site, x.site));
  const parts: Part[] = [
    { label: "Open", value: f.filter((x) => x.status === "open").length, color: "var(--warn)" },
    { label: "With a reviewer", value: f.filter((x) => x.status === "assigned").length, color: "var(--accent)", opacity: 0.6 },
    { label: "Reviewed", value: f.filter((x) => x.status === "reviewed").length, color: "var(--ok)" },
  ];
  return (
    <Card title="Funding exceptions" sub={f.length + " NCS/ECCE mismatches this month, " + euro(f.reduce((n, x) => n + x.amount, 0))}>
      <div className="ov-list">
        {(["NCS", "ECCE"] as const).map((sc) => {
          const own = f.filter((x) => x.scheme === sc);
          const openN = own.filter((x) => x.status !== "reviewed").length;
          return (
            <RowBtn key={sc} onClick={() => navigate("Finance", "reconciliation")}>
              <Chip tone="outline">{sc}</Chip>
              <span style={{ flex: 1, minWidth: 0 }} className="ov-s">{own.length} item{own.length === 1 ? "" : "s"}, {openN} still open</span>
              <span className="sh-num" style={{ fontSize: 12.5, color: "var(--ink)" }}>{euro(own.reduce((n, x) => n + x.amount, 0))}</span>
              <Chev />
            </RowBtn>
          );
        })}
      </div>
      <Sec>Review state</Sec>
      <Stack parts={parts} total={f.length} height={8} />
      <Legend parts={parts} />
      <div className="ov-s" style={{ marginTop: 10 }}>Found by comparing the Acorn export with portal entries. Corrections are keyed on the portal by a person; nothing is submitted from here.</div>
    </Card>
  );
}

function NoticesCard({ s, site }: { s: DemoState; site: SiteFilter }) {
  const msgs = s.messages.filter((m) => inSite(site, m.site) && m.fromKind !== "guardian");
  const fromParents = s.messages.filter((m) => inSite(site, m.site) && m.fromKind === "guardian");
  const rows: { p: "Urgent" | "Important" | "Routine"; tone: Tone }[] = [{ p: "Urgent", tone: "bad" }, { p: "Important", tone: "gold" }, { p: "Routine", tone: "neutral" }];
  const max = Math.max(1, ...rows.map((r) => msgs.filter((m) => m.priority === r.p).length));
  return (
    <Card title="Parent notices by priority" sub={msgs.length + " sent by the centres, today and yesterday"}>
      <div className="ov-list">
        {rows.map((r) => {
          const own = msgs.filter((m) => m.priority === r.p);
          const waiting = own.filter((m) => m.ackRequired && !m.ackAt).length;
          return (
            <RowBtn key={r.p} onClick={() => navigate("Families", "messaging")}>
              <span style={{ width: 82, flex: "none" }}><Chip tone={r.tone}>{r.p}</Chip></span>
              <span style={{ flex: 1, minWidth: 0 }}><Bar value={own.length} max={max} tone={r.tone === "neutral" ? "accent" : r.tone} /></span>
              <span className="sh-num" style={{ fontSize: 12, minWidth: 44, textAlign: "right", flex: "none", color: "var(--body)", whiteSpace: "nowrap" }}>{own.length}{waiting ? <span style={{ color: "var(--warn)" }}> ({waiting} open)</span> : ""}</span>
            </RowBtn>
          );
        })}
      </div>
      <div className="ov-s" style={{ marginTop: 10 }}>Bracketed: awaiting a parent's acknowledgement. {fromParents.length} messages from parents today. {fromParents.filter((m) => m.ackRequired && !m.ackAt).length} need a reply from the centre.</div>
      <div className="ov-s" style={{ marginTop: 4 }}>Routine care stays in the app; only Important and Urgent reach a phone.</div>
    </Card>
  );
}

function Executive({ s }: { s: DemoState }) {
  const site = effectiveSite(s);
  const m = metrics(s, site);
  const closedEarly = s.tasks.filter((t) => t.status === "done" && inSite(site, t.site) && t.owner !== "edel").length;
  return (
    <>
      <PageHead
        title="Executive overview"
        sub={TODAY_LABEL + ", " + nowLabel() + ". " + (site === "all" ? "Both registered services side by side." : siteName(site) + " only (sidebar filter).") + " Every figure states its denominator and period."}
        right={<><DemoTag />{site !== "all" && <SiteChip site={site} />}</>}
      />
      <ExecBand s={s} m={m} />
      <div style={{ marginBottom: 14 }}>
        <Note tone="accent" icon={IC.spark}>
          {site === "all" ? briefingLine(s) : m.exceptionsOpen + " open item" + (m.exceptionsOpen === 1 ? "" : "s") + " at " + siteName(site) + "."} {closedEarly} task{closedEarly === 1 ? "" : "s"} already closed by the team today without Edel chasing them.
        </Note>
      </div>
      <Grid cols="main" style={{ marginBottom: 12 }}>
        <Scorecard s={s} site={site} />
        <ExceptionsCard s={s} site={site} />
      </Grid>
      <Grid cols={2} style={{ marginBottom: 12 }}>
        <ChildrenByRoom s={s} site={site} />
        <StaffBySite s={s} site={site} />
      </Grid>
      <Grid cols={4} style={{ marginBottom: 14 }}>
        <ApprovalsCard s={s} site={site} />
        <FeesCard s={s} site={site} />
        <FundingCard s={s} site={site} />
        <NoticesCard s={s} site={site} />
      </Grid>
      <Note icon={IC.lock}>Executive figures are counts and totals. Child records, care logs and staff files stay with their registered service and open from the Elmgrove and Ballyneety tabs for people with access. Nothing on this page combines personal records across the two registrations.</Note>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   SITE (Elmgrove / Ballyneety)
   ═════════════════════════════════════════════════════════════════════════════ */
function figOf(list: Child[]) {
  return { booked: list.length, expected: list.filter((c) => c.attendingToday).length, inNow: list.filter((c) => c.checkedIn && !c.checkedOut).length };
}
function RegBlock({ refNo, label, capacity, capLabel, f, later }: { refNo: string; label: string; capacity: number | null; capLabel: string; f: { booked: number; expected: number; inNow: number }; later?: string }) {
  const max = capacity ?? Math.max(1, f.booked);
  return (
    <div>
      <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Chip tone="accent">Tusla {refNo}</Chip>
        <span style={{ fontSize: 12.5, color: "var(--body)" }}>{label}</span>
      </div>
      <div className="ov-figs">
        <div className="ov-fig ref"><span className="l">{capLabel}</span><span className="v sh-num" style={capacity === null ? { fontSize: 14, paddingTop: 4 } : undefined}>{capacity ?? "Separate"}</span><span className="x">{capacity !== null ? "Reference, from the register" : "Not added to the 55"}</span></div>
        <div className="ov-fig"><span className="l">Holding a booking</span><span className="v sh-num">{f.booked}</span><span className="x">Children enrolled</span></div>
        <div className="ov-fig"><span className="l">Expected today</span><span className="v sh-num">{f.expected}</span><span className="x">Booked for {WEEKDAYS[TODAY_IDX]}</span></div>
        <div className="ov-fig"><span className="l">In now</span><span className="v sh-num">{f.inNow}</span><span className="x">{later || "Checked in, not collected"}</span></div>
      </div>
      {capacity !== null && <HBars max={max} rows={[{ label: "Holding a booking", value: f.booked, note: "of " + capacity + " registered" }, { label: "Expected today", value: f.expected }, { label: "In now", value: f.inNow }]} />}
    </div>
  );
}
function Registration({ s, id }: { s: DemoState; id: SiteId }) {
  const st = siteById(id);
  const kids = s.children.filter((c) => c.site === id);
  if (id === "elm") {
    return (
      <Card title="Registration" sub={st.address} right={<span style={{ fontSize: 12.5 }}><RecordLink type="site" id={id}>Service record</RecordLink></span>}>
        <RegBlock refNo={st.tusla} label={st.serviceType} capacity={st.capacity} capLabel={st.capacityLabel} f={figOf(kids)} />
        <div style={{ marginTop: 12 }}><Note>Registered places is not the same as booked or attending. Bookings vary by day; Weekly Operations shows each room's grid.</Note></div>
      </Card>
    );
  }
  const ses = kids.filter((c) => roomById(c.room)?.programme === "ecce");
  const sa = kids.filter((c) => roomById(c.room)?.programme === "afterschool");
  const extra = st.extraRegistrations[0];
  return (
    <Card title="Registrations" sub={st.address} right={<span style={{ fontSize: 12.5 }}><RecordLink type="site" id={id}>Service record</RecordLink></span>}>
      <RegBlock refNo={st.tusla} label={st.serviceType + ": Robins and Wrens"} capacity={st.capacity} capLabel={st.capacityLabel} f={figOf(ses)} />
      <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />
      <RegBlock refNo={extra ? extra.ref : "TU2021CC067SA"} label={(extra ? extra.label : "School-age service") + ": After-school"} capacity={null} capLabel="Registered places" f={figOf(sa)} later="Arrive from 13:35" />
      <div style={{ marginTop: 12 }}><Note>Two separate registrations share this building. The school-age service {extra ? extra.ref : "TU2021CC067SA"} is registered on its own, so its places are never added to the {st.capacity} sessional places. Registered places is not the same as booked or attending.</Note></div>
    </Card>
  );
}

function CoverageCard({ s, id }: { s: DemoState; id: SiteId }) {
  const role = roleDef(s.role);
  const absent = s.staff.filter((x) => x.site === id && x.status !== "on");
  const watch = id === "bal" && !s.coverConfirmed;
  const ap = s.approvals.find((a) => a.id === "ap-cover");
  const canApprove = !!ap && ap.status === "pending" && (role.id === "owner" || role.id === "manager-bal");
  const rosterTask = s.tasks.find((t) => t.id === (id === "elm" ? "t-roster-elm" : "t-roster-bal"));
  const coverFor = (x: Staff) => s.leave.find((l) => l.staff === x.id && l.status === "approved")?.cover || (x.status === "onboarding" ? "Not counted on the floor until induction is complete" : x.status === "off" ? "Rostered day off" : x.status === "training" ? "Planned, covered within the room roster" : "Covered from the roster" + (rosterTask?.doneAt ? " at " + rosterTask.doneAt : ""));
  return (
    <Card title="Coverage watch" sub="Who is on against the approved roster. Not a statutory ratio calculation." right={watch ? <Chip tone="warn" dot>1 watch open</Chip> : <Chip tone="ok">No watch open</Chip>}>
      {id === "bal" && (watch ? (
        <div className="ov-watch warn">
          <Icon d={IC.alert} size={15} style={{ color: "var(--warn)", marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>After-school, 14:00 to 18:00</div>
            <div>{ap ? ap.detail : "After-school leader off sick. Cover to be confirmed."}</div>
            <div className="sh-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {canApprove && <Btn size="sm" kind="primary" icon={IC.check} onClick={() => approve("ap-cover")}>Confirm cover</Btn>}
              {ap && ap.status === "pending" && !canApprove && <span className="ov-s">Waiting on {personName(ap.approver, s)} to confirm.</span>}
              <Btn size="sm" icon={IC.arrow} onClick={() => navigate("People", "leave")}>Leave and cover</Btn>
            </div>
          </div>
        </div>
      ) : (
        <div className="ov-watch ok">
          <Icon d={IC.check} size={15} style={{ color: "var(--ok)", marginTop: 2 }} />
          <div>Cover confirmed for After-school 14:00 to 18:00{staffById("s28", s)?.statusNote ? ": " + staffById("s28", s)?.statusNote : ""}.</div>
        </div>
      ))}
      {id === "elm" && <div className="ov-watch ok"><Icon d={IC.check} size={15} style={{ color: "var(--ok)", marginTop: 2 }} /><div>All four rooms covered against the approved roster{rosterTask?.doneAt ? ", confirmed at " + rosterTask.doneAt : ""}.</div></div>}
      <Sec n={absent.length + " of " + s.staff.filter((x) => x.site === id).length + " staff"}>Away today</Sec>
      <div className="ov-list">
        {absent.map((x) => (
          <RowBtn key={x.id} onClick={() => openDrawer("staff", x.id)}>
            <Avatar initials={x.initials} size={26} tone={x.status === "sick" ? "bad" : undefined} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="ov-t" style={{ display: "block" }}>{x.name} <span className="sh-faint" style={{ fontSize: 11.5 }}>{x.room ? roomById(x.room)?.name : "Floater or office"}</span></span>
              <span className="ov-s" style={{ display: "block" }}>{x.statusNote || x.status}. {coverFor(x)}</span>
            </span>
            <Chev />
          </RowBtn>
        ))}
      </div>
      <Btn size="sm" kind="ghost" icon={IC.arrow} style={{ marginTop: 8 }} onClick={() => navigate("People", "leave")}>People, leave and cover</Btn>
    </Card>
  );
}

function BoardRow({ title, meta, chips, onOpen, children }: { title: ReactNode; meta?: ReactNode; chips?: ReactNode; onOpen: () => void; children?: ReactNode }) {
  return (
    <div className="ov-board-row">
      <button type="button" className="ov-board-main" onClick={onOpen}>
        <span className="ov-t" style={{ display: "block" }}>{title}</span>
        {meta && <span className="ov-s" style={{ display: "block" }}>{meta}</span>}
      </button>
      {chips}
      {children && <div className="ov-board-acts">{children}</div>}
    </div>
  );
}

function TodayBoard({ s, id }: { s: DemoState; id: SiteId }) {
  const [show, setShow] = useState<"open" | "done">("open");
  const mgr = siteById(id).manager;
  const tasks = s.tasks.filter((t) => t.site === id || (t.site === "both" && t.owner === mgr));
  const open = tasks.filter((t) => t.status !== "done").sort((a, b) => dueRank(a.due) - dueRank(b.due));
  const done = tasks.filter((t) => t.status === "done").sort((a, b) => (toMin(a.doneAt) ?? 0) - (toMin(b.doneAt) ?? 0));
  const approvals = s.approvals.filter((a) => a.site === id && a.status === "pending");
  const cleaning = s.cleaning.filter((c) => c.site === id && !c.done).sort((a, b) => dueRank(a.due) - dueRank(b.due));
  const handovers = s.handovers.filter((h) => roomById(h.room)?.site === id && (!h.read || h.outstanding));
  const kidsWaiting = s.children.filter((c) => c.site === id && c.checkedIn && !c.checkedOut && (c.alert || "").startsWith("Awaiting collection"));
  const parentFlags = s.messages.filter((m) => m.site === id && m.escalation.some((e) => e.state === "standby") && !m.ackAt);
  const openCount = open.length + approvals.length + cleaning.length + handovers.length + kidsWaiting.length + parentFlags.length;
  return (
    <Card title="Today board" sub={openCount + " open for " + personName(mgr, s) + ", " + done.length + " done today"}
      right={<Segmented value={show} onChange={setShow} options={[{ id: "open", label: "Open " + openCount }, { id: "done", label: "Done " + done.length }]} />}>
      {show === "done" ? (
        done.length ? (
          <div>
            {done.map((t) => <BoardRow key={t.id} title={t.title} meta={personName(t.owner, s) + (t.recurring ? " · " + t.recurring : "")} chips={<TaskState t={t} />} onOpen={() => openDrawer("task", t.id)} />)}
          </div>
        ) : <div className="ov-s">Nothing closed yet today.</div>
      ) : (
        <>
          {(kidsWaiting.length > 0 || parentFlags.length > 0) && (
            <>
              <Sec n={kidsWaiting.length + parentFlags.length}>Children and parents</Sec>
              {kidsWaiting.map((c) => (
                <BoardRow key={c.id} title={short(c) + " awaiting collection"} meta={cap((c.alert || "").replace("Awaiting collection: ", "")) + ", " + (roomById(c.room)?.name || "")} chips={<Chip tone="bad" dot>Urgent</Chip>} onOpen={() => openDrawer("child", c.id)}>
                  <Btn size="sm" icon={IC.door} onClick={() => navigate("Centres", "attendance")}>Handover</Btn>
                </BoardRow>
              ))}
              {parentFlags.map((m) => {
                const c = m.child ? childById(m.child, s) : undefined;
                return (
                  <BoardRow key={m.id} title={(c ? short(c) + ": " : "") + m.subject} meta={m.escalation.find((e) => e.state === "standby")?.step} chips={<Chip tone="gold">{m.priority}</Chip>} onOpen={() => (c ? openDrawer("child", c.id) : navigate("Families", "messaging"))}>
                    <Btn size="sm" icon={IC.arrow} onClick={() => navigate("Centres", "today")}>Resolve</Btn>
                  </BoardRow>
                );
              })}
            </>
          )}
          <Sec n={approvals.length}>Approvals</Sec>
          {approvals.length ? approvals.map((a) => (
            <BoardRow key={a.id} title={a.title} meta={a.kind + " · requested by " + (a.requestedBy.startsWith("s") ? personName(a.requestedBy, s) : a.requestedBy)} onOpen={() => openDrawer("approval", a.id)}>
              <Btn size="sm" kind="primary" icon={IC.check} onClick={() => approve(a.id)}>Approve</Btn>
              <Btn size="sm" kind="ghost" onClick={() => decline(a.id)}>Decline</Btn>
            </BoardRow>
          )) : <div className="ov-s" style={{ padding: "4px 0" }}>No approvals waiting at {siteName(id)}.</div>}
          <Sec n={open.length}>Tasks</Sec>
          {open.length ? open.map((t) => (
            <BoardRow key={t.id} title={t.title} meta={personName(t.owner, s) + " · due " + t.due + (t.checklist.length ? " · " + t.checklist.filter((c) => c.done).length + " of " + t.checklist.length + " steps" : "")} chips={<TaskState t={t} />} onOpen={() => openDrawer("task", t.id)}>
              <TaskAction s={s} t={t} />
            </BoardRow>
          )) : <div className="ov-s" style={{ padding: "4px 0" }}>All tasks closed.</div>}
          <Sec n={cleaning.length}>Cleaning and safety due</Sec>
          {cleaning.length ? cleaning.map((c) => (
            <BoardRow key={c.id} title={c.area + ": " + c.task} meta={personName(c.owner, s) + " · due " + c.due} chips={cleanOverdue(c) ? <Chip tone="bad">Overdue</Chip> : <Chip tone="neutral">Due {c.due}</Chip>} onOpen={() => openDrawer("staff", c.owner)}>
              <Btn size="sm" icon={IC.check} onClick={() => signOff(s, c.id)}>Sign off</Btn>
            </BoardRow>
          )) : <div className="ov-s" style={{ padding: "4px 0" }}>Every checklist signed off.</div>}
          <Sec n={handovers.length}>Handovers outstanding</Sec>
          {handovers.length ? handovers.map((h) => (
            <BoardRow key={h.id} title={(roomById(h.room)?.name || h.room) + ", " + h.kind.toLowerCase() + " handover"} meta={personName(h.from, s) + " to " + personName(h.to, s) + " at " + h.at + (h.outstanding ? ". Outstanding: " + h.outstanding : "")} chips={!h.read ? <Chip tone="gold">Unread</Chip> : <Chip tone="neutral">Follow-up</Chip>} onOpen={() => navigate("Centres", "handovers")}>
              {!h.read ? <Btn size="sm" icon={IC.eye} onClick={() => markHandoverRead(s, h)}>Mark read</Btn> : <Btn size="sm" icon={IC.check} onClick={() => clearOutstanding(s, h)}>Close follow-up</Btn>}
            </BoardRow>
          )) : <div className="ov-s" style={{ padding: "4px 0" }}>All handovers read and closed.</div>}
        </>
      )}
    </Card>
  );
}

function RoomsTable({ s, id }: { s: DemoState; id: SiteId }) {
  const rooms = ROOMS.filter((r) => r.site === id);
  type R = (typeof rooms)[number];
  const watchRoom = (r: R) => r.programme === "afterschool" && !s.coverConfirmed;
  const cols: Col<R>[] = [
    { key: "room", label: "Room", render: (r) => <div><div className="strong">{r.name}</div><div className="ov-def">{r.ages}</div></div> },
    { key: "hours", label: "Hours", render: (r) => <span className="sh-num">{r.hours}</span> },
    { key: "booked", label: "Holding a booking", align: "r", render: (r) => <span className="sh-num">{roomLive(s, r.id).booked}</span> },
    { key: "exp", label: "Expected today", align: "r", render: (r) => <span className="sh-num">{roomLive(s, r.id).expected}</span> },
    { key: "in", label: "In now", align: "r", render: (r) => { const l = roomLive(s, r.id); return <span className="sh-num strong">{l.inNow}{l.late ? <span style={{ color: "var(--warn)", fontWeight: 400 }}> ({l.late} late)</span> : ""}</span>; } },
    { key: "staff", label: "Staff on duty", render: (r) => { const l = roomLive(s, r.id); const extra = r.programme === "afterschool" && s.coverConfirmed ? 1 : 0; return <span className="sh-num">{l.onDuty.length + extra} <span className="sh-faint">of {l.staff.length + extra}</span></span>; } },
    { key: "lead", label: "Room leader", render: (r) => { const lead = staffById(r.leader, s); return <span>{lead?.name}{lead && lead.status !== "on" ? <span style={{ color: "var(--warn)", fontSize: 11.5 }}> ({lead.status === "sick" ? "sick" : lead.status})</span> : ""}</span>; } },
    { key: "w", label: "Coverage", render: (r) => (watchRoom(r) ? <Chip tone="warn" dot>Watch 14:00-18:00</Chip> : <Chip tone="ok">Covered</Chip>) },
  ];
  return (
    <Card title="Rooms" sub="Live from the room tablets. Select a room for staff, children and today's plan." pad={false}>
      <div style={{ padding: "8px 4px 6px" }}><Table cols={cols} rows={rooms} rowKey={(r) => r.id} onRow={(r) => openDrawer("room", r.id)} /></div>
    </Card>
  );
}

function SiteView({ s, id, note }: { s: DemoState; id: SiteId; note?: ReactNode }) {
  const st = siteById(id);
  const m = metrics(s, id);
  const role = roleDef(s.role);
  const mgr = staffById(st.manager, s);
  const open = s.tasks.filter((t) => t.status !== "done" && (t.site === id || (t.site === "both" && t.owner === st.manager))).length
    + s.approvals.filter((a) => a.site === id && a.status === "pending").length
    + s.cleaning.filter((c) => c.site === id && !c.done).length;
  const opening = s.tasks.find((t) => t.id === (id === "elm" ? "t-open-elm" : "t-open-bal"));
  const goCentre = () => { if (role.site === null) setSite(id); navigate("Centres", "today"); };
  return (
    <>
      <PageHead
        title={st.name}
        sub={st.serviceType + ". Managed by " + (mgr?.name || "") + ". Opening checks " + (opening?.status === "done" ? "done at " + opening.doneAt : "not yet done") + "."}
        right={<><Chip tone="accent">Tusla {st.tusla}</Chip><DemoTag /><Btn size="sm" icon={IC.arrow} onClick={goCentre}>Open centre today</Btn></>}
      />
      {note && <div style={{ marginBottom: 14 }}>{note}</div>}
      <Band>
        <Stat label="Children in now" value={<>{m.checkedIn}<Of n={m.attending} /></>} sub={"Checked in, of " + m.attending + " expected today"} onClick={() => navigate("Centres", "attendance")} />
        <Stat label="Expected today" value={<>{m.attending}<Of n={m.booked} /></>} sub={"Of " + m.booked + " holding a booking"} onClick={() => navigate("Centres", "today")} />
        <Stat label="Staff on duty" value={<>{m.onDuty}<Of n={m.staffTotal} /></>} sub={m.away + " away today"} onClick={() => navigate("People", "rota")} />
        <Stat label="Rooms covered" value={<>{m.roomsCovered}<Of n={m.roomsTotal} /></>} sub={m.coverageWatch ? "1 coverage watch open" : "Against the approved roster"} tone={m.coverageWatch ? "gold" : undefined} onClick={() => navigate("People", "leave")} />
        <Stat label="Safe Sleep v4.0" value={<>{m.safeSleepSigned}<Of n={m.safeSleepTotal} /></>} sub={"Signed by " + st.name + " staff"} tone={m.safeSleepSigned < m.safeSleepTotal ? "gold" : "ok"} onClick={() => navigate("Policies", "versions")} />
        <Stat label="Open on the board" value={open} sub="Tasks, approvals and checklists" onClick={() => jump("ov-board")} />
      </Band>
      <Grid cols="main" style={{ marginBottom: 12 }}>
        <div id="ov-board" className="ov-anchor"><TodayBoard s={s} id={id} /></div>
        <div className="sh-stack">
          <Registration s={s} id={id} />
          <CoverageCard s={s} id={id} />
        </div>
      </Grid>
      <RoomsTable s={s} id={id} />
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   WEEKLY OPERATIONS
   ═════════════════════════════════════════════════════════════════════════════ */
function Weekly({ s }: { s: DemoState }) {
  const site = effectiveSite(s);
  const [rosterSite, setRosterSite] = useState<SiteId>(site === "bal" ? "bal" : "elm");
  const rs: SiteId = site === "all" ? rosterSite : site;
  const rooms = ROOMS.filter((r) => inSite(site, r.site));
  const weekOf = dayLabel(-TODAY_IDX);
  const routines = s.tasks.filter((t) => t.recurring && inSite(site, t.site)).sort((a, b) => dueRank(a.due) - dueRank(b.due));
  const enquiries = s.enquiries.filter((e) => inSite(site, e.site) && ["new", "contacted", "visit", "waitlist"].includes(e.status));
  const roster = s.staff.filter((x) => x.site === rs);

  const Cell = ({ booked, places, today, onClick }: { booked: number; places: number; today: boolean; onClick: () => void }) => {
    const free = places - booked;
    return (
      <button type="button" className={"ov-gcell" + (today ? " today" : "") + (free <= 0 ? " full" : "")} onClick={onClick}>
        <span className="top"><span className="sh-num" style={{ fontSize: 12.5, color: "var(--ink)" }}>{booked}<span className="sh-faint">/{places}</span></span><span className="free">{free <= 0 ? "Full" : free + " free"}</span></span>
        <Bar value={booked} max={places} tone={free <= 0 ? "gold" : "accent"} />
      </button>
    );
  };

  const roomRow = (r: Room) => {
    const wk = r.bookedByDay.reduce((n, v) => n + v, 0);
    return (
      <tr key={r.id}>
        <td className="ov-gname"><RecordLink type="room" id={r.id}>{r.name}</RecordLink><div className="ov-def">{r.placesPerDay} planning places{r.programme === "afterschool" ? ", school-age" : ""}</div></td>
        {r.bookedByDay.map((b, i) => <td key={i}><Cell booked={b} places={r.placesPerDay} today={i === TODAY_IDX} onClick={() => openDrawer("room", r.id)} /></td>)}
        <td><span className="sh-num" style={{ fontSize: 12.5, color: "var(--body)", padding: "0 6px" }}>{wk} of {r.placesPerDay * 5}</span></td>
      </tr>
    );
  };

  const routineCols: Col<Task>[] = [
    { key: "t", label: "Routine", render: (t) => <div><div className="strong">{t.title}</div><div className="ov-def">{t.recurring}</div></div> },
    { key: "o", label: "Owner", render: (t) => personName(t.owner, s) },
    { key: "site", label: "Site", render: (t) => <SiteChip site={t.site} /> },
    { key: "due", label: "Due", render: (t) => <span className="sh-num">{t.due}</span> },
    { key: "st", label: "This cycle", render: (t) => <TaskState t={t} /> },
    { key: "a", label: "", align: "r", render: (t) => <span onClick={(e) => e.stopPropagation()}><TaskAction s={s} t={t} label="Mark done" /></span> },
  ];

  return (
    <>
      <PageHead title="Weekly operations" sub={"Week of " + weekOf + ". Bookings against each room's planning figure, the team's recurring routines and the week's roster."} right={<><DemoTag />{site !== "all" && <SiteChip site={site} />}</>} />
      <Card title="Booking grid, Monday to Friday" sub="Children booked per day against the room's planning places. Select a day to open the room." right={<Chip tone="outline">Planning figure, not a ratio</Chip>} style={{ marginBottom: 12 }}>
        <div className="sh-scroll-x">
          <table className="ov-grid-week">
            <thead>
              <tr>
                <th>Room</th>
                {WEEKDAYS.map((d, i) => <th key={d} className={i === TODAY_IDX ? "today" : ""}>{d}{i === TODAY_IDX ? " (today)" : ""}</th>)}
                <th>Week</th>
              </tr>
            </thead>
            <tbody>
              {sitesOf(site).map((sid) => {
                const rr = rooms.filter((r) => r.site === sid);
                const tr = rr.filter((r) => r.programme !== "afterschool");
                const dayTot = WEEKDAYS.map((_, i) => tr.reduce((n, r) => n + r.bookedByDay[i], 0));
                const placeTot = tr.reduce((n, r) => n + r.placesPerDay, 0);
                return [
                  <tr key={sid + "-h"}><td colSpan={7}><Sec>{siteName(sid)}{sid === "bal" ? " (After-school sits under TU2021CC067SA and is kept out of the sessional total)" : ""}</Sec></td></tr>,
                  ...tr.map((r) => roomRow(r)),
                  <tr key={sid + "-t"} className="ov-subtot">
                    <td className="ov-gname"><span className="ov-s">{sid === "bal" ? "Sessional rooms total" : "Site total"}</span></td>
                    {dayTot.map((b, i) => <td key={i}><span className="sh-num" style={{ fontSize: 12, padding: "0 9px", color: i === TODAY_IDX ? "var(--accent)" : "var(--dim)" }}>{b} of {placeTot}</span></td>)}
                    <td><span className="sh-num" style={{ fontSize: 12, padding: "0 6px", color: "var(--dim)" }}>{dayTot.reduce((n, v) => n + v, 0)} of {placeTot * 5}</span></td>
                  </tr>,
                  ...rr.filter((r) => r.programme === "afterschool").map((r) => roomRow(r)),
                ];
              })}
            </tbody>
          </table>
        </div>
        <div className="ov-s" style={{ marginTop: 10 }}>Planning places per day is the demo's booking-grid figure for offering days. It is not a ratio, a staffing rule or a registered number.</div>
      </Card>

      <Grid cols="main" style={{ marginBottom: 12 }}>
        <Card title="Recurring routines" sub={routines.filter((t) => t.status === "done").length + " of " + routines.length + " done this cycle. They run whether or not Edel is in."} pad={false}>
          <div style={{ padding: "8px 4px 6px" }}><Table cols={routineCols} rows={routines} rowKey={(t) => t.id} onRow={(t) => openDrawer("task", t.id)} /></div>
        </Card>
        <Card title="Enquiries against this week" sub="Requested days checked against the booking grid">
          {enquiries.length ? (
            <div className="ov-list">
              {enquiries.map((e) => {
                const r = roomById(e.room);
                const fit = e.days.map((d) => { const i = WEEKDAYS.indexOf(d); return { d, ok: !!r && i > -1 && r.bookedByDay[i] < r.placesPerDay }; });
                return (
                  <RowBtn key={e.id} onClick={() => openDrawer("enquiry", e.id)}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="ov-t" style={{ display: "block" }}>{e.parent} <span className="sh-faint" style={{ fontSize: 11.5 }}>for {e.child.split(" ")[0]}, {r?.name}</span></span>
                      <span className="ov-chipset" style={{ marginTop: 6 }}>{fit.map((f) => <Chip key={f.d} tone={f.ok ? "ok" : "warn"}>{f.d} {f.ok ? "fits" : "full"}</Chip>)}</span>
                    </span>
                    <Chev />
                  </RowBtn>
                );
              })}
            </div>
          ) : <div className="ov-s">No open enquiries for this filter.</div>}
        </Card>
      </Grid>

      <Card title="This week's staffing" sub="Rostered shifts from the approved rota. Today shows who is actually on." right={site === "all" ? <Segmented value={rosterSite} onChange={setRosterSite} options={[{ id: "elm", label: "Elmgrove" }, { id: "bal", label: "Ballyneety" }]} /> : undefined}>
        <div className="sh-grid" style={{ gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 8, marginBottom: 14 }}>
          {WEEKDAYS.map((d, i) => {
            const on = roster.filter((x) => (x.week[i] || "Off") !== "Off").length;
            return (
              <div key={d} className={"ov-gcell" + (i === TODAY_IDX ? " today" : "")} style={{ cursor: "default" }}>
                <span className="top"><span style={{ fontSize: 11.5, color: "var(--dim)" }}>{d}</span><span className="sh-num" style={{ fontSize: 12.5, color: "var(--ink)" }}>{on}<span className="sh-faint">/{roster.length}</span></span></span>
                <Bar value={on} max={roster.length} />
              </div>
            );
          })}
        </div>
        <div className="sh-scroll-x">
          <table className="sh-table">
            <thead><tr><th>Staff</th>{WEEKDAYS.map((d, i) => <th key={d} style={i === TODAY_IDX ? { color: "var(--accent)" } : undefined}>{d}</th>)}</tr></thead>
            <tbody>
              {roster.map((x) => (
                <tr key={x.id} className="click" onClick={() => openDrawer("staff", x.id)}>
                  <td><div className="strong">{x.name}</div><div className="ov-def">{x.room ? roomById(x.room)?.name : x.role}</div></td>
                  {x.week.map((w, i) => (
                    <td key={i} className="sh-num" style={{ fontSize: 11.5, whiteSpace: "nowrap", color: w === "Off" ? "var(--faint)" : "var(--body)", background: i === TODAY_IDX ? "var(--accent-faint)" : undefined }}>
                      {i === TODAY_IDX && x.status !== "on" ? <span style={{ color: x.status === "sick" ? "var(--bad)" : "var(--dim)" }}>{x.status === "sick" ? "Sick" : x.status === "leave" ? "Leave" : x.status === "training" ? "Training" : x.status === "onboarding" ? "Induction" : "Off"}</span> : w}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   QUALITY AND RISK
   ═════════════════════════════════════════════════════════════════════════════ */
function Quality({ s }: { s: DemoState }) {
  const site = effectiveSite(s);
  const role = roleDef(s.role);
  const staff = s.staff.filter((x) => inSite(site, x.site));
  const kids = s.children.filter((c) => inSite(site, c.site));
  const reviews = s.policies.map((p) => ({ p, r: reviewState(p) }));
  const overduePol = reviews.filter((x) => x.r.overdue).sort((a, b) => b.r.days - a.r.days);
  const soonPol = reviews.filter((x) => !x.r.overdue && x.r.days <= 60).sort((a, b) => a.r.days - b.r.days);
  const vetting = staff.filter((x) => x.vetting.status !== "Valid");
  const firstAid = staff.filter((x) => x.firstAid.startsWith("Expires"));
  const consentKids = kids.filter((c) => !c.consents.photos || !c.consents.sunscreen || !c.consents.outings || !c.consents.firstAid);
  const cleanOver = s.cleaning.filter((c) => inSite(site, c.site) && cleanOverdue(c));
  const cleanLater = s.cleaning.filter((c) => inSite(site, c.site) && !c.done && !cleanOverdue(c));
  const pendingLogs = s.careLogs.filter((l) => l.status === "pending-review" && inSite(site, childById(l.child, s)?.site || "elm"));
  const drafts = s.progress.filter((p) => p.status === "draft" && inSite(site, childById(p.child, s)?.site || "elm"));
  const unsigned = staff.filter((x) => !x.safeSleepSigned);
  const apSleep = s.approvals.find((a) => a.id === "ap-safesleep");

  return (
    <>
      <PageHead title="Quality and risk" sub="Signatures, reviews, renewals, consents, checklists and records awaiting a person. Every row opens the record it is about." right={<><DemoTag />{site !== "all" && <SiteChip site={site} />}</>} />
      <Band>
        <Stat label="Safe Sleep v4.0" value={<>{staff.length - unsigned.length}<Of n={staff.length} /></>} sub="Staff signatures, current version" tone={unsigned.length ? "gold" : "ok"} onClick={() => jump("q-sleep")} />
        <Stat label="Policy reviews overdue" value={overduePol.length} sub={"Of " + s.policies.length + " policies, as at today"} tone={overduePol.length ? "gold" : "ok"} onClick={() => jump("q-policy")} />
        <Stat label="Staff renewals due" value={vetting.length + firstAid.length} sub={vetting.length + " vetting, " + firstAid.length + " first aid, next 60 days"} onClick={() => jump("q-staff")} />
        <Stat label="Consents missing" value={consentKids.length} sub={"Of " + kids.length + " children holding a booking"} onClick={() => jump("q-consents")} />
        <Stat label="Cleaning overdue" value={cleanOver.length} sub={cleanLater.length + " more due later today"} tone={cleanOver.length ? "bad" : "ok"} onClick={() => jump("q-cleaning")} />
        <Stat label="Awaiting review" value={pendingLogs.length + drafts.length} sub="Observations, incidents and summaries" onClick={() => jump("q-reviews")} />
      </Band>

      <Grid cols={2} style={{ marginBottom: 12 }}>
        <Card id="q-sleep" title="Safe Sleep v4.0 signatures" sub="By site, of staff on each roster" style={{ scrollMarginTop: 16 }} right={<span style={{ fontSize: 12.5 }}><RecordLink type="policy" id="pol-safesleep">Policy</RecordLink></span>}>
          <HBars rows={sitesOf(site).map((sid) => { const st = s.staff.filter((x) => x.site === sid); const sg = st.filter((x) => x.safeSleepSigned).length; return { label: siteName(sid), value: sg, note: "of " + st.length, tone: (sg < st.length ? "gold" : "ok") as Tone }; })} max={Math.max(1, ...sitesOf(site).map((sid) => s.staff.filter((x) => x.site === sid).length))} />
          {unsigned.length > 0 && (
            <>
              <Sec n={unsigned.length}>Not yet signed</Sec>
              <div className="ov-list">
                {unsigned.map((x) => (
                  <RowBtn key={x.id} onClick={() => openDrawer("staff", x.id)}>
                    <Avatar initials={x.initials} size={24} />
                    <span className="ov-t" style={{ flex: 1 }}>{x.name} <span className="sh-faint" style={{ fontSize: 11.5 }}>{siteName(x.site)}</span></span>
                    {s.safeSleepReminded[x.id] ? <Chip tone="accent">Reminded {s.safeSleepReminded[x.id]}</Chip> : <Chip tone="neutral">Not reminded</Chip>}
                    <Chev />
                  </RowBtn>
                ))}
              </div>
              <div className="sh-row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {apSleep?.status === "pending" && role.id === "owner" && <Btn size="sm" kind="primary" icon={IC.check} onClick={() => approve("ap-safesleep")}>Approve reminder to {unsigned.length}</Btn>}
                {apSleep?.status === "pending" && role.id !== "owner" && <span className="ov-s">Reminder waits on Edel's approval.</span>}
                <Btn size="sm" icon={IC.arrow} onClick={() => navigate("Policies", "versions")}>Versions and sign-offs</Btn>
              </div>
            </>
          )}
          {!unsigned.length && <div className="ov-s" style={{ marginTop: 10 }}>Every staff member in view has signed v4.0.</div>}
        </Card>

        <Card id="q-policy" title="Policy reviews" sub="Next review date against today" style={{ scrollMarginTop: 16 }}>
          <Sec n={overduePol.length}>Overdue</Sec>
          {overduePol.length ? (
            <div className="ov-list">
              {overduePol.map(({ p, r }) => (
                <RowBtn key={p.id} onClick={() => openDrawer("policy", p.id)}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ov-t" style={{ display: "block" }}>{p.title} v{p.version}</span>
                    <span className="ov-s" style={{ display: "block" }}>Review was due {p.nextReview}. Owner {personName(p.owner, s)}. {p.status}.</span>
                  </span>
                  <Chip tone="bad">{r.days} day{r.days === 1 ? "" : "s"} over</Chip>
                  <Chev />
                </RowBtn>
              ))}
            </div>
          ) : <div className="ov-s">No reviews overdue.</div>}
          <Sec n={soonPol.length}>Due in the next 60 days</Sec>
          {soonPol.length ? (
            <div className="ov-list">
              {soonPol.map(({ p, r }) => (
                <RowBtn key={p.id} onClick={() => openDrawer("policy", p.id)}>
                  <span className="ov-t" style={{ flex: 1 }}>{p.title} v{p.version}</span>
                  <Chip tone="neutral">In {r.days} days</Chip>
                  <Chev />
                </RowBtn>
              ))}
            </div>
          ) : <div className="ov-s">Nothing due in the next 60 days.</div>}
        </Card>

        <Card id="q-staff" title="Vetting and first aid renewals" sub="Staff in view, by renewal date" style={{ scrollMarginTop: 16 }} right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("People", "training")}>Training and vetting</Btn>}>
          {vetting.length + firstAid.length ? (
            <div className="ov-list">
              {vetting.map((x) => (
                <RowBtn key={"v" + x.id} onClick={() => openDrawer("staff", x.id)}>
                  <Avatar initials={x.initials} size={24} />
                  <span style={{ flex: 1, minWidth: 0 }}><span className="ov-t" style={{ display: "block" }}>{x.name}</span><span className="ov-s" style={{ display: "block" }}>Garda vetting via NVB: {x.vetting.status.toLowerCase()}, {x.vetting.date}. {siteName(x.site)}.</span></span>
                  <Chip tone="gold">Vetting</Chip><Chev />
                </RowBtn>
              ))}
              {firstAid.map((x) => (
                <RowBtn key={"f" + x.id} onClick={() => openDrawer("staff", x.id)}>
                  <Avatar initials={x.initials} size={24} />
                  <span style={{ flex: 1, minWidth: 0 }}><span className="ov-t" style={{ display: "block" }}>{x.name}</span><span className="ov-s" style={{ display: "block" }}>Paediatric first aid {x.firstAid.toLowerCase()}. {siteName(x.site)}.</span></span>
                  <Chip tone="neutral">First aid</Chip><Chev />
                </RowBtn>
              ))}
            </div>
          ) : <div className="ov-s">No renewals due.</div>}
          <div className="ov-s" style={{ marginTop: 10 }}>HR records the vetting outcome. The app tracks dates; it does not vet anyone.</div>
        </Card>

        <Card id="q-consents" title="Consents missing" sub={consentKids.length + " of " + kids.length + " children with at least one consent outstanding"} style={{ scrollMarginTop: 16 }} right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("Families", "forms")}>Permissions and forms</Btn>}>
          <HBars rows={[
            { label: "Photos", value: kids.filter((c) => !c.consents.photos).length },
            { label: "Outings", value: kids.filter((c) => !c.consents.outings).length },
            { label: "Sunscreen", value: kids.filter((c) => !c.consents.sunscreen).length },
          ]} max={Math.max(1, consentKids.length)} tone="gold" />
          <div className="ov-chipset" style={{ marginTop: 12 }}>
            {consentKids.map((c) => (
              <button key={c.id} type="button" className="sh-chip outline" style={{ cursor: "pointer", font: "inherit", fontSize: 11 }} onClick={() => openDrawer("child", c.id)}
                title={[c.consents.photos ? "" : "photos", c.consents.outings ? "" : "outings", c.consents.sunscreen ? "" : "sunscreen"].filter(Boolean).join(", ") + " missing"}>
                {short(c)} <span style={{ color: "var(--faint)" }}>{roomById(c.room)?.name}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card id="q-cleaning" title="Cleaning and safety checklists" sub={cleanOver.length + " overdue, " + cleanLater.length + " due later today"} style={{ scrollMarginTop: 16 }} right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("Centres", "cleaning")}>All checklists</Btn>}>
          {cleanOver.length + cleanLater.length ? (
            <div>
              {cleanOver.concat(cleanLater).map((c) => (
                <BoardRow key={c.id} title={c.area + ": " + c.task} meta={personName(c.owner, s) + " · " + siteName(c.site) + " · due " + c.due} chips={cleanOverdue(c) ? <Chip tone="bad">Overdue</Chip> : <Chip tone="neutral">Due {c.due}</Chip>} onOpen={() => openDrawer("staff", c.owner)}>
                  <Btn size="sm" icon={IC.check} onClick={() => signOff(s, c.id)}>Sign off</Btn>
                </BoardRow>
              ))}
            </div>
          ) : <div className="ov-s">Every checklist in view is signed off.</div>}
        </Card>

        <Card id="q-reviews" title="Records awaiting a person" sub="Drafted on the room tablet or by an agent. Nothing reaches parents until approved." style={{ scrollMarginTop: 16 }}>
          {pendingLogs.length + drafts.length ? (
            <div>
              {pendingLogs.map((l) => {
                const c = childById(l.child, s);
                return (
                  <BoardRow key={l.id} title={(c ? short(c) : l.child) + ": " + l.kind} meta={l.detail} chips={<Chip tone={l.kind === "incident" ? "bad" : "gold"}>{l.kind === "observation" ? "Observation" : l.kind === "incident" ? "Incident" : "Medication"}</Chip>} onOpen={() => openDrawer("child", l.child)}>
                    <Btn size="sm" icon={IC.check} onClick={() => { approveCareLog(l.id); afterReview(s, l.id); toast("Approved and shared to the parent timeline."); }}>Approve</Btn>
                  </BoardRow>
                );
              })}
              {drafts.map((p) => {
                const c = childById(p.child, s);
                return (
                  <BoardRow key={p.id} title={(c ? short(c) : p.child) + ": " + p.label} meta="Draft summary from approved observations. Not a developmental assessment." chips={<Chip tone="gold">Summary</Chip>} onOpen={() => openDrawer("child", p.child)}>
                    <Btn size="sm" icon={IC.check} onClick={() => { approveProgress(p.id); toast("Summary reviewed and released to the family."); }}>Release</Btn>
                  </BoardRow>
                );
              })}
            </div>
          ) : <div className="ov-s">Nothing waiting for review.</div>}
        </Card>
      </Grid>

      <Card title="Inspection readiness" sub="Where the evidence lives, per registered service">
        <div className="sh-row" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div className="ov-chipset" style={{ marginBottom: 10 }}>
              {inSite(site, "elm") && <Chip tone="accent">Elmgrove, TU2015CC365</Chip>}
              {inSite(site, "bal") && <Chip tone="accent">Ballyneety, TU2015CC366</Chip>}
              {inSite(site, "bal") && <Chip tone="accent">School-age, TU2021CC067SA</Chip>}
            </div>
            <div className="ov-s" style={{ fontSize: 12.5 }}>Policies, sign-offs, checklists and records are gathered per registered service in Policies, Inspection Readiness. It is a preparation aid: no inspection has taken place in this demo and nothing here confirms compliance.</div>
          </div>
          <Btn kind="primary" icon={IC.arrow} onClick={() => navigate("Policies", "inspection")}>Open inspection readiness</Btn>
        </div>
      </Card>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   PAGE
   ═════════════════════════════════════════════════════════════════════════════ */
export default function Overview() {
  const s = useDemo();
  const role = roleDef(s.role);
  const mgrSite: SiteId | null = role.id === "manager-elm" ? "elm" : role.id === "manager-bal" ? "bal" : null;
  const tab = activeTab("Overview", s);
  const unset = !s.tabs.Overview;

  // Site managers land on their own centre's tab by default.
  useEffect(() => { if (mgrSite && unset) setTab("Overview", mgrSite); }, [mgrSite, unset]);

  if (!role.pages.includes("Overview")) return <Page><PageHead title="Overview" right={<DemoTag />} /><Restricted what="The Overview dashboard" /></Page>;

  let body: ReactNode;
  if (tab === "elm" || tab === "bal") {
    body = mgrSite && mgrSite !== tab
      ? <><PageHead title={siteName(tab)} right={<DemoTag />} /><Restricted what={siteName(tab) + " overview"} /></>
      : <SiteView s={s} id={tab} />;
  } else if (tab === "weekly") {
    body = <Weekly s={s} />;
  } else if (tab === "quality") {
    body = <Quality s={s} />;
  } else {
    body = mgrSite
      ? <SiteView s={s} id={mgrSite} note={<Note icon={IC.lock}>The executive view combines both registered services, so it is for the owner. As {role.label.replace("Site Manager · ", "Site Manager for ")} you see your own centre here.</Note>} />
      : <Executive s={s} />;
  }
  return <Page>{body}</Page>;
}
