/* Shournagh OS · People
   Rota, team, HR onboarding, contracts, training and vetting, leave and cover.
   Every count is derived from the store. Rota edits go to the centre manager for
   approval. Cover answers come from the approved roster and approved availability:
   a coverage watch, never a ratio calculation or an AI judgement. */
import { Fragment, useEffect, useState, type ReactNode, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  useDemo, activeTab, effectiveSite, inSite, roleDef, metrics, personName, staffById, roomById, siteById, navigate, openDrawer,
  update, add, logEvent, toast, decide, decideLeave, requestDocument, verifyStep, addTask, signSafeSleep, nowLabel,
  type DemoState, type RoleDef,
} from "../store";
import { ROOMS, TODAY_IDX, WEEKDAYS, TODAY_LABEL, dayLabel, siteName } from "../seed";
import type { Staff, SiteId, SiteFilter, LeaveRequest, Onboarding, Room } from "../types";
import {
  Page, PageHead, Grid, Card, Stat, Chip, DemoTag, SiteChip, Bar, Avatar, Btn, Segmented, Table, Empty, KV, Note, RecordLink,
  Steps, Modal, Restricted, Icon, IC, type Col, type Tone,
} from "../ui";
import "./people.css";

/* ── Constants and small helpers ───────────────────────────────────────────── */
const MANAGER: Record<SiteId, string> = { elm: "s01", bal: "s18" };
const PRESETS = ["Off", "08:00-16:30", "09:30-18:00"];
const STAGES = ["Invite", "Personal details", "Contract", "Garda vetting confirmation", "Qualifications checked", "Policies read and signed", "Room induction", "Ready for the floor"];
const CONTRACT_VERSION = "2026 v1.2";
const STATUS_LABEL: Record<Staff["status"], string> = { on: "On duty", leave: "Annual leave", sick: "Sick leave", off: "Day off", training: "Training", onboarding: "Onboarding" };
const STATUS_SHORT: Record<Staff["status"], string> = { on: "On", leave: "Leave", sick: "Sick", off: "Off", training: "Training", onboarding: "Induction" };
const STATUS_TONE: Record<Staff["status"], Tone> = { on: "ok", leave: "gold", sick: "bad", off: "neutral", training: "accent", onboarding: "accent" };
const AWAY_ORDER: Staff["status"][] = ["sick", "leave", "training", "onboarding", "off"];
const SITES: SiteId[] = ["elm", "bal"];

const dayName = (d: number) => WEEKDAYS[d] + " " + dayLabel(d - TODAY_IDX);
const qualLevel = (q: string) => { const m = q.match(/L(?:evel)?\s?(\d)/); return m ? Number(m[1]) : 0; };
const firstName = (n: string) => n.split(" ")[0];
const requesterId = (r: RoleDef) => (r.personId === "edel" ? "Edel Lyons" : r.personId);
const canApproveFor = (r: RoleDef, site: SiteId) => r.id === "owner" || (r.id === "manager-elm" && site === "elm") || (r.id === "manager-bal" && site === "bal");
function absentPhrase(st: Staff, d: number): string {
  if (d !== TODAY_IDX || st.status === "on") return "rostered off";
  return ({ sick: "off sick", leave: "on annual leave", training: "on a training course", onboarding: "still in induction", off: "on a day off", on: "on duty" } as Record<Staff["status"], string>)[st.status];
}
/** Day offset (0..120) of a "16 Dec" style label, or null. */
function daysUntil(label: string): number | null {
  for (let k = 0; k <= 120; k++) if (dayLabel(k) === label) return k;
  return null;
}
/** Overlays render into the theme root: .sh-page keeps a transform from its entry
    animation, which would otherwise trap position:fixed inside the page box. */
function Layer({ children }: { children: ReactNode }) {
  const host = typeof document === "undefined" ? null : (document.querySelector("[data-theme]") as HTMLElement | null) || document.body;
  return host ? createPortal(children, host) : <>{children}</>;
}
function Sel({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; label: string }) {
  return (
    <select className="sh-input" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ height: 34, paddingRight: 8 }}>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

/* ── Rota changes: payload kept beside the approval that gates it ──────────── */
interface RotaChange { staff: string; day: number; value: string; prev: string; applied: boolean }
const ROTA: Record<string, RotaChange> = {};

function pendingFor(s: DemoState, staffId: string, day: number): { id: string; value: string } | null {
  const ap = s.approvals.find((a) => a.status === "pending" && ROTA[a.id] && ROTA[a.id].staff === staffId && ROTA[a.id].day === day);
  return ap ? { id: ap.id, value: ROTA[ap.id].value } : null;
}
function cellValue(st: Staff, d: number): string {
  if (d === TODAY_IDX && st.status === "on" && st.shift) return st.shift;
  return st.week[d] || "Off";
}
function onLeaveDays(l: LeaveRequest): number[] {
  const inWeek = (label: string): number | null => { for (let d = 0; d < 5; d++) if (dayLabel(d - TODAY_IDX) === label) return d; return null; };
  if (l.dates === "Today") return [TODAY_IDX];
  const parts = l.dates.split(" to ");
  if (parts.length === 2) {
    const a = parts[0] === "Today" ? TODAY_IDX : inWeek(parts[0]);
    if (a === null) return [];
    const b = inWeek(parts[1]);
    const out: number[] = [];
    for (let d = a; d <= (b === null ? 4 : b); d++) out.push(d);
    return out;
  }
  const d = inWeek(l.dates);
  return d === null ? [] : [d];
}
const onLeave = (s: DemoState, id: string, d: number) => s.leave.some((l) => l.staff === id && l.status === "approved" && onLeaveDays(l).includes(d));
const rostered = (st: Staff, d: number) => cellValue(st, d) !== "Off" && (d !== TODAY_IDX || st.status === "on");

function applyRotaChange(id: string) {
  const c = ROTA[id];
  if (!c || c.applied) return;
  const st = staffById(c.staff);
  if (!st) return;
  c.applied = true;
  const week = st.week.slice();
  week[c.day] = c.value;
  const patch: Partial<Staff> = { week };
  if (c.day === TODAY_IDX) {
    if (c.value === "Off" && st.status === "on") { patch.status = "off"; patch.statusNote = "Rostered off (approved rota change)"; patch.shift = ""; }
    else if (c.value !== "Off" && st.status === "off") { patch.status = "on"; patch.statusNote = "Added to today's rota (approved change)"; patch.shift = c.value; }
    else if (c.value !== "Off" && st.status === "on") patch.shift = c.value;
  }
  update("staff", st.id, patch);
}
function proposeRota(s: DemoState, st: Staff, day: number, value: string) {
  const r = roleDef(s.role);
  const cur = cellValue(st, day);
  const existing = pendingFor(s, st.id, day);
  if (!existing && cur === value) { toast(st.name + " is already " + (value === "Off" ? "off" : "on " + value) + " on " + dayName(day) + "."); return; }
  const title = "Rota change: " + st.name + ", " + dayName(day) + ", " + cur + " to " + value;
  const detail = "Proposed by " + r.person + ". " + siteName(st.site) + " rota, " + (st.room ? roomById(st.room)?.name : "office and floating") + ". Applies once the centre manager approves.";
  if (existing) {
    ROTA[existing.id].value = value;
    update("approvals", existing.id, { title, detail });
  } else {
    const id = "ap-rota-" + st.id + "-" + day + "-" + Date.now();
    ROTA[id] = { staff: st.id, day, value, prev: cur, applied: false };
    add("approvals", { id, kind: "Staff cover", title, detail, requestedBy: requesterId(r), approver: MANAGER[st.site], site: st.site, status: "pending", link: { type: "staff", id: st.id }, story: null, decidedAt: null });
  }
  logEvent({ actor: r.person, actorKind: "person", action: "proposed rota change (pending manager approval)", target: st.name + ", " + dayName(day) + ": " + value, kind: "people", site: st.site, story: null });
  toast("Sent to " + personName(MANAGER[st.site], s) + " for approval. The rota changes once approved.");
}
function approveRota(id: string) {
  const c = ROTA[id];
  decide(id, "approved");
  applyRotaChange(id);
  if (c) toast("Approved. " + personName(c.staff) + " is now " + (c.value === "Off" ? "off" : c.value) + " on " + dayName(c.day) + ".");
}

