/* Families: website enquiry to enrolment, bookings against planning places,
   permission-scoped child records, parent messaging, consents and the parent
   app preview. Every action goes through the shared store, so Home, Work and
   Activity move with it. All children and families are fictional. */
import { useState, type DragEvent, type ReactNode } from "react";
import {
  useDemo, activeTab, effectiveSite, inSite, roleDef, childById, familyById, guardiansOf, primaryGuardian, staffById, roomById,
  siteById, personName, moveEnquiry, ENQUIRY_FLOW, ENQUIRY_LABEL, sendMessage, logEvent, toast, update, add, openDrawer, setRole,
  nowLabel, type DemoState,
} from "../store";
import { ROOMS, WEEKDAYS, TODAY_IDX, dayLabel } from "../seed";
import type { Child, Enquiry, EnquiryStatus, Message, Room, SiteFilter, SiteId } from "../types";
import {
  Page, PageHead, Grid, Card, Stat, Chip, DemoTag, SiteChip, Bar, Btn, Segmented, Table, Empty, Note, RecordLink, Steps, Modal,
  Restricted, Icon, IC, type Col, type Tone,
} from "../ui";
import { ParentPhone } from "../surfaces/ParentApp";
import "./families.css";

/* ── shared helpers ────────────────────────────────────────────────────────── */
const actor = (s: DemoState) => roleDef(s.role).person;
const listText = (xs: string[]) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
const kidShort = (c: Child) => c.first + " " + c.last.charAt(0) + ".";
const firstOf = (n: string) => n.split(" ")[0];
const ROUTINE_KINDS = ["arrival", "meal", "drink", "sleep", "nappy", "activity"];

function regFor(roomId: string): string {
  const r = roomById(roomId);
  if (!r) return "";
  if (r.programme === "afterschool") return siteById("bal").extraRegistrations[0]?.ref || "";
  return siteById(r.site).tusla;
}

interface DayCap { d: string; i: number; wants: boolean; booked: number; places: number }
function capacityFor(e: Enquiry) {
  const room = roomById(e.room);
  const days: DayCap[] = room ? WEEKDAYS.map((d, i) => ({ d, i, wants: e.days.includes(d), booked: room.bookedByDay[i], places: room.placesPerDay })) : [];
  const conflicts = days.filter((x) => x.wants && x.booked + 1 > x.places).map((x) => x.d);
  return { room, days, conflicts };
}

/** Move an enquiry, but never offer or enrol into a day that is already at planning places. */
function tryMove(e: Enquiry, to: EnquiryStatus) {
  if (e.status === to) return;
  const holding = e.status === "offered" || e.status === "enrolled";
  if ((to === "offered" || to === "enrolled") && !holding) {
    const cap = capacityFor(e);
    if (cap.conflicts.length) {
      logEvent({ actor: "Capacity check", actorKind: "system", action: "blocked a double booking", target: e.child + ", " + (cap.room ? cap.room.name : "room") + " full on " + listText(cap.conflicts), kind: "data", site: e.site, story: "F" });
      toast("Not moved. " + (cap.room ? cap.room.name : "The room") + " would exceed planning places on " + listText(cap.conflicts) + ". Change days or waitlist.");
      return;
    }
  }
  const wasNewDoyle = e.id === "enq-doyle" && e.status === "new";
  moveEnquiry(e.id, to);
  toast(e.parent + " moved to " + ENQUIRY_LABEL[to] + "." + (wasNewDoyle ? " The Home exception is resolved." : ""));
}

const SHORT_NEXT: Record<EnquiryStatus, string> = { new: "New", contacted: "Contacted", visit: "Visit", offered: "Offer", enrolled: "Enrol", waitlist: "Waitlist" };
const OWNER_OPTIONS: Record<SiteId, string[]> = { elm: ["s01", "s02", "edel"], bal: ["s18", "s29", "s02", "edel"] };
function assignOwner(s: DemoState, e: Enquiry, owner: string) {
  if (owner === e.owner) return;
  update("enquiries", e.id, { owner });
  logEvent({ actor: actor(s), actorKind: "person", action: "assigned enquiry follow-up to " + personName(owner, s), target: e.parent + " (" + e.child + ")", kind: "people", site: e.site, story: "F" });
  toast("Follow-up for " + e.parent + " is now with " + personName(owner, s) + ".");
}

const WEB_ENQUIRIES: Omit<Enquiry, "id" | "status" | "received" | "owner" | "source">[] = [
  { parent: "Niamh Foley", child: "Cara Foley", childAge: "8 months", programme: "Full day care, Babies", site: "elm", room: "elm-babies", days: ["Mon", "Thu"], start: "Feb 2027", note: "Back to work in February. Asked about settling-in and bottle routines." },
  { parent: "Gavin Spillane", child: "Rosa Spillane", childAge: "2 years 9 months", programme: "ECCE playschool", site: "bal", room: "bal-wrens", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: "Sep 2027", note: "First ECCE year. Asked whether lunch club runs every day." },
  { parent: "Deborah Linehan", child: "Max Linehan", childAge: "1 year 4 months", programme: "Full day care, Wobblers", site: "elm", room: "elm-wobblers", days: ["Tue", "Wed", "Thu"], start: "Mar 2027", note: "Flexible on days if Tuesday is tight." },
];

const CONSENTS: { key: keyof Child["consents"]; label: string; form: string }[] = [
  { key: "photos", label: "Photos", form: "Photo and video consent v2.0" },
  { key: "sunscreen", label: "Sunscreen", form: "Sunscreen application consent v1.2" },
  { key: "outings", label: "Outings", form: "Outings and local walks consent v3.0" },
  { key: "firstAid", label: "First aid", form: "First aid and emergency care consent v1.1" },
];
const missingOf = (c: Child) => CONSENTS.filter((k) => !c.consents[k.key]);

function Pattern({ days }: { days: string[] }) {
  return <span className="fam-pattern" aria-label={days.join(", ")}>{WEEKDAYS.map((d) => <i key={d} className={days.includes(d) ? "on" : ""}>{d.charAt(0)}</i>)}</span>;
}
function Ticks({ c }: { c: Child }) {
  const miss = missingOf(c);
  return (
    <span className="sh-row" style={{ gap: 7 }} title={miss.length ? "Missing: " + miss.map((m) => m.label).join(", ") : "All four consents held"}>
      <span className="fam-ticks">{CONSENTS.map((k) => <i key={k.key} className={c.consents[k.key] ? "" : "no"} />)}</span>
      <span className="sh-num" style={{ fontSize: 11.5, color: miss.length ? "var(--bad)" : "var(--dim)" }}>{4 - miss.length}/4</span>
    </span>
  );
}
function attendanceChip(c: Child) {
  if (!c.attendingToday) return <Chip tone="outline">Not booked today</Chip>;
  if (c.checkedOut) return <Chip tone="neutral">Collected {c.checkedOut}</Chip>;
  if (c.checkedIn) return <Chip tone="ok" dot>In since {c.checkedIn}</Chip>;
  return <Chip tone="warn">Expected {c.expected}</Chip>;
}

function RestrictedTab({ title, sub }: { title: string; sub: string }) {
  return <><PageHead title={title} sub={sub} right={<DemoTag />} /><Restricted what="Child records" /></>;
}

/* ══ ENQUIRIES ══════════════════════════════════════════════════════════════ */
function EnquiryCard({ s, e }: { s: DemoState; e: Enquiry }) {
  const cap = capacityFor(e);
  const idx = ENQUIRY_FLOW.indexOf(e.status);
  const next: EnquiryStatus | null = e.status === "waitlist" ? "contacted" : idx >= 0 && idx < ENQUIRY_FLOW.length - 1 ? ENQUIRY_FLOW[idx + 1] : null;
  const owners = Array.from(new Set([e.owner].concat(OWNER_OPTIONS[e.site])));
  return (
    <div className={"fam-card" + (e.id === "enq-doyle" ? " hero" : "")} draggable role="button" tabIndex={0}
      onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", e.id); ev.dataTransfer.effectAllowed = "move"; }}
      onClick={() => openDrawer("enquiry", e.id)} onKeyDown={(ev) => { if (ev.key === "Enter") openDrawer("enquiry", e.id); }}
      aria-label={"Enquiry from " + e.parent + ", " + ENQUIRY_LABEL[e.status]}>
      <div className="fam-card-top"><span className="nm sh-trunc">{e.parent}</span><span className="fam-site">{e.site === "elm" ? "Elm" : "Bal"}</span></div>
      <div className="sb">{e.child}, {e.childAge}</div>
      <div className="sb">{cap.room ? cap.room.name : e.programme}, from {e.start}</div>
      <div className="fam-days">
        {cap.days.map((d) => {
          const full = d.wants && d.booked + 1 > d.places;
          return <span key={d.d} className={"fam-day" + (d.wants ? (full ? " full" : " want") : "")} title={d.d + ": " + d.booked + " of " + d.places + " booked" + (d.wants ? (full ? ", would exceed" : ", fits") : "")}>{d.d.slice(0, 2)}</span>;
        })}
      </div>
      {e.status !== "enrolled" && e.status !== "waitlist" && cap.conflicts.length > 0 && <div className="fam-flag bad">Full on {listText(cap.conflicts)}. Offer is blocked until days change.</div>}
      {e.status === "waitlist" && <div className="fam-flag"><b style={{ color: "var(--ink)", fontWeight: 600 }}>Waitlist reason. </b>{cap.conflicts.length ? listText(cap.conflicts) + " full in " + (cap.room ? cap.room.name : "the room") + ". " : ""}{e.note}</div>}
      {e.status === "enrolled" && <div className="fam-flag">Place held from {e.start}.</div>}
      <div className="fam-card-foot" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
        <select className="fam-sel" value={e.owner} aria-label="Follow-up owner" onChange={(ev) => assignOwner(s, e, ev.target.value)}>
          {owners.map((o) => { const n = personName(o, s).split(" "); return <option key={o} value={o}>Owner: {n[0]} {n.length > 1 ? n[n.length - 1].charAt(0) + "." : ""}</option>; })}
        </select>
        <div className="fam-acts">
          {next && <Btn size="sm" onClick={() => tryMove(e, next)} title={"Move to " + ENQUIRY_LABEL[next]}>{SHORT_NEXT[next]}<Icon d={IC.arrow} size={11} /></Btn>}
          {e.status !== "waitlist" && e.status !== "enrolled" && <Btn size="sm" kind="ghost" onClick={() => tryMove(e, "waitlist")}>Waitlist</Btn>}
        </div>
      </div>
    </div>
  );
}

