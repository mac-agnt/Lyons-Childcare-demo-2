/* Room tablet: the Toddlers room at Elmgrove on shared device TAB-E3.
   Educators sign in with a personal PIN. The tablet shows this room's children
   attending today and nothing else. Every tap writes a care log through the
   store, so the parent app, Centres, Work and Activity update immediately.
   Care events are only ever created by an educator: AI is not used here. */
import { useEffect, useState, type ReactNode } from "react";
import {
  useDemo, addCareLog, addHandover, readHandover, nowLabel, personName, guardiansOf, primaryGuardian,
  update, add, logEvent, toast, setState, type DemoState,
} from "../store";
import { Icon, IC, Modal, Chip, Steps } from "../ui";
import { ReturnBar } from "../shell/DemoControls";
import type { Child, CareLog, CareKind, Task, Guardian, Handover } from "../types";
import "./roomtablet.css";

/* ── Room constants ────────────────────────────────────────────────────────── */
const ROOM_ID = "elm-toddlers";
const TABLET = "TAB-E3";
const LEADER = "s07";                 // Aisling Corcoran, room leader
const MANAGER = "s01";                // Gráinne Twomey, centre manager
const EDUCATORS = ["s08", "s07"];     // personal PINs on this tablet
type MealType = "Breakfast" | "Snack" | "Lunch";
const MEALS: MealType[] = ["Breakfast", "Snack", "Lunch"];
const MENU: Record<MealType, string> = { Breakfast: "Porridge and fruit", Snack: "Apple slices and rice cakes", Lunch: "Shepherd's pie, carrots and peas" };
type Amount = "All" | "Most" | "Some" | "None";
const AMOUNTS: Amount[] = ["All", "Most", "Some", "None"];
const AMOUNT_TEXT: Record<Amount, string> = { All: "Ate all", Most: "Ate most", Some: "Ate some", None: "Did not eat" };
const PLAN: { title: string; aistear: string; at: string }[] = [
  { title: "Sand and water tray", aistear: "Exploring and Thinking", at: "09:15" },
  { title: "Circle time: pouring song", aistear: "Communicating", at: "10:15" },
  { title: "Puddle walk in the garden", aistear: "Well-being", at: "10:45" },
  { title: "Playdough and cutters", aistear: "Exploring and Thinking", at: "14:00" },
  { title: "Family photo wall chat", aistear: "Identity and Belonging", at: "15:30" },
];
const SUPPLIES = ["Nappies, size 4", "Nappies, size 5", "Wipes", "Nappy cream", "Spare clothes (room stock)", "Tissues"];

/* ── Time helpers (demo clock is HH:MM) ────────────────────────────────────── */
const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
const fromMin = (n: number) => { const v = ((n % 1440) + 1440) % 1440; return String(Math.floor(v / 60)).padStart(2, "0") + ":" + String(v % 60).padStart(2, "0"); };
const dur = (mins: number) => (mins < 60 ? mins + " min" : Math.floor(mins / 60) + "h " + String(mins % 60).padStart(2, "0") + "m");
const defaultMeal = (m: number): MealType => (m < 570 ? "Breakfast" : m < 690 ? "Snack" : m < 810 ? "Lunch" : "Snack");
const short = (c: Child) => c.first + " " + c.last.charAt(0) + ".";
const initials = (c: Child) => (c.first.charAt(0) + c.last.charAt(0)).toUpperCase();
const firstName = (full: string) => full.split(" ")[0];

/** Newest first: by logged time, then by insertion (new logs are prepended). */
function sortLogs(list: CareLog[]): CareLog[] {
  return list.map((l, i) => ({ l, i, m: toMin(l.at) }))
    .sort((a, b) => (isNaN(b.m) ? -1 : b.m) - (isNaN(a.m) ? -1 : a.m) || a.i - b.i)
    .map((x) => x.l);
}

/* ── Per-child status derived from today's care logs ───────────────────────── */
interface St {
  state: "in" | "out" | "notin";
  asleepSince: number | null;
  lastCheck: number | null;
  checkDueIn: number | null;     // minutes until the next 10-minute sleep check (negative = overdue)
  lastMeal: CareLog | null;
  lastNappy: CareLog | null;
  nappyDue: boolean;
}
function statusOf(c: Child, mine: CareLog[], nowM: number): St {
  const state: St["state"] = c.checkedOut ? "out" : c.checkedIn ? "in" : "notin";
  let asleepSince: number | null = null;
  let lastCheck: number | null = null;
  for (const l of mine) {
    if (l.kind !== "sleep") continue;
    if (l.title === "Sleep check") { if (lastCheck === null) lastCheck = toMin(l.at); continue; }
    if (l.title === "Asleep") { const m = /at (\d{2}:\d{2})/.exec(l.detail); asleepSince = toMin(m ? m[1] : l.at); }
    break;
  }
  if (state !== "in") asleepSince = null;
  const base = asleepSince === null ? null : Math.max(asleepSince, lastCheck ?? asleepSince);
  const lastMeal = mine.find((l) => l.kind === "meal") || null;
  const lastNappy = mine.find((l) => l.kind === "nappy") || null;
  const since = lastNappy ? toMin(lastNappy.at) : c.checkedIn ? toMin(c.checkedIn) : NaN;
  return {
    state, asleepSince, lastCheck: asleepSince === null ? null : lastCheck,
    checkDueIn: base === null ? null : base + 10 - nowM,
    lastMeal, lastNappy,
    nappyDue: state === "in" && asleepSince === null && !isNaN(since) && nowM - since >= 120,
  };
}

/** Medication consent on file (demo data): nothing can be given without one. */
function medConsent(c: Child, s: DemoState): { med: string; dose: string; signed: string } | null {
  const g = primaryGuardian(c.family, s)?.name || "a guardian";
  if (c.id === "c-rory") return { med: "Emollient cream (dry skin)", dose: "Thin layer to hands, as needed", signed: g };
  if (c.alert && /cream consent/i.test(c.alert)) return { med: "Eczema cream", dose: "Thin layer to affected skin, as needed", signed: g };
  return null;
}

function newTask(title: string, owner: string, priority: Task["priority"], link: Task["link"], checklist: string[] = []): Task {
  return { id: "t" + Date.now() + Math.floor(Math.random() * 99), title, owner, site: "elm", due: "Today", priority, status: "todo", link, story: null,
    checklist: checklist.map((label) => ({ label, done: false })), recurring: null, doneAt: null };
}