/* ── Acting leads and conflicts ────────────────────────────────────────────── */
function actingLead(s: DemoState, room: Room, d: number): string | null {
  const key = room.name + ", " + dayName(d) + ": ";
  const e = s.events.find((x) => x.action === "named acting room lead" && x.target.startsWith(key));
  return e ? e.target.slice(key.length) : null;
}
function nameActing(s: DemoState, room: Room, d: number, st: Staff) {
  const r = roleDef(s.role);
  logEvent({ actor: r.person, actorKind: "person", action: "named acting room lead", target: room.name + ", " + dayName(d) + ": " + st.name, kind: "people", site: room.site, story: null });
  toast(st.name + " is acting room lead in " + room.name + ", " + dayName(d) + ".");
}
interface Conflict { key: string; tone: "bad" | "warn"; title: string; detail: string; fixLabel?: string; fix?: () => void }
function conflictsFor(s: DemoState, site: SiteFilter, openCover: (room: string) => void): Conflict[] {
  const out: Conflict[] = [];
  if (inSite(site, "bal") && !s.coverConfirmed) {
    const lead = staffById(roomById("bal-afterschool")?.leader || "", s);
    out.push({ key: "gap-as", tone: "bad", title: "After-school 14:00-18:00 unfilled today", detail: (lead ? lead.name + " is " + absentPhrase(lead, TODAY_IDX) + ". " : "") + "Coverage watch against the approved roster.", fixLabel: "Who's covering?", fix: () => openCover("bal-afterschool") });
  }
  s.staff.filter((x) => inSite(site, x.site)).forEach((st) => {
    for (let d = 0; d < 5; d++) {
      if (cellValue(st, d) === "Off") continue;
      const leave = onLeave(s, st.id, d);
      const absentToday = d === TODAY_IDX && st.status !== "on";
      if (!leave && !absentToday) continue;
      const pend = pendingFor(s, st.id, d);
      if (pend && pend.value === "Off") continue;
      out.push({ key: "lv-" + st.id + d, tone: "bad", title: st.name + " rostered " + dayName(d), detail: leave ? "On approved leave that day." : STATUS_LABEL[st.status] + " today.", fixLabel: "Propose Off", fix: () => proposeRota(s, st, d, "Off") });
    }
  });
  ROOMS.filter((r) => inSite(site, r.site)).forEach((r) => {
    const inRoom = s.staff.filter((x) => x.room === r.id);
    for (let d = 0; d < 5; d++) {
      const on = inRoom.filter((x) => rostered(x, d));
      if (!on.length) { out.push({ key: "empty-" + r.id + d, tone: "bad", title: r.name + ": nobody rostered " + dayName(d), detail: "Add a shift before the day starts." }); continue; }
      if (on.some((x) => x.access === "Room Leader") || actingLead(s, r, d)) continue;
      const best = on.slice().sort((a, b) => qualLevel(b.qualification) - qualLevel(a.qualification))[0];
      const lead = staffById(r.leader, s);
      out.push({ key: "lead-" + r.id + d, tone: "warn", title: r.name + ": no room leader " + dayName(d),
        detail: (lead ? lead.name + " is " + absentPhrase(lead, d) + ". " : "") + "Suggested acting lead: " + best.name + " (QQI Level " + qualLevel(best.qualification) + ").",
        fixLabel: "Name " + firstName(best.name) + " acting lead", fix: () => nameActing(s, r, d, best) });
    }
  });
  return out;
}

/* ── Who's covering this room? ─────────────────────────────────────────────── */
function CoverModal({ s, roomId, onClose }: { s: DemoState; roomId: string | null; onClose: () => void }) {
  const r = roleDef(s.role);
  const room = roomId ? roomById(roomId) : undefined;
  if (!room) return null;
  const inRoom = s.staff.filter((x) => x.room === room.id);
  const on = inRoom.filter((x) => x.status === "on");
  const away = inRoom.filter((x) => x.status !== "on");
  const isAfter = room.id === "bal-afterschool";
  const gap = isAfter && !s.coverConfirmed;
  const ap = s.approvals.find((a) => a.id === "ap-cover");
  const avail = s.staff.filter((x) => x.site === room.site && x.room !== room.id && /approved availability/i.test(x.statusNote));
  const coverer = s.staff.find((x) => /^Covering /.test(x.statusNote) && x.statusNote.includes(room.name));
  const canConfirm = r.id === "owner" || r.id === "manager-bal";
  const leaveFor = (id: string) => s.leave.find((l) => l.staff === id && l.status === "approved" && onLeaveDays(l).includes(TODAY_IDX));
  let answer: ReactNode;
  if (gap) {
    const c = avail[0];
    answer = <>Nobody yet for <b>14:00-18:00</b>. {away.map((x) => x.name + " is " + absentPhrase(x, TODAY_IDX)).join("; ")}. {c ? <><b>{c.name}</b> has approved availability ({c.statusNote.replace(/\s*\(approved availability\)/i, "")}) and is eligible: {siteName(c.site)} staff, {c.qualification}.</> : "No one at " + siteName(room.site) + " has approved availability for this window."}</>;
  } else if (isAfter && coverer) {
    answer = <><b>{coverer.name}</b> is covering 14:00-18:00{ap?.decidedAt ? ", confirmed at " + ap.decidedAt : ""}. The coverage watch is clear.</>;
  } else {
    answer = <>Covered by the approved roster: {on.map((x) => x.name + " " + (x.shift || "")).join(", ") || "no one rostered"}.{away.length ? " " + away.map((x) => x.name + " is " + absentPhrase(x, TODAY_IDX) + (leaveFor(x.id) ? " (" + leaveFor(x.id)!.cover.toLowerCase() + ")" : "")).join("; ") + "." : ""} No unfilled shift today.</>;
  }
  return (
    <Layer><Modal open onClose={onClose} width={560} title={"Who's covering " + room.name + " today?"} sub={siteName(room.site) + ", " + room.hours + ", " + TODAY_LABEL}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Close</Btn>
        {gap && ap && ap.status === "pending" && avail[0] && (
          <Btn kind="primary" icon={IC.check} disabled={!canConfirm} title={canConfirm ? undefined : "The centre manager confirms cover"}
            onClick={() => { decide("ap-cover", "approved"); onClose(); }}>Confirm {firstName(avail[0].name)}</Btn>
        )}
      </>}>
      <div className="people-answer">{answer}</div>
      {gap && !canConfirm && <div className="people-hint" style={{ marginTop: 8 }}>Cover is confirmed by {personName(MANAGER[room.site], s)} or Edel. You can see the answer; you cannot confirm it in this role.</div>}
      <div className="sh-eyebrow" style={{ margin: "18px 0 6px" }}>Rostered in {room.name} today</div>
      <div style={{ fontSize: 13 }}>
        {inRoom.map((x) => (
          <div key={x.id} className="people-li" style={{ alignItems: "center" }}>
            <Avatar name={x.name} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}><RecordLink type="staff" id={x.id}>{x.name}</RecordLink><div className="d">{x.role}</div></div>
            {x.status === "on" ? <Chip tone="ok">{x.shift}</Chip> : <Chip tone={STATUS_TONE[x.status]}>{STATUS_LABEL[x.status]}</Chip>}
          </div>
        ))}
        {coverer && isAfter && <div className="people-li" style={{ alignItems: "center" }}><Avatar name={coverer.name} size={26} tone="accent" /><div style={{ flex: 1 }}><RecordLink type="staff" id={coverer.id}>{coverer.name}</RecordLink><div className="d">Cover from approved availability</div></div><Chip tone="accent">14:00-18:00</Chip></div>}
      </div>
      {avail.length > 0 && <>
        <div className="sh-eyebrow" style={{ margin: "16px 0 6px" }}>Approved availability at {siteName(room.site)}</div>
        {avail.map((x) => <div key={x.id} className="people-li" style={{ fontSize: 13 }}><Avatar name={x.name} size={26} tone="gold" /><div style={{ flex: 1 }}><div className="t">{x.name}</div><div className="d">{x.statusNote}. {x.qualification}.</div></div></div>)}
      </>}
      <div style={{ marginTop: 16 }}><Note icon={IC.shield}>This is a coverage watch against the approved roster and approved availability. It is not a ratio calculation and not an AI judgement. The centre manager decides and confirms cover.</Note></div>
    </Modal></Layer>
  );
}