function DoyleStory({ s, e }: { s: DemoState; e: Enquiry }) {
  const cap = capacityFor(e);
  const ex = s.exceptions.find((x) => x.id === "x-enquiry");
  const task = s.tasks.find((t) => t.id === "t-doyle");
  const stage = ENQUIRY_FLOW.indexOf(e.status);
  const fn = firstOf(e.child);
  const pn = firstOf(e.parent);
  const roomStaff = s.staff.filter((x) => x.room === e.room && x.status === "on");
  const loads = roomStaff.map((x) => ({ x, n: s.children.filter((c) => c.keyworker === x.id).length })).sort((a, b) => a.n - b.n);
  const kw = loads[0];
  const packSent = s.events.some((ev) => ev.action === "sent enrolment pack (simulated)" && ev.target.indexOf(e.child) >= 0);
  const docState = (): { label: string; tone: Tone } => (e.status === "enrolled" ? { label: "Received", tone: "ok" } : packSent ? { label: "Requested", tone: "gold" } : { label: "Not yet", tone: "neutral" });
  const docs = [
    "Registration form and booking days (" + e.days.join(", ") + ")",
    "Guardian contacts and an emergency contact",
    "Consents: photos, sunscreen, outings, first aid",
    "Collection authorisation: named collectors",
    "Health and allergy information (care plan only if needed)",
    "NCS award reference, if claiming the subsidy",
  ];
  const primary: { label: string; to: EnquiryStatus } | null =
    e.status === "new" ? { label: "Called back: mark Contacted", to: "contacted" }
      : e.status === "contacted" ? { label: "Visit arranged", to: "visit" }
        : e.status === "visit" ? { label: "Offer the place", to: "offered" }
          : e.status === "offered" ? { label: "Mark enrolled", to: "enrolled" } : null;
  const sendPack = () => {
    logEvent({ actor: actor(s), actorKind: "person", action: "sent enrolment pack (simulated)", target: e.parent + " for " + e.child + ", forms and consents", kind: "people", site: e.site, story: "F" });
    toast("Enrolment pack sent to " + e.parent + " (simulated). Documents now show as requested.");
  };
  const steps: { label: string; note: string; state: "done" | "current" | "todo" | "blocked" }[] = [
    { label: "Visit with " + pn + ", before Christmas", note: stage >= 3 ? "Visited" : stage === 2 ? "Visit arranged" : "Offer a visit on the callback", state: stage >= 3 ? "done" : stage === 2 ? "current" : "todo" },
    { label: "Mon 4 Jan: one hour, " + pn + " stays in the room", note: (kw ? firstOf(kw.x.name) : "The keyworker") + " learns " + fn + "'s routines", state: e.status === "enrolled" ? "current" : "todo" },
    { label: "Wed 6 Jan: morning until lunch", note: "Short goodbye at the door", state: "todo" },
    { label: "Fri 8 Jan: first full day", note: "Daily notes in the parent app from day one", state: "todo" },
  ];
  return (
    <section className="sh-card" style={{ marginBottom: 12 }}>
      <div className="fam-story-h">
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <h2>{e.parent} wants a {cap.room ? cap.room.name : ""} place for {fn}</h2>
          <p>{e.source}, {e.received.toLowerCase()}. {e.childAge}, {listText(e.days)} from {e.start}.</p>
        </div>
        <div className="sh-row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Chip tone={e.status === "new" ? "warn" : "accent"}>{ENQUIRY_LABEL[e.status]}</Chip>
          {ex && (ex.status === "resolved" ? <Chip tone="ok">Home exception resolved</Chip> : <Chip tone="gold">On Edel's Home: callback due {task ? task.due : "11:00"}</Chip>)}
          <DemoTag />
        </div>
      </div>
      <div className="sh-card-b">
        <Grid cols="main" gap={16}>
          <div className="sh-stack" style={{ gap: 14 }}>
            <div className="fam-quote">"{e.note}"</div>
            <div>
              <div className="fam-sub">Capacity check, {cap.room ? cap.room.name : "room"} at {siteById(e.site).name} (planning places, not a ratio rule)</div>
              <div className="fam-cap">
                {cap.days.map((d) => {
                  const full = d.wants && d.booked + 1 > d.places;
                  return (
                    <div key={d.d} className={"fam-capc" + (d.wants ? (full ? " full" : " want") : "")}>
                      <div className="d">{d.d}</div>
                      <div className="v">{d.wants && !full ? d.booked + 1 : d.booked}/{d.places}</div>
                      <div className="x">{d.wants ? (full ? "Would exceed" : "Fits") : "Not asked"}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: cap.conflicts.length ? "var(--bad)" : "var(--dim)", marginTop: 8 }}>
                {cap.conflicts.length ? "Would exceed on " + listText(cap.conflicts) + ". An offer is blocked until the days change." : "Fits on all " + e.days.length + " requested days. Source: Acorn Cloud bookings."}
              </div>
            </div>
            {task && (
              <div className="sh-row" style={{ gap: 10, flexWrap: "wrap" }}>
                <RecordLink type="task" id={task.id}>{task.title}</RecordLink>
                <span style={{ fontSize: 12, color: "var(--dim)" }}>{personName(task.owner, s)}, due {task.due}, {task.checklist.filter((c) => c.done).length} of {task.checklist.length} steps</span>
                <Chip tone={task.status === "done" ? "ok" : "neutral"}>{task.status === "done" ? "Done " + (task.doneAt || "") : "Open"}</Chip>
              </div>
            )}
            <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
              {primary && <Btn kind="primary" icon={IC.check} onClick={() => tryMove(e, primary.to)}>{primary.label}</Btn>}
              {e.status === "offered" && !packSent && <Btn icon={IC.file} onClick={sendPack}>Send enrolment pack (simulated)</Btn>}
              <Btn kind="ghost" icon={IC.link} onClick={() => openDrawer("enquiry", e.id)}>Open enquiry</Btn>
            </div>
          </div>
          <div className="sh-stack" style={{ gap: 14 }}>
            <div>
              <div className="fam-sub">Future care plan for {fn} (draft, the room leader decides)</div>
              <dl className="sh-kv">
                <dt>Room</dt><dd>{cap.room ? <RecordLink type="room" id={cap.room.id}>{cap.room.name}, {siteById(e.site).name}</RecordLink> : e.programme}</dd>
                <dt>Keyworker</dt><dd>{kw ? <><RecordLink type="staff" id={kw.x.id}>{kw.x.name}</RecordLink><span style={{ color: "var(--dim)" }}> (suggested, {kw.n} key children now)</span></> : "To be assigned"}</dd>
                <dt>Room leader</dt><dd>{cap.room ? personName(cap.room.leader, s) : ""}</dd>
                <dt>Days</dt><dd>{e.days.join(", ")}, {cap.room ? cap.room.hours : ""}</dd>
              </dl>
            </div>
            <div>
              <div className="fam-sub">Settling-in plan</div>
              <Steps steps={steps} />
            </div>
            <div>
              <div className="fam-sub">Documents needed</div>
              <div className="fam-docs">
                {docs.map((d) => { const st = docState(); return <div key={d} className="fam-doc"><Icon d={IC.file} size={13} style={{ color: "var(--faint)" }} /><span className="t">{d}</span><Chip tone={st.tone}>{st.label}</Chip></div>; })}
              </div>
            </div>
          </div>
        </Grid>
      </div>
    </section>
  );
}

function EnquiriesTab({ s, site }: { s: DemoState; site: SiteFilter }) {
  const [over, setOver] = useState<EnquiryStatus | null>(null);
  const rows = s.enquiries.filter((e) => inSite(site, e.site));
  const cols: EnquiryStatus[] = ENQUIRY_FLOW.concat(["waitlist"]);
  const nextTpl = WEB_ENQUIRIES.find((t) => inSite(site, t.site) && !s.enquiries.some((e) => e.parent === t.parent));
  const newCount = rows.filter((e) => e.status === "new").length;
  const doyle = rows.find((e) => e.id === "enq-doyle");
  const simulate = () => {
    if (!nextTpl) return;
    const e: Enquiry = { ...nextTpl, id: "enq-web-" + Date.now(), status: "new", received: "Today " + nowLabel(), owner: siteById(nextTpl.site).manager, source: "Website enquiry form" };
    add("enquiries", e);
    logEvent({ actor: "Website form", actorKind: "system", action: "new enquiry received", target: e.parent + ", " + e.programme + " at " + siteById(e.site).name, kind: "data", site: e.site, story: "F" });
    toast("New website enquiry from " + e.parent + ". It lands in New, owned by " + personName(e.owner, s) + ".");
  };
  const onDrop = (ev: DragEvent<HTMLDivElement>, col: EnquiryStatus) => {
    ev.preventDefault();
    setOver(null);
    const e = s.enquiries.find((x) => x.id === ev.dataTransfer.getData("text/plain"));
    if (e) tryMove(e, col);
  };
  const open = rows.filter((e) => e.status !== "enrolled" && e.status !== "waitlist").length;
  return (
    <>
      <PageHead title="Enquiries" sub="The website form drops straight into this inbox. Every enquiry has an owner, a capacity check and a next step, so no family waits on a missed callback."
        right={<><DemoTag /><Chip tone={newCount ? "warn" : "ok"}>{newCount} new</Chip><Btn icon={IC.plus} onClick={simulate} disabled={!nextTpl} title={nextTpl ? "Adds a sample website enquiry" : "All sample enquiries added"}>Simulate website enquiry</Btn></>} />
      {doyle && <DoyleStory s={s} e={doyle} />}
      <Card title="Pipeline" sub="Drag a card or use its arrow. Offers and enrolments check planning places first, so a day is never double booked."
        right={<span style={{ fontSize: 12, color: "var(--dim)" }}>{open} in progress, {rows.filter((e) => e.status === "waitlist").length} waitlisted</span>}>
        <div className="fam-board">
          {cols.map((col) => {
            const items = rows.filter((e) => e.status === col);
            return (
              <div key={col} className={"fam-col" + (over === col ? " over" : "") + (col === "waitlist" ? " wait" : "")}
                onDragOver={(ev) => { ev.preventDefault(); if (over !== col) setOver(col); }}
                onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setOver(null); }}
                onDrop={(ev) => onDrop(ev, col)}>
                <div className="fam-col-h"><span>{col === "new" ? "New (inbox)" : ENQUIRY_LABEL[col]}</span><span className="n">{items.length}</span></div>
                {items.map((e) => <EnquiryCard key={e.id} s={s} e={e} />)}
                {!items.length && <div className="fam-col-empty">{col === "new" ? "Inbox clear" : "Drop here"}</div>}
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

/* ══ ENROLMENTS ═════════════════════════════════════════════════════════════ */
interface Service { id: string; site: SiteId; label: string; ref: string; capLabel: string; rooms: string[] }
function serviceList(): Service[] {
  const elm = siteById("elm");
  const bal = siteById("bal");
  const sa = bal.extraRegistrations[0];
  return [
    { id: "elm", site: "elm", label: "Elmgrove full day care", ref: elm.tusla, capLabel: elm.capacityLabel + " " + elm.capacity, rooms: ROOMS.filter((r) => r.site === "elm").map((r) => r.id) },
    { id: "bal", site: "bal", label: "Ballyneety sessional ECCE", ref: bal.tusla, capLabel: bal.capacityLabel + " " + bal.capacity, rooms: ROOMS.filter((r) => r.site === "bal" && r.programme === "ecce").map((r) => r.id) },
    { id: "sa", site: "bal", label: "Ballyneety school-age", ref: sa ? sa.ref : "", capLabel: "Separate registration, places not added to the " + bal.capacity, rooms: ROOMS.filter((r) => r.programme === "afterschool").map((r) => r.id) },
  ];
}
function fundingRef(c: Child, s: DemoState) {
  const parts: string[] = [];
  if (c.funding.includes("NCS")) parts.push("NCS award ref: on file (masked)");
  if (c.funding.includes("ECCE")) parts.push("ECCE: registered, Early Years Hive (manual)");
  if (c.funding === "Private") parts.push("Private fees, no scheme");
  return { text: parts.join(". "), open: s.funding.find((f) => f.child === c.id && f.status !== "reviewed") };
}
function enrolmentTodo(c: Child, s: DemoState): { text: string; owner: string } | null {
  const f = s.funding.find((x) => x.child === c.id && x.status !== "reviewed");
  if (f) return { text: f.scheme + " check, due " + dayLabel(5), owner: f.reviewer || "s02" };
  if (missingOf(c).length) return { text: "Consent form due " + dayLabel(7), owner: siteById(c.site).manager };
  return null;
}

function EnrolmentsTab({ s, site }: { s: DemoState; site: SiteFilter }) {
  const all = serviceList().filter((x) => inSite(site, x.site));
  const [svc, setSvc] = useState(all[0] ? all[0].id : "elm");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const cur = all.find((x) => x.id === svc) || all[0];
  const scoped = s.children.filter((c) => inSite(site, c.site));
  const needle = q.trim().toLowerCase();
  const kids = cur ? s.children.filter((c) => cur.rooms.includes(c.room) && (!needle || (c.first + " " + c.last + " " + (familyById(c.family, s)?.name || "")).toLowerCase().includes(needle))) : [];
  const shown = showAll || needle ? kids : kids.slice(0, 12);
  const pipeline = s.enquiries.filter((e) => inSite(site, e.site) && (e.status === "visit" || e.status === "offered" || e.status === "enrolled"));
  const fundOpen = s.funding.filter((f) => inSite(site, f.site) && f.status !== "reviewed");
  const consentGaps = scoped.filter((c) => missingOf(c).length).length;

  const pipeCols: Col<Enquiry>[] = [
    { key: "c", label: "Child", render: (e) => <div className="fam-two"><RecordLink type="enquiry" id={e.id}>{e.child}</RecordLink><small>{e.parent}</small></div> },
    { key: "p", label: "Programme", render: (e) => <div className="fam-two"><span>{e.programme}</span><small><Pattern days={e.days} /></small></div> },
    { key: "s", label: "Start", render: (e) => e.start },
    { key: "st", label: "Stage", render: (e) => <Chip tone={e.status === "enrolled" ? "ok" : e.status === "offered" ? "gold" : "accent"}>{ENQUIRY_LABEL[e.status]}</Chip> },
    { key: "n", label: "Next step and deadline", render: (e) => e.status === "visit" ? "Visit, then offer if days fit. By " + dayLabel(3) : e.status === "offered" ? "Reply and enrolment forms. By " + dayLabel(4) : "Funding reference and consents before " + e.start },
    { key: "o", label: "Owner", render: (e) => personName(e.owner, s) },
    { key: "a", label: "", align: "r", render: (e) => e.status === "enrolled"
      ? <Btn size="sm" kind="ghost" onClick={() => { logEvent({ actor: actor(s), actorKind: "person", action: "sent enrolment forms reminder (simulated)", target: e.parent + " for " + e.child, kind: "people", site: e.site, story: "F" }); toast("Forms reminder sent to " + e.parent + " (simulated)."); }}>Remind (simulated)</Btn>
      : <Btn size="sm" onClick={() => tryMove(e, e.status === "visit" ? "offered" : "enrolled")}>{e.status === "visit" ? "Offer" : "Enrol"}<Icon d={IC.arrow} size={11} /></Btn> },
  ];

  const cols: Col<Child>[] = [
    { key: "c", label: "Child", render: (c) => <div className="fam-two"><RecordLink type="child" id={c.id}>{c.first} {c.last}</RecordLink><small>{c.age}</small></div> },
    { key: "r", label: "Programme", render: (c) => { const r = roomById(c.room); return <div className="fam-two"><span>{r ? r.name : ""}</span><small>{c.hours}</small></div>; } },
    { key: "d", label: "Booked days", render: (c) => <Pattern days={c.pattern} /> },
    { key: "f", label: "Funding", render: (c) => { const f = fundingRef(c, s); return <div className="fam-two" style={{ maxWidth: 230 }}><span><Chip tone="accent">{c.funding}</Chip>{f.open && <> <RecordLink type="funding" id={f.open.id}>Check open</RecordLink></>}</span><small>{f.text}</small></div>; } },
    { key: "g", label: "Guardian", render: (c) => { const g = primaryGuardian(c.family, s); return g ? <div className="fam-two"><RecordLink type="family" id={c.family}>{g.name}</RecordLink><small>{g.phone}</small></div> : "None"; } },
    { key: "k", label: "Consents", render: (c) => <Ticks c={c} /> },
    { key: "t", label: "Deadline and owner", render: (c) => { const t = enrolmentTodo(c, s); return t ? <div className="fam-two"><span style={{ color: "var(--warn)" }}>{t.text}</span><small>{personName(t.owner, s)}</small></div> : <span className="sh-faint">Nothing due</span>; } },
  ];

  return (
    <>
      <PageHead title="Enrolments" sub="One enrolment record per child: programme, booked days, guardians, funding reference and consents. Entered once, used by the rooms, billing and the parent app."
        right={<DemoTag />} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Enrolled children" value={scoped.length} sub={all.map((x) => x.label.replace("Ballyneety ", "").replace("Elmgrove ", "") + " " + s.children.filter((c) => x.rooms.includes(c.room)).length).join(", ")} />
        <Stat label="Enrolments in progress" value={pipeline.filter((e) => e.status !== "enrolled").length} sub={pipeline.filter((e) => e.status === "enrolled").length + " confirmed for a future start"} />
        <Stat label="Consent forms outstanding" value={consentGaps} tone={consentGaps ? "warn" : "ok"} sub="Children missing at least one" />
        <Stat label="Funding checks open" value={fundOpen.length} tone={fundOpen.length ? "warn" : "ok"} sub="Human review, nothing auto-submitted" />
      </Grid>
      <Card title="New enrolments in progress" sub="From an accepted visit to the first day. Each has an owner and a deadline." style={{ marginBottom: 12 }} pad={false}>
        <Table cols={pipeCols} rows={pipeline} rowKey={(e) => e.id} empty="No enrolments in progress for this scope." />
      </Card>
      {cur ? (
        <Card title="Enrolment records by registered service" sub="Each Tusla registration keeps its own records and capacity."
          right={<span className="sh-row" style={{ gap: 6 }}><Chip tone="accent">Tusla {cur.ref}</Chip><Chip tone="outline">{cur.capLabel}</Chip></span>}>
          <div className="fam-toolbar">
            <Segmented options={all.map((x) => ({ id: x.id, label: x.label }))} value={cur.id} onChange={(v) => { setSvc(v); setShowAll(false); }} />
            <input className="sh-input" placeholder="Search child or family" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search enrolments" />
          </div>
          <Table cols={cols} rows={shown} rowKey={(c) => c.id} empty="No matching enrolments." />
          {!needle && kids.length > 12 && (
            <div style={{ marginTop: 10 }}><Btn size="sm" kind="ghost" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : "Show all " + kids.length}</Btn></div>
          )}
        </Card>
      ) : <Empty title="No registered services in this scope." />}
    </>
  );
}

/* ══ BOOKINGS ═══════════════════════════════════════════════════════════════ */
function BookingsTab({ s, site }: { s: DemoState; site: SiteFilter }) {
  const rooms = ROOMS.filter((r) => inSite(site, r.site));
  const sites = (["elm", "bal"] as SiteId[]).filter((x) => inSite(site, x));
  const pipeline = s.enquiries.filter((e) => e.status === "new" || e.status === "contacted" || e.status === "visit" || e.status === "offered");
  const reqs = (r: Room, i: number) => pipeline.filter((e) => e.room === r.id && e.days.includes(WEEKDAYS[i])).length;
  const [roomId, setRoomId] = useState(rooms.find((r) => r.id === "elm-toddlers")?.id || (rooms[0] ? rooms[0].id : ""));
  const [days, setDays] = useState<string[]>(["Mon", "Wed", "Fri"]);
  const cr = rooms.find((r) => r.id === roomId) || rooms[0];
  const roomDays = rooms.length * 5;
  const bookedWeek = rooms.reduce((n, r) => n + r.bookedByDay.reduce((a, b) => a + b, 0), 0);
  const placesWeek = rooms.reduce((n, r) => n + r.placesPerDay * 5, 0);
  const fullDays = rooms.reduce((n, r) => n + r.bookedByDay.filter((b) => b >= r.placesPerDay).length, 0);
  const todayBooked = rooms.reduce((n, r) => n + r.bookedByDay[TODAY_IDX], 0);
  const pipeScoped = pipeline.filter((e) => inSite(site, e.site));
  const toggleDay = (d: string) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : WEEKDAYS.filter((w) => w === d || ds.includes(w))));
  const res = cr ? WEEKDAYS.map((d, i) => ({ d, on: days.includes(d), b: cr.bookedByDay[i], p: cr.placesPerDay, q: reqs(cr, i) })) : [];
  const exceed = res.filter((x) => x.on && x.b + 1 > x.p).map((x) => x.d);
  const hold = () => {
    if (!cr || exceed.length || !days.length) return;
    logEvent({ actor: actor(s), actorKind: "person", action: "held a provisional place (simulated, Acorn Cloud unchanged)", target: cr.name + ", " + listText(days), kind: "data", site: cr.site, story: "F" });
    toast("Provisional hold noted for " + cr.name + " on " + listText(days) + ". Acorn Cloud stays the system of record.");
  };
  const doyle = s.enquiries.find((e) => e.id === "enq-doyle");
  return (
    <>
      <PageHead title="Bookings" sub="The weekly booking pattern against each room's planning places. Full days are flagged before anyone promises a place."
        right={<><DemoTag /><Chip tone="outline">Source: Acorn Cloud (system of record while integrated)</Chip></>} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label={"Booked today (" + WEEKDAYS[TODAY_IDX] + ")"} value={todayBooked} sub={"Across " + rooms.length + " rooms"} />
        <Stat label="Booked this week" value={bookedWeek} sub={"of " + placesWeek + " planning places"} />
        <Stat label="Full room-days" value={fullDays} tone={fullDays ? "warn" : "ok"} sub={"of " + roomDays + " room-days this week"} />
        <Stat label="Requests in the pipeline" value={pipeScoped.length} sub="Shown on the grid as requested" />
      </Grid>
      <Grid cols="main">
        <Card title="Weekly pattern by room" sub="Booked of planning places per day. Planning places are a demo planning figure, not a ratio rule." pad>
          <div className="sh-scroll-x">
            <div className="fam-bk">
              <div className="fam-bk-h">Room</div>
              {WEEKDAYS.map((d, i) => <div key={d} className={"fam-bk-h" + (i === TODAY_IDX ? " today" : "")}>{d}{i === TODAY_IDX ? ", today" : ""}</div>)}
              {sites.map((st) => {
                const sr = rooms.filter((r) => r.site === st);
                return [
                  <div key={st + "-h"} className="fam-bk-site"><SiteChip site={st} /><span style={{ fontWeight: 500, color: "var(--dim)", fontSize: 12 }}>{st === "elm" ? "Full day care" : "Sessional ECCE and the separately registered school-age service"}</span></div>,
                  ...sr.map((r) => [
                    <div key={r.id + "-n"} className="fam-bk-room"><b><RecordLink type="room" id={r.id}>{r.name}</RecordLink></b><small>{r.ages}{r.programme === "afterschool" ? ". Reg. " + regFor(r.id) : ""}</small></div>,
                    ...WEEKDAYS.map((d, i) => {
                      const b = r.bookedByDay[i];
                      const p = r.placesPerDay;
                      const q = reqs(r, i);
                      const full = b >= p;
                      const tight = !full && b / p >= 0.9;
                      const over = q > 0 && b + q > p;
                      return (
                        <div key={r.id + d} className={"fam-cell" + (full ? " full" : tight ? " tight" : "") + (i === TODAY_IDX ? " today" : "")} title={r.name + " " + d + ": " + b + " of " + p + " booked"}>
                          <div className="fam-cell-v">{b}<span className="of">/{p}</span></div>
                          <Bar value={b} max={p} tone={full ? "bad" : tight ? "warn" : "ok"} />
                          <div className="fam-cell-x">{full ? "Full" : p - b + " free"}{q > 0 && <>, <span className={over ? "bad" : ""}>{q} requested{over ? ", would exceed" : ""}</span></>}</div>
                        </div>
                      );
                    }),
                  ]),
                  <div key={st + "-t"} className="fam-bk-room"><small>Total, {sr.length} rooms</small></div>,
                  ...WEEKDAYS.map((d, i) => {
                    const b = sr.reduce((n, r) => n + r.bookedByDay[i], 0);
                    const p = sr.reduce((n, r) => n + r.placesPerDay, 0);
                    return <div key={st + d + "t"} className="fam-cell total"><div className="fam-cell-v">{b}<span className="of">/{p}</span></div></div>;
                  }),
                ];
              })}
            </div>
          </div>
        </Card>
        <Card title="Check a booking request" sub="Would this request fit, day by day? Nothing is booked until it is offered and confirmed in Acorn Cloud.">
          {cr ? (
            <div className="sh-stack" style={{ gap: 14 }}>
              <div>
                <label className="sh-label" htmlFor="fam-bk-room">Room</label>
                <select id="fam-bk-room" className="fam-select" style={{ width: "100%" }} value={cr.id} onChange={(e) => setRoomId(e.target.value)}>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}, {r.site === "elm" ? "Elmgrove" : "Ballyneety"}</option>)}
                </select>
              </div>
              <div>
                <span className="sh-label">Days requested</span>
                <div className="fam-pick">{WEEKDAYS.map((d) => <button key={d} type="button" className={days.includes(d) ? "on" : ""} aria-pressed={days.includes(d)} onClick={() => toggleDay(d)}>{d}</button>)}</div>
              </div>
              {doyle && inSite(site, doyle.site) && (
                <button type="button" className="sh-link" style={{ fontSize: 12.5 }} onClick={() => { setRoomId(doyle.room); setDays(doyle.days.slice()); }}>Load {doyle.parent}'s request ({listText(doyle.days)}, {roomById(doyle.room)?.name})</button>
              )}
              <div>
                {res.filter((x) => x.on).map((x) => {
                  const bad = x.b + 1 > x.p;
                  return (
                    <div key={x.d} className="fam-result">
                      <b>{x.d}</b>
                      <span className="t">{bad ? "Would exceed: " + x.b + " of " + x.p + " already booked" : x.b + " to " + (x.b + 1) + " of " + x.p}{x.q ? ", " + x.q + " pipeline request" + (x.q > 1 ? "s" : "") : ""}</span>
                      <Chip tone={bad ? "bad" : "ok"}>{bad ? "Full" : "Fits"}</Chip>
                    </div>
                  );
                })}
                {!days.length && <div style={{ fontSize: 12.5, color: "var(--dim)" }}>Pick at least one day.</div>}
              </div>
              {exceed.length > 0 && <Note tone="warn" icon={IC.alert}>Would exceed planning places on {listText(exceed)}. Offer other days or add to the waitlist with this as the reason.</Note>}
              <Btn kind="primary" icon={IC.check} disabled={!days.length || exceed.length > 0} onClick={hold} title={exceed.length ? "Blocked: would exceed on " + listText(exceed) : undefined}>Note provisional hold (simulated)</Btn>
            </div>
          ) : <Empty title="No rooms in this scope." />}
        </Card>
      </Grid>
    </>
  );
}

/* ══ CHILDREN ═══════════════════════════════════════════════════════════════ */
type ChildFilter = "all" | "in" | "expected" | "off" | "plan" | "consent";
function ChildrenTab({ s, site }: { s: DemoState; site: SiteFilter }) {
  const [q, setQ] = useState("");
  const [sf, setSf] = useState<SiteFilter>("all");
  const [room, setRoom] = useState("all");
  const [f, setF] = useState<ChildFilter>("all");
  const siteF: SiteFilter = site === "all" ? sf : site;
  const rooms = ROOMS.filter((r) => inSite(siteF, r.site));
  const needle = q.trim().toLowerCase();
  const order = ROOMS.map((r) => r.id);
  const base = s.children.filter((c) => inSite(siteF, c.site) && (room === "all" || c.room === room));
  const rows = base
    .filter((c) => !needle || (c.first + " " + c.last).toLowerCase().includes(needle))
    .filter((c) => f === "all" ? true : f === "in" ? !!c.checkedIn && !c.checkedOut : f === "expected" ? c.attendingToday && !c.checkedIn : f === "off" ? !c.attendingToday : f === "plan" ? !!c.alert : missingOf(c).length > 0)
    .sort((a, b) => order.indexOf(a.room) - order.indexOf(b.room) || a.first.localeCompare(b.first));
  const cols: Col<Child>[] = [
    { key: "c", label: "Child", render: (c) => <div className="fam-two"><span className="strong" style={{ color: "var(--ink)", fontWeight: 500 }}>{c.first} {c.last}</span><small>{c.age}</small></div> },
    { key: "r", label: "Room", render: (c) => <div className="fam-two"><span>{roomById(c.room)?.name}</span><small>{c.site === "elm" ? "Elmgrove" : "Ballyneety"}</small></div> },
    { key: "reg", label: "Registration", render: (c) => <span className="sh-num" style={{ fontSize: 11.5 }}>{regFor(c.room)}</span> },
    { key: "t", label: "Today", render: (c) => attendanceChip(c) },
    { key: "g", label: "Primary guardian", render: (c) => { const g = primaryGuardian(c.family, s); return g ? <div className="fam-two"><span>{g.name}</span><small>{g.phone}</small></div> : "None"; } },
    { key: "e", label: "Emergency contact", render: (c) => { const g = guardiansOf(c.family, s).find((x) => !x.primary && x.authorisedCollect); return g ? <div className="fam-two"><span>{g.name}</span><small>{g.relation}</small></div> : <span className="sh-faint">Primary only</span>; } },
    { key: "p", label: "Care plan", render: (c) => c.alert ? <span title={c.alert} style={{ display: "inline-block", maxWidth: 180 }} className="sh-trunc"><Chip tone={c.alert.startsWith("Awaiting") ? "bad" : "warn"}>{c.alert}</Chip></span> : <span className="sh-faint">None</span> },
    { key: "k", label: "Consents", render: (c) => <Ticks c={c} /> },
    { key: "w", label: "Keyworker", render: (c) => personName(c.keyworker, s) },
  ];
  const opts: { id: ChildFilter; label: string }[] = [
    { id: "all", label: "All" }, { id: "in", label: "In now" }, { id: "expected", label: "Expected" }, { id: "off", label: "Not today" },
    { id: "plan", label: "Care plan or alert" }, { id: "consent", label: "Consent missing" },
  ];
  return (
    <>
      <PageHead title="Children" sub="Permission-scoped records: you see the children your role and centre allow, and every open is logged. Care plans show only where one exists."
        right={<><DemoTag /><Chip tone="outline">Fictional children, no PPSNs stored</Chip></>} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Booked" value={base.length} sub="Children holding a booking" />
        <Stat label="Attending today" value={base.filter((c) => c.attendingToday).length} onClick={() => setF("expected")} sub="Tap to see who is still expected" />
        <Stat label="In now" value={base.filter((c) => c.checkedIn && !c.checkedOut).length} tone="ok" onClick={() => setF("in")} />
        <Stat label="Care plans and alerts" value={base.filter((c) => !!c.alert).length} tone="warn" onClick={() => setF("plan")} />
      </Grid>
      <Card pad>
        <div className="fam-toolbar">
          <input className="sh-input" placeholder="Search by child's name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search children" />
          {site === "all" && <Segmented options={[{ id: "all" as SiteFilter, label: "Both" }, { id: "elm" as SiteFilter, label: "Elmgrove" }, { id: "bal" as SiteFilter, label: "Ballyneety" }]} value={sf} onChange={(v) => { setSf(v); setRoom("all"); }} />}
          <select className="fam-select" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Room">
            <option value="all">All rooms</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="fam-toolbar"><Segmented options={opts} value={f} onChange={setF} /><span style={{ fontSize: 12, color: "var(--dim)" }}>{rows.length} of {base.length} shown. Select a row to open the full record.</span></div>
        <Table cols={cols} rows={rows} rowKey={(c) => c.id} onRow={(c) => openDrawer("child", c.id)} maxHeight={560} empty="No children match these filters." />
      </Card>
    </>
  );
}

/* ══ PARENTS & MESSAGING ════════════════════════════════════════════════════ */
const PRI_TONE: Record<Message["priority"], Tone> = { Urgent: "bad", Important: "gold", Routine: "neutral" };
const PRI_CHANNEL: Record<Message["priority"], string> = { Urgent: "Push + SMS, acknowledgement, phone escalation", Important: "Push to the parent's phone", Routine: "In the app only, no push or email" };
const needsAction = (m: Message) => (m.ackRequired && !m.ackAt) || m.escalation.some((x) => x.state === "standby");

function confirmDempsey(s: DemoState, m: Message) {
  const who = actor(s);
  const at = nowLabel();
  update("messages", m.id, {
    ackAt: at, ackBy: who,
    escalation: [
      { step: "Ann Dempsey is not an authorised collector: flagged to the manager", state: "done" },
      { step: who + " confirmed with Louise Dempsey by phone at " + at + " (simulated)", state: "done" },
      { step: "Ann Dempsey added as a one-time collector for today. Photo ID check at the door at 17:30", state: "done" },
    ],
  });
  if (!s.guardians.some((g) => g.family === "fam-dempsey" && g.name === "Ann Dempsey")) {
    add("guardians", { id: "fam-dempsey-ot1", name: "Ann Dempsey", relation: "Grandmother (one-time, today)", family: "fam-dempsey", phone: "Not held", email: "Not held", authorisedCollect: true, primary: false });
  }
  logEvent({ actor: who, actorKind: "person", action: "confirmed with Louise Dempsey and added a one-time collector", target: "Ann Dempsey for Ellie D., After-school 17:30, photo ID at the door", kind: "people", site: "bal", story: "E" });
  toast("Confirmed with Louise. Ann Dempsey can collect Ellie today with photo ID.");
}
function callGuardian(s: DemoState, m: Message) {
  const g = primaryGuardian(m.family, s);
  if (!g) return;
  const who = actor(s);
  const at = nowLabel();
  update("messages", m.id, { escalation: m.escalation.concat([{ step: who + " phoned " + g.name + " at " + at + " (simulated, no call placed)", state: "done" }]) });
  logEvent({ actor: who, actorKind: "person", action: "phoned " + g.name + " (simulated, no call placed)", target: m.subject, kind: "people", site: m.site, story: "E" });
  toast("Call to " + g.name + " logged on the thread (simulated).");
}

function ThreadDetail({ s, m }: { s: DemoState; m: Message }) {
  const [reply, setReply] = useState("");
  const [pr, setPr] = useState<"Routine" | "Important">("Routine");
  const fam = familyById(m.family, s);
  const kid = m.child ? childById(m.child, s) : undefined;
  const g = primaryGuardian(m.family, s);
  const fromGuardian = m.fromKind === "guardian";
  const pendingDempsey = m.id === "m-dempsey" && !m.ackAt;
  const send = () => {
    const body = reply.trim();
    if (!body) return;
    sendMessage({ family: m.family, child: m.child, from: actor(s) + ", " + (m.site === "elm" ? "Elmgrove" : "Ballyneety"), fromKind: "centre", to: g ? g.name : fam ? fam.name : "Family", priority: pr,
      subject: m.subject.startsWith("Re: ") ? m.subject : "Re: " + m.subject, body, ackRequired: pr === "Important", site: m.site });
    setReply("");
    toast(pr === "Routine" ? "Reply sent in the app (simulated). Routine, so no push or email." : "Sent as Important with a push (simulated). Acknowledgement requested.");
  };
  return (
    <Card>
      <div className="sh-stack" style={{ gap: 14 }}>
        <div>
          <div className="sh-row" style={{ gap: 6, flexWrap: "wrap" }}>
            <Chip tone={PRI_TONE[m.priority]}>{m.priority}</Chip>
            <Chip tone="outline">{PRI_CHANNEL[m.priority]}</Chip>
            <span className="sh-num" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--faint)" }}>{m.at}</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-.3px", marginTop: 10, lineHeight: 1.3 }}>{m.subject}</div>
          <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 4 }}>
            From {m.from} to {m.to}. {fam && <RecordLink type="family" id={fam.id}>{fam.name}</RecordLink>}{kid && <>, <RecordLink type="child" id={kid.id}>{kid.first} {kid.last}</RecordLink></>}
          </div>
        </div>
        <div className="fam-body">{m.body}</div>
        {m.ackRequired && (m.ackAt
          ? <Note icon={IC.check}>{fromGuardian ? "Handled by " + m.ackBy + " at " + m.ackAt + "." : "Acknowledged by " + m.ackBy + " at " + m.ackAt + " in the parent app."}</Note>
          : fromGuardian
            ? <Note tone="warn" icon={IC.alert}>{m.id === "m-dempsey" ? "Ann Dempsey is not an authorised collector for Ellie. A manager confirms with Louise, adds Ann as a one-time collector, and staff check photo ID at 17:30." : "Needs a reply from the centre."}</Note>
            : <Note tone="warn" icon={IC.clock}>Waiting for {m.to} to acknowledge in the parent app. Only the guardian can acknowledge; staff cannot do it on their behalf. You can call, and the call is logged on this thread.</Note>)}
        {m.escalation.length > 0 && (
          <div>
            <div className="fam-sub">Escalation trail</div>
            <Steps steps={m.escalation.map((x) => ({ label: x.step, note: x.state === "skipped" ? "Not needed" : x.state === "standby" ? "Waiting on a manager" : undefined, state: x.state === "done" ? "done" as const : x.state === "standby" ? (fromGuardian ? "blocked" as const : "current" as const) : "todo" as const }))} />
          </div>
        )}
        <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
          {pendingDempsey && <Btn kind="primary" icon={IC.check} onClick={() => confirmDempsey(s, m)}>Confirm with Louise and add one-time collector</Btn>}
          {g && <Btn icon={IC.phone} onClick={() => callGuardian(s, m)}>Call {g.name} (simulated)</Btn>}
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <label className="sh-label" htmlFor={"fam-reply-" + m.id}>Reply to {g ? g.name : "the family"}</label>
          <textarea id={"fam-reply-" + m.id} className="sh-input" rows={3} style={{ width: "100%" }} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a short, plain reply" />
          <div className="sh-row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
            <Segmented options={[{ id: "Routine" as const, label: "Routine" }, { id: "Important" as const, label: "Important" }]} value={pr} onChange={setPr} />
            <span style={{ flex: 1, fontSize: 11.5, color: "var(--faint)", minWidth: 160 }}>Urgent notices are raised from the room tablet with manager approval.</span>
            <Btn kind="primary" icon={IC.message} disabled={!reply.trim()} onClick={send}>Send (simulated)</Btn>
          </div>
        </div>
      </div>
    </Card>
  );
}

