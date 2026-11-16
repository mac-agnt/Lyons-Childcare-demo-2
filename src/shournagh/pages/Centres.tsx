/* Centres: the operational floor of both registered services.
   Today, rooms, attendance and handover to authorised collectors, daily care
   (human-entered on the room tablets), curriculum, cleaning and handovers.
   Staff coverage is a coverage watch against the approved roster, never a
   statutory ratio claim. Every number is derived from the demo store. */
import { useState, type ReactNode } from "react";
import {
  useDemo, metrics, effectiveSite, inSite, roleDef, personName, staffById, roomById, siteById, childById, guardiansOf, activeTab, setTab,
  navigate, openDrawer, decide, setTaskStatus, completeCleaning, readHandover, addHandover, update, logEvent, toast, nowLabel,
  checkIn, checkOut, approveCareLog, approveProgress, setRole, type DemoState,
} from "../store";
import { ROOMS, WEEKDAYS, TODAY_IDX, TODAY_LABEL, siteName, dayLabel } from "../seed";
import type { SiteId, SiteFilter, Child, Room, CareLog, CareKind, CleaningItem, Handover, Task } from "../types";
import {
  Page, PageHead, Grid, Card, Stat, Chip, DemoTag, SiteChip, Bar, Btn, Segmented, Toggle, Table, Empty, KV, Note, RecordLink, Modal,
  Restricted, Icon, IC, Avatar, type Col,
} from "../ui";
import "./centres.css";

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function toMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const nowMin = () => toMin(nowLabel()) ?? 0;
const dueRank = (due: string) => toMin(due) ?? (due === "Yesterday" ? -1 : due === "Today" ? 1200 : 2000);
const pl = (n: number, one: string, many?: string) => n + " " + (n === 1 ? one : many || one + "s");
const short = (c: Child) => c.first + " " + c.last.charAt(0) + ".";
const sitesOf = (f: SiteFilter): SiteId[] => (f === "all" ? ["elm", "bal"] : [f]);
const actor = (s: DemoState) => roleDef(s.role).person;
const cleanOverdue = (c: CleaningItem) => !c.done && (c.due === "Yesterday" || (toMin(c.due) ?? 99999) < nowMin());

type AttState = "in" | "out" | "late" | "due";
function attState(c: Child): AttState {
  if (c.checkedOut) return "out";
  if (c.checkedIn) return "in";
  return (toMin(c.expected) ?? 99999) <= nowMin() ? "late" : "due";
}
function roomLive(s: DemoState, roomId: string) {
  const kids = s.children.filter((c) => c.room === roomId);
  const expected = kids.filter((c) => c.attendingToday);
  const staff = s.staff.filter((x) => x.room === roomId);
  return {
    booked: kids.length,
    expected: expected.length,
    inNow: expected.filter((c) => attState(c) === "in").length,
    collected: expected.filter((c) => c.checkedOut).length,
    notYet: expected.filter((c) => !c.checkedIn).length,
    late: expected.filter((c) => attState(c) === "late").length,
    staff,
    onDuty: staff.filter((x) => x.status === "on"),
  };
}
const missingConsents = (c: Child) => [c.consents.photos ? null : "Photos", c.consents.outings ? null : "Outings", c.consents.sunscreen ? null : "Sunscreen", c.consents.firstAid ? null : "First aid"].filter((x): x is string => !!x);

