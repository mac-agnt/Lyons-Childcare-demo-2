/* Shournagh parent app: Laura Murphy's phone (Murphy family, Elmgrove).
   Warm ivory and sage in both themes. Routine care stays in the app,
   Important notices are pushed, Urgent needs a tap with phone escalation
   behind it. Only the Murphy family's records are ever read here.
   `ParentPhone` is also embedded in Families > Parent App Preview. */
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import {
  useDemo, setState, ackMessage, sendMessage, setParentPref, logEvent, toast, update, add, nowLabel, euro,
  childById, familyById, guardiansOf, personName, roomById, staffById, policyById, siteById, POLICY_STAGES, type DemoState,
} from "../store";
import { CARE_LOGS as SEED_LOGS, FAMILIES as SEED_FAMILIES, FEE_SCHEDULE, dayLabel, siteName } from "../seed";
import type { CareKind, Child, Message, Policy } from "../types";
import { Icon, IC } from "../ui";
import { ReturnBar } from "../shell/DemoControls";
import "./parent.css";

const FAM = "fam-murphy";
const PARENT = "Laura Murphy";
const SEED_LOG_IDS = new Set(SEED_LOGS.map((l) => l.id));
const PARENT_POLICIES = ["pol-illness", "pol-parentcomms", "pol-collection", "pol-fees", "pol-complaints"];