function NewMessageModal({ s, site, open, onClose }: { s: DemoState; site: SiteFilter; open: boolean; onClose: () => void }) {
  const fams = s.families.filter((f) => inSite(site, f.site) && f.children.length).sort((a, b) => a.name.localeCompare(b.name));
  const [famId, setFamId] = useState(fams[0] ? fams[0].id : "");
  const [childId, setChildId] = useState("");
  const [pr, setPr] = useState<"Routine" | "Important">("Routine");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const fam = fams.find((f) => f.id === famId);
  const g = fam ? primaryGuardian(fam.id, s) : undefined;
  const send = () => {
    if (!fam || !subject.trim() || !body.trim()) return;
    sendMessage({ family: fam.id, child: childId || null, from: actor(s) + ", " + (fam.site === "elm" ? "Elmgrove" : "Ballyneety"), fromKind: "centre", to: g ? g.name : fam.name, priority: pr, subject: subject.trim(), body: body.trim(), ackRequired: pr === "Important", site: fam.site });
    toast("Sent to " + (g ? g.name : fam.name) + " as " + pr + " (simulated).");
    setSubject(""); setBody(""); setChildId("");
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="New message to a family" sub="Simulated. Nothing leaves the demo."
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" icon={IC.message} disabled={!fam || !subject.trim() || !body.trim()} onClick={send}>Send as {pr}</Btn></>}>
      <div className="sh-stack" style={{ gap: 14 }}>
        <div>
          <label className="sh-label" htmlFor="fam-new-fam">Family</label>
          <select id="fam-new-fam" className="fam-select" style={{ width: "100%" }} value={famId} onChange={(e) => { setFamId(e.target.value); setChildId(""); }}>
            {fams.map((f) => <option key={f.id} value={f.id}>{f.name}, {f.site === "elm" ? "Elmgrove" : "Ballyneety"}</option>)}
          </select>
        </div>
        {fam && (
          <div>
            <label className="sh-label" htmlFor="fam-new-child">About</label>
            <select id="fam-new-child" className="fam-select" style={{ width: "100%" }} value={childId} onChange={(e) => setChildId(e.target.value)}>
              <option value="">The whole family</option>
              {fam.children.map((cid) => { const c = childById(cid, s); return c ? <option key={cid} value={cid}>{c.first} {c.last}</option> : null; })}
            </select>
          </div>
        )}
        <div>
          <span className="sh-label">Priority</span>
          <Segmented options={[{ id: "Routine" as const, label: "Routine, in-app only" }, { id: "Important" as const, label: "Important, push" }]} value={pr} onChange={setPr} />
        </div>
        <div>
          <label className="sh-label" htmlFor="fam-new-subj">Subject</label>
          <input id="fam-new-subj" className="sh-input" style={{ width: "100%" }} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="sh-label" htmlFor="fam-new-body">Message</label>
          <textarea id="fam-new-body" className="sh-input" rows={4} style={{ width: "100%" }} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

type MsgFilter = "all" | "action" | Message["priority"];
function MessagingTab({ s, site }: { s: DemoState; site: SiteFilter }) {
  const [filter, setFilter] = useState<MsgFilter>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const msgs = s.messages.filter((m) => inSite(site, m.site));
  const shown = msgs.filter((m) => (filter === "all" ? true : filter === "action" ? needsAction(m) : m.priority === filter));
  const current = shown.find((m) => m.id === sel) || shown[0] || null;
  const urgent = msgs.filter((m) => m.priority === "Urgent");
  const impWaiting = msgs.filter((m) => m.priority === "Important" && m.ackRequired && !m.ackAt);
  const routineLogs = s.careLogs.filter((l) => {
    const c = childById(l.child, s);
    return l.parentVisible && ROUTINE_KINDS.includes(l.kind) && !l.at.startsWith("Yesterday") && !!c && inSite(site, c.site);
  }).length;
  const fams = s.families.filter((f) => inSite(site, f.site) && f.children.length);
  const acked = fams.filter((f) => f.ackParentComms).length;
  const groups: Message["priority"][] = ["Urgent", "Important", "Routine"];
  return (
    <>
      <PageHead title="Parents & Messaging" sub="Every parent message classified as Routine, Important or Urgent. Routine stays in the app, important is pushed, urgent needs an acknowledgement with a phone call behind it."
        right={<><DemoTag /><Btn kind="primary" icon={IC.plus} onClick={() => setNewOpen(true)}>New message</Btn></>} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Urgent notices today" value={urgent.length} tone={urgent.some((m) => m.ackRequired && !m.ackAt) ? "bad" : "ok"} sub={urgent.filter((m) => m.ackAt).length + " acknowledged, " + urgent.filter((m) => m.ackRequired && !m.ackAt).length + " waiting"} onClick={() => setFilter("Urgent")} />
        <Stat label="Important awaiting acknowledgement" value={impWaiting.length} tone={impWaiting.length ? "warn" : "ok"} sub="Only the guardian can acknowledge" onClick={() => setFilter("Important")} />
        <Stat label="Routine care logs kept in-app" value={routineLogs} tone="ok" sub={"Today. The old way, that was " + routineLogs + " separate emails"} />
        <Stat label="Comms policy v1.0 acknowledged" value={acked + " of " + fams.length} sub="Families, live from the parent app" />
      </Grid>
      <div className="fam-rules" style={{ marginBottom: 12 }}>
        {groups.map((p) => (
          <div key={p} className="fam-rule">
            <div className="t"><Chip tone={PRI_TONE[p]}>{p}</Chip></div>
            <p>{p === "Routine" ? "Meals, naps, nappies, activities and everyday chat. In the app only. Never an email per entry." : p === "Important" ? "Outings, closures, policy changes. Pushed to the phone, acknowledgement where it matters." : "Collection requests and safety. Push and SMS, needs a tap, then phone the parent, then the second contact."}</p>
          </div>
        ))}
      </div>
      <div className="fam-msg">
        <Card title="Threads" right={<Segmented options={[{ id: "all" as MsgFilter, label: "All" }, { id: "action" as MsgFilter, label: "Waiting" }, { id: "Urgent" as MsgFilter, label: "Urgent" }, { id: "Important" as MsgFilter, label: "Important" }, { id: "Routine" as MsgFilter, label: "Routine" }]} value={filter} onChange={(v) => { setFilter(v); setSel(null); }} />}>
          {shown.length === 0 && <Empty title="No messages in this view." />}
          {groups.map((p) => {
            const items = shown.filter((m) => m.priority === p);
            if (!items.length) return null;
            return (
              <div key={p} className={"fam-pgroup " + p.toLowerCase()}>
                <div className="fam-pgroup-h"><Chip tone={PRI_TONE[p]}>{p}</Chip><span className="sh-num">{items.length}</span><span className="sh-trunc">{PRI_CHANNEL[p]}</span></div>
                {items.map((m) => {
                  const fam = familyById(m.family, s);
                  return (
                    <button key={m.id} type="button" className={"fam-thread" + (current && current.id === m.id ? " on" : "")} onClick={() => setSel(m.id)}>
                      <span className="r1">
                        <span className="fn sh-trunc">{fam ? fam.name : m.family}</span>
                        {m.ackRequired && (m.ackAt ? <Chip tone="ok">{m.fromKind === "guardian" ? "Handled" : "Acknowledged"}</Chip> : m.fromKind === "guardian" ? <Chip tone="bad">Needs manager</Chip> : <Chip tone="warn">Awaiting ack</Chip>)}
                        <span className="at">{m.at.replace("Yesterday ", "Yest ")}</span>
                      </span>
                      <span className="sj sh-trunc">{m.subject}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </Card>
        {current ? <ThreadDetail key={current.id} s={s} m={current} /> : <Card><Empty title="Select a thread" /></Card>}
      </div>
      <NewMessageModal s={s} site={site} open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}

/* ══ PERMISSIONS & FORMS ════════════════════════════════════════════════════ */
function FormsTab({ s, site }: { s: DemoState; site: SiteFilter }) {
  const [view, setView] = useState<"missing" | "all">("missing");
  const kids = s.children.filter((c) => inSite(site, c.site));
  const items = kids.flatMap((c) => missingOf(c).map((k) => ({ c, k, target: kidShort(c) + ": " + k.form })));
  const requested = (t: string) => s.events.some((e) => e.action === "requested missing form (simulated)" && e.target === t);
  const open = items.filter((x) => !requested(x.target));
  const request = (c: Child, target: string) => logEvent({ actor: actor(s), actorKind: "person", action: "requested missing form (simulated)", target, kind: "people", site: c.site, story: null });
  const requestAll = () => {
    open.forEach((x) => request(x.c, x.target));
    toast(open.length + " form requests sent to families in the parent app (simulated).");
  };
  const received = (c: Child, key: keyof Child["consents"], form: string) => {
    update("children", c.id, { consents: { ...c.consents, [key]: true } });
    logEvent({ actor: actor(s), actorKind: "person", action: "recorded consent received", target: kidShort(c) + ": " + form, kind: "data", site: c.site, story: null });
    toast(form + " recorded for " + kidShort(c) + ".");
  };
  const complete = kids.filter((c) => !missingOf(c).length).length;
  const fams = s.families.filter((f) => inSite(site, f.site) && f.children.length);
  const pending = fams.filter((f) => !f.ackParentComms).sort((a, b) => (a.id === "fam-murphy" ? -1 : b.id === "fam-murphy" ? 1 : a.name.localeCompare(b.name)));
  const ackEvents = s.events.filter((e) => e.action === "acknowledged Important notice" && (e.target === "How we'll contact you from now on" || e.target.startsWith("Parent Communications")));
  const reminded = s.events.some((e) => e.action === "sent comms policy reminder (simulated)");
  const remind = () => {
    logEvent({ actor: actor(s), actorKind: "person", action: "sent comms policy reminder (simulated)", target: pending.length + " families yet to acknowledge Parent Communications Policy v1.0", kind: "people", site: site === "all" ? "both" : site, story: "E" });
    toast("Reminder sent in the app to " + pending.length + " families (simulated).");
  };
  const tableRows = view === "missing" ? kids.filter((c) => missingOf(c).length) : kids;
  const cols: Col<Child>[] = [
    { key: "c", label: "Child", render: (c) => <div className="fam-two"><RecordLink type="child" id={c.id}>{c.first} {c.last}</RecordLink><small>{roomById(c.room)?.name}, {c.site === "elm" ? "Elmgrove" : "Ballyneety"}</small></div> },
    ...CONSENTS.map((k): Col<Child> => ({
      key: k.key, label: k.label,
      render: (c) => c.consents[k.key]
        ? <span style={{ fontSize: 12, color: "var(--dim)" }}><Icon d={IC.check} size={12} sw={2.2} style={{ color: "var(--ok)", verticalAlign: "-2px", marginRight: 4 }} />{k.form.split(" consent ")[1] || "held"}</span>
        : <Chip tone="bad">Missing</Chip>,
    })),
    { key: "g", label: "Guardian", render: (c) => primaryGuardian(c.family, s)?.name || "" },
  ];
  return (
    <>
      <PageHead title="Permissions & Forms" sub="Versioned consents for every child, the missing documents list built from them, and the acknowledgement trail for parent policies."
        right={<><DemoTag /><Btn icon={IC.message} disabled={!open.length} onClick={requestAll}>Request all missing ({open.length}, simulated)</Btn></>} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Consent records complete" value={complete + " of " + kids.length} sub="All four consents held" />
        <Stat label="Missing forms" value={items.length} tone={items.length ? "warn" : "ok"} sub={items.length - open.length + " requested, " + open.length + " not yet"} />
        <Stat label="Comms policy v1.0" value={fams.length - pending.length + " of " + fams.length} sub="Families acknowledged" />
        <Stat label="Current consent versions" value={CONSENTS.length} sub="Photos, sunscreen, outings, first aid" />
      </Grid>
      <Grid cols="main" style={{ marginBottom: 12 }}>
        <Card title="Missing documents" sub="Built from each child's consents. Request in the parent app, then record it when it comes back." pad={false}>
          {items.length ? (
            <div className="sh-scroll-x" style={{ maxHeight: 380, overflowY: "auto" }}>
              <table className="sh-table">
                <thead><tr><th>Child</th><th>Form</th><th>Guardian</th><th className="r">Action</th></tr></thead>
                <tbody>
                  {items.map(({ c, k, target }) => {
                    const req = requested(target);
                    const g = primaryGuardian(c.family, s);
                    return (
                      <tr key={c.id + k.key}>
                        <td><RecordLink type="child" id={c.id}>{c.first} {c.last}</RecordLink></td>
                        <td>{k.form}</td>
                        <td>{g ? g.name : ""}</td>
                        <td className="r">
                          <span className="sh-row" style={{ gap: 6, justifyContent: "flex-end" }}>
                            {req ? <Chip tone="gold">Requested</Chip> : <Btn size="sm" onClick={() => { request(c, target); toast("Asked " + (g ? g.name : "the family") + " for the " + k.label.toLowerCase() + " form (simulated)."); }}>Request (simulated)</Btn>}
                            <Btn size="sm" kind="ghost" onClick={() => received(c, k.key, k.form)}>Mark received</Btn>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No missing forms in this scope." hint="Every child has all four consents on file." />}
        </Card>
        <Card title="Parent Communications Policy v1.0" sub="Acknowledgement trail. Parents acknowledge in the app; staff cannot do it for them.">
          <div className="sh-row" style={{ justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
            <span>{fams.length - pending.length} of {fams.length} families</span>
            <span className="sh-faint">Published {s.policies.find((p) => p.id === "pol-parentcomms")?.effective}</span>
          </div>
          <Bar value={fams.length - pending.length} max={fams.length} />
          {ackEvents.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="fam-sub">Acknowledged today</div>
              {ackEvents.slice(0, 4).map((e) => <div key={e.id} className="fam-doc"><Icon d={IC.check} size={13} style={{ color: "var(--ok)" }} /><span className="t">{e.actor}</span><span className="sh-num sh-faint" style={{ flex: "none" }}>{e.at}</span></div>)}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <div className="fam-sub">Not yet acknowledged ({pending.length})</div>
            {pending.slice(0, 6).map((f) => {
              const g = primaryGuardian(f.id, s);
              return <div key={f.id} className="fam-doc"><span className="t"><RecordLink type="family" id={f.id}>{f.name}</RecordLink></span><span className="sh-faint" style={{ fontSize: 11.5 }}>{g ? g.name : ""}</span><SiteChip site={f.site} /></div>;
            })}
            {pending.length > 6 && <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 4 }}>and {pending.length - 6} more</div>}
          </div>
          <div className="sh-row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Btn size="sm" icon={IC.bell} disabled={!pending.length || reminded} onClick={remind}>{reminded ? "Reminder sent" : "Remind " + pending.length + " families (simulated)"}</Btn>
            {inSite(site, "elm") && <Btn size="sm" kind="ghost" icon={IC.phone} onClick={() => { setRole("parent"); }}>See it as Laura Murphy</Btn>}
          </div>
        </Card>
      </Grid>
      <Card title="Consents by child" sub="Each consent shows its current form version. Older versions are kept in the evidence trail."
        right={<Segmented options={[{ id: "missing" as const, label: "Missing only" }, { id: "all" as const, label: "All children" }]} value={view} onChange={setView} />} pad={false}>
        <Table cols={cols} rows={tableRows} rowKey={(c) => c.id} maxHeight={460} empty="No children with missing consents." />
      </Card>
    </>
  );
}

/* ══ PARENT APP PREVIEW ═════════════════════════════════════════════════════ */
function AppTab({ s, site }: { s: DemoState; site: SiteFilter }) {
  if (!inSite(site, "elm")) {
    return <><PageHead title="Parent App Preview" sub="The preview family, Laura Murphy, is at Elmgrove." right={<DemoTag />} /><Restricted what="The Elmgrove preview family" /></>;
  }
  const child = childById(s.parentChild, s);
  const logsToday = s.careLogs.filter((l) => l.child === s.parentChild && l.parentVisible && ROUTINE_KINDS.includes(l.kind) && !l.at.startsWith("Yesterday")).length;
  const pol = s.messages.find((m) => m.id === "m-policy");
  const urg = s.messages.find((m) => m.id === "m-urgent");
  const lib = s.messages.find((m) => m.id === "m-library");
  const principles: { icon: string; tone: "" | "gold" | "bad"; title: string; text: string; live: ReactNode }[] = [
    { icon: IC.sun, tone: "", title: "Routine stays in the app", text: "Meals, naps, nappies and activities land in the timeline as the room logs them. No email or push per entry.",
      live: <><Chip tone="ok">{logsToday}</Chip>routine entries for {child ? child.first : "this child"} today, 0 emails sent</> },
    { icon: IC.bell, tone: "gold", title: "Important is pushed", text: "Policy changes, outings and closures go to the phone as a push, with an acknowledgement where it matters.",
      live: pol ? (pol.ackAt ? <><Chip tone="ok">Done</Chip>Laura acknowledged the comms policy at {pol.ackAt}</> : <><Chip tone="warn">Waiting</Chip>Laura has not acknowledged the comms policy yet{lib && !lib.ackAt ? ", or the library visit" : ""}</>) : null },
    { icon: IC.alert, tone: "bad", title: "Urgent needs a tap, with escalation", text: "A push alone is not a safe emergency channel. Urgent notices need an acknowledgement; no tap in 15 minutes and the room phones the parent, then the second contact.",
      live: urg ? <><Chip tone={urg.ackAt ? "ok" : "bad"}>{urg.ackAt ? "Acknowledged " + urg.ackAt : "Waiting"}</Chip>Darragh's collection request{urg.ackAt ? ", phone steps not needed" : ""}</> : null },
    { icon: IC.lock, tone: "", title: "Mandatory service communications cannot be silenced", text: "Parents choose how routine and important updates arrive. Urgent is locked to push, SMS and phone escalation.",
      live: <><Chip tone="outline">Locked</Chip>{s.parentPrefs.urgent}</> },
  ];
  return (
    <>
      <PageHead title="Parent App Preview" sub="Exactly what Laura Murphy sees on her phone, live from the same records. Log a meal on the room tablet and it appears here."
        right={<><DemoTag /><Btn icon={IC.phone} onClick={() => setRole("parent")}>Open full screen as Laura</Btn><Btn icon={IC.tablet} onClick={() => setRole("educator")}>Open the room tablet</Btn></>} />
      <div className="fam-app">
        <div className="fam-app-phone"><ParentPhone variant="framed" height={820} /></div>
        <div className="sh-stack">
          {principles.map((p) => (
            <div key={p.title} className="fam-principle">
              <span className={"ic " + p.tone}><Icon d={p.icon} size={16} /></span>
              <div style={{ minWidth: 0 }}>
                <b>{p.title}</b>
                <p>{p.text}</p>
                {p.live && <div className="live">{p.live}</div>}
              </div>
            </div>
          ))}
          <Card title="Try it in the phone">
            <Steps steps={[
              { label: "Messages: acknowledge the Parent Communications Policy", note: pol && pol.ackAt ? "Done at " + pol.ackAt + ". The Murphy family now counts as acknowledged in Permissions & Forms." : "The acknowledgement trail updates here and in Activity.", state: pol && pol.ackAt ? "done" : "current" },
              { label: "Ask: \"My child has chickenpox. What is Shournagh's illness policy?\"", note: "The answer quotes section 5.4 with its effective date, and never diagnoses.", state: "todo" },
              { label: "Payments: pay the statement with the saved card", note: "Simulated. No money moves, invoices are untouched, and the event is logged.", state: "todo" },
              { label: "More: try to silence urgent notices", note: "It stays locked. Mandatory service communications cannot be silenced.", state: "todo" },
            ]} />
          </Card>
        </div>
      </div>
    </>
  );
}

/* ══ PAGE ═══════════════════════════════════════════════════════════════════ */
export default function Families() {
  const s = useDemo();
  const tab = activeTab("Families", s);
  const site = effectiveSite(s);
  const hr = roleDef(s.role).id === "hr";
  let body: ReactNode;
  switch (tab) {
    case "enrolments": body = hr ? <RestrictedTab title="Enrolments" sub="Enrolment records by registered service." /> : <EnrolmentsTab s={s} site={site} />; break;
    case "bookings": body = <BookingsTab s={s} site={site} />; break;
    case "children": body = hr ? <RestrictedTab title="Children" sub="Permission-scoped child records." /> : <ChildrenTab s={s} site={site} />; break;
    case "messaging": body = hr ? <RestrictedTab title="Parents & Messaging" sub="Parent messages contain child records." /> : <MessagingTab s={s} site={site} />; break;
    case "forms": body = hr ? <RestrictedTab title="Permissions & Forms" sub="Consents are part of each child's record." /> : <FormsTab s={s} site={site} />; break;
    case "app": body = hr ? <RestrictedTab title="Parent App Preview" sub="The preview shows a family's child records." /> : <AppTab s={s} site={site} />; break;
    default: body = hr ? <RestrictedTab title="Enquiries" sub="Enquiries name children and families." /> : <EnquiriesTab s={s} site={site} />;
  }
  return <Page>{body}</Page>;
}