const KIND_ICON: Record<CareKind, string> = {
  meal: IC.meal, sleep: IC.sleep, nappy: IC.nappy, drink: IC.drink, activity: IC.activity, observation: IC.eye,
  incident: IC.alert, medication: IC.pill, arrival: IC.door, note: IC.note,
};

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function RoomTablet() {
  const s = useDemo();
  const [who, setWho] = useState<string>("s08");
  const [locked, setLocked] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "switch" | "lunch" | "supplies" | "handover">(null);
  const [filter, setFilter] = useState<"all" | "in" | "notin" | "asleep">("all");
  const [lunchIds, setLunchIds] = useState<{ log: string; child: string }[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => setTick((x) => x + 1), 15000); return () => window.clearInterval(t); }, []);

  const now = nowLabel();
  const nowM = toMin(now);
  const whoName = personName(who, s);
  const other = who === "s08" ? "s07" : "s08";

  // Only this room's children attending today. Nothing else is reachable on this device.
  const kids = s.children.filter((c) => c.room === ROOM_ID && c.attendingToday);
  const kidIds = new Set(kids.map((c) => c.id));
  const roomLogs = s.careLogs.filter((l) => kidIds.has(l.child));
  const today = sortLogs(roomLogs.filter((l) => !l.at.startsWith("Yesterday")));
  const stat = new Map<string, St>(kids.map((c) => [c.id, statusOf(c, today.filter((l) => l.child === c.id), nowM)]));
  const st = (id: string) => stat.get(id)!;

  const present = kids.filter((c) => st(c.id).state === "in");
  const notIn = kids.filter((c) => st(c.id).state === "notin");
  const asleep = kids.filter((c) => st(c.id).asleepSince !== null);
  const hasLunch = (id: string) => today.some((l) => l.child === id && l.kind === "meal" && l.title === "Lunch");
  const lunchTargets = present.filter((c) => !hasLunch(c.id) && st(c.id).asleepSince === null);
  const pendingObs = roomLogs.filter((l) => l.kind === "observation" && l.status === "pending-review");
  const handovers = s.handovers.filter((h) => h.room === ROOM_ID);

  const shown = kids.filter((c) => {
    const x = st(c.id);
    return filter === "all" || (filter === "in" && x.state === "in") || (filter === "notin" && x.state === "notin") || (filter === "asleep" && x.asleepSince !== null);
  });
  const child = sel ? kids.find((c) => c.id === sel) || null : null;

  /* ── access: lock, unlock, switch (never mixes identities) ── */
  const clearWork = () => { setSel(null); setSheet(null); setLunchIds([]); };
  function lock() {
    logEvent({ actor: whoName, actorKind: "person", action: "locked", target: "Toddlers tablet (" + TABLET + ")", kind: "access", site: "elm", story: null });
    clearWork();
    setLocked(true);
  }
  function signIn(id: string, prev: string | null) {
    if (prev) logEvent({ actor: personName(prev, s), actorKind: "person", action: "signed out of", target: "Toddlers tablet (" + TABLET + ")", kind: "access", site: "elm", story: null });
    logEvent({ actor: personName(id, s), actorKind: "person", action: "signed in on", target: "Toddlers tablet (" + TABLET + ") with personal PIN", kind: "access", site: "elm", story: null });
    clearWork();
    setWho(id);
    setLocked(false);
    toast("Signed in as " + personName(id, s) + ". Entries from now on are recorded under this name.");
  }

  /* ── bulk lunch, then adjust exceptions ── */
  function lunchForAll() {
    if (!lunchTargets.length) return;
    const at = nowLabel();
    const base = Date.now();
    const logs: CareLog[] = lunchTargets.map((c, i) => ({ id: "l" + base + "-" + i, child: c.id, kind: "meal", at, title: "Lunch", detail: MENU.Lunch + ". " + AMOUNT_TEXT.All + ".", by: who, status: "logged", parentVisible: true }));
    setState((x) => ({ careLogs: logs.concat(x.careLogs) }));
    logEvent({ actor: whoName, actorKind: "person", action: "logged lunch for " + logs.length + " children in one tap", target: "Toddlers, exceptions adjusted on the tablet", kind: "data", site: "elm", story: null });
    setLunchIds(logs.map((l) => ({ log: l.id, child: l.child })));
    setSheet("lunch");
    toast("Lunch logged for " + logs.length + " children. Adjust anyone who ate less.");
  }

  function sleepCheck(c: Child) {
    const l = addCareLog(c.id, "sleep", "Sleep check", "Breathing, position and colour checked. 10-minute check, Safe Sleep v4.0.", who);
    update("careLogs", l.id, { parentVisible: false });
    toast("Sleep check recorded for " + c.first + ". Next check due in 10 min.");
  }

  const visibleLogs = showAll ? today : today.slice(0, 12);

  return (
    <div className="rt-root">
      <ReturnBar label="Toddlers tablet" />
      <div className="rt-wrap">
        {/* ── Header ── */}
        <div className="rt-top">
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <h1 className="rt-title">Toddlers</h1>
            <div className="rt-sub">Elmgrove, 2 to 3 years, shared tablet {TABLET}</div>
          </div>
          <div className="rt-who" aria-live="polite">
            <span className="rt-ava sm">{s.staff.find((x) => x.id === who)?.initials}</span>
            <span>Signed in: <b>{whoName}</b> (personal PIN)</span>
          </div>
          <button type="button" className="rt-btn" onClick={() => setSheet("switch")}><Icon d={IC.user} size={18} style={{ color: "var(--accent)" }} />Switch educator</button>
          <button type="button" className="rt-btn" onClick={lock} aria-label="Lock tablet"><Icon d={IC.lock} size={18} style={{ color: "var(--accent)" }} />Lock</button>
        </div>

        {/* ── Room strip and room-wide actions ── */}
        <div className="rt-top">
          <div style={{ flex: "1 1 280px", fontSize: 14, color: "var(--dim)" }}>
            <b style={{ color: "var(--ink)" }}>{kids.length}</b> attending today, <b style={{ color: "var(--ink)" }}>{present.length}</b> in,{" "}
            <b style={{ color: "var(--ink)" }}>{notIn.length}</b> not in yet{asleep.length > 0 && <>, <b style={{ color: "var(--ink)" }}>{asleep.length}</b> asleep</>}. Demo time {now}.
          </div>
          {lunchTargets.length > 0 ? (
            <button type="button" className="rt-btn primary" onClick={lunchForAll}><Icon d={IC.meal} size={18} />Lunch for everyone ({lunchTargets.length})</button>
          ) : lunchIds.length > 0 ? (
            <button type="button" className="rt-btn soft" onClick={() => setSheet("lunch")}><Icon d={IC.meal} size={18} />Adjust lunch</button>
          ) : (
            <button type="button" className="rt-btn" disabled title="Everyone present has a lunch entry"><Icon d={IC.meal} size={18} />Lunch logged</button>
          )}
          <button type="button" className="rt-btn" onClick={() => setSheet("supplies")}><Icon d={IC.plus} size={18} style={{ color: "var(--accent)" }} />Supplies low</button>
          <button type="button" className="rt-btn" onClick={() => setSheet("handover")}><Icon d={IC.note} size={18} style={{ color: "var(--accent)" }} />Handover</button>
        </div>

        {/* ── Sleep checks (Safe Sleep v4.0: every 10 minutes) ── */}
        {asleep.length > 0 && (
          <div className="rt-sleep" aria-label="Sleep checks">
            {asleep.map((c) => {
              const x = st(c.id);
              const due = (x.checkDueIn ?? 10) <= 0;
              return (
                <div key={c.id} className={"rt-sleepcard" + (due ? " due" : "")}>
                  <Icon d={IC.sleep} size={20} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{short(c)} asleep {dur(Math.max(0, nowM - (x.asleepSince ?? nowM)))}</div>
                    <div style={{ fontSize: 13, color: due ? "var(--ink)" : "var(--dim)" }}>
                      {due ? "Sleep check due now" : "Next check in " + x.checkDueIn + " min"}{x.lastCheck !== null ? ", last " + fromMin(x.lastCheck) : ", no check yet"}
                    </div>
                  </div>
                  <button type="button" className={"rt-btn" + (due ? " primary" : " soft")} onClick={() => sleepCheck(c)}><Icon d={IC.check} size={18} />Check done</button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Children and the selected child's logging panel ── */}
        <div className="rt-main">
          <section className="rt-panel" aria-label="Children in the room">
            <div className="rt-panel-h">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t">Children here today</div>
                <div className="s">Tap a child, then tap what happened</div>
              </div>
            </div>
            <div className="rt-seg" style={{ marginBottom: 12 }} role="tablist">
              {([["all", "All " + kids.length], ["in", "In " + present.length], ["notin", "Not in yet " + notIn.length], ["asleep", "Asleep " + asleep.length]] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>
              ))}
            </div>
            {shown.length === 0 ? (
              <div style={{ padding: "28px 8px", textAlign: "center", color: "var(--dim)", fontSize: 14 }}>No children in this view.</div>
            ) : (
              <div className="rt-kids">
                {shown.map((c) => <ChildTile key={c.id} c={c} x={st(c.id)} on={sel === c.id} nowM={nowM} onClick={() => setSel(sel === c.id ? null : c.id)} />)}
              </div>
            )}
          </section>

          <div className="rt-side">
            {child ? (
              <ChildPanel key={child.id + who} c={child} x={st(child.id)} who={who} onClose={() => setSel(null)} onSleepCheck={() => sleepCheck(child)} />
            ) : (
              <section className="rt-panel">
                <div className="rt-panel-h"><div><div className="t">Select a child</div><div className="s">Meals, sleep, nappies, drinks and activities take one or two taps</div></div></div>
                <div className="rt-info"><Icon d={IC.shield} size={16} style={{ color: "var(--accent)", marginTop: 1 }} /><span>This tablet shows the Toddlers room only. Records from other rooms and families are not available on this device. Care entries are written by educators, never generated by AI.</span></div>
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {notIn.map((c) => (
                    <button key={c.id} type="button" className="rt-row-btn" onClick={() => setSel(c.id)}>
                      <span className="rt-ava sm">{initials(c)}</span>
                      <span style={{ flex: 1 }}>{c.first} {c.last}<span className="sub">Not in yet, expected {c.expected}</span></span>
                      <Icon d={IC.chevron} size={16} style={{ color: "var(--faint)" }} />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* ── Room timeline, reviews and handovers ── */}
        <div className="rt-lower">
          <section className="rt-panel" aria-label="Room timeline today">
            <div className="rt-panel-h">
              <div style={{ flex: 1 }}><div className="t">Room today</div><div className="s">{today.length} entries, newest first</div></div>
            </div>
            {today.length === 0 ? <div style={{ color: "var(--dim)", fontSize: 14 }}>Nothing logged yet today.</div> : (
              <div className="rt-tl">
                {visibleLogs.map((l) => {
                  const c = kids.find((k) => k.id === l.child)!;
                  return (
                    <div key={l.id} className="rt-tl-row">
                      <span className="rt-time">{l.at}</span>
                      <span className={"rt-tl-ic" + (l.kind === "incident" || l.kind === "medication" ? " warn" : "")}><Icon d={KIND_ICON[l.kind]} size={16} /></span>
                      <div className="rt-tl-main">
                        <b>{short(c)}</b> {l.title}: {l.detail}
                        <div className="rt-tl-meta">
                          <span>{firstName(personName(l.by, s))}</span>
                          <LogChip l={l} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {today.length > 12 && (
              <button type="button" className="rt-btn full" style={{ marginTop: 10 }} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : "Show all " + today.length + " entries"}</button>
            )}
          </section>

          <div className="rt-stack">
            <section className="rt-panel" aria-label="Observations awaiting review">
              <div className="rt-panel-h">
                <div style={{ flex: 1 }}><div className="t">Observations to review</div><div className="s">Parents see an observation only after the room leader approves it</div></div>
                <Chip tone={pendingObs.length ? "gold" : "ok"}>{pendingObs.length} waiting</Chip>
              </div>
              {pendingObs.length === 0 ? <div style={{ color: "var(--dim)", fontSize: 14 }}>All observations reviewed.</div>
                : who !== LEADER ? (
                  <div className="rt-hint">{pendingObs.length} draft observation{pendingObs.length === 1 ? "" : "s"} waiting for Aisling Corcoran. Room leaders review on this tablet after signing in with their own PIN.</div>
                ) : (
                  <div>
                    {pendingObs.map((l) => {
                      const c = kids.find((k) => k.id === l.child)!;
                      return (
                        <div key={l.id} className="rt-item">
                          <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.45 }}>
                            <b>{short(c)}</b> <span style={{ color: "var(--faint)", fontSize: 12.5 }}>{l.at}, {firstName(personName(l.by, s))}</span>
                            <div style={{ color: "var(--body)", marginTop: 3 }}>{l.detail}</div>
                          </div>
                          <button type="button" className="rt-btn soft" onClick={() => {
                            update("careLogs", l.id, { status: "approved", parentVisible: true });
                            logEvent({ actor: whoName, actorKind: "person", action: "approved observation for parents", target: short(c) + ", Toddlers", kind: "people", site: "elm", story: l.child === "c-aoife" ? "E" : null });
                            toast("Observation approved. " + c.first + "'s family can see it now.");
                          }}><Icon d={IC.check} size={18} />Approve</button>
                        </div>
                      );
                    })}
                  </div>
                )}
            </section>

            <section className="rt-panel" aria-label="Handovers">
              <div className="rt-panel-h">
                <div style={{ flex: 1 }}><div className="t">Handovers</div><div className="s">Shift, room to room and parent notes for Toddlers</div></div>
                <button type="button" className="rt-btn soft" onClick={() => setSheet("handover")}><Icon d={IC.plus} size={18} />Write</button>
              </div>
              {handovers.length === 0 ? <div style={{ color: "var(--dim)", fontSize: 14 }}>No handovers yet.</div> : handovers.slice(0, 5).map((h) => (
                <div key={h.id} className="rt-item">
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.45 }}>
                    <div className="sh-row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <Chip tone="outline">{h.kind}</Chip>
                      <span style={{ fontSize: 12.5, color: "var(--faint)" }}>{h.at}, {firstName(personName(h.from, s))} to {/^s\d+$/.test(h.to) ? personName(h.to, s) : h.to}</span>
                    </div>
                    <div style={{ color: "var(--body)", marginTop: 5 }}>{h.note}</div>
                    {h.outstanding && <div style={{ color: "var(--warn)", fontSize: 13, marginTop: 4 }}>Outstanding: {h.outstanding}</div>}
                  </div>
                  {!h.read ? (
                    <button type="button" className="rt-btn" onClick={() => {
                      readHandover(h.id);
                      logEvent({ actor: whoName, actorKind: "person", action: "read " + h.kind.toLowerCase() + " handover", target: "Toddlers, from " + personName(h.from, s), kind: "people", site: "elm", story: null });
                      toast("Handover marked as read.");
                    }}>Mark read</button>
                  ) : <Chip tone="ok">Read</Chip>}
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>

      {/* ── Sheets ── */}
      <Modal open={sheet === "switch"} onClose={() => setSheet(null)} title={"Sign in as " + personName(other, s)} sub="Personal PIN. The current educator is signed out and any unsaved entry is cleared." width={460}>
        <PinPad hint={"Enter " + firstName(personName(other, s)) + "'s 4-digit PIN"} onDone={() => signIn(other, who)} />
      </Modal>
      <Modal open={sheet === "lunch"} onClose={() => setSheet(null)} title="Lunch: adjust exceptions" sub={MENU.Lunch + ". Everyone was logged as ate all. Change anyone who ate less."} width={620}
        footer={<button type="button" className="rt-btn primary" onClick={() => setSheet(null)}>Done</button>}>
        <LunchAdjust rows={lunchIds} kids={kids} who={who} />
      </Modal>
      <Modal open={sheet === "supplies"} onClose={() => setSheet(null)} title="Supplies running low" sub="Creates a task for Gráinne Twomey, Centre Manager" width={560}>
        <SuppliesForm who={who} onDone={() => setSheet(null)} />
      </Modal>
      <Modal open={sheet === "handover"} onClose={() => setSheet(null)} title="Write a handover" sub={"From " + whoName + ", Toddlers"} width={600}>
        <HandoverForm who={who} kids={present.length ? present : kids} preset={child} onDone={() => setSheet(null)} />
      </Modal>

      {locked && <LockScreen now={now} onUnlock={(id) => signIn(id, null)} />}
    </div>
  );
}

/* ── Child tile ────────────────────────────────────────────────────────────── */
function ChildTile({ c, x, on, nowM, onClick }: { c: Child; x: St; on: boolean; nowM: number; onClick: () => void }) {
  const meal = x.lastMeal ? x.lastMeal.title + ": " + (AMOUNTS.find((a) => x.lastMeal!.detail.includes(AMOUNT_TEXT[a])) || "logged").toLowerCase() : "No meal yet";
  return (
    <button type="button" className={"rt-kid" + (on ? " on" : "") + (x.state !== "in" ? " muted" : "")} onClick={onClick} aria-pressed={on}>
      {c.alert && <span className="flag" title="Care plan or alert on file"><Icon d={IC.alert} size={17} /></span>}
      <div className="sh-row" style={{ gap: 9 }}>
        <span className="rt-ava">{initials(c)}</span>
        <span className="nm">{c.first} {c.last.charAt(0)}.</span>
      </div>
      {x.state === "notin" && <span className="ln warn"><Icon d={IC.clock} size={13} /><span>Not in yet, exp. {c.expected}</span></span>}
      {x.state === "out" && <span className="ln"><Icon d={IC.door} size={13} /><span>Gone home {c.checkedOut}</span></span>}
      {x.state === "in" && (x.asleepSince !== null
        ? <span className="ln accent"><Icon d={IC.sleep} size={13} /><span>Asleep {dur(Math.max(0, nowM - x.asleepSince))}</span></span>
        : <span className="ln ok"><Icon d={IC.check} size={13} /><span>In since {c.checkedIn}</span></span>)}
      {x.state === "in" && <span className="ln"><Icon d={IC.meal} size={13} /><span>{meal}</span></span>}
      {x.state === "in" && (x.nappyDue
        ? <span className="ln warn"><Icon d={IC.nappy} size={13} /><span>Nappy check due</span></span>
        : <span className="ln"><Icon d={IC.nappy} size={13} /><span>{x.lastNappy ? "Nappy " + x.lastNappy.at : "Nappy not logged"}</span></span>)}
    </button>
  );
}

function LogChip({ l }: { l: CareLog }) {
  if (l.status === "pending-review") {
    return <Chip tone="gold">{l.kind === "observation" ? "Awaiting room leader review" : l.kind === "incident" ? "Awaiting manager review" : "Pending review"}</Chip>;
  }
  if (l.status === "approved") return <Chip tone="ok">Approved, shared with parents</Chip>;
  return l.parentVisible ? <Chip tone="accent">In parent app</Chip> : <Chip tone="outline">Internal record</Chip>;
}

/* ── Selected child: one or two taps per entry ─────────────────────────────── */
type Mode = null | "meal" | "sleep" | "nappy" | "drink" | "activity" | "observation" | "incident" | "medication" | "checkin" | "checkout";

function ChildPanel({ c, x, who, onClose, onSleepCheck }: { c: Child; x: St; who: string; onClose: () => void; onSleepCheck: () => void }) {
  const s = useDemo();
  const [mode, setMode] = useState<Mode>(null);
  const [mealType, setMealType] = useState<MealType>(defaultMeal(toMin(nowLabel())));
  const [obs, setObs] = useState("");
  const [incType, setIncType] = useState<"Accident" | "Incident">("Accident");
  const [what, setWhat] = useState("");
  const [aid, setAid] = useState("");
  const [witness, setWitness] = useState("");
  const [medStep, setMedStep] = useState(0);
  const [checker, setChecker] = useState("");
  const [stranger, setStranger] = useState(false);

  const whoName = personName(who, s);
  const nowM = toMin(nowLabel());
  const gs = guardiansOf(c.family, s);
  const parent = primaryGuardian(c.family, s);
  const parentLine = parent ? " Visible to " + firstName(parent.name) + " in the parent app." : "";
  const consent = medConsent(c, s);
  const colleagues = [LEADER, "s08", MANAGER].filter((id) => id !== who);
  const canLog = x.state === "in";
  const keyworker = personName(c.keyworker, s);

  const open = (m: Mode) => { setMode(mode === m ? null : m); setMedStep(0); setChecker(""); setStranger(false); };
  const done = (msg: string) => { toast(msg); setMode(null); };
  const log = (kind: CareKind, title: string, detail: string, msg: string) => { addCareLog(c.id, kind, title, detail, who); done(msg); };

  function checkIn(g: Guardian) {
    const at = nowLabel();
    update("children", c.id, { checkedIn: at });
    add("careLogs", { id: "l" + Date.now() + "a", child: c.id, kind: "arrival", at, title: "Arrived", detail: "Dropped off by " + g.name + ".", by: who, status: "logged", parentVisible: true });
    logEvent({ actor: whoName, actorKind: "person", action: "checked in", target: short(c) + ", Toddlers (dropped off by " + g.name + ")", kind: "data", site: "elm", story: null });
    done(c.first + " checked in at " + at + ".");
  }
  function checkOut(g: Guardian) {
    const at = nowLabel();
    update("children", c.id, { checkedOut: at });
    add("careLogs", { id: "l" + Date.now() + "d", child: c.id, kind: "note", at, title: "Went home", detail: "Collected by " + g.name + " (" + g.relation.toLowerCase() + ", authorised collector).", by: who, status: "logged", parentVisible: true });
    logEvent({ actor: whoName, actorKind: "person", action: "handed over to " + g.name + " (authorised collector)", target: short(c) + ", Toddlers", kind: "people", site: "elm", story: null });
    done(c.first + " handed over to " + g.name + " at " + at + ".");
  }
  function reviewTask(title: string, priority: Task["priority"]) {
    add("tasks", newTask(title, MANAGER, priority, { type: "child", id: c.id }));
    logEvent({ actor: whoName, actorKind: "person", action: "sent for manager review", target: title + " (Gráinne Twomey)", kind: "people", site: "elm", story: null });
  }

  const ACTS: { id: Exclude<Mode, null | "checkin" | "checkout">; label: string; icon: string; alert?: boolean }[] = [
    { id: "meal", label: "Meal", icon: IC.meal }, { id: "sleep", label: x.asleepSince !== null ? "Wake / check" : "Sleep", icon: IC.sleep },
    { id: "nappy", label: "Nappy", icon: IC.nappy }, { id: "drink", label: "Drink", icon: IC.drink },
    { id: "activity", label: "Activity", icon: IC.activity }, { id: "observation", label: "Observation", icon: IC.eye },
    { id: "incident", label: "Incident", icon: IC.alert, alert: true }, { id: "medication", label: "Medication", icon: IC.pill, alert: true },
  ];

  let flow: ReactNode = null;
  if (mode === "meal") {
    flow = (
      <>
        <div className="rt-seg full">{MEALS.map((m) => <button key={m} type="button" className={m === mealType ? "on" : ""} onClick={() => setMealType(m)}>{m}</button>)}</div>
        <div className="rt-hint">Today: {MENU[mealType]}. Tap how much {c.first} ate.</div>
        <div className="rt-opts">
          {AMOUNTS.map((a) => (
            <button key={a} type="button" className="rt-opt" onClick={() => log("meal", mealType, MENU[mealType] + ". " + AMOUNT_TEXT[a] + ".", mealType + " logged for " + c.first + ": " + a.toLowerCase() + "." + parentLine)}>{a}</button>
          ))}
        </div>
      </>
    );
  } else if (mode === "sleep") {
    flow = x.asleepSince !== null ? (
      <>
        <div className="rt-flow-t">Asleep since {fromMin(x.asleepSince)} ({dur(Math.max(0, nowM - x.asleepSince))})</div>
        <div className="rt-hint">{(x.checkDueIn ?? 10) <= 0 ? "Sleep check is due now." : "Next 10-minute check in " + x.checkDueIn + " min."} Safe Sleep v4.0: checks are visual and close enough to see breathing.</div>
        <div className="rt-opts two">
          <button type="button" className="rt-opt" onClick={() => { onSleepCheck(); setMode(null); }}>Check done<small>Logs a sleep check</small></button>
          <button type="button" className="rt-opt" onClick={() => {
            const since = x.asleepSince ?? nowM;
            log("sleep", "Woke up", "Slept " + fromMin(since) + " to " + nowLabel() + " (" + dur(Math.max(0, nowM - since)) + ").", c.first + " is awake after " + dur(Math.max(0, nowM - since)) + "." + parentLine);
          }}>Woke up<small>Ends the sleep</small></button>
        </div>
      </>
    ) : (
      <>
        <div className="rt-hint">When did {c.first} fall asleep? 10-minute sleep checks start straight away.</div>
        <div className="rt-opts">
          {[0, 5, 15, 30].map((ago) => (
            <button key={ago} type="button" className="rt-opt" onClick={() => {
              const t = fromMin(nowM - ago);
              log("sleep", "Asleep", "Fell asleep at " + t + ".", c.first + " asleep since " + t + ". Sleep check " + (ago >= 10 ? "due now." : "due in " + (10 - ago) + " min."));
            }}>{ago === 0 ? "Now" : ago + " min"}<small>{ago === 0 ? "just now" : "ago"}</small></button>
          ))}
        </div>
      </>
    );
  } else if (mode === "nappy") {
    flow = (
      <div className="rt-opts">
        {([["Wet", "Nappy", "Wet."], ["Dirty", "Nappy", "Dirty."], ["Dry", "Nappy", "Dry."], ["Potty", "Potty", "Used the potty."]] as const).map(([lab, title, det]) => (
          <button key={lab} type="button" className="rt-opt" onClick={() => log("nappy", title, det, title + " logged for " + c.first + ": " + lab.toLowerCase() + ".")}>{lab}</button>
        ))}
      </div>
    );
  } else if (mode === "drink") {
    flow = (
      <div className="rt-opts two">
        {(["Water", "Milk"] as const).map((d) => (
          <button key={d} type="button" className="rt-opt" onClick={() => log("drink", "Drink", d + ".", "Drink logged for " + c.first + ": " + d.toLowerCase() + ".")}>{d}</button>
        ))}
      </div>
    );
  } else if (mode === "activity") {
    flow = (
      <>
        <div className="rt-hint">Today's plan for Toddlers. Tap the one {c.first} joined.</div>
        {PLAN.map((p) => (
          <button key={p.title} type="button" className="rt-row-btn" onClick={() => log("activity", p.title, "Aistear: " + p.aistear + ".", c.first + " joined " + p.title.toLowerCase() + "." + parentLine)}>
            <Icon d={IC.activity} size={18} style={{ color: "var(--accent)" }} />
            <span style={{ flex: 1 }}>{p.title}<span className="sub">{p.at}, Aistear: {p.aistear}</span></span>
          </button>
        ))}
      </>
    );
  } else if (mode === "observation") {
    flow = (
      <>
        <div className="rt-label">What did you see? Keep it to what happened, not a judgement.</div>
        <textarea className="rt-text" value={obs} maxLength={280} onChange={(e) => setObs(e.target.value)} placeholder={c.first + " poured water between two cups and said \"more\"."} aria-label="Observation" />
        <div className="rt-info"><Icon d={IC.eye} size={16} style={{ color: "var(--accent)", marginTop: 1 }} /><span>Goes to Aisling Corcoran (room leader) for review. Parents see it only after it is approved.</span></div>
        <button type="button" className="rt-btn primary full" disabled={obs.trim().length < 5} onClick={() => {
          log("observation", "Observation (draft)", obs.trim(), "Observation saved for room leader review. Not shared with parents yet.");
          setObs("");
        }}>Send for review</button>
      </>
    );
  } else if (mode === "incident") {
    const ready = what.trim().length > 3 && aid && witness;
    flow = (
      <>
        <div className="rt-seg full">{(["Accident", "Incident"] as const).map((t) => <button key={t} type="button" className={incType === t ? "on" : ""} onClick={() => setIncType(t)}>{t === "Accident" ? "Accident (injury)" : "Incident"}</button>)}</div>
        <div className="rt-label">What happened</div>
        <textarea className="rt-text" value={what} maxLength={400} onChange={(e) => setWhat(e.target.value)} placeholder="Where, when and how, in plain words" aria-label="What happened" />
        <div className="rt-label">First aid given</div>
        <div className="rt-chips">{["None needed", "Cold compress", "Cleaned and plaster", "Comfort and reassurance"].map((a) => <button key={a} type="button" className={"rt-chip" + (aid === a ? " on" : "")} onClick={() => setAid(a)}>{a}</button>)}</div>
        <div className="rt-label">Witness</div>
        <div className="rt-chips">{colleagues.map((id) => <button key={id} type="button" className={"rt-chip" + (witness === id ? " on" : "")} onClick={() => setWitness(id)}>{personName(id, s)}</button>)}</div>
        <div className="rt-alert"><Icon d={IC.alert} size={16} style={{ color: "var(--warn)", marginTop: 1 }} /><span>Saved as awaiting manager review. The parent copy is shared only after review. A head bump or anything serious: tell the room leader and manager now, do not wait for the tablet.</span></div>
        <button type="button" className="rt-btn primary full" disabled={!ready} onClick={() => {
          const title = incType === "Accident" ? "Accident report" : "Incident report";
          addCareLog(c.id, "incident", title, "What happened: " + what.trim().replace(/\.$/, "") + ". First aid: " + aid.toLowerCase() + ". Witness: " + personName(witness, s) + ". Awaiting manager review; parent copy after review.", who);
          reviewTask("Review " + title.toLowerCase() + ": " + short(c) + ", Toddlers", "High");
          setWhat(""); setAid(""); setWitness("");
          done(title + " saved. Status: awaiting manager review. Parents get a copy after review.");
        }}>Save report</button>
      </>
    );
  } else if (mode === "medication") {
    flow = !consent ? (
      <>
        <div className="rt-alert"><Icon d={IC.lock} size={16} style={{ color: "var(--warn)", marginTop: 1 }} /><span>No medication consent on file for {c.first}. Nothing can be given or recorded until a signed consent form is on file.</span></div>
        <button type="button" className="rt-btn full" onClick={() => {
          add("tasks", newTask("Request medication consent form: " + short(c) + ", Toddlers", MANAGER, "Medium", { type: "child", id: c.id }));
          logEvent({ actor: whoName, actorKind: "person", action: "asked the office to request medication consent", target: short(c) + ", Toddlers (task for Gráinne Twomey)", kind: "people", site: "elm", story: null });
          done("Request sent to the office. Gráinne will ask " + (parent ? firstName(parent.name) : "the family") + " for a consent form.");
        }}>Ask the office to request consent</button>
      </>
    ) : (
      <>
        <Steps steps={[
          { label: "Consent on file", state: "done", note: consent.med + ". " + consent.dose + ". Signed by " + consent.signed + "." },
          { label: "Given by " + whoName, state: medStep === 0 ? "current" : "done", note: medStep === 0 ? "Confirm when it has been given." : "Confirmed at " + nowLabel() },
          { label: "Second staff check", state: medStep === 1 ? "current" : "todo", note: "A second person confirms the medication, dose and child with their own PIN." },
          { label: "Pending review", state: "todo", note: "Recorded for manager review before it is final." },
        ]} />
        {medStep === 0 ? (
          <button type="button" className="rt-btn primary full" onClick={() => setMedStep(1)}>Confirm given now</button>
        ) : (
          <>
            <div className="rt-label">Second check by</div>
            <div className="rt-chips">{colleagues.map((id) => <button key={id} type="button" className={"rt-chip" + (checker === id ? " on" : "")} onClick={() => setChecker(id)}>{personName(id, s)}</button>)}</div>
            <button type="button" className="rt-btn primary full" disabled={!checker} onClick={() => {
              addCareLog(c.id, "medication", "Medication", consent.med + ", " + consent.dose.toLowerCase() + ". Given by " + whoName + " at " + nowLabel() + ", second check by " + personName(checker, s) + ". Consent on file (" + consent.signed + "). Pending review.", who);
              reviewTask("Review medication record: " + short(c) + ", Toddlers", "Medium");
              done("Medication recorded with a two-person check. Status: pending review.");
            }}>Confirm second check (simulated PIN)</button>
          </>
        )}
      </>
    );
  } else if (mode === "checkin") {
    flow = (
      <>
        <div className="rt-hint">Who dropped {c.first} off?</div>
        {gs.map((g) => (
          <button key={g.id} type="button" className="rt-row-btn" onClick={() => checkIn(g)}>
            <Icon d={IC.user} size={18} style={{ color: "var(--accent)" }} />
            <span style={{ flex: 1 }}>{g.name}<span className="sub">{g.relation}</span></span>
          </button>
        ))}
      </>
    );
  } else if (mode === "checkout") {
    const auth = gs.filter((g) => g.authorisedCollect);
    const notAuth = gs.filter((g) => !g.authorisedCollect);
    flow = (
      <>
        <div className="rt-hint">Hand over only to an authorised collector. Check the face against the photo on file.</div>
        {auth.map((g) => (
          <button key={g.id} type="button" className="rt-row-btn" onClick={() => checkOut(g)}>
            <Icon d={IC.shield} size={18} style={{ color: "var(--ok)" }} />
            <span style={{ flex: 1 }}>{g.name}<span className="sub">{g.relation}, authorised to collect</span></span>
          </button>
        ))}
        {notAuth.map((g) => (
          <button key={g.id} type="button" className="rt-row-btn" disabled>
            <Icon d={IC.lock} size={18} style={{ color: "var(--bad)" }} />
            <span style={{ flex: 1 }}>{g.name}<span className="sub">Not authorised to collect</span></span>
          </button>
        ))}
        {!stranger ? (
          <button type="button" className="rt-btn full" onClick={() => setStranger(true)}>Someone else is here to collect</button>
        ) : (
          <>
            <div className="rt-alert"><Icon d={IC.alert} size={16} style={{ color: "var(--warn)", marginTop: 1 }} /><span>Do not hand over. Keep {c.first} in the room. Collection changes are confirmed by the office with the parent, never on the tablet.</span></div>
            <button type="button" className="rt-btn warn full" onClick={() => {
              logEvent({ actor: whoName, actorKind: "person", action: "flagged a collector not on the authorised list", target: short(c) + ", Toddlers (Gráinne Twomey alerted, simulated)", kind: "people", site: "elm", story: null });
              done("Gráinne has been alerted (simulated). " + c.first + " stays in the room until the office confirms.");
            }}>Alert the centre manager</button>
          </>
        )}
      </>
    );
  }

  return (
    <section className="rt-panel" aria-label={"Care for " + c.first}>
      <div className="rt-panel-h" style={{ alignItems: "flex-start" }}>
        <span className="rt-ava lg">{initials(c)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.3px" }}>{c.first} {c.last}</div>
          <div className="s">{c.age}, keyworker {keyworker}</div>
          <div className="sh-row" style={{ gap: 6, marginTop: 7, flexWrap: "wrap" }}>
            {x.state === "in" && <Chip tone="ok">In since {c.checkedIn}</Chip>}
            {x.state === "notin" && <Chip tone="warn">Not in yet, expected {c.expected}</Chip>}
            {x.state === "out" && <Chip tone="outline">Gone home {c.checkedOut}</Chip>}
            {x.asleepSince !== null && <Chip tone="accent">Asleep</Chip>}
            {consent && <Chip tone="outline">Medication consent on file</Chip>}
          </div>
        </div>
        <button type="button" className="rt-btn" onClick={onClose} aria-label="Close child"><Icon d={IC.x} size={16} sw={2.2} /></button>
      </div>

      {c.alert && <div className="rt-alert" style={{ marginBottom: 12 }}><Icon d={IC.alert} size={16} style={{ color: "var(--warn)", marginTop: 1 }} /><span>{c.alert}</span></div>}

      {x.state === "notin" && <button type="button" className={"rt-btn primary full"} style={{ marginBottom: 12 }} onClick={() => open("checkin")}><Icon d={IC.door} size={18} />Check in {c.first}</button>}
      {x.state === "in" && <button type="button" className={"rt-btn full" + (mode === "checkout" ? " soft" : "")} style={{ marginBottom: 12 }} onClick={() => open("checkout")}><Icon d={IC.door} size={18} style={{ color: "var(--accent)" }} />Check out to an authorised collector</button>}

      <div className="rt-acts">
        {ACTS.map((a) => (
          <button key={a.id} type="button" className={"rt-act" + (mode === a.id ? " on" : "") + (a.alert ? " alert" : "")} disabled={!canLog} onClick={() => open(a.id)} aria-pressed={mode === a.id}>
            <span className="ic"><Icon d={a.icon} size={22} /></span>{a.label}
          </button>
        ))}
      </div>
      {!canLog && <div className="rt-hint" style={{ marginTop: 10 }}>{x.state === "notin" ? "Check " + c.first + " in to start logging." : c.first + " has gone home. Today's entries are kept below."}</div>}
      {flow && <div className="rt-flow" key={mode || ""}>{flow}</div>}
    </section>
  );
}

/* ── Lunch exceptions ──────────────────────────────────────────────────────── */
function LunchAdjust({ rows, kids, who }: { rows: { log: string; child: string }[]; kids: Child[]; who: string }) {
  const s = useDemo();
  if (!rows.length) return <div style={{ color: "var(--dim)" }}>Nothing to adjust.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => {
        const c = kids.find((k) => k.id === r.child);
        const l = s.careLogs.find((x) => x.id === r.log);
        if (!c || !l) return null;
        const cur = AMOUNTS.find((a) => l.detail.includes(AMOUNT_TEXT[a])) || "All";
        return (
          <div key={r.log} className="sh-row" style={{ gap: 12, flexWrap: "wrap" }}>
            <span className="rt-ava sm">{initials(c)}</span>
            <span style={{ flex: "1 1 120px", fontWeight: 500 }}>{c.first} {c.last.charAt(0)}.</span>
            <div className="rt-seg">
              {AMOUNTS.map((a) => (
                <button key={a} type="button" className={cur === a ? "on" : ""} onClick={() => {
                  if (cur === a) return;
                  update("careLogs", r.log, { detail: MENU.Lunch + ". " + AMOUNT_TEXT[a] + "." });
                  logEvent({ actor: personName(who, s), actorKind: "person", action: "adjusted lunch to " + a.toLowerCase(), target: short(c) + ", Toddlers", kind: "data", site: "elm", story: null });
                  toast("Updated: " + c.first + " " + AMOUNT_TEXT[a].toLowerCase() + ".");
                }}>{a}</button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Supplies request: logs an event and creates a task ────────────────────── */
function SuppliesForm({ who, onDone }: { who: string; onDone: () => void }) {
  const s = useDemo();
  const [items, setItems] = useState<string[]>([]);
  const [out, setOut] = useState(false);
  const toggle = (i: string) => setItems(items.includes(i) ? items.filter((x) => x !== i) : items.concat(i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="rt-chips">{SUPPLIES.map((i) => <button key={i} type="button" className={"rt-chip" + (items.includes(i) ? " on" : "")} onClick={() => toggle(i)} aria-pressed={items.includes(i)}>{i}</button>)}</div>
      <div className="rt-seg full">
        <button type="button" className={!out ? "on" : ""} onClick={() => setOut(false)}>Running low</button>
        <button type="button" className={out ? "on" : ""} onClick={() => setOut(true)}>Run out</button>
      </div>
      <button type="button" className="rt-btn primary full" disabled={!items.length} onClick={() => {
        const title = "Toddlers supplies " + (out ? "run out" : "running low") + ": " + items.join(", ");
        add("tasks", newTask(title, MANAGER, out ? "High" : "Medium", { type: "room", id: ROOM_ID }, items));
        logEvent({ actor: personName(who, s), actorKind: "person", action: "requested supplies", target: items.join(", ") + " (task for Gráinne Twomey)", kind: "people", site: "elm", story: null });
        toast("Supplies request sent. Task created for Gráinne Twomey.");
        onDone();
      }}>Send request{items.length ? " (" + items.length + ")" : ""}</button>
    </div>
  );
}

/* ── Handover writer: shift, room to room, parent ──────────────────────────── */
function HandoverForm({ who, kids, preset, onDone }: { who: string; kids: Child[]; preset: Child | null; onDone: () => void }) {
  const s = useDemo();
  const [kind, setKind] = useState<Handover["kind"]>(preset ? "Parent" : "Shift");
  const [to, setTo] = useState("");
  const [childId, setChildId] = useState(preset ? preset.id : "");
  const [note, setNote] = useState("");
  const [outstanding, setOutstanding] = useState("");
  const shiftTo = [LEADER, "s08", MANAGER].filter((id) => id !== who).map((id) => ({ id, label: personName(id, s) }));
  const roomTo = [{ id: "s10", label: "Preschool, Rachel Buckley" }, { id: "s05", label: "Wobblers, Lorraine Kiely" }, { id: "s03", label: "Babies, Orla Fitzgerald" }];
  const c = kids.find((k) => k.id === childId) || null;
  const g = c ? primaryGuardian(c.family, s) : undefined;
  const target = kind === "Parent" ? (g ? g.name : "") : to;
  const ready = !!target && note.trim().length > 3;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="rt-seg full">{(["Shift", "Room to room", "Parent"] as const).map((k) => <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => { setKind(k); setTo(""); }}>{k}</button>)}</div>
      {kind === "Shift" && <><div className="rt-label">To</div><div className="rt-chips">{shiftTo.map((o) => <button key={o.id} type="button" className={"rt-chip" + (to === o.id ? " on" : "")} onClick={() => setTo(o.id)}>{o.label}</button>)}</div></>}
      {kind === "Room to room" && <><div className="rt-label">To room</div><div className="rt-chips">{roomTo.map((o) => <button key={o.id} type="button" className={"rt-chip" + (to === o.id ? " on" : "")} onClick={() => setTo(o.id)}>{o.label}</button>)}</div></>}
      {kind === "Parent" && (
        <>
          <div className="rt-label">For which child</div>
          <div className="rt-chips">{kids.map((k) => <button key={k.id} type="button" className={"rt-chip" + (childId === k.id ? " on" : "")} onClick={() => setChildId(k.id)}>{short(k)}</button>)}</div>
          {g && <div className="rt-hint">Read out at collection to {g.name}. Shared with the family only through the collection conversation.</div>}
        </>
      )}
      <div className="rt-label">Note</div>
      <textarea className="rt-text" value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} placeholder="What the next person needs to know" aria-label="Handover note" />
      <input className="sh-input" style={{ height: 56, borderRadius: 18, fontSize: 15 }} value={outstanding} onChange={(e) => setOutstanding(e.target.value)} placeholder="Anything still outstanding (optional)" aria-label="Outstanding" />
      <button type="button" className="rt-btn primary full" disabled={!ready} onClick={() => {
        addHandover({ room: ROOM_ID, kind, from: who, to: target, note: (kind === "Parent" && c ? short(c) + ": " : "") + note.trim(), outstanding: outstanding.trim() || null });
        toast(kind + " handover saved for " + (/^s\d+$/.test(target) ? personName(target, s) : target) + ".");
        onDone();
      }}>Save handover</button>
    </div>
  );
}

/* ── PIN pad (simulated: any four digits) ──────────────────────────────────── */
function PinPad({ hint, onDone }: { hint: string; onDone: () => void }) {
  const [pin, setPin] = useState("");
  useEffect(() => {
    if (pin.length !== 4) return;
    const t = window.setTimeout(() => { setPin(""); onDone(); }, 220);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);
  const press = (k: string) => setPin((p) => (k === "del" ? p.slice(0, -1) : p.length < 4 ? p + k : p));
  return (
    <div className="rt-pin">
      <div style={{ fontSize: 14, color: "var(--dim)" }}>{hint}</div>
      <div className="rt-dots" aria-label={pin.length + " of 4 digits entered"}>{[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? "on" : ""} />)}</div>
      <div className="rt-keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) => k === ""
          ? <span key={i} className="rt-key blank" />
          : <button key={i} type="button" className="rt-key" onClick={() => press(k)} aria-label={k === "del" ? "Delete digit" : "Digit " + k}>{k === "del" ? <Icon d={IC.back} size={20} /> : k}</button>)}
      </div>
      <div style={{ fontSize: 12, color: "var(--faint)", textAlign: "center" }}>Demo: any four digits. Real PINs are personal and never shown or shared.</div>
    </div>
  );
}

/* ── Lock screen ───────────────────────────────────────────────────────────── */
function LockScreen({ now, onUnlock }: { now: string; onUnlock: (id: string) => void }) {
  const s = useDemo();
  const [pick, setPick] = useState<string | null>(null);
  return (
    <div className="rt-lock" role="dialog" aria-modal="true" aria-label="Tablet locked">
      <div className="rt-lock-box">
        <Icon d={IC.lock} size={26} style={{ color: "var(--accent)" }} />
        <div className="rt-clock">{now}</div>
        <div style={{ fontSize: 15, color: "var(--dim)" }}>Toddlers tablet {TABLET} is locked. No child details are shown.</div>
        {!pick ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
            {EDUCATORS.map((id) => (
              <button key={id} type="button" className="rt-row-btn" onClick={() => setPick(id)}>
                <span className="rt-ava sm">{s.staff.find((x) => x.id === id)?.initials}</span>
                <span style={{ flex: 1 }}>{personName(id, s)}<span className="sub">{s.staff.find((x) => x.id === id)?.role}</span></span>
                <Icon d={IC.chevron} size={16} style={{ color: "var(--faint)" }} />
              </button>
            ))}
          </div>
        ) : (
          <>
            <PinPad hint={"Enter " + firstName(personName(pick, s)) + "'s 4-digit PIN"} onDone={() => onUnlock(pick)} />
            <button type="button" className="rt-btn" onClick={() => setPick(null)}>Not {firstName(personName(pick, s))}</button>
          </>
        )}
      </div>
    </div>
  );
}