/* ── HR desk: Deirdre's journey through People ─────────────────────────────── */
function HrDesk({ s }: { s: DemoState }) {
  const ella = s.onboarding.find((o) => o.id === "ob-ella");
  const q = ella?.steps.find((x) => x.label === "Qualifications checked");
  const verified = q?.state === "done";
  const requested = !!q && (verified || q.note.toLowerCase().includes("requested"));
  const reviewed = s.events.some((e) => e.action === "reviewed policy sign-offs");
  const pend = s.leave.filter((l) => l.status === "pending").length;
  const rotaTouched = s.approvals.some((a) => !!ROTA[a.id]);
  const tab = activeTab("People", s);
  const steps: { label: string; done: boolean; go: () => void }[] = [
    { label: "Open onboarding", done: tab === "onboarding" || requested, go: () => navigate("People", "onboarding") },
    { label: "Request Ella's certificate", done: requested, go: () => navigate("People", "onboarding") },
    { label: "Verify her qualification", done: verified, go: () => navigate("People", "onboarding") },
    { label: "Review policy sign-offs", done: reviewed, go: () => {
      logEvent({ actor: roleDef(s.role).person, actorKind: "person", action: "reviewed policy sign-offs", target: "Safe Sleep v4.0 register", kind: "people", site: "both", story: "B" });
      navigate("Policies", "versions");
    } },
    { label: pend ? "Decide " + pend + " leave request" + (pend === 1 ? "" : "s") : "Leave decided", done: pend === 0, go: () => navigate("People", "leave") },
    { label: "Update the rota", done: rotaTouched, go: () => navigate("People", "rota") },
  ];
  return (
    <div className="people-desk" role="navigation" aria-label="HR desk">
      <span className="lead"><Icon d={IC.people} size={14} style={{ color: "var(--accent)" }} />HR desk, {steps.filter((x) => x.done).length} of {steps.length} done</span>
      {steps.map((st, i) => (
        <button key={st.label} type="button" className={st.done ? "done" : ""} onClick={st.go}>
          <span className="ix">{st.done ? <Icon d={IC.check} size={10} sw={2.6} /> : i + 1}</span>{st.label}
        </button>
      ))}
    </div>
  );
}