/* Actions with an audit entry and a toast */
function signOff(s: DemoState, id: string) {
  const c = s.cleaning.find((x) => x.id === id);
  if (!c || c.done) return;
  completeCleaning(id);
  if (id === "cl1") { const t = s.tasks.find((x) => x.id === "t-clean-tod"); if (t && t.status !== "done") setTaskStatus("t-clean-tod", "done"); }
  toast(c.area + " signed off at " + nowLabel() + ". Evidence recorded against your sign-in.");
}
function markRead(s: DemoState, h: Handover) {
  readHandover(h.id);
  logEvent({ actor: actor(s), actorKind: "person", action: "marked handover read", target: (roomById(h.room)?.name || h.room) + ", " + h.kind.toLowerCase() + " from " + personName(h.from, s), kind: "people", site: roomById(h.room)?.site || "elm", story: null });
  toast("Handover marked read.");
}
function closeFollowUp(s: DemoState, h: Handover) {
  update("handovers", h.id, { outstanding: null, read: true });
  logEvent({ actor: actor(s), actorKind: "person", action: "closed handover follow-up", target: (roomById(h.room)?.name || h.room) + ": " + (h.outstanding || ""), kind: "people", site: roomById(h.room)?.site || "elm", story: null });
  toast("Follow-up closed and logged.");
}
function doCheckIn(c: Child) { checkIn(c.id); toast(short(c) + " checked in at " + nowLabel() + "."); }
function returnObservation(s: DemoState, l: CareLog) {
  update("careLogs", l.id, { status: "logged", parentVisible: false, title: "Observation (returned for edits)" });
  const c = childById(l.child, s);
  logEvent({ actor: actor(s), actorKind: "person", action: "returned observation to " + personName(l.by, s) + " for edits", target: c ? short(c) + ", " + (roomById(c.room)?.name || "") : l.child, kind: "people", site: c?.site || "elm", story: null });
  afterReview(s, l.id);
  toast("Returned to " + personName(l.by, s) + ". It stays hidden from parents.");
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
function approveLog(s: DemoState, l: CareLog) { approveCareLog(l.id); afterReview(s, l.id); toast("Approved. Now visible in the parent timeline."); }
function confirmCollector(s: DemoState, msgId: string) {
  const m = s.messages.find((x) => x.id === msgId);
  if (!m || m.ackAt) return;
  update("messages", msgId, {
    ackAt: nowLabel(), ackBy: actor(s),
    escalation: m.escalation.map((e) => (e.state === "standby" ? { step: "Confirmed with " + m.from + " by phone at " + nowLabel() + " (simulated). Photo ID check at the door; a guardian must add the collector in the parent app", state: "done" as const } : e)),
  });
  logEvent({ actor: actor(s), actorKind: "person", action: "confirmed one-time collector request by phone (simulated)", target: m.subject + ", photo ID required", kind: "people", site: m.site, story: null });
  toast("Logged. The collector is still not on the authorised list until a guardian adds them.");
}

const KIND: Record<CareKind, { label: string; icon: string }> = {
  meal: { label: "Meals", icon: IC.meal }, drink: { label: "Drinks", icon: IC.drink }, nappy: { label: "Nappies", icon: IC.nappy }, sleep: { label: "Sleeps", icon: IC.sleep },
  activity: { label: "Activities", icon: IC.activity }, observation: { label: "Observations", icon: IC.eye }, incident: { label: "Incidents", icon: IC.alert },
  medication: { label: "Medication", icon: IC.pill }, arrival: { label: "Arrivals", icon: IC.door }, note: { label: "Notes", icon: IC.note },
};
const KIND_ORDER: CareKind[] = ["arrival", "meal", "drink", "nappy", "sleep", "activity", "note", "observation", "incident", "medication"];

/* ── Weekly plans (demo data, owned by each room's staff) ───────────────────── */
type Aistear = "Well-being" | "Identity and Belonging" | "Communicating" | "Exploring and Thinking";
interface PlanAct { day: number; time: string; title: string; detail: string; tag: string; owner: string }
interface Plan { theme: string; focus: string; aistear: Aistear[]; siolta: string[]; acts: PlanAct[]; schoolAge?: boolean }
const A = (day: number, time: string, title: string, detail: string, tag: string, owner: string): PlanAct => ({ day, time, title, detail, tag, owner });
const PLANS: Record<string, Plan> = {
  "elm-babies": {
    theme: "Textures and treasure baskets", focus: "Calm exploration of natural materials and close one-to-one rhymes.",
    aistear: ["Well-being", "Exploring and Thinking", "Communicating", "Identity and Belonging"],
    siolta: ["2 Environments", "5 Interactions", "6 Play", "9 Health and Welfare"],
    acts: [
      A(0, "09:30", "Treasure basket: wood, wool and metal", "Babies explore safe natural objects at their own pace.", "Exploring and Thinking", "s03"),
      A(1, "10:00", "Tummy time with mirrors", "Short sessions on the soft mat, faces and reflections.", "Well-being", "s17"),
      A(2, "09:45", "Rhymes and finger play", "Round and Round the Garden and This Little Piggy, one to one.", "Communicating", "s04"),
      A(3, "10:00", "Sensory bags", "Sealed water and gel bags to press and watch.", "Exploring and Thinking", "s03"),
      A(4, "09:30", "Family photo board", "Looking at photos from home and naming the people in them.", "Identity and Belonging", "s17"),
    ],
  },
  "elm-wobblers": {
    theme: "Moving, climbing and posting", focus: "Gross motor confidence and early problem solving.",
    aistear: ["Well-being", "Exploring and Thinking", "Communicating"],
    siolta: ["2 Environments", "6 Play", "7 Curriculum", "9 Health and Welfare"],
    acts: [
      A(0, "09:45", "Soft-play obstacle course", "Crawl, climb and slide with an adult close by.", "Well-being", "s05"),
      A(1, "10:00", "Posting and stacking", "Posting boxes and stacking rings, side by side.", "Exploring and Thinking", "s06"),
      A(2, "10:30", "Puddle walk in wellies", "Garden walk, splashing and naming the sounds.", "Exploring and Thinking", "s05"),
      A(3, "09:45", "Action songs", "Head, Shoulders, Knees and Toes; Row Your Boat.", "Communicating", "s06"),
      A(4, "10:00", "Chunky crayon mark-making", "Large paper on the floor, children choose colours.", "Communicating", "s15"),
    ],
  },
  "elm-toddlers": {
    theme: "Big and small, full and empty", focus: "Following the children's interest in pouring and sorting by size.",
    aistear: ["Exploring and Thinking", "Communicating", "Identity and Belonging", "Well-being"],
    siolta: ["3 Parents and Families", "6 Play", "7 Curriculum", "16 Community Involvement"],
    acts: [
      A(0, "09:15", "Sand and water: filling and pouring", "Cups and jugs of different sizes; talk about big, small, full and empty.", "Exploring and Thinking", "s08"),
      A(1, "09:30", "Nesting cups and sorting by size", "Next step drawn from last week's approved observations.", "Exploring and Thinking", "s08"),
      A(2, "10:00", "Story: Owl Babies", "Read before the library walk; naming the big and small owls.", "Communicating", "s07"),
      A(3, "10:00", "Walk to Blarney library", "Small group outing. Only children with outing consent from home.", "Identity and Belonging", "s07"),
      A(4, "09:45", "Pouring song at circle time", "Turn-taking with jugs and a short song.", "Well-being", "s08"),
    ],
  },
  "elm-preschool": {
    theme: "Autumn and the people who help us", focus: "Counting, early mark-making and role play.",
    aistear: ["Exploring and Thinking", "Identity and Belonging", "Communicating", "Well-being"],
    siolta: ["7 Curriculum", "8 Planning and Evaluation", "12 Communication", "16 Community Involvement"],
    acts: [
      A(0, "10:00", "Leaf sorting and counting", "Sort by colour and size, count each pile together.", "Exploring and Thinking", "s11"),
      A(1, "10:00", "Role play: the doctor's surgery", "Children take turns as doctor, nurse and patient.", "Identity and Belonging", "s10"),
      A(2, "10:30", "Name writing at the mark-making table", "Tracing and copying names with chunky pencils.", "Communicating", "s12"),
      A(3, "10:00", "Visitor: a parent who works as a nurse", "Questions prepared by the children on Tuesday.", "Identity and Belonging", "s10"),
      A(4, "11:00", "Group story and drawing", "Children draw a helper they met this week.", "Communicating", "s11"),
    ],
  },
  "bal-robins": {
    theme: "Shapes in our world", focus: "Noticing and naming shapes indoors and outside.",
    aistear: ["Exploring and Thinking", "Communicating", "Well-being"],
    siolta: ["2 Environments", "6 Play", "7 Curriculum", "12 Communication"],
    acts: [
      A(0, "09:30", "Shape hunt indoors", "Find circles, squares and triangles around the room.", "Exploring and Thinking", "s19"),
      A(1, "09:45", "Junk modelling", "Boxes and tubes; talk about the shapes used.", "Exploring and Thinking", "s20"),
      A(2, "10:15", "Shapes in the garden", "Chalk shapes on the yard and a shape walk.", "Well-being", "s21"),
      A(3, "09:30", "Story retell with puppets", "Retelling The Three Little Pigs in small groups.", "Communicating", "s19"),
      A(4, "10:30", "Shape biscuits", "Cutting shapes and naming them before baking.", "Well-being", "s20"),
    ],
  },
  "bal-wrens": {
    theme: "Weather watchers", focus: "Observing the weather and dressing for it.",
    aistear: ["Exploring and Thinking", "Well-being", "Communicating"],
    siolta: ["2 Environments", "6 Play", "9 Health and Welfare", "12 Communication"],
    acts: [
      A(0, "09:30", "Our weather chart", "Each morning a child chooses the weather picture.", "Communicating", "s22"),
      A(1, "10:00", "Rain gauge in the garden", "Set up the gauge and check it each day.", "Exploring and Thinking", "s23"),
      A(2, "09:45", "Dressing for the weather", "Coats, hats and wellies: practising on our own.", "Well-being", "s22"),
      A(3, "10:00", "Wind sock craft", "Make a wind sock and hang it in the yard.", "Exploring and Thinking", "s23"),
      A(4, "10:30", "Rain song and movement", "Movement to music, loud and quiet rain.", "Communicating", "s24"),
    ],
  },
  "bal-afterschool": {
    theme: "Homework club and autumn crafts", focus: "Quiet homework time, then active and creative choices.", schoolAge: true,
    aistear: [], siolta: [],
    acts: [
      A(0, "14:30", "Homework club, then board games", "Quiet table for homework, games after.", "Homework and play", "s26"),
      A(1, "15:00", "Football in the yard", "Mixed teams, older children lead the warm-up.", "Active play", "s27"),
      A(2, "15:00", "Autumn leaf art", "Leaf printing and collage.", "Creative", "s27"),
      A(3, "15:00", "Lego challenge", "Build a bridge that holds a book.", "Construction", "s26"),
      A(4, "15:30", "Film and popcorn", "Children vote on the film on Thursday.", "Children's choice", "s26"),
    ],
  },
};
const lastFriday = dayLabel(-(TODAY_IDX + 3));
const weekOf = dayLabel(-TODAY_IDX);
function planState(s: DemoState, roomId: string): { published: boolean; label: string } {
  if (roomId === "elm-preschool") {
    const t = s.tasks.find((x) => x.id === "t-plan-pre");
    return t?.status === "done" ? { published: true, label: "Published today " + (t.doneAt || "") } : { published: false, label: "Draft, activities being assigned" };
  }
  const r = roomById(roomId);
  return { published: true, label: "Published by " + personName(r?.leader || "", undefined) + ", Fri " + lastFriday };
}

/* ── Shared bits ───────────────────────────────────────────────────────────── */
function Sec({ children, n }: { children: ReactNode; n?: ReactNode }) {
  return <div className="ct-sec">{children}{n !== undefined && <span className="n">{n}</span>}</div>;
}
function Row({ title, meta, chips, onOpen, children }: { title: ReactNode; meta?: ReactNode; chips?: ReactNode; onOpen: () => void; children?: ReactNode }) {
  return (
    <div className="ct-row">
      <button type="button" className="ct-main" onClick={onOpen}>
        <span className="ct-t" style={{ display: "block" }}>{title}</span>
        {meta && <span className="ct-s" style={{ display: "block" }}>{meta}</span>}
      </button>
      {chips}
      {children && <div className="ct-acts">{children}</div>}
    </div>
  );
}
function AttChip({ c }: { c: Child }) {
  const st = attState(c);
  return st === "in" ? <Chip tone="ok" dot>In since {c.checkedIn}</Chip> : st === "out" ? <Chip tone="neutral">Collected {c.checkedOut}</Chip> : st === "late" ? <Chip tone="warn">Late, expected {c.expected.replace(" (late)", "")}</Chip> : <Chip tone="outline">Expected {c.expected}</Chip>;
}
function RoomSelect({ rooms, value, onChange }: { rooms: Room[]; value: string; onChange: (id: string) => void }) {
  return (
    <select className="ct-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Room">
      {sitesOf(rooms.some((r) => r.site === "elm") && rooms.some((r) => r.site === "bal") ? "all" : (rooms[0]?.site || "elm")).map((sid) => (
        <optgroup key={sid} label={siteName(sid)}>
          {rooms.filter((r) => r.site === sid).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/* ── Handover to an authorised collector ───────────────────────────────────── */
function HandoverModal({ s, childId, onClose }: { s: DemoState; childId: string; onClose: () => void }) {
  const [pick, setPick] = useState<string>("");
  const [other, setOther] = useState("");
  const [blocked, setBlocked] = useState<string | null>(null);
  const c = childById(childId, s);
  if (!c) return null;
  const gs = guardiansOf(c.family, s);
  const auth = gs.filter((g) => g.authorisedCollect);
  const notAuth = gs.filter((g) => !g.authorisedCollect);
  const primary = gs.find((g) => g.primary) || gs[0];
  const flag = s.messages.find((m) => m.child === c.id && m.escalation.some((e) => /authorised collector/i.test(e.step)));
  const hand = (name: string) => { checkOut(c.id, name); toast(short(c) + " handed over to " + name + " at " + nowLabel() + "."); onClose(); };
  const submit = () => {
    if (pick === "other") {
      const name = other.trim();
      const match = auth.find((g) => g.name.toLowerCase() === name.toLowerCase());
      if (match) { hand(match.name); return; }
      setBlocked(name);
      logEvent({ actor: actor(s), actorKind: "person", action: "stopped a handover to someone not authorised to collect", target: short(c) + ", " + (roomById(c.room)?.name || "") + ": " + name, kind: "people", site: c.site, story: null });
      return;
    }
    const g = auth.find((x) => x.id === pick);
    if (g) hand(g.name);
  };
  const can = pick !== "" && (pick !== "other" || other.trim().length > 1);
  return (
    <Modal open onClose={onClose} title={"Hand over " + c.first + " " + c.last} sub={(roomById(c.room)?.name || "") + ", " + siteName(c.site) + ". Only people listed as authorised collectors on the child's record."}
      footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn kind="primary" icon={IC.door} disabled={!can} onClick={submit} title={can ? undefined : "Choose who is collecting"}>Hand over</Btn></>}>
      {flag && (
        <Note tone="warn" icon={IC.alert}>
          <b style={{ color: "var(--ink)", fontWeight: 600 }}>{flag.from}, {flag.at}:</b> {flag.body}
          <div style={{ marginTop: 4 }}>{flag.escalation.map((e) => e.step).join(". ")}.</div>
        </Note>
      )}
      <div className="ct-sec" style={{ marginTop: flag ? 14 : 0 }}>Authorised collectors</div>
      {auth.map((g) => (
        <button key={g.id} type="button" className={"ct-pick" + (pick === g.id ? " on" : "")} onClick={() => { setPick(g.id); setBlocked(null); }}>
          <span className="ct-radio" />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="ct-t" style={{ display: "block" }}>{g.name} {g.primary && <Chip tone="accent">Primary</Chip>}</span>
            <span className="ct-s" style={{ display: "block" }}>{g.relation} · {g.phone}</span>
          </span>
          <Chip tone="ok">Can collect</Chip>
        </button>
      ))}
      {notAuth.map((g) => (
        <button key={g.id} type="button" className="ct-pick" disabled title="Not authorised to collect">
          <span className="ct-radio" />
          <span style={{ flex: 1 }}><span className="ct-t">{g.name}</span><span className="ct-s" style={{ display: "block" }}>{g.relation}</span></span>
          <Chip tone="bad">Cannot collect</Chip>
        </button>
      ))}
      <button type="button" className={"ct-pick" + (pick === "other" ? " on" : "")} onClick={() => setPick("other")}>
        <span className="ct-radio" />
        <span style={{ flex: 1 }}><span className="ct-t">Someone else</span><span className="ct-s" style={{ display: "block" }}>Checked against the authorised list before handover</span></span>
      </button>
      {pick === "other" && (
        <div style={{ marginTop: 4 }}>
          <label className="sh-label" htmlFor="ct-collector">Name of the person at the door</label>
          <input id="ct-collector" className="sh-input" style={{ width: "100%" }} value={other} placeholder="Full name" onChange={(e) => { setOther(e.target.value); setBlocked(null); }} />
        </div>
      )}
      {blocked && (
        <div className="ct-stop" role="alert">
          <Icon d={IC.lock} size={15} style={{ color: "var(--bad)", marginTop: 2 }} />
          <div><b style={{ color: "var(--ink)" }}>Do not hand over.</b> {blocked} is not an authorised collector for {c.first}. Phone {primary ? primary.name : "the primary guardian"} on the number on file and follow the Collection Authorisation Procedure. A guardian can add a one-time collector in the parent app; photo ID is checked at the door. This attempt was logged.</div>
        </div>
      )}
      <div className="ct-s" style={{ marginTop: 12 }}>Consents on file: {missingConsents(c).length ? missingConsents(c).join(", ") + " missing" : "all current"}.</div>
    </Modal>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   TODAY
   ═════════════════════════════════════════════════════════════════════════════ */
function SiteStatus({ s, id, onAtt }: { s: DemoState; id: SiteId; onAtt: () => void }) {
  const st = siteById(id);
  const m = metrics(s, id);
  const open = s.tasks.find((t) => t.id === (id === "elm" ? "t-open-elm" : "t-open-bal"));
  const after = ROOMS.find((r) => r.site === id && r.programme === "afterschool");
  return (
    <div className="ct-site">
      <div className="ct-site-h">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t">{st.name}</div>
          <div className="s">Tusla {st.tusla}{st.extraRegistrations.map((x) => " and " + x.ref).join("")}</div>
        </div>
        <span style={{ fontSize: 12.5 }}><RecordLink type="site" id={id}>Service record</RecordLink></span>
      </div>
      <div className="ct-figs">
        <button type="button" className="ct-fig" onClick={() => open && openDrawer("task", open.id)}>
          <span className="l">Opening checks</span>
          <span className="v">{open?.status === "done" ? open.doneAt : "Not done"}</span>
          <span className="x">{open ? personName(open.owner, s) + ", " + open.checklist.filter((c) => c.done).length + " of " + open.checklist.length + " checks" : ""}</span>
        </button>
        <button type="button" className="ct-fig" onClick={() => navigate("People", "rota")}>
          <span className="l">Staff on duty</span>
          <span className="v">{m.onDuty}<span className="ct-of">/{m.staffTotal}</span></span>
          <span className="x">{m.away} away today</span>
        </button>
        <button type="button" className="ct-fig" onClick={onAtt}>
          <span className="l">Children in</span>
          <span className="v">{m.checkedIn}<span className="ct-of">/{m.attending}</span></span>
          <span className="x">Of expected today{after ? ", After-school from 13:35" : ""}</span>
        </button>
        <button type="button" className={"ct-fig" + (m.coverageWatch ? " warn" : "")} onClick={() => navigate("People", "leave")}>
          <span className="l">Coverage watch</span>
          <span className="v">{m.coverageWatch ? "1 open" : "Clear"}</span>
          <span className="x">{m.coverageWatch ? "After-school 14:00-18:00" : "Against the approved roster"}</span>
        </button>
      </div>
    </div>
  );
}

function RoomsLive({ s, rooms, onRoom }: { s: DemoState; rooms: Room[]; onRoom: (id: string) => void }) {
  const cols: Col<Room>[] = [
    { key: "r", label: "Room", render: (r) => <div style={{ whiteSpace: "nowrap" }}><div className="strong">{r.name}</div><div className="ct-s" style={{ marginTop: 1 }}>{siteName(r.site)}</div></div> },
    { key: "in", label: "In now", render: (r) => { const l = roomLive(s, r.id); return <div style={{ minWidth: 64 }}><span className="sh-num strong">{l.inNow}</span><Bar value={l.inNow} max={Math.max(1, l.expected)} style={{ marginTop: 5, height: 4 }} /></div>; } },
    { key: "exp", label: "Expected", align: "r", render: (r) => <span className="sh-num">{roomLive(s, r.id).expected}</span> },
    { key: "ny", label: "Not yet in", align: "r", render: (r) => { const l = roomLive(s, r.id); return <span className="sh-num" style={{ whiteSpace: "nowrap" }}>{l.notYet}{l.late ? <span style={{ color: "var(--warn)" }}> ({l.late} late)</span> : ""}</span>; } },
    { key: "out", label: "Collected", align: "r", render: (r) => <span className="sh-num">{roomLive(s, r.id).collected}</span> },
    { key: "st", label: "Staff on duty", render: (r) => { const l = roomLive(s, r.id); const extra = r.programme === "afterschool" && s.coverConfirmed ? 1 : 0; return <span className="sh-num" style={{ whiteSpace: "nowrap" }}>{l.onDuty.length + extra} <span className="sh-faint">of {l.staff.length + extra}</span>{r.programme === "afterschool" && !s.coverConfirmed ? <span style={{ color: "var(--warn)", fontSize: 11.5 }}> watch</span> : ""}</span>; } },
    { key: "lead", label: "Room leader", render: (r) => { const x = staffById(r.leader, s); return <span style={{ whiteSpace: "nowrap" }} title={x?.name}>{x ? x.name.split(" ")[0] + " " + x.name.split(" ").slice(-1)[0].charAt(0) + "." : ""}{x && x.status !== "on" ? <span style={{ color: "var(--warn)", fontSize: 11.5 }}> ({x.status})</span> : ""}</span>; } },
  ];
  return (
    <Card title="Rooms, live" sub="Counts move as children are checked in and handed over. Select a room for its detail." pad={false}>
      <div style={{ padding: "8px 4px 6px" }}><Table cols={cols} rows={rooms} rowKey={(r) => r.id} onRow={(r) => onRoom(r.id)} /></div>
    </Card>
  );
}

function UrgentCard({ s, site, onHandover, goAtt, go }: { s: DemoState; site: SiteFilter; onHandover: (id: string) => void; goAtt: (status: AttFilter) => void; go: (tab: string) => void }) {
  const role = roleDef(s.role);
  const urgentMsgs = s.messages.filter((m) => m.priority === "Urgent" && m.child && inSite(site, m.site));
  const flags = s.messages.filter((m) => inSite(site, m.site) && m.escalation.some((e) => /authorised collector/i.test(e.step)));
  const late = s.children.filter((c) => inSite(site, c.site) && c.attendingToday && attState(c) === "late");
  const cleanOver = s.cleaning.filter((c) => inSite(site, c.site) && cleanOverdue(c));
  const unread = s.handovers.filter((h) => inSite(site, roomById(h.room)?.site || "elm") && !h.read);
  const reviews = s.careLogs.filter((l) => l.status === "pending-review" && inSite(site, childById(l.child, s)?.site || "elm"));
  const watch = inSite(site, "bal") && site !== "elm" && !s.coverConfirmed;
  const ap = s.approvals.find((a) => a.id === "ap-cover");
  const canApprove = !!ap && ap.status === "pending" && (role.id === "owner" || role.id === "manager-bal");
  const items: ReactNode[] = [];

  urgentMsgs.forEach((m) => {
    const c = childById(m.child || "", s);
    if (!c) return;
    const done = !!c.checkedOut;
    items.push(
      <div key={m.id} className="ct-urgent">
        <span className={"ct-mark " + (done ? "ok" : "bad")}><Icon d={done ? IC.check : IC.alert} size={14} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ct-t" style={{ fontWeight: 500 }}>{done ? short(c) + " collected by " + (s.events.find((e) => e.target.startsWith(short(c)) && e.action.startsWith("handed over to"))?.action.replace("handed over to ", "") || "an authorised guardian") + " at " + c.checkedOut : short(c) + " awaiting collection"}</div>
          <div className="ct-s">{done ? "Urgent notice closed. Collection logged in the audit trail." : m.subject + ". " + (m.ackAt ? "Acknowledged by " + m.ackBy + " at " + m.ackAt + "." : "Not yet acknowledged.") + " " + (roomById(c.room)?.name || "")}</div>
          {!done && (
            <div className="sh-row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <Btn size="sm" kind="primary" icon={IC.door} onClick={() => onHandover(c.id)}>Hand over</Btn>
              <Btn size="sm" onClick={() => openDrawer("child", c.id)}>Open {c.first}</Btn>
            </div>
          )}
        </div>
      </div>,
    );
  });
  flags.forEach((m) => {
    const c = childById(m.child || "", s);
    const done = !!m.ackAt;
    items.push(
      <div key={m.id} className="ct-urgent">
        <span className={"ct-mark " + (done ? "ok" : "warn")}><Icon d={done ? IC.check : IC.shield} size={14} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ct-t" style={{ fontWeight: 500 }}>{c ? short(c) + ", " + (roomById(c.room)?.name || "") + ": " : ""}collector not on the authorised list</div>
          <div className="ct-s">{m.from} at {m.at}: "{m.body}"</div>
          <div className="ct-s" style={{ color: done ? "var(--ok)" : "var(--warn)" }}>{m.escalation.map((e) => e.step).join(". ")}.</div>
          <div className="sh-row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {!done && <Btn size="sm" kind="primary" icon={IC.phone} onClick={() => confirmCollector(s, m.id)}>Log call with {m.from.split(" ")[0]}</Btn>}
            {c && <Btn size="sm" onClick={() => openDrawer("child", c.id)}>Open {c.first}</Btn>}
            {c && <Btn size="sm" kind="ghost" onClick={() => onHandover(c.id)}>Handover check</Btn>}
          </div>
        </div>
      </div>,
    );
  });
  if (inSite(site, "bal") && site !== "elm") {
    items.push(
      <div key="cover" className="ct-urgent">
        <span className={"ct-mark " + (watch ? "warn" : "ok")}><Icon d={watch ? IC.people : IC.check} size={14} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ct-t" style={{ fontWeight: 500 }}>{watch ? "Coverage watch: After-school 14:00-18:00" : "After-school cover confirmed"}</div>
          <div className="ct-s">{watch ? (ap?.detail || "After-school leader off sick.") : (staffById("s28", s)?.name || "") + ": " + (staffById("s28", s)?.statusNote || "") + "."} A watch against the approved roster, not a ratio calculation.</div>
          {watch && (
            <div className="sh-row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {canApprove && <Btn size="sm" kind="primary" icon={IC.check} onClick={() => decide("ap-cover", "approved")}>Confirm cover</Btn>}
              <Btn size="sm" icon={IC.arrow} onClick={() => navigate("People", "leave")}>Leave and cover</Btn>
            </div>
          )}
        </div>
      </div>,
    );
  }
  const quick: { key: string; n: number; label: string; tone: "warn" | "bad" | ""; act: () => void; btn: string }[] = [
    { key: "late", n: late.length, label: late.length + " late arrival" + (late.length === 1 ? "" : "s") + " (expected, not yet in)", tone: "warn", act: () => goAtt("late"), btn: "Review" },
    { key: "clean", n: cleanOver.length, label: cleanOver.length + " cleaning check" + (cleanOver.length === 1 ? "" : "s") + " overdue", tone: "bad", act: () => go("cleaning"), btn: "Open" },
    { key: "hand", n: unread.length, label: unread.length + " handover" + (unread.length === 1 ? "" : "s") + " unread", tone: "warn", act: () => go("handovers"), btn: "Open" },
    { key: "rev", n: reviews.length, label: reviews.length + " care record" + (reviews.length === 1 ? "" : "s") + " awaiting room leader review", tone: "", act: () => go("care"), btn: "Review" },
  ];
  quick.filter((q) => q.n > 0).forEach((q) => {
    items.push(
      <div key={q.key} className="ct-urgent" style={{ alignItems: "center" }}>
        <span className={"ct-mark " + q.tone}><Icon d={q.key === "late" ? IC.clock : q.key === "clean" ? IC.shield : q.key === "hand" ? IC.note : IC.eye} size={14} /></span>
        <div className="ct-t" style={{ flex: 1, minWidth: 0 }}>{q.label}</div>
        <Btn size="sm" onClick={q.act}>{q.btn}</Btn>
      </div>,
    );
  });
  return (
    <Card title="Needs attention" sub="Children, collections, cover and checklists, in order of urgency" right={<DemoTag />}>
      {items.length ? items : <div className="ct-s">Nothing urgent. Both rooms are running on routine.</div>}
    </Card>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   ROOMS
   ═════════════════════════════════════════════════════════════════════════════ */
function RoomPicker({ s, rooms, value, onChange }: { s: DemoState; rooms: Room[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="ct-rooms" role="tablist" aria-label="Rooms">
      {rooms.map((r) => {
        const l = roomLive(s, r.id);
        return (
          <button key={r.id} type="button" role="tab" aria-selected={r.id === value} className={"ct-roompick" + (r.id === value ? " on" : "")} onClick={() => onChange(r.id)}>
            <span className="sh-row" style={{ justifyContent: "space-between" }}><span className="n">{r.name}</span><span className="m">{siteName(r.site)}</span></span>
            <span className="m sh-num">{l.inNow} in of {l.expected} expected</span>
            <Bar value={l.inNow} max={Math.max(1, l.expected)} />
          </button>
        );
      })}
    </div>
  );
}

function PlanTable({ s, roomId, compact }: { s: DemoState; roomId: string; compact?: boolean }) {
  const plan = PLANS[roomId];
  if (!plan) return null;
  const ap = s.approvals.find((a) => a.id === "ap-notice");
  return (
    <table className="ct-plan">
      <tbody>
        {plan.acts.map((a) => {
          const owner = staffById(a.owner, s);
          const today = a.day === TODAY_IDX;
          return (
            <tr key={a.day} className={today ? "today" : ""}>
              <td className="day">{WEEKDAYS[a.day]}<div>{a.time}</div></td>
              <td>
                <div className="ct-t" style={{ fontWeight: 500 }}>{a.title}</div>
                {!compact && <div className="ct-s">{a.detail}</div>}
                {roomId === "elm-toddlers" && a.day === 3 && ap && <div className="ct-s" style={{ color: ap.status === "approved" ? "var(--ok)" : "var(--warn)" }}>{ap.status === "approved" ? "Outing notice sent to families (simulated). Consent replies due Wednesday 17:00." : ap.status === "pending" ? "Outing notice to families awaiting manager approval." : "Outing notice declined; plan needs a change."}</div>}
              </td>
              <td style={{ width: compact ? 120 : 160 }}><Chip tone={plan.schoolAge ? "outline" : "accent"}>{a.tag}</Chip></td>
              <td style={{ width: 150 }}>
                {owner ? <RecordLink type="staff" id={owner.id}>{owner.name}</RecordLink> : a.owner}
                {owner && today && owner.status !== "on" && <div className="ct-s" style={{ color: "var(--warn)" }}>Away today, room leader reassigns</div>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RoomDetail({ s, room, onHandover, go }: { s: DemoState; room: Room; onHandover: (id: string) => void; go: (tab: string) => void }) {
  const kids = s.children.filter((c) => c.room === room.id && c.attendingToday);
  const present = kids.filter((c) => attState(c) === "in");
  const waiting = kids.filter((c) => !c.checkedIn).sort((a, b) => (toMin(a.expected) ?? 0) - (toMin(b.expected) ?? 0));
  const collected = kids.filter((c) => c.checkedOut);
  const staff = s.staff.filter((x) => x.room === room.id);
  const leader = staffById(room.leader, s);
  const cover = room.programme === "afterschool" && s.coverConfirmed ? staffById("s28", s) : undefined;
  const tasks = s.tasks.filter((t) => t.status !== "done" && t.id !== "t-clean-tod" && ((t.link?.type === "room" && t.link.id === room.id) || (t.link?.type === "child" && childById(t.link.id, s)?.room === room.id)));
  const cleaning = s.cleaning.filter((c) => c.area.toLowerCase().startsWith(room.name.toLowerCase()));
  const reviews = s.careLogs.filter((l) => l.status === "pending-review" && childById(l.child, s)?.room === room.id);
  const hands = s.handovers.filter((h) => h.room === room.id && (!h.read || h.outstanding));
  const plan = PLANS[room.id];
  const ps = planState(s, room.id);
  const l = roomLive(s, room.id);
  const followUps = tasks.length + cleaning.filter((c) => !c.done).length + reviews.length + hands.length;
  return (
    <>
      <Grid cols="main" style={{ marginBottom: 12 }}>
        <div className="sh-stack">
          <Card title={"Children present · " + present.length} sub={l.expected + " expected today, " + l.booked + " holding a booking. Select a child to open the record."}
            right={<span style={{ fontSize: 12.5 }}><RecordLink type="room" id={room.id}>Room record</RecordLink></span>}>
            {present.length ? (
              <div className="ct-kids">
                {present.map((c) => <button key={c.id} type="button" className="ct-kid" onClick={() => openDrawer("child", c.id)}>{short(c)} <span className="t">{c.checkedIn}</span></button>)}
              </div>
            ) : <div className="ct-s">{room.programme === "afterschool" ? "After-school children arrive from 13:35." : "No children checked in yet."}</div>}
            {collected.length > 0 && (
              <>
                <Sec n={collected.length}>Collected</Sec>
                <div className="ct-kids">{collected.map((c) => <button key={c.id} type="button" className="ct-kid out" onClick={() => openDrawer("child", c.id)}>{short(c)} <span className="t">{c.checkedOut}</span></button>)}</div>
              </>
            )}
          </Card>
          <Card title={"Expected arrivals · " + waiting.length} sub="Booked for today and not yet checked in">
            {waiting.length ? waiting.map((c) => (
              <Row key={c.id} title={c.first + " " + c.last} meta={"Keyworker " + personName(c.keyworker, s)} chips={<AttChip c={c} />} onOpen={() => openDrawer("child", c.id)}>
                <Btn size="sm" icon={IC.check} onClick={() => doCheckIn(c)}>Check in</Btn>
              </Row>
            )) : <div className="ct-s">Everyone expected today has arrived.</div>}
          </Card>
          {plan && (
            <Card title={"This week's plan: " + plan.theme} sub={"Week of " + weekOf + ". " + ps.label + "."} right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => go("curriculum")}>Curriculum</Btn>}>
              <PlanTable s={s} roomId={room.id} compact />
            </Card>
          )}
        </div>
        <div className="sh-stack">
          <Card title="Room leader and staff" sub={"Coverage watch against the approved roster, " + room.hours}>
            {leader && (
              <button type="button" className="ct-pick" onClick={() => openDrawer("staff", leader.id)} style={{ marginBottom: 12 }}>
                <Avatar initials={leader.initials} tone={leader.status === "on" ? "accent" : "bad"} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ct-t" style={{ display: "block", fontWeight: 600 }}>{leader.name}</span>
                  <span className="ct-s" style={{ display: "block" }}>Room leader · {leader.status === "on" ? "on duty " + leader.shift : leader.statusNote}</span>
                </span>
              </button>
            )}
            {staff.filter((x) => x.id !== room.leader).map((x) => (
              <Row key={x.id} title={x.name} meta={x.role + (x.qualification ? " · " + x.qualification : "")} chips={x.status === "on" ? <Chip tone="ok">{x.shift}</Chip> : <Chip tone={x.status === "sick" ? "bad" : "neutral"}>{x.statusNote || x.status}</Chip>} onOpen={() => openDrawer("staff", x.id)} />
            ))}
            {cover && <Row title={cover.name} meta="Floater, covering this room" chips={<Chip tone="accent">14:00-18:00</Chip>} onOpen={() => openDrawer("staff", cover.id)} />}
            {room.programme === "afterschool" && !s.coverConfirmed && <div style={{ marginTop: 10 }}><Note tone="warn" icon={IC.alert}>Coverage watch: 14:00 to 18:00 needs a confirmed educator. <button type="button" className="sh-link" onClick={() => navigate("People", "leave")}>Leave and cover</button></Note></div>}
          </Card>
          <Card title={"Care tasks and follow-ups · " + followUps} sub="Tasks, checklists, reviews and handovers for this room">
            {tasks.map((t) => (
              <Row key={t.id} title={t.title} meta={personName(t.owner, s) + " · due " + t.due} onOpen={() => openDrawer("task", t.id)}>
                <TaskBtn s={s} t={t} onHandover={onHandover} go={go} />
              </Row>
            ))}
            {cleaning.map((c) => (
              <Row key={c.id} title={c.area + ": " + c.task} meta={personName(c.owner, s) + " · due " + c.due + (c.done ? " · signed off " + c.done : "")} chips={c.done ? <Chip tone="ok">Done</Chip> : cleanOverdue(c) ? <Chip tone="bad">Overdue</Chip> : undefined} onOpen={() => go("cleaning")}>
                {!c.done && <Btn size="sm" icon={IC.check} onClick={() => signOff(s, c.id)}>Sign off</Btn>}
              </Row>
            ))}
            {reviews.map((lg) => { const c = childById(lg.child, s); return (
              <Row key={lg.id} title={(c ? short(c) : "") + ": " + lg.kind + " to review"} meta={lg.detail} onOpen={() => openDrawer("child", lg.child)}>
                <Btn size="sm" icon={IC.check} onClick={() => approveLog(s, lg)}>Approve</Btn>
              </Row>
            ); })}
            {hands.map((h) => (
              <Row key={h.id} title={h.kind + " handover from " + personName(h.from, s)} meta={h.note} chips={!h.read ? <Chip tone="gold">Unread</Chip> : undefined} onOpen={() => go("handovers")}>
                {!h.read ? <Btn size="sm" onClick={() => markRead(s, h)}>Mark read</Btn> : <Btn size="sm" onClick={() => closeFollowUp(s, h)}>Close</Btn>}
              </Row>
            ))}
            {followUps === 0 && <div className="ct-s">Nothing outstanding for {room.name}.</div>}
          </Card>
          <Card title="Room facts">
            <KV rows={[["Ages", room.ages], ["Hours", room.hours], ["Room tablet", room.tabletId + ", shared device with personal PIN"], ["Planning places", room.placesPerDay + " per day (booking grid figure, not a ratio)"], ["Booked today", room.bookedByDay[TODAY_IDX] + " of " + room.placesPerDay], ["Registration", room.programme === "afterschool" ? "TU2021CC067SA (school-age)" : siteById(room.site).tusla]]} />
          </Card>
        </div>
      </Grid>
    </>
  );
}

function TaskBtn({ s, t, onHandover, go }: { s: DemoState; t: Task; onHandover: (id: string) => void; go: (tab: string) => void }) {
  if (t.status === "blocked") return <Chip tone="bad">Blocked</Chip>;
  if (t.id === "t-clean-tod" && s.cleaning.some((c) => c.id === "cl1" && !c.done)) return <Btn size="sm" icon={IC.check} onClick={() => signOff(s, "cl1")}>Sign off</Btn>;
  if (t.id === "t-obs-tod") return <Btn size="sm" icon={IC.eye} onClick={() => go("curriculum")}>Review</Btn>;
  if (t.id === "t-plan-pre") return <Btn size="sm" icon={IC.arrow} onClick={() => go("curriculum")}>Open plan</Btn>;
  if (t.link?.type === "child") {
    const c = childById(t.link.id, s);
    if (c && c.checkedIn && !c.checkedOut) return <Btn size="sm" kind="primary" icon={IC.door} onClick={() => onHandover(c.id)}>Hand over</Btn>;
  }
  return <Btn size="sm" icon={IC.check} onClick={() => { setTaskStatus(t.id, "done"); toast("Done: " + t.title + "."); }}>Done</Btn>;
}

/* ═════════════════════════════════════════════════════════════════════════════
   ATTENDANCE
   ═════════════════════════════════════════════════════════════════════════════ */
type AttFilter = "all" | "notyet" | "late" | "in" | "out";
function Attendance({ s, site, rooms, room, setRoom, status, setStatus, onHandover }: {
  s: DemoState; site: SiteFilter; rooms: Room[]; room: string; setRoom: (id: string) => void; status: AttFilter; setStatus: (f: AttFilter) => void; onHandover: (id: string) => void;
}) {
  const all = s.children.filter((c) => inSite(site, c.site) && c.attendingToday && (room === "all" || c.room === room));
  const counts = { in: all.filter((c) => attState(c) === "in").length, late: all.filter((c) => attState(c) === "late").length, due: all.filter((c) => attState(c) === "due").length, out: all.filter((c) => attState(c) === "out").length };
  const rows = all.filter((c) => {
    const st = attState(c);
    return status === "all" || (status === "notyet" && (st === "late" || st === "due")) || (status === "late" && st === "late") || status === st;
  }).sort((a, b) => {
    const ra = ROOMS.findIndex((r) => r.id === a.room), rb = ROOMS.findIndex((r) => r.id === b.room);
    if (ra !== rb) return ra - rb;
    const order: Record<AttState, number> = { late: 0, due: 1, in: 2, out: 3 };
    return order[attState(a)] - order[attState(b)] || (toMin(a.expected) ?? 0) - (toMin(b.expected) ?? 0) || a.first.localeCompare(b.first);
  });
  const cols: Col<Child>[] = [
    { key: "c", label: "Child", render: (c) => <div><RecordLink type="child" id={c.id}>{c.first} {c.last}</RecordLink>{(c.alert || "").startsWith("Awaiting collection") && !c.checkedOut && <div className="ct-s" style={{ color: "var(--bad)" }}>Awaiting collection, guardian on the way</div>}</div> },
    { key: "r", label: "Room", render: (c) => roomById(c.room)?.name },
    { key: "e", label: "Expected", render: (c) => <span className="sh-num">{c.expected.replace(" (late)", "")}</span> },
    { key: "i", label: "In", render: (c) => <span className="sh-num">{c.checkedIn || "-"}</span> },
    { key: "o", label: "Out", render: (c) => <span className="sh-num">{c.checkedOut || "-"}</span> },
    { key: "cs", label: "Consents", render: (c) => { const miss = missingConsents(c); return miss.length ? <span className="sh-row" style={{ gap: 4, flexWrap: "wrap" }}>{miss.map((x) => <Chip key={x} tone="warn">{x} missing</Chip>)}</span> : <span className="sh-faint" style={{ fontSize: 12 }}>All current</span>; } },
    { key: "s", label: "Status", render: (c) => <AttChip c={c} /> },
    { key: "a", label: "", align: "r", render: (c) => { const st = attState(c); return <span onClick={(e) => e.stopPropagation()}>{st === "in" ? <Btn size="sm" icon={IC.door} onClick={() => onHandover(c.id)}>Hand over</Btn> : st === "out" ? <span className="sh-faint" style={{ fontSize: 11.5 }}>Logged</span> : <Btn size="sm" kind={st === "late" ? "primary" : "secondary"} icon={IC.check} onClick={() => doCheckIn(c)}>Check in</Btn>}</span>; } },
  ];
  return (
    <>
      <PageHead title="Attendance" sub={"Checked in " + (counts.in + counts.out) + " of " + all.length + " expected today" + (room !== "all" ? " in " + (roomById(room)?.name || "") : "") + ". Handover only to authorised collectors on the child's record."} right={<><DemoTag />{site !== "all" && <SiteChip site={site} />}</>} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="In now" value={counts.in} sub={"Of " + all.length + " expected today"} onClick={() => setStatus("in")} />
        <Stat label="Late" value={counts.late} sub="Expected time passed, not yet in" tone={counts.late ? "gold" : undefined} onClick={() => setStatus("late")} />
        <Stat label="Due later" value={counts.due} sub="Expected later today" onClick={() => setStatus("notyet")} />
        <Stat label="Collected" value={counts.out} sub="Handed over to an authorised collector" onClick={() => setStatus("out")} />
      </Grid>
      <div className="ct-filters">
        <select className="ct-select" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Filter by room">
          <option value="all">All rooms</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}{site === "all" ? ", " + siteName(r.site) : ""}</option>)}
        </select>
        <div className="sh-scroll-x"><Segmented<AttFilter> value={status} onChange={setStatus} options={[{ id: "all", label: "All" }, { id: "notyet", label: "Not yet in" }, { id: "late", label: "Late" }, { id: "in", label: "In" }, { id: "out", label: "Collected" }]} /></div>
        <span className="ct-s" style={{ marginTop: 0 }}>{rows.length} shown</span>
      </div>
      <Card pad={false}>
        <div style={{ padding: "6px 4px" }}>
          <Table cols={cols} rows={rows} rowKey={(c) => c.id} onRow={(c) => openDrawer("child", c.id)} maxHeight={620}
            empty={status === "late" ? "No late arrivals for this filter." : status === "out" ? "Nobody collected yet for this filter." : "No children match this filter."} />
        </div>
      </Card>
      <div className="ct-s" style={{ marginTop: 10 }}>Only attendance and consent state are shown here. Care plans and family details open in the child's record for people with access.</div>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   DAILY CARE
   ═════════════════════════════════════════════════════════════════════════════ */
function Care({ s, site, rooms, room, setRoom }: { s: DemoState; site: SiteFilter; rooms: Room[]; room: Room; setRoom: (id: string) => void }) {
  const [group, setGroup] = useState<"child" | "kind">("child");
  const logs = s.careLogs.filter((l) => childById(l.child, s)?.room === room.id);
  const sorted = logs.slice().sort((a, b) => (toMin(a.at) ?? -1) - (toMin(b.at) ?? -1));
  const byChild = Array.from(new Set(sorted.map((l) => l.child)));
  const kinds = KIND_ORDER.filter((k) => sorted.some((l) => l.kind === k));
  const queue = s.careLogs.filter((l) => l.status === "pending-review" && inSite(site, childById(l.child, s)?.site || "elm"));
  const cnt = (k: CareKind) => logs.filter((l) => l.kind === k && l.status !== "pending-review").length;
  const kidsIn = roomLive(s, room.id).inNow;
  const pendingRoom = logs.filter((l) => l.status === "pending-review").length;
  const LogLine = ({ l, showChild }: { l: CareLog; showChild?: boolean }) => {
    const c = childById(l.child, s);
    return (
      <div className="ct-log">
        <span className="at">{l.at}</span>
        <span className="ct-ico"><Icon d={KIND[l.kind].icon} size={13} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ct-t">{showChild && c ? <><RecordLink type="child" id={c.id}>{short(c)}</RecordLink>: </> : null}<b style={{ fontWeight: 500 }}>{l.title}</b></div>
          <div className="ct-s">{l.detail}</div>
          <div className="ct-s" style={{ color: "var(--faint)" }}>Logged by {personName(l.by, s)} on {room.tabletId}{l.parentVisible ? " · visible to parents" : " · not visible to parents"}</div>
        </div>
        {l.status === "pending-review" ? <Chip tone="gold">Awaiting review</Chip> : l.status === "approved" ? <Chip tone="ok">Approved</Chip> : null}
      </div>
    );
  };
  return (
    <>
      <PageHead title="Daily care" sub="Meals, sleeps, nappies, activities and observations as recorded on each room tablet today." right={<><DemoTag /><Btn kind="primary" icon={IC.tablet} onClick={() => setRole("educator")}>Open room tablet</Btn></>} />
      <div style={{ marginBottom: 12 }}>
        <Note tone="accent" icon={IC.tablet}>Every entry is made by a person on the room tablet. AI may summarise approved records for the room leader, but it never creates or changes a care event. Observations, incidents and medication stay hidden from parents until a room leader approves them.</Note>
      </div>
      <div className="ct-filters">
        <RoomSelect rooms={rooms} value={room.id} onChange={setRoom} />
        <Segmented value={group} onChange={setGroup} options={[{ id: "child", label: "By child" }, { id: "kind", label: "By kind" }]} />
        <span className="ct-s" style={{ marginTop: 0 }}>{logs.length} entries in {room.name} today</span>
      </div>
      <Grid cols="main">
        <Card title={room.name + ", today's log"} sub={kidsIn + " children in now. The room tablet is " + room.tabletId + "."}>
          {!sorted.length ? (
            <Empty title={"No entries logged yet today in " + room.name} hint="Entries appear here as soon as an educator saves them on the room tablet." />
          ) : group === "child" ? byChild.map((cid) => {
            const c = childById(cid, s);
            const own = sorted.filter((l) => l.child === cid);
            return (
              <div key={cid} className="ct-child">
                <div className="sh-row" style={{ gap: 8, marginBottom: 4 }}>
                  <Avatar initials={c ? (c.first[0] + c.last[0]).toUpperCase() : "?"} size={24} />
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{c ? <RecordLink type="child" id={c.id}>{c.first} {c.last}</RecordLink> : cid}</span>
                  <span className="ct-s" style={{ marginTop: 0 }}>{own.length} entr{own.length === 1 ? "y" : "ies"}</span>
                </div>
                {own.map((l) => <LogLine key={l.id} l={l} />)}
              </div>
            );
          }) : kinds.map((k) => (
            <div key={k} className="ct-child">
              <Sec n={sorted.filter((l) => l.kind === k).length}>{KIND[k].label}</Sec>
              {sorted.filter((l) => l.kind === k).map((l) => <LogLine key={l.id} l={l} showChild />)}
            </div>
          ))}
        </Card>
        <div className="sh-stack">
          <Card title="Room summary" sub="Counted from saved tablet entries only">
            <div className="ct-counts">
              {(["meal", "drink", "nappy", "sleep", "activity", "observation", "incident", "medication"] as CareKind[]).map((k) => (
                <div key={k} className="ct-count"><span className="l"><Icon d={KIND[k].icon} size={11} />{KIND[k].label}</span><span className="v">{k === "observation" || k === "incident" || k === "medication" ? logs.filter((l) => l.kind === k).length : cnt(k)}</span></div>
              ))}
            </div>
            <div className="ct-summary">
              {logs.length
                ? <>Summary drafted from {pl(logs.filter((l) => l.status !== "pending-review").length, "saved entry", "saved entries")} for {pl(new Set(logs.map((l) => l.child)).size, "child", "children")} in {room.name}: {pl(cnt("meal"), "meal")}, {pl(cnt("drink"), "drink")}, {pl(cnt("nappy"), "nappy change")}, {pl(cnt("sleep"), "sleep")} and {pl(cnt("activity"), "activity", "activities")}. {pendingRoom ? pendingRoom + " record" + (pendingRoom === 1 ? "" : "s") + " await room leader review and are not included." : "Nothing awaiting review."}</>
                : <>No saved entries yet, so there is nothing to summarise. The summary never fills gaps.</>}
            </div>
          </Card>
          <Card title={"Review queue · " + queue.length} sub={"Observations, incidents and medication across " + (site === "all" ? "both centres" : siteName(site))}>
            {queue.length ? queue.map((l) => {
              const c = childById(l.child, s);
              return (
                <Row key={l.id} title={(c ? short(c) + ", " + (roomById(c.room)?.name || "") : l.child)} meta={KIND[l.kind].label.replace(/s$/, "") + " by " + personName(l.by, s) + " at " + l.at + ": " + l.detail} onOpen={() => openDrawer("child", l.child)}>
                  <Btn size="sm" kind="primary" icon={IC.check} onClick={() => approveLog(s, l)}>Approve</Btn>
                  {l.kind === "observation" && <Btn size="sm" kind="ghost" onClick={() => returnObservation(s, l)}>Return</Btn>}
                </Row>
              );
            }) : <div className="ct-s">Nothing waiting for review.</div>}
          </Card>
        </div>
      </Grid>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   CURRICULUM
   ═════════════════════════════════════════════════════════════════════════════ */
function Curriculum({ s, site, rooms, room, setRoom }: { s: DemoState; site: SiteFilter; rooms: Room[]; room: Room; setRoom: (id: string) => void }) {
  const plan = PLANS[room.id];
  const ps = planState(s, room.id);
  const obs = s.careLogs.filter((l) => l.kind === "observation" && l.status === "pending-review" && inSite(site, childById(l.child, s)?.site || "elm"));
  const summaries = s.progress.filter((p) => inSite(site, childById(p.child, s)?.site || "elm"));
  const planTask = s.tasks.find((t) => t.id === "t-plan-pre");
  return (
    <>
      <PageHead title="Curriculum" sub="Weekly room plans tagged to Aistear themes and Síolta standards, observations awaiting a room leader, and educator-approved summaries for families." right={<DemoTag />} />
      <div className="ct-filters">
        <RoomSelect rooms={rooms} value={room.id} onChange={setRoom} />
        <span className="ct-s" style={{ marginTop: 0 }}>Week of {weekOf}</span>
      </div>
      <Grid cols="main" style={{ marginBottom: 12 }}>
        {plan ? (
          <Card title={room.name + ": " + plan.theme} sub={plan.focus}
            right={ps.published ? <Chip tone="ok">{ps.label}</Chip> : <Chip tone="gold">{ps.label}</Chip>}>
            {plan.schoolAge ? (
              <Note>School-age service under TU2021CC067SA. This is an activity plan; Aistear and Síolta tags apply to the early years rooms.</Note>
            ) : (
              <>
                <Sec>Aistear themes</Sec>
                <div className="sh-row" style={{ gap: 6, flexWrap: "wrap" }}>{plan.aistear.map((a) => <Chip key={a} tone="accent">{a}</Chip>)}</div>
                <Sec>Síolta standards</Sec>
                <div className="sh-row" style={{ gap: 6, flexWrap: "wrap" }}>{plan.siolta.map((x) => <Chip key={x} tone="outline">Síolta {x}</Chip>)}</div>
              </>
            )}
            <Sec>Activities and owners</Sec>
            <div className="ct-scroll"><PlanTable s={s} roomId={room.id} /></div>
            {!ps.published && planTask && (
              <div className="sh-row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <Btn kind="primary" size="sm" icon={IC.check} onClick={() => { setTaskStatus(planTask.id, "done"); toast(room.name + " plan published to the room tablet and the parent app (simulated)."); }}>Publish plan</Btn>
                <span className="ct-s" style={{ marginTop: 0 }}>Owner {personName(planTask.owner, s)} · {planTask.checklist.filter((c) => c.done).length} of {planTask.checklist.length} steps done</span>
              </div>
            )}
          </Card>
        ) : <Card><Empty title="No plan for this room" /></Card>}
        <Card title={"Observations to review · " + obs.length} sub="Written by educators on the tablet. Approval makes them visible to the family.">
          {obs.length ? obs.map((l) => {
            const c = childById(l.child, s);
            return (
              <div key={l.id} className="ct-row" style={{ alignItems: "flex-start" }}>
                <button type="button" className="ct-main" onClick={() => openDrawer("child", l.child)}>
                  <span className="ct-t" style={{ display: "block", fontWeight: 500 }}>{c ? short(c) : l.child} <span className="sh-faint" style={{ fontSize: 11.5, fontWeight: 400 }}>{c ? roomById(c.room)?.name : ""} · {l.at}</span></span>
                  <span className="ct-s" style={{ display: "block" }}>{l.detail}</span>
                  <span className="ct-s" style={{ display: "block", color: "var(--faint)" }}>Drafted by {personName(l.by, s)}</span>
                </button>
                <div className="ct-acts" style={{ flexDirection: "column" }}>
                  <Btn size="sm" kind="primary" icon={IC.check} onClick={() => approveLog(s, l)}>Approve</Btn>
                  <Btn size="sm" kind="ghost" onClick={() => returnObservation(s, l)}>Return</Btn>
                </div>
              </div>
            );
          }) : <div className="ct-s">No observations waiting.</div>}
        </Card>
      </Grid>
      <Card title="Summaries for families" sub="Educator-approved summaries drawn from approved observations. These are not developmental assessments." right={<Chip tone="outline">Human approved</Chip>}>
        {summaries.length ? (
          <div className="sh-grid sh-cols-2" style={{ gap: 12 }}>
            {summaries.map((p) => {
              const c = childById(p.child, s);
              return (
                <div key={p.id} className="ct-summary" style={{ background: "var(--surface-faint)" }}>
                  <div className="sh-row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    {c ? <RecordLink type="child" id={c.id}>{c.first} {c.last}</RecordLink> : p.child}
                    <Chip tone="outline">{p.period}</Chip>
                    {p.status === "approved" ? <Chip tone="ok">Approved</Chip> : <Chip tone="gold">Draft, not shared</Chip>}
                  </div>
                  <div className="ct-t" style={{ fontWeight: 500 }}>{p.label}</div>
                  <div className="sh-row" style={{ gap: 5, flexWrap: "wrap", margin: "6px 0" }}>{p.aistear.map((a) => <Chip key={a} tone="accent">{a}</Chip>)}</div>
                  {p.body.map((b, i) => <div key={i} className="ct-s" style={{ color: "var(--body)", fontSize: 12.5 }}>{b}</div>)}
                  <div className="ct-s" style={{ marginTop: 8, color: "var(--faint)" }}>{p.status === "approved" ? "Reviewed by " + personName(p.reviewedBy || "", s) + ", " + p.reviewedAt + ". Not a developmental assessment." : "Prepared from approved observations. A room leader must review it before the family sees it."}</div>
                  {p.status === "draft" && <div style={{ marginTop: 10 }}><Btn size="sm" kind="primary" icon={IC.check} onClick={() => { approveProgress(p.id); toast("Reviewed and released to the family."); }}>Review and release</Btn></div>}
                </div>
              );
            })}
          </div>
        ) : <Empty title="No summaries for this filter" hint="Summaries appear once a room leader has approved enough observations." />}
      </Card>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   CLEANING AND SAFETY
   ═════════════════════════════════════════════════════════════════════════════ */
function Cleaning({ s, site }: { s: DemoState; site: SiteFilter }) {
  const items = s.cleaning.filter((c) => inSite(site, c.site));
  const done = items.filter((c) => c.done);
  const over = items.filter(cleanOverdue);
  const later = items.filter((c) => !c.done && !cleanOverdue(c));
  const safety = s.tasks.filter((t) => ["t-open-elm", "t-open-bal", "t-drill-bal", "t-clean-tod"].includes(t.id) && inSite(site, t.site));
  const cols: Col<CleaningItem>[] = [
    { key: "a", label: "Area", render: (c) => <div><div className="strong">{c.area}</div><div className="ct-s">{c.task}</div></div> },
    { key: "d", label: "Due", render: (c) => <span className="sh-num">{c.due}</span> },
    { key: "o", label: "Responsible", render: (c) => <RecordLink type="staff" id={c.owner}>{personName(c.owner, s)}</RecordLink> },
    { key: "s", label: "Status", render: (c) => (c.done ? <Chip tone="ok">Signed off {c.done}</Chip> : cleanOverdue(c) ? <Chip tone="bad">Overdue</Chip> : <Chip tone="neutral">Due {c.due}</Chip>) },
    { key: "e", label: "Evidence", render: (c) => <span style={{ fontSize: 12, color: c.evidence ? "var(--body)" : "var(--faint)" }}>{c.evidence || "None yet"}</span> },
    { key: "x", label: "", align: "r", render: (c) => (c.done ? <span className="sh-faint" style={{ fontSize: 11.5 }}>Audited</span> : <span onClick={(e) => e.stopPropagation()}><Btn size="sm" kind={cleanOverdue(c) ? "primary" : "secondary"} icon={IC.check} onClick={() => signOff(s, c.id)}>Sign off</Btn></span>) },
  ];
  return (
    <>
      <PageHead title="Cleaning and safety" sub="Tablet checklists replace paper sheets. Each sign-off records who, when and the evidence, so the audit trail builds itself." right={<><DemoTag /><span style={{ fontSize: 12.5 }}><RecordLink type="policy" id="pol-cleaning">Cleaning and Infection Control v3.4</RecordLink></span></>} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Signed off today" value={<>{done.length}<span className="ct-of">/{items.length}</span></>} sub="Checklist items in view" />
        <Stat label="Overdue" value={over.length} sub="Due time passed, not signed off" tone={over.length ? "bad" : "ok"} />
        <Stat label="Due later today" value={later.length} sub="Open, not yet due" />
        <Stat label="With evidence" value={<>{items.filter((c) => c.evidence).length}<span className="ct-of">/{done.length}</span></>} sub="Of signed-off items" />
      </Grid>
      <div className="sh-stack" style={{ marginBottom: 12 }}>
        {sitesOf(site).map((sid) => {
          const own = items.filter((c) => c.site === sid).sort((a, b) => Number(!!a.done) - Number(!!b.done) || dueRank(a.due) - dueRank(b.due));
          return (
            <Card key={sid} title={siteName(sid)} sub={own.filter((c) => c.done).length + " of " + own.length + " signed off, " + own.filter(cleanOverdue).length + " overdue"} pad={false}>
              <div style={{ padding: "8px 4px 6px" }}><Table cols={cols} rows={own} rowKey={(c) => c.id} onRow={(c) => openDrawer("staff", c.owner)} empty="No checklist items for this site." /></div>
            </Card>
          );
        })}
      </div>
      <Card title="Safety routines" sub="Opening checks, drills and sign-offs that recur" right={<span style={{ fontSize: 12.5 }}><RecordLink type="policy" id="pol-emergency">Emergency Planning v2.2</RecordLink></span>}>
        {safety.map((t) => (
          <Row key={t.id} title={t.title} meta={personName(t.owner, s) + " · " + (t.recurring || "One-off") + " · due " + t.due + " · " + t.checklist.filter((c) => c.done).length + " of " + t.checklist.length + " steps"}
            chips={t.status === "done" ? <Chip tone="ok">Done {t.doneAt}</Chip> : <Chip tone="neutral">Open</Chip>} onOpen={() => openDrawer("task", t.id)}>
            {t.status !== "done" && <Btn size="sm" icon={IC.check} onClick={() => { setTaskStatus(t.id, "done"); toast("Done: " + t.title + "."); }}>Mark done</Btn>}
          </Row>
        ))}
        {!safety.length && <div className="ct-s">No safety routines for this filter.</div>}
      </Card>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   HANDOVERS
   ═════════════════════════════════════════════════════════════════════════════ */
function Handovers({ s, site, rooms, room }: { s: DemoState; site: SiteFilter; rooms: Room[]; room: Room }) {
  const role = roleDef(s.role);
  const [kind, setKind] = useState<"all" | Handover["kind"]>("all");
  const [outOnly, setOutOnly] = useState(false);
  const [fRoom, setFRoom] = useState(room.id);
  const [fKind, setFKind] = useState<Handover["kind"]>("Shift");
  const [fTo, setFTo] = useState("");
  const [fNote, setFNote] = useState("");
  const [fOut, setFOut] = useState("");
  const list = s.handovers.filter((h) => inSite(site, roomById(h.room)?.site || "elm") && (kind === "all" || h.kind === kind) && (!outOnly || !h.read || !!h.outstanding));
  const formRoom = roomById(fRoom) || room;
  const staffOpts = s.staff.filter((x) => x.site === formRoom.site && x.status === "on" && x.id !== role.personId);
  const guardianOpts = Array.from(new Set(s.children.filter((c) => c.room === formRoom.id && c.attendingToday).map((c) => c.family)))
    .flatMap((f) => guardiansOf(f, s).filter((g) => g.primary)).slice(0, 40);
  const toValid = fKind === "Parent" ? guardianOpts.some((g) => g.name === fTo) : staffOpts.some((x) => x.id === fTo);
  const can = toValid && fNote.trim().length >= 4;
  const submit = () => {
    if (!can) return;
    addHandover({ room: formRoom.id, kind: fKind, from: role.personId, to: fTo, note: fNote.trim(), outstanding: fOut.trim() || null });
    toast("Handover sent to " + personName(fTo, s) + ". It shows on the " + formRoom.name + " tablet.");
    setFNote(""); setFOut(""); setFTo("");
  };
  return (
    <>
      <PageHead title="Handovers" sub="Shift, room-to-room and parent handovers in one place: who sent it, who has read it, and what is still outstanding." right={<DemoTag />} />
      <Grid cols="main">
        <div>
          <div className="ct-filters">
            <Segmented value={kind} onChange={setKind} options={[{ id: "all", label: "All" }, { id: "Shift", label: "Shift" }, { id: "Room to room", label: "Room to room" }, { id: "Parent", label: "Parent" }]} />
            <span className="sh-row" style={{ gap: 8, fontSize: 12.5, color: "var(--dim)" }}><Toggle on={outOnly} onChange={setOutOnly} label="Outstanding only" />Outstanding only</span>
          </div>
          <Card pad>
            {list.length ? list.map((h) => {
              const r = roomById(h.room);
              return (
                <div key={h.id} className="ct-row" style={{ alignItems: "flex-start", padding: "12px 0" }}>
                  <button type="button" className="ct-main" onClick={() => openDrawer("room", h.room)}>
                    <span className="sh-row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                      <Chip tone="outline">{h.kind}</Chip>
                      <span className="ct-t" style={{ fontWeight: 500 }}>{r?.name}</span>
                      <span className="ct-s" style={{ marginTop: 0 }}>{h.at}</span>
                    </span>
                    <span className="ct-t" style={{ display: "block" }}>{h.note}</span>
                    <span className="ct-s" style={{ display: "block" }}>From {personName(h.from, s)} to {personName(h.to, s)} · {h.read ? "read by " + personName(h.to, s).split(" ")[0] : "not yet read by " + personName(h.to, s).split(" ")[0]}</span>
                    {h.outstanding && <span className="ct-s" style={{ display: "block", color: "var(--warn)" }}>Outstanding: {h.outstanding}</span>}
                  </button>
                  <div className="ct-acts" style={{ flexDirection: "column", alignItems: "flex-end" }}>
                    {h.read ? <Chip tone="ok">Read</Chip> : <Chip tone="gold">Unread</Chip>}
                    {!h.read && <Btn size="sm" icon={IC.eye} onClick={() => markRead(s, h)}>Mark read</Btn>}
                    {h.outstanding && <Btn size="sm" kind="ghost" icon={IC.check} onClick={() => closeFollowUp(s, h)}>Close follow-up</Btn>}
                  </div>
                </div>
              );
            }) : <Empty title={outOnly ? "Nothing outstanding for this filter" : "No handovers for this filter"} hint="Write one with the form; it appears on the room tablet." />}
          </Card>
        </div>
        <Card title="Write a handover" sub={"From " + role.person + ". Logged and shown on the room tablet."}>
          <div className="ct-form">
            <div>
              <label className="sh-label" htmlFor="ct-h-room">Room</label>
              <select id="ct-h-room" className="ct-select" style={{ width: "100%" }} value={fRoom} onChange={(e) => { setFRoom(e.target.value); setFTo(""); }}>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}{site === "all" ? ", " + siteName(r.site) : ""}</option>)}
              </select>
            </div>
            <div>
              <span className="sh-label">Type</span>
              <Segmented value={fKind} onChange={(v) => { setFKind(v); setFTo(""); }} options={[{ id: "Shift", label: "Shift" }, { id: "Room to room", label: "Room to room" }, { id: "Parent", label: "Parent" }]} />
            </div>
            <div>
              <label className="sh-label" htmlFor="ct-h-to">To</label>
              <select id="ct-h-to" className="ct-select" style={{ width: "100%" }} value={fTo} onChange={(e) => setFTo(e.target.value)}>
                <option value="">{fKind === "Parent" ? "Choose a parent or guardian" : "Choose a colleague on duty"}</option>
                {fKind === "Parent"
                  ? guardianOpts.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)
                  : staffOpts.map((x) => <option key={x.id} value={x.id}>{x.name}{x.room ? ", " + roomById(x.room)?.name : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="sh-label" htmlFor="ct-h-note">Handover note</label>
              <textarea id="ct-h-note" className="sh-input" rows={3} value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="What the next person needs to know" />
            </div>
            <div>
              <label className="sh-label" htmlFor="ct-h-out">Still outstanding (optional)</label>
              <input id="ct-h-out" className="sh-input" value={fOut} onChange={(e) => setFOut(e.target.value)} placeholder="For example: confirm collector at 17:30" />
            </div>
            <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Btn kind="primary" icon={IC.check} disabled={!can} onClick={submit} title={can ? undefined : "Choose who it is for and write a short note"}>Send handover</Btn>
              {!can && <span className="ct-s" style={{ marginTop: 0 }}>Choose a recipient and write a note.</span>}
            </div>
            {fKind === "Parent" && <div className="ct-s">Parent handovers are recorded here for staff. Anything sent to families goes through Parents and Messaging.</div>}
          </div>
        </Card>
      </Grid>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   PAGE
   ═════════════════════════════════════════════════════════════════════════════ */
export default function Centres() {
  const s = useDemo();
  const role = roleDef(s.role);
  const site = effectiveSite(s);
  const tab = activeTab("Centres", s);
  const rooms = ROOMS.filter((r) => inSite(site, r.site));
  const [roomSel, setRoomSel] = useState("elm-toddlers");
  const [attRoom, setAttRoom] = useState("all");
  const [attStatus, setAttStatus] = useState<AttFilter>("all");
  const [handoverFor, setHandoverFor] = useState<string | null>(null);

  if (!role.pages.includes("Centres")) return <Page><PageHead title="Centres" right={<DemoTag />} /><Restricted what="Centre operations and child records" /></Page>;

  const room = rooms.find((r) => r.id === roomSel) || rooms[0];
  const attRoomOk = attRoom === "all" || rooms.some((r) => r.id === attRoom) ? attRoom : "all";
  const go = (t: string) => setTab("Centres", t);
  const openRoom = (id: string) => { setRoomSel(id); go("rooms"); };
  const goAtt = (f: AttFilter) => { setAttStatus(f); go("attendance"); };

  let body: ReactNode;
  if (tab === "rooms") {
    body = (
      <>
        <PageHead title="Rooms" sub={"Staff allocation, children present, expected arrivals, care follow-ups and the week's plan for each room. " + TODAY_LABEL + ", " + nowLabel() + "."} right={<DemoTag />} />
        <RoomPicker s={s} rooms={rooms} value={room.id} onChange={setRoomSel} />
        <RoomDetail s={s} room={room} onHandover={setHandoverFor} go={go} />
      </>
    );
  } else if (tab === "attendance") {
    body = <Attendance s={s} site={site} rooms={rooms} room={attRoomOk} setRoom={setAttRoom} status={attStatus} setStatus={setAttStatus} onHandover={setHandoverFor} />;
  } else if (tab === "care") {
    body = <Care s={s} site={site} rooms={rooms} room={room} setRoom={setRoomSel} />;
  } else if (tab === "curriculum") {
    body = <Curriculum s={s} site={site} rooms={rooms} room={room} setRoom={setRoomSel} />;
  } else if (tab === "cleaning") {
    body = <Cleaning s={s} site={site} />;
  } else if (tab === "handovers") {
    body = <Handovers key={site} s={s} site={site} rooms={rooms} room={room} />;
  } else {
    body = (
      <>
        <PageHead title="Today in the centres" sub={TODAY_LABEL + ", " + nowLabel() + ". Live from the room tablets and the approved roster. Coverage is a watch against the roster, not a ratio calculation."} right={<><DemoTag />{site !== "all" && <SiteChip site={site} />}</>} />
        <div className="ct-sites">
          {sitesOf(site).map((sid) => <SiteStatus key={sid} s={s} id={sid} onAtt={() => { setAttRoom("all"); goAtt("all"); }} />)}
        </div>
        <Grid cols="main">
          <RoomsLive s={s} rooms={rooms} onRoom={openRoom} />
          <UrgentCard s={s} site={site} onHandover={setHandoverFor} goAtt={goAtt} go={go} />
        </Grid>
      </>
    );
  }
  return (
    <Page>
      {body}
      {handoverFor && <HandoverModal s={s} childId={handoverFor} onClose={() => setHandoverFor(null)} />}
    </Page>
  );
}