/* ── helpers ───────────────────────────────────────────────────────────────── */
function timeKey(at: string): number {
  const m = at.match(/(\d{1,2}):(\d{2})/);
  const mins = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  return at.startsWith("Yesterday") ? mins - 1440 : mins;
}
const firstName = (n: string) => n.split(" ")[0];
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => (n < 0 ? "-" : "") + euro(Math.abs(n), 2);
function useTick(ms = 20000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN((n) => n + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
}
const collectionStageReached = (s: DemoState) =>
  POLICY_STAGES.findIndex((x) => x.id === s.policyFlow.stage) >= POLICY_STAGES.findIndex((x) => x.id === "signatures");
const collectionSigned = (s: DemoState) => s.events.some((e) => e.actor === PARENT && e.action === "signed Collection Authorisation v2.2");

/* ── care log grouping ─────────────────────────────────────────────────────── */
type Group = "arrival" | "meals" | "sleep" | "nappies" | "activities" | "notes";
const GROUP_OF: Record<CareKind, Group> = {
  arrival: "arrival", meal: "meals", drink: "meals", sleep: "sleep", nappy: "nappies",
  activity: "activities", observation: "activities", note: "notes", incident: "notes", medication: "notes",
};
const KIND_ICON: Record<CareKind, string> = {
  arrival: IC.door, meal: IC.meal, drink: IC.drink, sleep: IC.sleep, nappy: IC.nappy,
  activity: IC.activity, observation: IC.eye, note: IC.note, incident: IC.alert, medication: IC.pill,
};
const TILES: { id: Group; label: string; icon: string; none: string }[] = [
  { id: "meals", label: "Meals and drinks", icon: IC.meal, none: "Nothing yet" },
  { id: "sleep", label: "Sleep", icon: IC.sleep, none: "No nap yet" },
  { id: "nappies", label: "Nappies", icon: IC.nappy, none: "None logged" },
  { id: "notes", label: "Health notes", icon: IC.note, none: "None today" },
  { id: "activities", label: "Activities", icon: IC.activity, none: "Nothing yet" },
];

/* ── policy assistant (approved excerpts only, never diagnoses) ─────────────── */
interface Excerpt { heading: string; text: string }
interface PolicyAnswer { lead: string; quotes: Excerpt[]; cite: string | null; health: boolean; tell?: string; passed?: boolean }
const HEALTH_RE = /\b(sick|ill|unwell|fever|temperature|temp|rash|spots|cough|cold|vomit\w*|diarrh\w*|chicken ?pox|measles|medicine|medication|calpol|nurofen|doctor|gp|symptoms?|allerg\w*|teething|ear)\b/;
const DIAG_RE = /\b(does|do you think|could|might)\b.*\b(have|has|be)\b|is (it|this|that) (chicken ?pox|measles|contagious|serious)|diagnos|what (is|could) (it|this) be/;
const citeOf = (p: Policy, section: string) => p.title + " v" + p.version + ", section " + section + ", effective " + p.effective;
const ex = (p: Policy | undefined, prefix: string) => (p ? p.excerpt.find((x) => x.heading.startsWith(prefix)) : undefined);
const keep = (...xs: (Excerpt | undefined)[]) => xs.filter((x): x is Excerpt => !!x);

function answerPolicy(raw: string, s: DemoState, child: Child): PolicyAnswer | null {
  const t = raw.toLowerCase();
  const diag = DIAG_RE.test(t);
  const ill = policyById("pol-illness", s);
  const med = policyById("pol-medication", s);
  const col = policyById("pol-collection", s);
  const fees = policyById("pol-fees", s);
  const sleep = policyById("pol-safesleep", s);
  const comms = policyById("pol-parentcomms", s);
  const comp = policyById("pol-complaints", s);
  if (ill && /chicken ?pox|varicella/.test(t)) {
    return {
      lead: diag
        ? "I can't tell you whether " + child.first + " has chickenpox. I can only share what the centre's approved policy says."
        : "Here is what Shournagh's approved Illness and Exclusion Policy says about chickenpox.",
      quotes: keep(ex(ill, "5.4"), ex(ill, "5.1")), cite: citeOf(ill, "5.4"), health: true,
      tell: diag ? undefined : child.first + " has chickenpox and will stay at home until all the spots have crusted over, as the illness policy asks.",
    };
  }
  if (med && /\b(medicine|medication|calpol|nurofen|inhaler|antibiotics?|dose|cream)\b/.test(t)) {
    return { lead: "The centre only gives medication with your written consent on file. This is the approved wording.", quotes: keep(ex(med, "4")), cite: citeOf(med, "4"), health: true };
  }
  if (ill && /\b(temperature|fever|temp|vomit\w*|diarrh\w*|sick|unwell|ill|illness|exclusion|rash|cough)\b|stay (at )?home|keep \w+ (at )?home/.test(t)) {
    return { lead: "This is when the centre asks you to keep a child at home, and how an urgent collection works.", quotes: keep(ex(ill, "5.1"), ex(ill, "6.2")), cite: citeOf(ill, "5.1"), health: true };
  }
  if (col && /\b(collect\w*|pickup|grand\w*|granny|nana|collector|authori[sz]\w*)\b|pick(ing)? (\w+ )?up/.test(t)) {
    return { lead: "Only listed collectors can collect. You can name a one-time collector under More, Who can collect.", quotes: keep(ex(col, "3.1")), cite: citeOf(col, "3.1"), health: false };
  }
  if (fees && /\b(fees?|ncs|ecce|subsid\w*|pay|paying|payments?|invoices?|bill|cost|price|funding|award)\b/.test(t)) {
    return { lead: "This is how subsidies work at Shournagh. Your own statement is under Payments.", quotes: keep(ex(fees, "3")), cite: citeOf(fees, "3"), health: false };
  }
  if (sleep && /\b(sleep\w*|naps?|napping|cots?|bedtime|rest)\b/.test(t)) {
    return { lead: "Naps appear in " + child.first + "'s timeline as they are logged. This is how the rooms check on sleeping children.", quotes: keep(ex(sleep, "4.2")), cite: citeOf(sleep, "4.2"), health: false };
  }
  if (comms && /\b(emails?|notifications?|push|texts?|sms|contact|acknowledg\w*|urgent|digest)\b/.test(t)) {
    return { lead: "This is how the centre contacts you.", quotes: keep(ex(comms, "1"), ex(comms, "2")), cite: citeOf(comms, "1 and 2"), health: false };
  }
  if (comp && /\b(complain\w*|concerns?|unhappy)\b|not happy/.test(t)) {
    return { lead: "This is how to raise a concern.", quotes: keep(ex(comp, "1")), cite: citeOf(comp, "1"), health: false };
  }
  return null;
}

/* ── statement (illustrative amounts that reconcile to the family balance) ─── */
interface Line { label: string; sub: string; amount: number }
function statementFor(s: DemoState, kids: Child[]) {
  const opening = SEED_FAMILIES.find((f) => f.id === FAM)?.balance ?? 0;
  const lines: Line[] = [];
  kids.forEach((c) => {
    const r = roomById(c.room);
    if (!r) return;
    const young = r.programme === "babies" || r.programme === "wobblers";
    const sched = FEE_SCHEDULE.find((f) => f.programme.includes(young ? "Babies" : "Toddlers"));
    const n = c.pattern.length;
    const weekly = sched?.rows.find((x) => x[0] === n + " days")?.[1] ?? 0;
    lines.push({ label: "Full day care, " + r.name, sub: c.first + ", " + n + " days a week, 2 weeks", amount: weekly * 2 });
    if (c.funding.includes("ECCE")) lines.push({ label: "ECCE hours deducted", sub: c.first + ", 15 hrs a week, state-funded", amount: -96 });
    if (c.funding.includes("NCS")) lines.push({ label: "NCS subsidy applied", sub: c.first + ", award ref on file (masked)", amount: c.funding === "NCS" ? -52.5 : -48 });
  });
  const diff = r2(lines.reduce((n, l) => n + l.amount, 0) - opening);
  if (diff > 0) lines.push({ label: "Payment received, thank you", sub: dayLabel(-9) + ", saved card", amount: -diff });
  else if (diff < 0) lines.push({ label: "Balance brought forward", sub: "Previous statement", amount: -diff });
  return { opening, lines };
}

/* ── sheet shell ───────────────────────────────────────────────────────────── */
function SheetWrap({ title, sub, onClose, children, footer, bodyRef }: {
  title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; bodyRef?: Ref<HTMLDivElement>;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="pa-sheet-wrap" onClick={onClose}>
      <div className="pa-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="pa-grab" aria-hidden="true" />
        <div className="pa-sheet-h">
          <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
          <button type="button" className="pa-x" onClick={onClose} aria-label="Close"><Icon d={IC.x} size={14} sw={2.2} /></button>
        </div>
        <div className="pa-sheet-b" ref={bodyRef}>{children}</div>
        {footer && <div className="pa-sheet-f">{footer}</div>}
      </div>
    </div>
  );
}

function Row({ icon, warm, title, sub, right, onClick }: { icon?: string; warm?: boolean; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      {icon && <span className={"pa-row-ic" + (warm ? " warm" : "")}><Icon d={icon} size={17} /></span>}
      <span className="pa-row-m"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {right !== undefined ? <span className="pa-row-r">{right}</span> : onClick ? <span className="pa-row-r"><Icon d={IC.chevron} size={16} /></span> : null}
    </>
  );
  return onClick ? <button type="button" className="pa-row" onClick={onClick}>{inner}</button> : <div className="pa-row">{inner}</div>;
}

/* ── Today ─────────────────────────────────────────────────────────────────── */
function TodayScreen({ s, child, onMessages }: { s: DemoState; child: Child; onMessages: () => void }) {
  const [filter, setFilter] = useState<Group | "all">("all");
  const room = roomById(child.room);
  const logs = s.careLogs
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.child === child.id && l.parentVisible && !l.at.startsWith("Yesterday"))
    .sort((a, b) => timeKey(b.l.at) - timeKey(a.l.at) || a.i - b.i)
    .map((x) => x.l);
  const shown = filter === "all" ? logs : logs.filter((l) => GROUP_OF[l.kind] === filter);
  const young = !!room && (room.programme === "babies" || room.programme === "wobblers" || room.programme === "toddlers");
  const tiles = TILES.filter((t) => (young ? t.id !== "notes" : t.id !== "nappies"));
  const urgent = s.messages.find((m) => m.family === FAM && m.child === child.id && m.priority === "Urgent");
  const h = Number(nowLabel().slice(0, 2));
  const hello = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const status = child.checkedOut ? "Collected at " + child.checkedOut : child.checkedIn ? "In since " + child.checkedIn : child.attendingToday ? "Expected at " + child.expected : "Not booked in today";
  return (
    <>
      <section className="pa-hello">
        <p className="pa-kicker">{hello}, Laura</p>
        <h2>{child.first}'s day</h2>
        <div className="pa-hero">
          <span className="pa-av lg">{child.first.charAt(0)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="pa-hero-t">{status}</div>
            <div className="pa-hero-s">{room?.name} room, keyworker {personName(child.keyworker, s)}</div>
          </div>
        </div>
      </section>

      {urgent && !child.checkedOut && (
        <button type="button" className="pa-alert" onClick={onMessages}>
          <Icon d={IC.alert} size={19} />
          <span>
            <b>{urgent.ackAt ? "Collection request acknowledged at " + urgent.ackAt : "Urgent: please open and acknowledge"}</b>
            <small>{urgent.subject}</small>
          </span>
          <Icon d={IC.chevron} size={16} />
        </button>
      )}
      {urgent && child.checkedOut && (
        <div className="pa-alert calm">
          <Icon d={IC.check} size={19} />
          <span><b>{child.first} was handed over at {child.checkedOut}</b><small>The room has closed today's collection request.</small></span>
        </div>
      )}

      <div className="pa-quiet">
        <Icon d={IC.bell} size={17} />
        <span><b>Routine updates stay here.</b> No email or push is sent for each meal, nap or nappy. Look in whenever it suits you.</span>
      </div>

      <section>
        <h3 className="pa-h">So far today</h3>
        <div className="pa-tiles">
          {tiles.map((t) => {
            const items = logs.filter((l) => GROUP_OF[l.kind] === t.id);
            const last = items[0];
            const on = filter === t.id;
            return (
              <button key={t.id} type="button" className={"pa-tile" + (on ? " on" : "")} aria-pressed={on} onClick={() => setFilter(on ? "all" : t.id)}>
                <span className="pa-tile-ic"><Icon d={t.icon} size={18} /></span>
                <span className="pa-tile-n">{items.length}</span>
                <span className="pa-tile-l">{t.label}</span>
                <span className="pa-tile-x">{last ? last.title + ", " + last.at : t.none}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="pa-h-row">
          <h3 className="pa-h">{filter === "all" ? "Timeline" : TILES.find((t) => t.id === filter)?.label}</h3>
          {filter !== "all" && <button type="button" className="pa-textbtn" onClick={() => setFilter("all")}>Show all</button>}
        </div>
        {shown.length ? (
          <ol className="pa-tl">
            {shown.map((l) => {
              const fresh = !SEED_LOG_IDS.has(l.id);
              return (
                <li key={l.id} className={"pa-tl-i" + (fresh ? " fresh" : "")}>
                  <span className="pa-tl-t">{l.at}</span>
                  <span className="pa-tl-ic"><Icon d={KIND_ICON[l.kind]} size={17} /></span>
                  <div className="pa-tl-c">
                    <div className="pa-tl-h">{l.title}{fresh && <span className="pa-new">Just added</span>}</div>
                    {l.detail && <p>{l.detail}</p>}
                    <span className="pa-tl-by">{personName(l.by, s)}{l.status === "approved" ? ", reviewed by the room leader" : ""}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="pa-empty">Nothing here yet today. Entries appear as the room logs them on the tablet.</div>
        )}
      </section>
      <span className="pa-demo">DEMO DATA</span>
    </>
  );
}

/* ── Messages ──────────────────────────────────────────────────────────────── */
function UrgentCard({ m, s }: { m: Message; s: DemoState }) {
  const kid = m.child ? childById(m.child, s) : null;
  return (
    <article className="pa-note urgent">
      <div className="pa-note-top"><span className="pa-tag urgent">Urgent</span>{kid && <span className="pa-about">About {kid.first}</span>}<span className="pa-at">{m.at}</span></div>
      <h4>{m.subject}</h4>
      <p>{m.body}</p>
      <span className="pa-from">From {m.from}</span>
      {m.ackAt ? (
        <div className="pa-acked"><Icon d={IC.check} size={16} sw={2.2} />Acknowledged {m.ackBy === PARENT ? "by you" : "by " + m.ackBy} at {m.ackAt}</div>
      ) : m.ackRequired ? (
        <button type="button" className="pa-cta urgent" onClick={() => { ackMessage(m.id, PARENT); toast("Acknowledged. The room can see you have it."); }}>
          <Icon d={IC.check} size={17} sw={2.2} />Acknowledge
        </button>
      ) : null}
      {m.escalation.length > 0 && (
        <div className="pa-trail">
          <div className="pa-trail-h">Escalation trail</div>
          <ol>
            {m.escalation.map((e, i) => (
              <li key={i} className={e.state}>
                <span className="dot"><Icon d={e.state === "done" ? IC.check : e.state === "standby" ? IC.clock : IC.x} size={11} sw={2.4} /></span>
                <span>{e.step}<small>{e.state === "done" ? "Done" : e.state === "skipped" ? "Not needed, you acknowledged" : "On standby"}</small></span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}

function ImportantCard({ m, s, onPolicy }: { m: Message; s: DemoState; onPolicy: (id: string) => void }) {
  const kid = m.child ? childById(m.child, s) : null;
  return (
    <article className="pa-note important">
      <div className="pa-note-top"><span className="pa-tag important">Important</span>{kid && <span className="pa-about">About {kid.first}</span>}<span className="pa-at">{m.at}</span></div>
      <h4>{m.subject}</h4>
      <p>{m.body}</p>
      <span className="pa-from">From {m.from}</span>
      {m.id === "m-policy" && <button type="button" className="pa-textbtn" style={{ alignSelf: "flex-start" }} onClick={() => onPolicy("pol-parentcomms")}>Read the policy</button>}
      {m.ackAt ? (
        <div className="pa-acked"><Icon d={IC.check} size={16} sw={2.2} />Acknowledged {m.ackBy === PARENT ? "by you" : "by " + m.ackBy} at {m.ackAt}</div>
      ) : m.ackRequired ? (
        <button type="button" className="pa-cta" onClick={() => { ackMessage(m.id, PARENT); toast("Acknowledged. The centre can see you've read it."); }}>
          <Icon d={IC.check} size={17} sw={2.2} />Acknowledge
        </button>
      ) : <span className="pa-fine">No acknowledgement needed.</span>}
    </article>
  );
}

function MessagesScreen({ s, child, onPolicy }: { s: DemoState; child: Child; onPolicy: (id: string) => void }) {
  const [draft, setDraft] = useState("");
  const mine = s.messages.filter((m) => m.family === FAM);
  const urgent = mine.filter((m) => m.priority === "Urgent");
  const important = mine.filter((m) => m.priority === "Important");
  const routine = mine
    .filter((m) => m.priority === "Routine" && (m.child === child.id || m.child === null))
    .map((m, i) => ({ m, i }))
    .sort((a, b) => timeKey(a.m.at) - timeKey(b.m.at) || b.i - a.i)
    .map((x) => x.m);
  const room = roomById(child.room);
  const roomName = room ? room.name : "Room";
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    sendMessage({ family: FAM, child: child.id, from: PARENT, fromKind: "guardian", to: roomName + " room", priority: "Routine", subject: child.first + ": message from Laura", body, ackRequired: false, site: child.site });
    setDraft("");
    toast("Sent to the " + roomName + " room. Routine, so it stays in the app.");
  };
  return (
    <>
      <section className="pa-intro">
        <h2>Messages</h2>
        <p>Urgent and important notices are kept apart from everyday chat, so nothing that matters gets buried.</p>
      </section>

      {urgent.length > 0 && (
        <section>
          <h3 className="pa-h">Urgent</h3>
          {urgent.map((m) => <UrgentCard key={m.id} m={m} s={s} />)}
          <div className="pa-why">
            <Icon d={IC.shield} size={17} />
            <span><b>Why we ask for a tap.</b> A push notification on its own can be muted, delayed or missed, so it is not a safe emergency channel. Urgent notices need your acknowledgement, and if we don't hear back within 15 minutes we phone you, then your second contact.</span>
          </div>
        </section>
      )}

      <section>
        <h3 className="pa-h">Important</h3>
        {important.length ? <div className="pa-stack">{important.map((m) => <ImportantCard key={m.id} m={m} s={s} onPolicy={onPolicy} />)}</div>
          : <div className="pa-empty">No important notices right now.</div>}
      </section>

      <section>
        <h3 className="pa-h">{roomName} room</h3>
        <p className="pa-sub">Everyday messages about {child.first}. Routine, so no push and no email.</p>
        {routine.length ? (
          <div className="pa-chat">
            {routine.map((m) => (
              <div key={m.id} className={"pa-bub " + (m.fromKind === "guardian" ? "me" : "them")}>
                <p>{m.body}</p>
                <span>{m.fromKind === "guardian" ? (m.from === PARENT ? "You" : firstName(m.from)) : m.from}, {m.at}</span>
              </div>
            ))}
          </div>
        ) : <div className="pa-empty">No messages with the {roomName} room yet today.</div>}
        <form className="pa-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="pa-sr" htmlFor="pa-compose-input">Message the {roomName} room</label>
          <input id="pa-compose-input" className="pa-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={"Message the " + roomName + " room"} autoComplete="off" />
          <button type="submit" className="pa-send" disabled={!draft.trim()} aria-label="Send"><Icon d={IC.arrow} size={18} sw={2} /></button>
        </form>
      </section>
    </>
  );
}

/* ── Progress ──────────────────────────────────────────────────────────────── */
function ProgressScreen({ s, child }: { s: DemoState; child: Child }) {
  const reports = s.progress
    .filter((p) => p.child === child.id && p.status === "approved")
    .sort((a, b) => (a.period === b.period ? 0 : a.period === "Weekly" ? -1 : 1));
  const moments = s.careLogs.filter((l) => l.child === child.id && l.kind === "observation" && l.status === "approved" && l.parentVisible);
  const room = roomById(child.room);
  return (
    <>
      <section className="pa-intro">
        <h2>{child.first}'s progress</h2>
        <p>Short summaries written from educator observations and reviewed by the room leader before they reach you.</p>
      </section>
      {reports.length ? (
        <div className="pa-stack">
          {reports.map((p) => {
            const rev = p.reviewedBy ? staffById(p.reviewedBy, s) : undefined;
            return (
              <article key={p.id} className="pa-report">
                <div className="pa-note-top"><span className="pa-tag sage">{p.period}</span><span className="pa-at">{p.reviewedAt}</span></div>
                <h4>{p.label}</h4>
                <div className="pa-themes">{p.aistear.map((a) => <span key={a}>{a}</span>)}</div>
                {p.body.map((b, i) => <p key={i}>{b}</p>)}
                <div className="pa-reviewed">
                  <Icon d={IC.check} size={14} sw={2.2} />
                  <span><b>Reviewed by {rev ? rev.name : "the room leader"}</b>{rev ? ", " + rev.role : ""}. A learning summary framed by Aistear, not a developmental assessment.</span>
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="pa-empty">No summaries yet. They appear here once the room leader has reviewed them.</div>}
      {moments.length > 0 && (
        <section>
          <h3 className="pa-h">Moments the room noticed</h3>
          <div className="pa-stack">
            {moments.map((l) => (
              <div key={l.id} className="pa-note">
                <div className="pa-note-top"><span className="pa-tag quiet">Observation</span><span className="pa-at">{l.at}</span></div>
                <p>{l.detail}</p>
                <span className="pa-from">Logged by {personName(l.by, s)}, reviewed by the room leader</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="pa-fine">Questions about how {child.first} is getting on are always welcome. Talk to {room ? personName(room.leader, s) : "the room leader"} at pick-up or message the room.</p>
    </>
  );
}

/* ── Payments ──────────────────────────────────────────────────────────────── */
function PaymentsScreen({ s, kids, onPay }: { s: DemoState; kids: Child[]; onPay: () => void }) {
  const fam = familyById(FAM, s);
  const { opening, lines } = statementFor(s, kids);
  const balance = fam ? fam.balance : 0;
  const simPaid = r2(opening - balance);
  const payEv = s.events.find((e) => e.actor === PARENT && e.action.indexOf("simulated payment") >= 0);
  const all = simPaid > 0 ? lines.concat([{ label: "Paid with saved card (simulated)", sub: "Today " + (payEv ? payEv.at : ""), amount: -simPaid }]) : lines;
  const ncs = kids.filter((c) => c.funding.includes("NCS"));
  const ecce = kids.filter((c) => c.funding.includes("ECCE"));
  return (
    <>
      <section className="pa-intro">
        <h2>Payments</h2>
        <p>Your family statement for {kids.map((k) => k.first).join(" and ")}.</p>
      </section>
      <div className="pa-due">
        <span className="l">{balance > 0 ? "Amount due" : "Nothing due"}</span>
        <span className="v">{money(balance)}</span>
        <span className="x">{balance > 0 ? "Due by " + dayLabel(5) + ". Statement for 2 weeks to " + dayLabel(-3) + "." : "Paid today" + (payEv ? " at " + payEv.at : "") + " (simulated). Next statement " + dayLabel(11) + "."}</span>
        {balance > 0 && <button type="button" className="pa-cta" onClick={onPay}>Pay {money(balance)}</button>}
      </div>
      <section>
        <div className="pa-h-row"><h3 className="pa-h">Statement</h3><span className="pa-demo">ILLUSTRATIVE</span></div>
        <div className="pa-lines">
          {all.map((l, i) => (
            <div key={i} className="pa-line">
              <span><b>{l.label}</b><small>{l.sub}</small></span>
              <span className={"pa-amt" + (l.amount < 0 ? " neg" : "")}>{money(l.amount)}</span>
            </div>
          ))}
          <div className="pa-line total"><span><b>Balance due</b></span><span className="pa-amt">{money(balance)}</span></div>
        </div>
      </section>
      <section>
        <h3 className="pa-h">Funding</h3>
        <div className="pa-group">
          {ncs.length > 0 && <Row icon={IC.shield} title="National Childcare Scheme" sub={"NCS award ref: on file (masked). Applied for " + ncs.map((k) => k.first).join(" and ") + "."} />}
          {ecce.length > 0 && <Row icon={IC.calendar} title="ECCE free preschool" sub={ecce.map((k) => k.first).join(" and ") + ": 15 hours a week over 38 weeks, deducted on each statement."} />}
          <Row icon={IC.lock} title="Saved card (simulated)" sub="No card details are held in this demo." />
        </div>
        <p className="pa-fine">Subsidies are applied by the centre once your award is confirmed for Shournagh. Amounts here are illustrative.</p>
      </section>
    </>
  );
}

function PaySheet({ s, onClose }: { s: DemoState; onClose: () => void }) {
  const fam = familyById(FAM, s);
  const [step, setStep] = useState<"review" | "processing" | "done">("review");
  const [paid, setPaid] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const amount = fam ? fam.balance : 0;
  const pay = () => {
    if (amount <= 0) return;
    setPaid(amount);
    setStep("processing");
    timer.current = window.setTimeout(() => {
      update("families", FAM, { balance: 0 });
      logEvent({ actor: PARENT, actorKind: "parent", action: "made a simulated payment, no money moved", target: money(amount) + ", Murphy family statement (invoices unchanged)", kind: "data", site: "elm", story: null });
      toast("Simulated payment of " + money(amount) + ". No money moved.");
      setStep("done");
    }, 1200);
  };
  const footer = step === "review"
    ? <><button type="button" className="pa-cta" onClick={pay} disabled={amount <= 0}><Icon d={IC.lock} size={16} />Pay with saved card (simulated)</button><span className="pa-fine c">Simulated. No card details, and no money moves.</span></>
    : step === "done" ? <button type="button" className="pa-cta" onClick={onClose}>Done</button> : undefined;
  return (
    <SheetWrap title={step === "done" ? "Payment recorded" : "Pay your statement"} sub={step === "done" ? undefined : "Shournagh Childcare, " + siteName("elm")} onClose={onClose} footer={footer}>
      {step === "review" && (
        <>
          <dl className="pa-kv">
            <dt>Amount</dt><dd>{money(amount)}</dd>
            <dt>Family</dt><dd>Murphy family</dd>
            <dt>Paying with</dt><dd>Saved card (simulated)</dd>
            <dt>To</dt><dd>Shournagh Childcare</dd>
          </dl>
          <p className="pa-fine">This is a demonstration. Overdue invoices held by the office are not changed by this step.</p>
        </>
      )}
      {step === "processing" && (
        <div className="pa-stack" style={{ padding: "18px 0" }}>
          <span className="pa-fine c">Confirming with your saved card (simulated)</span>
          <div className="pa-bar"><i /></div>
        </div>
      )}
      {step === "done" && (
        <div className="pa-done">
          <span className="ring"><Icon d={IC.check} size={30} sw={2.2} /></span>
          <b>{money(paid)} paid (simulated)</b>
          <p>No money moved. The office sees the payment on your family statement, and it is in the activity log.</p>
          <span className="pa-demo">SIMULATED</span>
        </div>
      )}
    </SheetWrap>
  );
}

/* ── More ──────────────────────────────────────────────────────────────────── */
function MoreScreen({ s, child, open }: { s: DemoState; child: Child; open: (sh: Sheet) => void }) {
  const fam = familyById(FAM, s);
  const collectors = guardiansOf(FAM, s).filter((g) => g.authorisedCollect);
  const askV22 = collectionStageReached(s);
  const signedV22 = collectionSigned(s);
  const dataReq = s.events.find((e) => e.actor === PARENT && e.action.startsWith("requested a copy of her family's data"));
  const prefs = s.parentPrefs;
  const requestData = () => {
    logEvent({ actor: PARENT, actorKind: "parent", action: "requested a copy of her family's data (simulated)", target: "Murphy family, data access request", kind: "access", site: "elm", story: null });
    toast("Request logged (simulated). Nothing is downloaded in the demo.");
  };
  return (
    <>
      <section className="pa-intro">
        <h2>More</h2>
        <p>Policies, signatures, how we contact you and who can collect.</p>
      </section>

      <button type="button" className="pa-askcard" onClick={() => open({ kind: "ask" })}>
        <span className="ic"><Icon d={IC.search} size={20} /></span>
        <span><b>Ask about the centre's policies</b><small>Answers come only from Shournagh's approved policies, with the section cited.</small></span>
      </button>

      <section>
        <h3 className="pa-h">Signatures and acknowledgements</h3>
        <div className="pa-group">
          <Row icon={IC.policies} warm={!fam?.ackParentComms} title="Parent Communications Policy v1.0"
            sub={fam?.ackParentComms ? "Acknowledged" : "Please read and acknowledge"}
            right={fam?.ackParentComms ? <Icon d={IC.check} size={16} sw={2.2} style={{ color: "var(--pa-accent)" }} /> : <span className="pa-tag important">To do</span>}
            onClick={() => open({ kind: "policy", id: "pol-parentcomms" })} />
          {askV22 && (
            <Row icon={IC.policies} warm={!signedV22} title="Collection Authorisation v2.2" sub={signedV22 ? "Signed in the app" : "New version, signature requested"}
              right={signedV22 ? <Icon d={IC.check} size={16} sw={2.2} style={{ color: "var(--pa-accent)" }} /> : <span className="pa-tag important">To do</span>}
              onClick={() => open({ kind: "policy", id: "pol-collection" })} />
          )}
          {!askV22 && <Row icon={IC.policies} title={"Collection Authorisation v" + (policyById("pol-collection", s)?.version || "2.1")} sub={"Signed " + dayLabel(-290)} right={<Icon d={IC.check} size={16} sw={2.2} style={{ color: "var(--pa-accent)" }} />} />}
          <Row icon={IC.policies} title={"Fees and Funding v" + (policyById("pol-fees", s)?.version || "2.1")} sub={"Signed " + dayLabel(-70)} right={<Icon d={IC.check} size={16} sw={2.2} style={{ color: "var(--pa-accent)" }} />} />
        </div>
      </section>

      <section>
        <h3 className="pa-h">Policies for parents</h3>
        <div className="pa-group">
          {PARENT_POLICIES.map((id) => {
            const p = policyById(id, s);
            if (!p) return null;
            return <Row key={id} icon={IC.file} title={p.title} sub={"Version " + p.version + ", effective " + p.effective} onClick={() => open({ kind: "policy", id })} />;
          })}
        </div>
      </section>

      <section>
        <h3 className="pa-h">How we contact you</h3>
        <div className="pa-group">
          <div className="pa-pref">
            <div className="pa-pref-h"><span className="pa-row-ic"><Icon d={IC.sun} size={17} /></span><span className="pa-row-m"><b>Routine care updates</b><small>Meals, naps, nappies, activities. Never by email.</small></span></div>
            <div className="pa-seg" role="radiogroup" aria-label="Routine updates">
              {(["In-app only", "Daily digest"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={prefs.routine === v} className={prefs.routine === v ? "on" : ""} onClick={() => { if (prefs.routine !== v) { setParentPref("routine", v); toast("Routine updates: " + v.toLowerCase() + "."); } }}>{v === "Daily digest" ? "In-app digest at 18:00" : v}</button>
              ))}
            </div>
          </div>
          <div className="pa-pref">
            <div className="pa-pref-h"><span className="pa-row-ic warm"><Icon d={IC.bell} size={17} /></span><span className="pa-row-m"><b>Important notices</b><small>Outings, closures, policy changes.</small></span></div>
            <div className="pa-seg" role="radiogroup" aria-label="Important notices">
              {(["Push", "Push + email digest"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={prefs.important === v} className={prefs.important === v ? "on" : ""} onClick={() => { if (prefs.important !== v) { setParentPref("important", v); toast("Important notices: " + v.toLowerCase() + "."); } }}>{v}</button>
              ))}
            </div>
          </div>
          <div className="pa-pref">
            <div className="pa-pref-h"><span className="pa-row-ic warm"><Icon d={IC.alert} size={17} /></span><span className="pa-row-m"><b>Urgent notices</b><small>Collection requests and anything about your child's safety.</small></span></div>
            <div className="pa-locked"><Icon d={IC.lock} size={15} /><span><b>{prefs.urgent}</b>. Mandatory service communications cannot be silenced.</span></div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="pa-h">Who can collect</h3>
        <div className="pa-group">
          {collectors.map((g) => (
            <Row key={g.id} icon={IC.user} title={g.name} sub={g.relation + (g.primary ? ", primary contact" : "")} right={<span className="pa-tag sage">Authorised</span>} />
          ))}
          <Row icon={IC.plus} title="Name a one-time collector" sub="For a single day. Staff check photo ID at the door." onClick={() => open({ kind: "collector" })} />
        </div>
      </section>

      <section>
        <h3 className="pa-h">Privacy</h3>
        <div className="pa-group">
          <Row icon={IC.file} title="What the centre holds" sub="Your family's records and why" onClick={() => open({ kind: "holds" })} />
          <Row icon={IC.eye} title={"Who can see " + child.first + "'s records"} sub="Named roles only, every view logged" onClick={() => open({ kind: "access" })} />
          {dataReq
            ? <Row icon={IC.check} title="Copy of my data requested" sub={"Today " + dataReq.at + " (simulated). The centre prepares it and sends a secure link."} />
            : <Row icon={IC.arrow} title="Download a copy of my data" sub="Simulated in the demo" onClick={requestData} />}
        </div>
      </section>

      <p className="pa-fine c">Shournagh Childcare, {siteName("elm")}. Tusla registration {siteById("elm").tusla}. Signed in as Laura Murphy.</p>
      <span className="pa-demo">DEMO DATA</span>
    </>
  );
}

function PolicySheet({ s, id, onClose }: { s: DemoState; id: string; onClose: () => void }) {
  const p = policyById(id, s);
  const fam = familyById(FAM, s);
  if (!p) return null;
  const isComms = id === "pol-parentcomms";
  const v22 = id === "pol-collection" && collectionStageReached(s);
  const signed = collectionSigned(s);
  const ack = () => {
    const m = s.messages.find((x) => x.id === "m-policy");
    if (m && !m.ackAt) ackMessage("m-policy", PARENT);
    else if (fam && !fam.ackParentComms) {
      update("families", FAM, { ackParentComms: true });
      logEvent({ actor: PARENT, actorKind: "parent", action: "acknowledged Important notice", target: "Parent Communications Policy v1.0", kind: "people", site: "elm", story: "E" });
    }
    toast("Acknowledged. Thank you, Laura.");
  };
  const sign = () => {
    logEvent({ actor: PARENT, actorKind: "parent", action: "signed Collection Authorisation v2.2", target: "Signature recorded in the parent app (simulated)", kind: "people", site: "elm", story: "B" });
    toast("Signed Collection Authorisation v2.2 (simulated signature).");
  };
  let footer: ReactNode = undefined;
  if (isComms) footer = fam?.ackParentComms
    ? <div className="pa-acked"><Icon d={IC.check} size={16} sw={2.2} />You have acknowledged version {p.version}</div>
    : <button type="button" className="pa-cta" onClick={ack}><Icon d={IC.check} size={17} sw={2.2} />Acknowledge version {p.version}</button>;
  if (v22) footer = signed
    ? <div className="pa-acked"><Icon d={IC.check} size={16} sw={2.2} />Signed version 2.2</div>
    : <button type="button" className="pa-cta" onClick={sign}>Sign version 2.2 (simulated)</button>;
  return (
    <SheetWrap title={p.title} sub={"Version " + p.version + ", effective " + p.effective + ". Next review " + p.nextReview + "."} onClose={onClose} footer={footer}>
      <div className="pa-meta"><span className="pa-tag sage">{p.audience}</span><span className="pa-tag quiet">{p.status}</span></div>
      {p.excerpt.map((e) => (
        <div key={e.heading} className="pa-section"><h5>{e.heading}</h5><p>{e.text}</p></div>
      ))}
      <div className="pa-why"><Icon d={IC.note} size={16} /><span><b>What changed.</b> {p.changeSummary}</span></div>
      <p className="pa-fine">Approved by Shournagh Childcare. The full policy is available from the office.</p>
    </SheetWrap>
  );
}

function AskSheet({ s, child, onClose }: { s: DemoState; child: Child; onClose: () => void }) {
  const [text, setText] = useState("");
  const [log, setLog] = useState<{ q: string; a: PolicyAnswer }[]>([]);
  const [told, setTold] = useState<number[]>([]);
  const body = useRef<HTMLDivElement>(null);
  const room = roomById(child.room);
  const roomName = room ? room.name : "room";
  const leader = room ? personName(room.leader, s) : "the room leader";
  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight; }, [log.length]);
  const suggestions = [
    "My child has chickenpox. What is Shournagh's illness policy?",
    "Can my mother collect " + child.first + " on Friday?",
    "How does the NCS subsidy work?",
    "How do you check on children when they nap?",
  ];
  const ask = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    const found = answerPolicy(q, s, child);
    let a: PolicyAnswer;
    if (found) {
      a = found;
      logEvent({ actor: "Policy assistant", actorKind: "agent", action: "answered a parent question from approved policy", target: (found.cite || "") + " (asked by Laura M.)", kind: "agent", site: child.site, story: "E" });
    } else {
      sendMessage({ family: FAM, child: child.id, from: PARENT, fromKind: "guardian", to: leader + ", " + roomName, priority: "Routine", subject: "Question passed on by the policy assistant", body: q, ackRequired: false, site: child.site });
      a = { lead: "I can only answer from Shournagh's approved policies, and none of them covers this. I've passed your question to " + leader + ", " + child.first + "'s room leader. The reply will appear in Messages.", quotes: [], cite: null, health: HEALTH_RE.test(q.toLowerCase()), passed: true };
    }
    setLog((l) => l.concat([{ q, a }]));
    setText("");
  };
  const tell = (i: number, msg: string) => {
    sendMessage({ family: FAM, child: child.id, from: PARENT, fromKind: "guardian", to: roomName + " room", priority: "Routine", subject: child.first + " is off sick", body: msg, ackRequired: false, site: child.site });
    setTold((t) => t.concat([i]));
    toast("The " + roomName + " room has your message.");
  };
  return (
    <SheetWrap title="Ask about Shournagh's policies" sub="Answers quote the centre's approved policies and cite the section. The assistant never diagnoses." onClose={onClose} bodyRef={body}
      footer={
        <form className="pa-compose" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
          <label className="pa-sr" htmlFor="pa-ask-input">Your question</label>
          <input id="pa-ask-input" className="pa-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question" autoComplete="off" />
          <button type="submit" className="pa-send" disabled={!text.trim()} aria-label="Ask"><Icon d={IC.arrow} size={18} sw={2} /></button>
        </form>
      }>
      {log.length === 0 && (
        <div className="pa-sugs">
          <span className="pa-help">Try one of these</span>
          {suggestions.map((q) => <button key={q} type="button" className="pa-sug" onClick={() => ask(q)}>{q}</button>)}
        </div>
      )}
      {log.map(({ q, a }, i) => (
        <div key={i} className="pa-stack">
          <div className="pa-q">{q}</div>
          <div className="pa-a">
            <p>{a.lead}</p>
            {a.quotes.map((x) => <blockquote key={x.heading} className="pa-quote"><b>{x.heading}</b>{x.text}</blockquote>)}
            {a.cite && <div className="pa-cite"><Icon d={IC.policies} size={14} />{a.cite}</div>}
            {a.health && <div className="pa-disc">This is the centre's policy, not medical advice. For health questions contact your GP or HSE.</div>}
            {a.tell && (
              <button type="button" className="pa-cta ghost sm" disabled={told.includes(i)} onClick={() => tell(i, a.tell || "")}>
                {told.includes(i) ? "Sent to the " + roomName + " room" : "Let the " + roomName + " room know"}
              </button>
            )}
            {a.passed && <span className="pa-fine">Sent as a routine message, so it stays in the app.</span>}
          </div>
        </div>
      ))}
      {log.length > 0 && (
        <div className="pa-sugs">
          {suggestions.filter((q) => !log.some((x) => x.q === q)).slice(0, 2).map((q) => <button key={q} type="button" className="pa-sug" onClick={() => ask(q)}>{q}</button>)}
        </div>
      )}
    </SheetWrap>
  );
}

function CollectorSheet({ kids, onClose }: { kids: Child[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [rel, setRel] = useState("Grandparent");
  const [when, setWhen] = useState<"Today" | "Tomorrow">("Today");
  const [who, setWho] = useState<string>("both");
  const ok = name.trim().length >= 3;
  const forLabel = who === "both" ? kids.map((k) => k.first).join(" and ") : kids.find((k) => k.id === who)?.first || "";
  const save = () => {
    if (!ok) return;
    const nm = name.trim();
    add("guardians", { id: FAM + "-ot" + Date.now(), name: nm, relation: rel + " (one-time, " + when.toLowerCase() + ")", family: FAM, phone: "Not held", email: "Not held", authorisedCollect: true, primary: false });
    logEvent({ actor: PARENT, actorKind: "parent", action: "named a one-time collector (photo ID check at the door)", target: nm + " for " + forLabel + ", " + when.toLowerCase(), kind: "people", site: "elm", story: null });
    toast(nm + " can collect " + forLabel + " " + when.toLowerCase() + ". Staff will check photo ID.");
    onClose();
  };
  return (
    <SheetWrap title="Name a one-time collector" sub="Under the Collection Authorisation Procedure, a one-time collector is named by a guardian in advance and shows photo ID." onClose={onClose}
      footer={<button type="button" className="pa-cta" disabled={!ok} onClick={save}>Add collector</button>}>
      <div className="pa-field">
        <label htmlFor="pa-col-name">Full name</label>
        <input id="pa-col-name" className="pa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="As shown on their photo ID" autoComplete="off" />
        <span className="pa-help">Staff compare this name with photo ID at the door.</span>
      </div>
      <div className="pa-field">
        <label htmlFor="pa-col-rel">Relationship</label>
        <select id="pa-col-rel" className="pa-input" value={rel} onChange={(e) => setRel(e.target.value)}>
          {["Grandparent", "Aunt or uncle", "Family friend", "Childminder", "Neighbour"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="pa-field">
        <span className="lbl">When</span>
        <div className="pa-seg" role="radiogroup" aria-label="When">
          {(["Today", "Tomorrow"] as const).map((w) => <button key={w} type="button" role="radio" aria-checked={when === w} className={when === w ? "on" : ""} onClick={() => setWhen(w)}>{w}</button>)}
        </div>
      </div>
      {kids.length > 1 && (
        <div className="pa-field">
          <span className="lbl">Collecting</span>
          <div className="pa-seg" role="radiogroup" aria-label="Which child">
            <button type="button" role="radio" aria-checked={who === "both"} className={who === "both" ? "on" : ""} onClick={() => setWho("both")}>Both</button>
            {kids.map((k) => <button key={k.id} type="button" role="radio" aria-checked={who === k.id} className={who === k.id ? "on" : ""} onClick={() => setWho(k.id)}>{k.first}</button>)}
          </div>
        </div>
      )}
    </SheetWrap>
  );
}

function HoldsSheet({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["Contact details", "Names, masked phone and email for each guardian, so we can reach you."],
    ["Children's records", "Room, booked days, keyworker, care plan only where one is needed, consents."],
    ["Daily care logs", "Meals, naps, nappies and activities entered by staff on the room tablet."],
    ["Learning summaries", "Weekly and monthly summaries, released after room leader review."],
    ["Fees and funding", "Statements, payments and scheme references (NCS award ref held masked)."],
    ["Messages and acknowledgements", "Notices, replies and when you acknowledged them."],
  ];
  return (
    <SheetWrap title="What the centre holds" sub="Kept while your children attend, then for the period the law requires. Retention periods to be confirmed with the centre." onClose={onClose}>
      <div className="pa-group">{rows.map(([t, d]) => <Row key={t} icon={IC.file} title={t} sub={d} />)}</div>
      <p className="pa-fine">No PPS numbers are stored in this demo. All records shown are fictional.</p>
    </SheetWrap>
  );
}

function AccessSheet({ s, child, onClose }: { s: DemoState; child: Child; onClose: () => void }) {
  const room = roomById(child.room);
  const site = siteById(child.site);
  const rows: [string, string][] = [
    [personName(child.keyworker, s), "Keyworker. Daily care logs and observations."],
    [room ? personName(room.leader, s) : "Room leader", "Room leader. Reviews observations and summaries before release."],
    [personName(site.manager, s), "Centre manager, " + site.name + ". Full record for this centre."],
    ["Edel Lyons", "Owner. Full record across both centres."],
  ];
  return (
    <SheetWrap title={"Who can see " + child.first + "'s records"} sub="Access follows the job, and every view is written to the access log." onClose={onClose}>
      <div className="pa-group">{rows.map(([t, d]) => <Row key={t} icon={IC.user} title={t} sub={d} />)}</div>
      <div className="pa-why"><Icon d={IC.lock} size={16} /><span><b>Not visible to:</b> HR and finance staff, who see invoices and funding only; staff at the other centre; and other families.</span></div>
      <p className="pa-fine">Room tablets need each educator's personal PIN, so entries are always signed by a named person.</p>
    </SheetWrap>
  );
}

/* ── the phone ─────────────────────────────────────────────────────────────── */
type Tab = "today" | "messages" | "progress" | "payments" | "more";
type Sheet = { kind: "policy"; id: string } | { kind: "ask" } | { kind: "pay" } | { kind: "collector" } | { kind: "holds" } | { kind: "access" } | null;
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: IC.sun },
  { id: "messages", label: "Messages", icon: IC.message },
  { id: "progress", label: "Progress", icon: IC.chart },
  { id: "payments", label: "Payments", icon: IC.euro },
  { id: "more", label: "More", icon: IC.overview },
];

/** Laura Murphy's parent app. `framed` always shows the device; `auto` drops the frame below 520px. */
export function ParentPhone({ variant = "framed", height }: { variant?: "framed" | "auto"; height?: number }) {
  const s = useDemo();
  useTick();
  const [tab, setTab] = useState<Tab>("today");
  const [sheet, setSheet] = useState<Sheet>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [tab, s.parentChild]);
  const fam = familyById(FAM, s);
  const kids = (fam ? fam.children : []).map((id) => childById(id, s)).filter((c): c is Child => !!c);
  const child = kids.find((c) => c.id === s.parentChild) || kids[0];
  if (!fam || !child) return null;
  const needAck = s.messages.filter((m) => m.family === FAM && m.fromKind !== "guardian" && m.ackRequired && !m.ackAt).length;
  const close = () => setSheet(null);
  const openPolicy = (id: string) => setSheet({ kind: "policy", id });
  const room = roomById(child.room);

  let sheetEl: ReactNode = null;
  if (sheet && sheet.kind === "policy") sheetEl = <PolicySheet s={s} id={sheet.id} onClose={close} />;
  else if (sheet && sheet.kind === "ask") sheetEl = <AskSheet s={s} child={child} onClose={close} />;
  else if (sheet && sheet.kind === "pay") sheetEl = <PaySheet s={s} onClose={close} />;
  else if (sheet && sheet.kind === "collector") sheetEl = <CollectorSheet kids={kids} onClose={close} />;
  else if (sheet && sheet.kind === "holds") sheetEl = <HoldsSheet onClose={close} />;
  else if (sheet && sheet.kind === "access") sheetEl = <AccessSheet s={s} child={child} onClose={close} />;

  return (
    <div className={"pa-device" + (variant === "auto" ? " pa-auto" : "")} style={height ? { height } : undefined}>
      <span className="pa-key k1" aria-hidden="true" /><span className="pa-key k2" aria-hidden="true" /><span className="pa-key k3" aria-hidden="true" />
      <div className="pa-screen">
        <div className="pa-island" aria-hidden="true" />
        <div className="pa-status" aria-hidden="true">
          <span>{nowLabel()}</span>
          <span className="pa-sys"><span className="pa-sig"><i /><i /><i /><i /></span><span className="pa-bat"><i /></span></span>
        </div>
        <header className="pa-top">
          <div className="pa-top-row">
            <div className="pa-brand">
              <span className="pa-mark" aria-hidden="true">S</span>
              <span style={{ minWidth: 0 }}><b>Shournagh</b><small>{siteName(child.site)}{room ? ", " + room.name + " room" : ""}</small></span>
            </div>
            <button type="button" className="pa-ask" onClick={() => setSheet({ kind: "ask" })}><Icon d={IC.search} size={15} sw={2} />Ask</button>
          </div>
          {kids.length > 1 && (
            <div className="pa-kids" role="tablist" aria-label="Choose child">
              {kids.map((k) => {
                const r = roomById(k.room);
                const on = k.id === child.id;
                return (
                  <button key={k.id} type="button" role="tab" aria-selected={on} className={"pa-kid" + (on ? " on" : "")} onClick={() => setState({ parentChild: k.id })}>
                    <span className="pa-av">{k.first.charAt(0)}</span>
                    <span style={{ minWidth: 0 }}><b>{k.first}</b><small>{r ? r.name : ""}{k.checkedOut ? ", collected" : k.checkedIn ? ", in" : ""}</small></span>
                  </button>
                );
              })}
            </div>
          )}
        </header>
        <main className="pa-scroll" ref={scroller}>
          <div className="pa-view" key={tab + child.id}>
            {tab === "today" && <TodayScreen s={s} child={child} onMessages={() => setTab("messages")} />}
            {tab === "messages" && <MessagesScreen s={s} child={child} onPolicy={openPolicy} />}
            {tab === "progress" && <ProgressScreen s={s} child={child} />}
            {tab === "payments" && <PaymentsScreen s={s} kids={kids} onPay={() => setSheet({ kind: "pay" })} />}
            {tab === "more" && <MoreScreen s={s} child={child} open={setSheet} />}
          </div>
        </main>
        <nav className="pa-nav" aria-label="Parent app">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <span className="pa-nav-ic">
                <Icon d={t.icon} size={22} sw={tab === t.id ? 2 : 1.7} />
                {t.id === "messages" && needAck > 0 && <span className="pa-badge" aria-label={needAck + " to acknowledge"}>{needAck}</span>}
              </span>
              {t.label}
            </button>
          ))}
        </nav>
        <span className="pa-home" aria-hidden="true" />
        {sheetEl}
      </div>
    </div>
  );
}

/** Full-screen parent surface (preview role "parent"). */
export default function ParentApp() {
  return (
    <div className="pa-stage">
      <ReturnBar label="Parent app" />
      <ParentPhone variant="auto" />
      <p className="pa-caption">Laura Murphy's phone. Routine updates stay in the app, important notices are pushed, urgent ones need a tap with a phone call behind them.</p>
    </div>
  );
}