/* ── Tab: Rota ─────────────────────────────────────────────────────────────── */
function Rota({ s, site }: { s: DemoState; site: SiteFilter }) {
  const r = roleDef(s.role);
  const m = metrics(s);
  const [menu, setMenu] = useState<{ staff: string; day: number; left: number; top?: number; bottom?: number } | null>(null);
  const [custom, setCustom] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const conflicts = conflictsFor(s, site, setCover);
  const pending = s.approvals.filter((a) => a.status === "pending" && ROTA[a.id] && inSite(site, a.site));
  const decided = s.approvals.filter((a) => a.status !== "pending" && ROTA[a.id] && inSite(site, a.site)).slice(0, 3);
  const sites = SITES.filter((x) => inSite(site, x));
  const menuStaff = menu ? staffById(menu.staff, s) : undefined;

  const openMenu = (e: MouseEvent<HTMLButtonElement>, st: Staff, d: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 272));
    const below = rect.bottom + 330 < window.innerHeight;
    setCustom("");
    setMenu(below ? { staff: st.id, day: d, left, top: rect.bottom + 6 } : { staff: st.id, day: d, left, bottom: window.innerHeight - rect.top + 6 });
  };
  const choose = (value: string) => {
    if (!menuStaff || !menu) return;
    proposeRota(s, menuStaff, menu.day, value);
    setMenu(null);
  };
  const submitCustom = () => {
    const v = custom.trim();
    if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(v)) { toast("Use the format 10:00-14:00."); return; }
    choose(v);
  };

  return (
    <>
      <PageHead title="Rota" sub={"Week of " + dayLabel(-TODAY_IDX) + ". One roster for both centres, each kept inside its own registration. Changes go to the centre manager before they apply."} right={<><DemoTag />{site !== "all" && <SiteChip site={site} />}</>} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="On duty today" value={<>{m.onDuty}<span className="sh-faint" style={{ fontSize: 15 }}> / {m.staffTotal}</span></>} sub={sites.map((x) => siteName(x) + " " + s.staff.filter((y) => y.site === x && y.status === "on").length).join(", ")} />
        <Stat label="Away today" value={m.away} sub="Sick, leave, training, induction or day off" onClick={() => navigate("People", "leave")} />
        <Stat label="Rota changes awaiting approval" value={pending.length} tone={pending.length ? "gold" : undefined} sub="Nothing changes until a manager approves" />
        <Stat label="Conflicts to resolve" value={conflicts.length} tone={conflicts.some((c) => c.tone === "bad") ? "bad" : conflicts.length ? "warn" : "ok"} sub={m.coverageWatch ? "Includes the After-school coverage watch" : "Coverage watch clear"} />
      </Grid>

      <Grid cols={3} style={{ marginBottom: 12 }}>
        <Card title="Unfilled shift watch" sub="Against the approved roster" right={inSite(site, "bal") ? (s.coverConfirmed ? <Chip tone="ok" dot>Clear</Chip> : <Chip tone="bad" dot>1 open</Chip>) : undefined}>
          {inSite(site, "bal") ? (
            <>
              <div className="people-li" style={{ paddingTop: 0 }}>
                <span className="people-mark" style={{ background: s.coverConfirmed ? "var(--ok)" : "var(--bad)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t">After-school, today 14:00-18:00</div>
                  <div className="d">{s.coverConfirmed ? "Covered by " + (s.staff.find((x) => x.statusNote.startsWith("Covering After-school"))?.name || "approved availability") + ". Watch cleared." : "Watching until cover is confirmed. Room leader off sick."}</div>
                </div>
              </div>
              <Btn size="sm" kind={s.coverConfirmed ? "secondary" : "primary"} icon={IC.people} onClick={() => setCover("bal-afterschool")}>Who's covering this room?</Btn>
            </>
          ) : <Empty title="No open shifts at Elmgrove" hint="Eimear Lynch's floater shift is covered from the roster." />}
        </Card>
        <Card title="Conflicts" sub="Leave rostered, rooms without a leader" right={<Chip tone={conflicts.length ? "warn" : "ok"}>{conflicts.length}</Chip>}>
          {conflicts.length ? (
            <div style={{ maxHeight: 226, overflowY: "auto", margin: "-6px 0" }}>
              {conflicts.map((c) => (
                <div key={c.key} className="people-li">
                  <span className="people-mark" style={{ background: c.tone === "bad" ? "var(--bad)" : "var(--warn)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t">{c.title}</div>
                    <div className="d">{c.detail}</div>
                    {c.fix && <Btn size="sm" kind="ghost" style={{ marginTop: 4, marginLeft: -11 }} icon={IC.arrow} onClick={c.fix}>{c.fixLabel}</Btn>}
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty title="No conflicts this week" />}
        </Card>
        <Card title="Pending manager approval" sub="Rota edits wait here" right={pending.length ? <Chip tone="gold">{pending.length}</Chip> : undefined}>
          {pending.length ? pending.map((a) => {
            const c = ROTA[a.id];
            const st = staffById(c.staff, s);
            const ok = st ? canApproveFor(r, st.site) : false;
            return (
              <div key={a.id} className="people-li">
                <span className="people-mark" style={{ background: "var(--gold)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t">{st?.name}, {dayName(c.day)}</div>
                  <div className="d"><span className="sh-num">{c.prev}</span> to <span className="sh-num">{c.value}</span>. Requested by {personName(a.requestedBy, s)}.</div>
                  <div className="sh-row" style={{ gap: 6, marginTop: 6 }}>
                    {ok ? <>
                      <Btn size="sm" kind="primary" icon={IC.check} onClick={() => approveRota(a.id)}>Approve</Btn>
                      <Btn size="sm" kind="ghost" onClick={() => decide(a.id, "declined")}>Decline</Btn>
                    </> : <Chip tone="gold">Waiting for {personName(a.approver, s)}</Chip>}
                  </div>
                </div>
              </div>
            );
          }) : (
            <>
              <Empty title="Nothing waiting" hint="Click any cell in the week below to propose a change." />
              {decided.map((a) => <div key={a.id} className="people-hint">{a.status === "approved" ? "Approved" : "Declined"} {a.decidedAt}: {a.title.replace("Rota change: ", "")}</div>)}
            </>
          )}
        </Card>
      </Grid>

      <Card title="Week grid" sub="Click a shift to change it. Today is highlighted. Names open the staff record." pad={false}
        right={<span className="people-hint" style={{ maxWidth: 300, textAlign: "right" }}>Eligibility: staff roster into their own centre's rooms. After-school needs school-age induction (TU2021CC067SA).</span>}>
        <div className="sh-scroll-x" style={{ marginTop: 10 }}>
          <table className="people-rota">
            <thead>
              <tr>
                <th className="people-sticky">Staff</th>
                {WEEKDAYS.map((w, d) => <th key={w} className={d === TODAY_IDX ? "today" : ""}>{w}<span>{dayLabel(d - TODAY_IDX)}</span>{d === TODAY_IDX && <em>Today</em>}</th>)}
              </tr>
            </thead>
            <tbody>
              {sites.map((sid) => {
                const siteStaff = s.staff.filter((x) => x.site === sid);
                const groups: { key: string; room: Room | null; staff: Staff[] }[] = ROOMS.filter((x) => x.site === sid).map((x) => ({ key: x.id, room: x, staff: siteStaff.filter((y) => y.room === x.id) }));
                groups.push({ key: sid + "-office", room: null, staff: siteStaff.filter((y) => !y.room) });
                return (
                  <Fragment key={sid}>
                    <tr className="site">
                      <td className="people-sticky"><span className="sname">{siteName(sid)}</span><span className="sreg">{siteById(sid).tusla}{sid === "bal" ? " + " + siteById(sid).extraRegistrations.map((x) => x.ref).join(", ") : ""}</span></td>
                      {WEEKDAYS.map((w, d) => <td key={w} className={d === TODAY_IDX ? "today" : ""}><span className="tot">{siteStaff.filter((x) => rostered(x, d)).length} rostered</span></td>)}
                    </tr>
                    {groups.map((g) => (
                      <Fragment key={g.key}>
                        <tr className="room">
                          <td className="people-sticky">
                            <div className="sh-row" style={{ gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {g.room ? <RecordLink type="room" id={g.room.id}>{g.room.name}</RecordLink> : <span style={{ fontSize: 12.5, color: "var(--ink)" }}>Office and floating</span>}
                                <div className="rmeta">{g.room ? g.room.hours + ", leader " + firstName(personName(g.room.leader, s)) : "Managers, admin, floaters, kitchen"}</div>
                              </div>
                              {g.room && <Btn size="sm" kind="ghost" style={{ height: 24, padding: "0 8px", fontSize: 11 }} onClick={() => setCover(g.room!.id)}>Who's covering?</Btn>}
                            </div>
                          </td>
                          {WEEKDAYS.map((w, d) => {
                            if (!g.room) return <td key={w} className={d === TODAY_IDX ? "today" : ""} />;
                            const room = g.room;
                            const on = g.staff.filter((x) => rostered(x, d));
                            const hasLead = on.some((x) => x.access === "Room Leader");
                            const acting = actingLead(s, room, d);
                            const asGap = room.id === "bal-afterschool" && d === TODAY_IDX && !s.coverConfirmed;
                            return (
                              <td key={w} className={d === TODAY_IDX ? "today" : ""}>
                                {asGap ? <span className="mini bad">14:00 gap</span>
                                  : !on.length ? <span className="mini bad">Nobody rostered</span>
                                  : hasLead ? <span className="mini">{on.length} on</span>
                                  : acting ? <span className="mini ok">Acting lead: {firstName(acting)}</span>
                                  : <span className="mini warn">No leader</span>}
                              </td>
                            );
                          })}
                        </tr>
                        {g.staff.map((st) => (
                          <tr key={st.id}>
                            <td className="people-sticky">
                              <button type="button" className="people-name" onClick={() => openDrawer("staff", st.id)}>
                                <Avatar initials={st.initials} name={st.name} size={24} tone={st.status === "on" ? undefined : STATUS_TONE[st.status]} />
                                <span style={{ minWidth: 0 }}><span className="n">{st.name}</span><span className="r">{st.role}</span></span>
                              </button>
                            </td>
                            {WEEKDAYS.map((w, d) => {
                              const v = cellValue(st, d);
                              const pend = pendingFor(s, st.id, d);
                              const leave = onLeave(s, st.id, d);
                              const absentToday = d === TODAY_IDX && st.status !== "on";
                              const conflict = v !== "Off" && (leave || absentToday) && !(pend && pend.value === "Off");
                              let cls = "people-cell";
                              let label: ReactNode = v.replace(", ", "\n");
                              if (pend) { cls += " pending"; label = <>{pend.value}<small>Pending approval</small></>; }
                              else if (conflict) { cls += " conflict"; label = <>{v}<small>{leave ? "On leave" : STATUS_SHORT[st.status]}</small></>; }
                              else if (absentToday && v === "Off") { cls += " absent" + (st.status === "sick" ? " sick" : ""); label = STATUS_SHORT[st.status]; if (st.status === "off") cls = "people-cell off"; }
                              else if (leave) { cls += " absent"; label = "Leave"; }
                              else if (v === "Off") cls += " off";
                              return (
                                <td key={w} className={d === TODAY_IDX ? "today" : ""}>
                                  <button type="button" className={cls} style={{ whiteSpace: "pre-line" }} onClick={(e) => openMenu(e, st, d)}
                                    title={st.name + ", " + dayName(d) + ": " + v + (pend ? " (pending " + pend.value + ")" : "")}>{label}</button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {menu && menuStaff && (
        <Layer>
          <div className="people-menu-scrim" onClick={() => setMenu(null)} onWheel={() => setMenu(null)} />
          <div className="people-menu" role="dialog" aria-label="Change shift" style={{ left: menu.left, top: menu.top, bottom: menu.bottom }}>
            <div className="h">{menuStaff.name}</div>
            <div className="s">{dayName(menu.day)}. Now: <span className="sh-num">{cellValue(menuStaff, menu.day)}</span>{pendingFor(s, menuStaff.id, menu.day) ? ", change pending" : ""}</div>
            {PRESETS.map((p) => (
              <button key={p} type="button" className={"opt" + (cellValue(menuStaff, menu.day) === p ? " cur" : "")} onClick={() => choose(p)}>
                {p}{cellValue(menuStaff, menu.day) === p && <span style={{ fontFamily: "var(--ui)", fontSize: 10.5 }}>Current</span>}
              </button>
            ))}
            <div className="sh-row" style={{ gap: 6, padding: "6px 2px 0" }}>
              <input className="sh-input" style={{ height: 30, flex: 1, fontFamily: "var(--mono)", fontSize: 12 }} placeholder="e.g. 10:00-14:00" value={custom}
                onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitCustom(); if (e.key === "Escape") setMenu(null); }} aria-label="Custom shift" />
              <Btn size="sm" onClick={submitCustom}>Set</Btn>
            </div>
            {onLeave(s, menuStaff.id, menu.day) && <div className="warnline">On approved leave this day. Rostering a shift will flag a conflict.</div>}
            {menu.day === TODAY_IDX && menuStaff.status !== "on" && menuStaff.status !== "off" && <div className="warnline">{STATUS_LABEL[menuStaff.status]} today. Rostering a shift will flag a conflict.</div>}
            <div className="rule">
              {menuStaff.site === "elm" ? "Eligible for Elmgrove rooms only (TU2015CC365)." : "Eligible for Ballyneety rooms. After-school (TU2021CC067SA) needs school-age induction on file."}{" "}
              {menuStaff.access === "Room Leader" || menuStaff.access === "Site Manager" ? "Can lead a room." : qualLevel(menuStaff.qualification) >= 6 ? "Can act as room lead with manager sign-off." : "Works under a room leader."}{" "}
              Goes to {personName(MANAGER[menuStaff.site], s)} for approval.
            </div>
          </div>
        </Layer>
      )}
      <CoverModal s={s} roomId={cover} onClose={() => setCover(null)} />
    </>
  );
}

/* ── Tab: Team ─────────────────────────────────────────────────────────────── */
function Team({ s, site }: { s: DemoState; site: SiteFilter }) {
  const [siteF, setSiteF] = useState<SiteFilter>("all");
  const [room, setRoom] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const scope: SiteFilter = site === "all" ? siteF : site;
  const inScope = s.staff.filter((x) => inSite(scope, x.site));
  const rows = inScope.filter((x) =>
    (room === "all" || (room === "none" ? !x.room : x.room === room)) &&
    (status === "all" || (status === "away" ? x.status !== "on" : x.status === status)) &&
    (!q || (x.name + " " + x.role + " " + x.qualification).toLowerCase().includes(q.toLowerCase())));
  const roomOpts = [{ id: "all", label: "All rooms" }, ...ROOMS.filter((x) => inSite(scope, x.site)).map((x) => ({ id: x.id, label: x.name + (scope === "all" ? ", " + siteName(x.site) : "") })), { id: "none", label: "Office and floating" }];
  const statusOpts = [{ id: "all", label: "Any status" }, { id: "on", label: "On duty" }, { id: "away", label: "Away today" }, ...AWAY_ORDER.map((x) => ({ id: x, label: STATUS_LABEL[x] }))];
  const cols: Col<Staff>[] = [
    { key: "n", label: "Name", render: (x) => <div className="sh-row" style={{ gap: 10 }}><Avatar initials={x.initials} name={x.name} size={28} /><div style={{ minWidth: 0 }}><div className="strong sh-trunc">{x.name}</div><div style={{ fontSize: 11.5, color: "var(--faint)" }}>{x.role}</div></div></div> },
    { key: "s", label: "Centre", render: (x) => siteName(x.site) },
    { key: "r", label: "Room", render: (x) => (x.room ? roomById(x.room)?.name : <span className="sh-faint">Office / floating</span>) },
    { key: "t", label: "Today", render: (x) => (x.status === "on" ? <Chip tone="ok" dot>{x.shift}</Chip> : <Chip tone={STATUS_TONE[x.status]}>{STATUS_LABEL[x.status]}</Chip>) },
    { key: "c", label: "Contract", render: (x) => <Chip tone={x.contract === "Signed 2026" ? "outline" : "gold"}>{x.contract}</Chip> },
    { key: "v", label: "Vetting", render: (x) => <span style={{ color: x.vetting.status === "Valid" ? "var(--body)" : "var(--warn)" }}>{x.vetting.status}</span> },
    { key: "ss", label: "Safe Sleep v4.0", render: (x) => (x.safeSleepSigned ? <span className="sh-muted">Signed</span> : <Chip tone="warn">Not signed</Chip>) },
  ];
  const counts = SITES.filter((x) => inSite(scope, x)).map((x) => siteName(x) + " " + s.staff.filter((y) => y.site === x).length).join(", ");
  return (
    <>
      <PageHead title="Team" sub="Everyone across both centres in one directory. Open anyone to see their roster, contract, vetting, training and sign-offs together." right={<><DemoTag />{site !== "all" && <SiteChip site={site} />}</>} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Team" value={inScope.length} sub={counts} />
        <Stat label="On duty today" value={inScope.filter((x) => x.status === "on").length} tone="ok" onClick={() => setStatus("on")} />
        <Stat label="Away today" value={inScope.filter((x) => x.status !== "on").length} onClick={() => setStatus("away")} />
        <Stat label="Room leaders" value={inScope.filter((x) => x.access === "Room Leader").length} sub={inScope.filter((x) => x.access === "Site Manager").length + " managers and deputies"} />
      </Grid>
      <Card pad={false}>
        <div className="sh-row" style={{ padding: "14px 16px", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
          {site === "all" && <Segmented options={[{ id: "all" as SiteFilter, label: "Both" }, { id: "elm" as SiteFilter, label: "Elmgrove" }, { id: "bal" as SiteFilter, label: "Ballyneety" }]} value={siteF} onChange={(v) => { setSiteF(v); setRoom("all"); }} />}
          <Sel label="Room" value={room} onChange={setRoom} options={roomOpts} />
          <Sel label="Status" value={status} onChange={setStatus} options={statusOpts} />
          <input className="sh-input" placeholder="Search name, role, qualification" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 200px" }} aria-label="Search team" />
          <span className="people-hint">{rows.length} of {inScope.length}</span>
        </div>
        <Table cols={cols} rows={rows} rowKey={(x) => x.id} onRow={(x) => openDrawer("staff", x.id)} empty="No one matches these filters" />
      </Card>
    </>
  );
}

/* ── Tab: HR onboarding ────────────────────────────────────────────────────── */
function activeIdx(o: Onboarding) { return o.steps.findIndex((x) => x.state === "blocked" || x.state === "current"); }
function completeStep(s: DemoState, o: Onboarding) {
  const i = activeIdx(o);
  if (i < 0) return;
  const label = o.steps[i].label;
  verifyStep(o.id);
  const st = o.staff ? staffById(o.staff, s) : undefined;
  if (st && label === "Qualifications checked") update("staff", st.id, { qualification: st.qualification.replace(/\s*\(.*\)$/, "") + " (certificate verified)" });
  if (st && label === "Ready for the floor") update("staff", st.id, { induction: "Complete", statusNote: "Induction complete, ready for the floor" });
  const next = o.steps.slice(i + 1).find((x) => x.state !== "done");
  toast(o.name + ": " + label.toLowerCase() + " done." + (next ? " Next: " + next.label.toLowerCase() + "." : " Ready for the floor."));
}
function StepActions({ s, o }: { s: DemoState; o: Onboarding }) {
  const i = activeIdx(o);
  if (i < 0) return <Chip tone="ok" dot>Ready for the floor</Chip>;
  const step = o.steps[i];
  const st = o.staff ? staffById(o.staff, s) : undefined;
  if (step.label === "Qualifications checked" && step.state === "blocked") {
    const requested = step.note.toLowerCase().includes("requested");
    return (
      <div className="sh-stack" style={{ gap: 8 }}>
        <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Btn size="sm" kind={requested ? "secondary" : "primary"} icon={IC.file} onClick={() => requestDocument(o.id)}>{requested ? "Request again" : "Request certificate copy"}</Btn>
          <Btn size="sm" kind={requested ? "primary" : "secondary"} icon={IC.check} disabled={!requested} title={requested ? undefined : "Request the certificate copy first"} onClick={() => completeStep(s, o)}>Mark verified</Btn>
        </div>
        <div className="people-hint">{requested ? "Check the copy against the QQI register, then mark it verified." : "Request the copy first. Verification is a person checking the certificate, not the app."}</div>
      </div>
    );
  }
  if (step.label === "Policies read and signed" && st && !st.safeSleepSigned) {
    return (
      <div className="sh-stack" style={{ gap: 8 }}>
        <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Btn size="sm" kind="primary" icon={IC.policies} onClick={() => { signSafeSleep(st.id); toast(st.name + " signed Safe Sleep v4.0 (simulated)."); }}>Simulate Safe Sleep v4.0 signature</Btn>
          <Btn size="sm" disabled title="Safe Sleep v4.0 is still unsigned">Mark policies signed</Btn>
        </div>
        <div className="people-hint">Waiting on Safe Sleep v4.0. Everything else is signed.</div>
      </div>
    );
  }
  const labels: Record<string, string> = {
    "Invite": "Record invite accepted", "Personal details": "Mark details complete", "Contract": "Record contract signed",
    "Garda vetting confirmation": "Record NVB outcome received", "Qualifications checked": "Mark verified", "Policies read and signed": "Mark policies signed",
    "Room induction": "Mark room induction complete", "Ready for the floor": "Mark ready for the floor",
  };
  return (
    <div className="sh-stack" style={{ gap: 8 }}>
      <Btn size="sm" kind="primary" icon={IC.check} onClick={() => completeStep(s, o)} style={{ alignSelf: "flex-start" }}>{labels[step.label] || "Mark complete"}</Btn>
      {step.label === "Garda vetting confirmation" && <div className="people-hint">Records the outcome HR received from the National Vetting Bureau. The app never carries out vetting.</div>}
    </div>
  );
}
function OnboardingCard({ s, o, hero }: { s: DemoState; o: Onboarding; hero?: boolean }) {
  const i = activeIdx(o);
  const step = i >= 0 ? o.steps[i] : null;
  const done = o.steps.filter((x) => x.state === "done").length;
  return (
    <Card title={<span className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>{o.staff ? <RecordLink type="staff" id={o.staff}>{o.name}</RecordLink> : o.name}{step ? <Chip tone={step.state === "blocked" ? "bad" : "accent"} dot>{step.state === "blocked" ? "Stuck at " : "At "}{step.label}</Chip> : <Chip tone="ok">Ready</Chip>}</span>}
      sub={o.role + ", " + siteName(o.site) + ". Start " + o.start + "."} right={<span className="sh-num sh-muted" style={{ fontSize: 12 }}>{done}/{o.steps.length}</span>}
      style={hero ? { borderColor: step?.state === "blocked" ? "var(--bad-soft)" : "var(--accent-line)" } : undefined}>
      <Bar value={done} max={o.steps.length} tone={step?.state === "blocked" ? "warn" : "accent"} style={{ marginBottom: 14 }} />
      <Grid cols="main" gap={18}>
        <Steps steps={o.steps.map((x) => ({ label: x.label, note: x.note, state: x.state }))} />
        <div className="sh-stack" style={{ gap: 12 }}>
          {step && <div>
            <div className="sh-eyebrow" style={{ marginBottom: 6 }}>Now</div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{step.label}</div>
            <div style={{ fontSize: 12.5, color: step.state === "blocked" ? "var(--bad)" : "var(--dim)", marginTop: 3, lineHeight: 1.5 }}>{step.note || "Waiting on HR."}</div>
          </div>}
          <StepActions s={s} o={o} />
          {hero && step?.label === "Qualifications checked" && <Note tone="warn" icon={IC.alert}>Ella cannot work unsupervised until her qualification is on file. Before, this sat in an email thread; now it has an owner, a task and a date.</Note>}
        </div>
      </Grid>
    </Card>
  );
}
function InviteModal({ s, open, onClose, site }: { s: DemoState; open: boolean; onClose: () => void; site: SiteFilter }) {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState(ROOMS.find((x) => inSite(site, x.site))?.id || "elm-toddlers");
  const [role, setRole] = useState("Early Years Educator");
  const room = roomById(roomId);
  const send = () => {
    if (!name.trim() || !room) { toast("Add the new starter's name first."); return; }
    const id = "ob-" + Date.now();
    add("onboarding", { id, name: name.trim(), role: role + ", " + room.name, site: room.site, start: dayLabel(21), staff: null,
      steps: STAGES.map((label, k) => ({ label, state: k === 0 ? "current" : "todo", note: k === 0 ? "Invite sent " + nowLabel() + " (simulated)" : "" })) });
    logEvent({ actor: roleDef(s.role).person, actorKind: "person", action: "sent onboarding invite (simulated)", target: name.trim() + ", " + role + ", " + room.name, kind: "people", site: room.site, story: null });
    toast("Invite created for " + name.trim() + ". Nothing was emailed from the demo.");
    setName("");
    onClose();
  };
  return (
    <Layer><Modal open={open} onClose={onClose} title="Invite a new starter" sub="Creates the onboarding pipeline. The invite email is simulated." width={480}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" icon={IC.arrow} onClick={send}>Create invite</Btn></>}>
      <div className="sh-stack">
        <div><label className="sh-label" htmlFor="ob-name">Full name</label><input id="ob-name" className="sh-input" style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Clíona Murphy" /></div>
        <div><label className="sh-label" htmlFor="ob-role">Role</label>
          <select id="ob-role" className="sh-input" style={{ width: "100%" }} value={role} onChange={(e) => setRole(e.target.value)}>
            {["Early Years Educator", "Room Leader", "After-school Educator", "Cook"].map((x) => <option key={x}>{x}</option>)}
          </select></div>
        <div><label className="sh-label" htmlFor="ob-room">Room</label>
          <select id="ob-room" className="sh-input" style={{ width: "100%" }} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {ROOMS.filter((x) => inSite(site, x.site)).map((x) => <option key={x.id} value={x.id}>{x.name}, {siteName(x.site)}</option>)}
          </select></div>
        <div className="people-hint">Steps: {STAGES.join(", ")}.</div>
      </div>
    </Modal></Layer>
  );
}
function OnboardingTab({ s, site }: { s: DemoState; site: SiteFilter }) {
  const [invite, setInvite] = useState(false);
  const obs = s.onboarding.filter((o) => inSite(site, o.site));
  const ella = obs.find((o) => o.id === "ob-ella");
  const others = obs.filter((o) => o.id !== "ob-ella");
  const atStage = (label: string) => obs.filter((o) => { const i = activeIdx(o); return i >= 0 && o.steps[i].label === label; }).length;
  const blocked = obs.filter((o) => o.steps.some((x) => x.state === "blocked")).length;
  const induction = s.policies.find((p) => p.id === "pol-induction");
  return (
    <>
      <PageHead title="HR onboarding" sub="Invite to ready for the floor, one pipeline per new starter. Each step has an owner and evidence, so nothing waits in an inbox."
        right={<><DemoTag /><Btn size="sm" kind="primary" icon={IC.plus} onClick={() => setInvite(true)}>Invite new starter</Btn></>} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="In onboarding" value={obs.filter((o) => activeIdx(o) >= 0).length} sub={obs.length + " in the pipeline"} />
        <Stat label="Stuck" value={blocked} tone={blocked ? "bad" : "ok"} sub={blocked ? "A document is missing" : "Nothing blocked"} />
        <Stat label="Ready for the floor" value={obs.filter((o) => activeIdx(o) < 0).length} />
        <Stat label="Steps complete" value={obs.reduce((n, o) => n + o.steps.filter((x) => x.state === "done").length, 0) + " / " + obs.reduce((n, o) => n + o.steps.length, 0)} />
      </Grid>
      <Card title="Pipeline" sub="Where each new starter is. Hover a step for its note." pad={false} style={{ marginBottom: 12 }}>
        {obs.length ? (
          <div className="sh-scroll-x" style={{ padding: "6px 16px 10px" }}>
            <table className="people-pipe">
              <thead><tr><th>New starter</th>{STAGES.map((l) => <th key={l}><b>{atStage(l)}</b>{l}</th>)}</tr></thead>
              <tbody>
                {obs.map((o) => (
                  <tr key={o.id}>
                    <td><div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{o.staff ? <RecordLink type="staff" id={o.staff}>{o.name}</RecordLink> : o.name}</div><div style={{ fontSize: 11.5, color: "var(--faint)" }}>{o.role}, {siteName(o.site)}</div></td>
                    {o.steps.map((x) => <td key={x.label}><span className={"people-pip " + x.state} title={x.label + (x.note ? ": " + x.note : "")}>{x.state === "done" ? <Icon d={IC.check} size={11} sw={2.6} /> : x.state === "blocked" ? <Icon d={IC.alert} size={11} sw={2.2} /> : ""}</span></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No one in onboarding at this centre" />}
      </Card>
      <Grid cols="main">
        <div className="sh-stack">
          {ella && <OnboardingCard s={s} o={ella} hero />}
          {others.map((o) => <OnboardingCard key={o.id} s={s} o={o} />)}
        </div>
        <div className="sh-stack">
          <Card title="Garda vetting" sub="What the app does and does not do">
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--body)" }}>Shournagh OS records the outcome of vetting that HR receives from the National Vetting Bureau (NVB): date, status and renewal. It never performs statutory vetting and never contacts the NVB.</div>
          </Card>
          <Card title="How We Do It, for new starters" sub="Role-specific playbooks from Edel's standards">
            {[["New starter week one", "Everyone"], ["Safe sleep checks on the tablet", "Babies and Wobblers"], ["Medication two-person check", "All room staff"], ["Opening the centre", "Room leaders"], ["Ending the day with a parent", "All room staff"]].map(([t, w]) => (
              <button key={t} type="button" className="sh-item click" style={{ width: "100%", border: 0, background: "none", font: "inherit", color: "inherit", textAlign: "left", margin: 0 }} onClick={() => navigate("Policies", "howwedo")}>
                <Icon d={IC.policies} size={14} style={{ color: "var(--accent)" }} />
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13 }}>{t}</span><span style={{ display: "block", fontSize: 11.5, color: "var(--faint)" }}>{w}</span></span>
                <Icon d={IC.chevron} size={13} style={{ color: "var(--faint)" }} />
              </button>
            ))}
            {induction && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--dim)" }}>Induction guide: <RecordLink type="policy" id={induction.id}>{induction.title} v{induction.version}</RecordLink></div>}
          </Card>
          <Card title="Policies a new starter signs" sub="Signed on their phone in week one">
            <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.55 }}>
              {s.policies.filter((p) => p.requiresSignature && p.audience !== "Parents").map((p, k, a) => <Fragment key={p.id}><RecordLink type="policy" id={p.id}>{p.title}</RecordLink>{k < a.length - 1 ? ", " : ""}</Fragment>)}
            </div>
          </Card>
        </div>
      </Grid>
      <InviteModal s={s} open={invite} onClose={() => setInvite(false)} site={site} />
    </>
  );
}

/* ── Tab: Contracts ────────────────────────────────────────────────────────── */
function Contracts({ s, site }: { s: DemoState; site: SiteFilter }) {
  const r = roleDef(s.role);
  const [filter, setFilter] = useState<"all" | "awaiting" | "signed">("all");
  const staff = s.staff.filter((x) => inSite(site, x.site));
  const signed = staff.filter((x) => x.contract === "Signed 2026").length;
  const sentAt = (st: Staff) => s.events.find((e) => e.action === "sent 2026 contract for e-signature (simulated)" && e.target.startsWith(st.name))?.at || null;
  const lastAction = (st: Staff) => s.events.find((e) => e.action.includes("2026 contract") && e.target.startsWith(st.name));
  const rows = staff.filter((x) => filter === "all" || (filter === "signed" ? x.contract === "Signed 2026" : x.contract !== "Signed 2026"));
  const send = (st: Staff) => {
    logEvent({ actor: r.person, actorKind: "person", action: "sent 2026 contract for e-signature (simulated)", target: st.name + ", " + CONTRACT_VERSION, kind: "people", site: st.site, story: null });
    toast("Contract sent to " + st.name + " for e-signature (simulated, nothing sent).");
  };
  const record = (st: Staff) => {
    update("staff", st.id, { contract: "Signed 2026" });
    logEvent({ actor: r.person, actorKind: "person", action: "recorded 2026 contract signed", target: st.name + ", " + CONTRACT_VERSION, kind: "people", site: st.site, story: null });
    toast(st.name + "'s 2026 contract recorded as signed.");
  };
  const cols: Col<Staff>[] = [
    { key: "n", label: "Staff member", render: (x) => <div><RecordLink type="staff" id={x.id}>{x.name}</RecordLink><div style={{ fontSize: 11.5, color: "var(--faint)" }}>{x.role}</div></div> },
    { key: "s", label: "Centre", render: (x) => siteName(x.site) },
    { key: "c", label: "2026 contract", render: (x) => (x.contract === "Signed 2026" ? <Chip tone="ok">Signed 2026</Chip> : sentAt(x) ? <Chip tone="gold" dot>Sent {sentAt(x)}, awaiting</Chip> : <Chip tone="warn">{x.contract}</Chip>) },
    { key: "v", label: "Version", render: () => <span className="sh-num" style={{ fontSize: 12 }}>{CONTRACT_VERSION}</span> },
    { key: "o", label: "Owner", render: () => personName("s02", s) },
    { key: "l", label: "Last action", render: (x) => { const e = lastAction(x); return e ? <span style={{ fontSize: 12 }}>{e.at}, {e.actor}</span> : <span className="sh-faint" style={{ fontSize: 12 }}>{x.contract === "Signed 2026" ? "Signed at renewal" : "Issued, not returned"}</span>; } },
    { key: "a", label: "", align: "r", render: (x) => x.contract === "Signed 2026" ? <Btn size="sm" kind="ghost" icon={IC.file} onClick={() => toast("Sample contract download is simulated. No file is created.")}>Copy</Btn> : (
      <div className="sh-row" style={{ gap: 6, justifyContent: "flex-end" }}>
        <Btn size="sm" icon={IC.message} onClick={() => send(x)}>{sentAt(x) ? "Resend" : "Send for e-signature (simulated)"}</Btn>
        <Btn size="sm" kind="primary" icon={IC.check} onClick={() => record(x)}>Record signed</Btn>
      </div>
    ) },
  ];
  return (
    <>
      <PageHead title="Contracts" sub="2026 contracts for every staff member: who has signed, who is waiting, and who sent it. No more chasing paper copies at the office." right={<><DemoTag /><Btn size="sm" icon={IC.file} onClick={() => toast("Sample contract download is simulated. No file is created.")}>Download sample contract</Btn></>} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Signed 2026" value={<>{signed}<span className="sh-faint" style={{ fontSize: 15 }}> / {staff.length}</span></>} tone={signed === staff.length ? "ok" : undefined} />
        <Stat label="Awaiting signature" value={staff.length - signed} tone={staff.length - signed ? "gold" : "ok"} onClick={() => setFilter("awaiting")} />
        <Stat label="Sent for e-signature" value={staff.filter((x) => x.contract !== "Signed 2026" && sentAt(x)).length} sub="Simulated in the demo" />
        <Stat label="Template" value={CONTRACT_VERSION} sub={"Owner: " + personName("s02", s)} />
      </Grid>
      <Card pad={false}>
        <div className="sh-row" style={{ padding: "14px 16px", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
          <Segmented options={[{ id: "all" as const, label: "All" }, { id: "awaiting" as const, label: "Awaiting" }, { id: "signed" as const, label: "Signed" }]} value={filter} onChange={setFilter} />
          <span style={{ flex: 1 }} />
          <Bar value={signed} max={staff.length || 1} tone="ok" style={{ width: 160 }} />
          <span className="people-hint">{Math.round((signed / Math.max(1, staff.length)) * 100)}% signed</span>
        </div>
        <Table cols={cols} rows={rows} rowKey={(x) => x.id} empty="Every contract is signed" />
      </Card>
      <div style={{ marginTop: 12 }}><Note>E-signature and downloads are simulated in the demo. Recording a signature updates the staff record, the inspection pack and the activity log.</Note></div>
    </>
  );
}

/* ── Tab: Training and vetting ─────────────────────────────────────────────── */
interface DueItem { key: string; st: Staff; kind: string; due: string; days: number | null; title: string; tone: Tone }
function Training({ s, site }: { s: DemoState; site: SiteFilter }) {
  const staff = s.staff.filter((x) => inSite(site, x.site));
  const due: DueItem[] = [];
  staff.forEach((st) => {
    if (st.vetting.status !== "Valid") { const d = daysUntil(st.vetting.date); due.push({ key: "v" + st.id, st, kind: "Garda vetting renewal", due: st.vetting.date, days: d, title: "Garda vetting renewal: " + st.name, tone: "warn" }); }
    if (st.firstAid.startsWith("Expires")) { const lab = st.firstAid.replace("Expires ", ""); const d = daysUntil(lab); due.push({ key: "f" + st.id, st, kind: "Paediatric first aid renewal", due: lab, days: d, title: "First aid renewal: " + st.name, tone: d !== null && d <= 30 ? "warn" : "gold" }); }
    if (/outstanding/i.test(st.qualification)) due.push({ key: "q" + st.id, st, kind: "Qualification copy outstanding", due: "Before unsupervised work", days: null, title: "", tone: "bad" });
  });
  due.sort((a, b) => (a.days ?? -1) - (b.days ?? -1));
  const taskFor = (title: string) => s.tasks.find((t) => t.title === title);
  const remind = (it: DueItem) => {
    const t = addTask(it.title, "s02", it.st.site, it.due, it.days !== null && it.days <= 21 ? "High" : "Medium");
    toast("Reminder task created for " + personName(t.owner, s) + ", due " + it.due + ".");
  };
  const vt = s.tasks.find((t) => t.id === "t-vetting");
  const valid = staff.filter((x) => x.vetting.status === "Valid").length;
  const faSoon = staff.filter((x) => { if (!x.firstAid.startsWith("Expires")) return false; const d = daysUntil(x.firstAid.replace("Expires ", "")); return d !== null && d <= 60; }).length;
  const cf = staff.filter((x) => /^Completed/.test(x.childrenFirst)).length;
  const cols: Col<Staff>[] = [
    { key: "n", label: "Staff member", render: (x) => <div><RecordLink type="staff" id={x.id}>{x.name}</RecordLink><div style={{ fontSize: 11.5, color: "var(--faint)" }}>{siteName(x.site)}{x.room ? ", " + roomById(x.room)?.name : ""}</div></div> },
    { key: "v", label: "Garda vetting (NVB outcome)", render: (x) => x.vetting.status === "Valid" ? <span>Valid <span className="sh-faint">since {x.vetting.date}</span></span> : <Chip tone="warn">{x.vetting.status} {x.vetting.date}</Chip> },
    { key: "f", label: "First aid", render: (x) => x.firstAid.startsWith("Expires") ? <Chip tone="gold">{x.firstAid}</Chip> : <span className="sh-muted">{x.firstAid}</span> },
    { key: "c", label: "Children First", render: (x) => <span className="sh-muted">{x.childrenFirst}</span> },
    { key: "q", label: "Qualification", render: (x) => <span style={{ color: /outstanding/i.test(x.qualification) ? "var(--bad)" : "var(--body)" }}>{x.qualification}</span> },
    { key: "i", label: "Induction", render: (x) => <Chip tone={x.induction === "Complete" ? "outline" : "accent"}>{x.induction}</Chip> },
  ];
  return (
    <>
      <PageHead title="Training and vetting" sub="Vetting outcomes, first aid, Children First and qualifications in one register, with renewals surfaced weeks ahead instead of found at inspection." right={<DemoTag />} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Garda vetting valid" value={<>{valid}<span className="sh-faint" style={{ fontSize: 15 }}> / {staff.length}</span></>} sub={staff.length - valid + " renewal" + (staff.length - valid === 1 ? "" : "s") + " due"} tone={valid === staff.length ? "ok" : undefined} />
        <Stat label="First aid expiring" value={faSoon} tone={faSoon ? "gold" : "ok"} sub="Within 60 days" />
        <Stat label="Children First complete" value={cf + " / " + staff.length} tone={cf === staff.length ? "ok" : "warn"} />
        <Stat label="Qualifications to verify" value={staff.filter((x) => /outstanding/i.test(x.qualification)).length} sub="Copy on file before unsupervised work" onClick={() => navigate("People", "onboarding")} />
      </Grid>
      <Grid cols="main" style={{ marginBottom: 12 }}>
        <Card title="Renewals and gaps" sub="Soonest first. Each one can become a task with an owner and a date." right={vt ? <span className="people-hint">Tracked: <RecordLink type="task" id={vt.id}>{vt.title}</RecordLink></span> : undefined}>
          {due.length ? due.map((it) => {
            const t = it.title ? taskFor(it.title) : undefined;
            return (
              <div key={it.key} className="people-li" style={{ alignItems: "center" }}>
                <span className="people-mark" style={{ background: it.tone === "bad" ? "var(--bad)" : it.tone === "warn" ? "var(--warn)" : "var(--gold)", marginTop: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t"><RecordLink type="staff" id={it.st.id}>{it.st.name}</RecordLink> <span style={{ color: "var(--dim)", fontWeight: 400 }}>{it.kind}</span></div>
                  <div className="d">{it.days !== null ? "Due " + it.due + ", in " + it.days + " days" : it.due}. {siteName(it.st.site)}.</div>
                </div>
                {it.kind.startsWith("Qualification") ? <Btn size="sm" icon={IC.arrow} onClick={() => navigate("People", "onboarding")}>Open onboarding</Btn>
                  : t ? <Chip tone="ok" dot>Task: {personName(t.owner, s).split(" ")[0]}, {t.due}</Chip>
                  : <Btn size="sm" icon={IC.plus} onClick={() => remind(it)}>Create reminder task</Btn>}
              </div>
            );
          }) : <Empty title="Nothing due" hint="All vetting, first aid and qualifications are current." />}
        </Card>
        <Card title="How vetting is handled">
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--body)" }}>HR submits vetting through the National Vetting Bureau as today. When the disclosure comes back, HR records the outcome and renewal date here. Shournagh OS never carries out statutory vetting.</div>
          <div className="people-hint" style={{ marginTop: 10 }}>Children First training is recorded from the Tusla e-learning certificate each person uploads.</div>
        </Card>
      </Grid>
      <Card title="Register" sub="Every staff member in scope" pad={false}>
        <div style={{ paddingTop: 8 }}><Table cols={cols} rows={staff} rowKey={(x) => x.id} onRow={(x) => openDrawer("staff", x.id)} /></div>
      </Card>
    </>
  );
}

/* ── Tab: Leave and cover ──────────────────────────────────────────────────── */
function Leave({ s, site }: { s: DemoState; site: SiteFilter }) {
  const r = roleDef(s.role);
  const m = metrics(s);
  const [cover, setCover] = useState<string | null>(null);
  const reqs = s.leave.filter((l) => { const st = staffById(l.staff, s); return st ? inSite(site, st.site) : false; });
  const pend = reqs.filter((l) => l.status === "pending");
  const away = s.staff.filter((x) => inSite(site, x.site) && x.status !== "on");
  const ap = s.approvals.find((a) => a.id === "ap-cover");
  const avail = s.staff.filter((x) => inSite(site, x.site) && (/approved availability/i.test(x.statusNote) || /^Covering /.test(x.statusNote)));
  const canConfirm = r.id === "owner" || r.id === "manager-bal";
  const decideL = (l: LeaveRequest, st: "approved" | "declined") => {
    decideLeave(l.id, st);
    toast((st === "approved" ? "Approved" : "Declined") + ": " + personName(l.staff, s) + ", " + l.dates + "." + (st === "approved" && l.cover ? " Cover: " + l.cover.replace(/^Proposed: /, "") + "." : ""));
  };
  const cols: Col<LeaveRequest>[] = [
    { key: "n", label: "Staff member", render: (l) => { const st = staffById(l.staff, s); return <div><RecordLink type="staff" id={l.staff}>{personName(l.staff, s)}</RecordLink><div style={{ fontSize: 11.5, color: "var(--faint)" }}>{st ? siteName(st.site) + (st.room ? ", " + roomById(st.room)?.name : "") : ""}</div></div>; } },
    { key: "d", label: "Dates", render: (l) => <span className="strong">{l.dates}</span> },
    { key: "k", label: "Type", render: (l) => l.kind },
    { key: "c", label: "Cover", render: (l) => <span style={{ fontSize: 12.5 }}>{l.cover}</span> },
    { key: "s", label: "Status", render: (l) => <Chip tone={l.status === "approved" ? "ok" : l.status === "declined" ? "neutral" : "gold"}>{l.status === "pending" ? "Pending" : l.status === "approved" ? "Approved" : "Declined"}</Chip> },
    { key: "a", label: "", align: "r", render: (l) => l.status === "pending" ? <div className="sh-row" style={{ gap: 6, justifyContent: "flex-end" }}><Btn size="sm" kind="primary" icon={IC.check} onClick={() => decideL(l, "approved")}>Approve</Btn><Btn size="sm" kind="ghost" onClick={() => decideL(l, "declined")}>Decline</Btn></div> : null },
  ];
  return (
    <>
      <PageHead title="Leave and cover" sub="Requests, today's absences and cover in one place. Cover comes from approved availability, and the manager confirms it." right={<DemoTag />} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Away today" value={m.away} sub={AWAY_ORDER.map((x) => { const n = away.filter((y) => y.status === x).length; return n ? n + " " + STATUS_LABEL[x].toLowerCase() : ""; }).filter(Boolean).join(", ")} />
        <Stat label="Leave requests pending" value={pend.length} tone={pend.length ? "gold" : "ok"} />
        <Stat label="Coverage watch" value={m.coverageWatch ? "1 open" : "Clear"} tone={m.coverageWatch ? "bad" : "ok"} sub="Against the approved roster" onClick={() => setCover("bal-afterschool")} />
        <Stat label="On duty today" value={m.onDuty + " / " + m.staffTotal} />
      </Grid>
      <Grid cols="main" style={{ marginBottom: 12 }}>
        <Card title="After-school cover request" sub={"Ballyneety school-age service, today 14:00-18:00"} right={ap ? <Chip tone={ap.status === "approved" ? "ok" : ap.status === "declined" ? "neutral" : "bad"} dot>{ap.status === "approved" ? "Confirmed " + (ap.decidedAt || "") : ap.status === "declined" ? "Declined" : "Coverage watch open"}</Chip> : undefined}>
          {inSite(site, "bal") && ap ? (
            <>
              <div className="people-answer" style={{ marginBottom: 12 }}>
                {ap.status === "approved"
                  ? <><b>{s.staff.find((x) => x.statusNote.startsWith("Covering After-school"))?.name || "Cover"}</b> confirmed for 14:00-18:00. The coverage watch is clear and the rota is updated.</>
                  : <>{ap.detail}</>}
              </div>
              <KV rows={[["Requested by", ap.requestedBy], ["Approver", personName(ap.approver, s)], ["Linked room", <RecordLink key="r" type="room" id="bal-afterschool">After-school</RecordLink>]]} />
              <div className="sh-row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <Btn size="sm" icon={IC.people} onClick={() => setCover("bal-afterschool")}>Who's covering this room?</Btn>
                {ap.status === "pending" && <Btn size="sm" kind="primary" icon={IC.check} disabled={!canConfirm} title={canConfirm ? undefined : "The centre manager confirms cover"} onClick={() => decide("ap-cover", "approved")}>Confirm cover</Btn>}
                {ap.status === "pending" && !canConfirm && <span className="people-hint">{personName(ap.approver, s)} confirms cover.</span>}
              </div>
            </>
          ) : <Empty title="No cover requests at this centre" />}
        </Card>
        <Card title="Cover from approved availability" sub="Staff who have offered extra hours, approved by their manager">
          {avail.length ? avail.map((x) => (
            <div key={x.id} className="people-li">
              <Avatar initials={x.initials} name={x.name} size={28} tone={/^Covering/.test(x.statusNote) ? "accent" : "gold"} />
              <div style={{ flex: 1, minWidth: 0 }}><RecordLink type="staff" id={x.id}>{x.name}</RecordLink><div className="d">{x.statusNote}. {x.qualification}, {siteName(x.site)}.</div></div>
            </div>
          )) : <Empty title="No approved availability in scope" />}
          <div className="people-hint" style={{ marginTop: 8 }}>Suggestions only come from availability a manager has approved. Nothing is decided automatically.</div>
        </Card>
      </Grid>
      <Grid cols="main">
        <Card title="Leave requests" sub="Approving updates the rota and the staff record" pad={false}>
          <div style={{ paddingTop: 8 }}><Table cols={cols} rows={reqs} rowKey={(l) => l.id} empty="No leave requests" /></div>
        </Card>
        <Card title={"Today's absences, " + TODAY_LABEL}>
          {away.length ? AWAY_ORDER.filter((x) => away.some((y) => y.status === x)).map((x) => (
            <div key={x} style={{ marginBottom: 10 }}>
              <div className="sh-eyebrow" style={{ marginBottom: 4 }}>{STATUS_LABEL[x]}</div>
              {away.filter((y) => y.status === x).map((y) => (
                <div key={y.id} className="people-li" style={{ padding: "7px 0" }}>
                  <Avatar initials={y.initials} name={y.name} size={24} tone={STATUS_TONE[x]} />
                  <div style={{ flex: 1, minWidth: 0 }}><RecordLink type="staff" id={y.id}>{y.name}</RecordLink><div className="d">{y.statusNote || STATUS_LABEL[x]}</div></div>
                  <SiteChip site={y.site} />
                </div>
              ))}
            </div>
          )) : <Empty title="Everyone is in today" />}
        </Card>
      </Grid>
      <CoverModal s={s} roomId={cover} onClose={() => setCover(null)} />
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function People() {
  const s = useDemo();
  useEffect(() => {
    s.approvals.forEach((a) => { if (a.status === "approved" && ROTA[a.id] && !ROTA[a.id].applied) applyRotaChange(a.id); });
  }, [s.approvals]);
  const role = roleDef(s.role);
  const tab = activeTab("People", s);
  const site = effectiveSite(s);
  if (!role.pages.includes("People")) {
    return <Page><PageHead title="People" right={<DemoTag />} /><Restricted what="People" /></Page>;
  }
  return (
    <Page>
      {role.id === "hr" && <HrDesk s={s} />}
      {tab === "rota" && <Rota s={s} site={site} />}
      {tab === "team" && <Team s={s} site={site} />}
      {tab === "onboarding" && <OnboardingTab s={s} site={site} />}
      {tab === "contracts" && <Contracts s={s} site={site} />}
      {tab === "training" && <Training s={s} site={site} />}
      {tab === "leave" && <Leave s={s} site={site} />}
    </Page>
  );
}
