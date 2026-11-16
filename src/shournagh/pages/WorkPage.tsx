/* Shournagh OS · Work. My Work, Team Board, Approvals, Recurring Routines, Workflows
   and Calendar. Tasks and approvals come from the demo store, so every tick,
   completion, reassignment or decision updates Home, Activity and the linked story
   cards elsewhere. Agents draft and propose; a person approves anything with an effect. */
import { useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import {
  useDemo, activeTab, effectiveSite, inSite, roleDef, personName, staffById, childById, childName, policyById, roomById, euro,
  openDrawer, navigate, logEvent, toast, update, decide, setTaskStatus, toggleCheck, assignTask, addTask, POLICY_STAGES,
  type DemoState,
} from "../store";
import { WEEKDAYS, TODAY_IDX, TODAY_LABEL, dayLabel, siteName } from "../seed";
import type { Task, Approval, LinkType, SiteFilter, SiteId } from "../types";
import {
  Page, PageHead, Grid, Card, Stat, Chip, DemoTag, Avatar, Bar, Btn, Segmented, Toggle, Empty, Note, RecordLink, Restricted,
  Icon, IC, type Tone,
} from "../ui";
import "./work.css";

type P = { s: DemoState; site: SiteFilter };

/* ── helpers ───────────────────────────────────────────────────────────────── */
const STATUSES: { id: Task["status"]; label: string; tone: Tone }[] = [
  { id: "todo", label: "To do", tone: "neutral" },
  { id: "doing", label: "In progress", tone: "gold" },
  { id: "blocked", label: "Blocked", tone: "bad" },
  { id: "done", label: "Done", tone: "ok" },
];
const stOf = (id: Task["status"]) => STATUSES.find((x) => x.id === id) || STATUSES[0];
const prioTone = (p: Task["priority"]): Tone => (p === "High" ? "bad" : p === "Medium" ? "gold" : "outline");
const actorOf = (s: DemoState) => roleDef(s.role).person;
const ini = (s: DemoState, id: string) => (id === "edel" ? "EL" : staffById(id, s)?.initials || id.slice(0, 2).toUpperCase());
const isTime = (due: string) => /^\d{1,2}:\d{2}$/.test(due);
const isToday = (due: string) => due === "Today" || isTime(due) || due === dayLabel(0) || due === WEEKDAYS[TODAY_IDX];
const siteText = (x: SiteId | "both") => (x === "both" ? "Both sites" : siteName(x));
const scopeText = (site: SiteFilter) => (site === "all" ? "Both centres" : siteName(site));
const historyOf = (s: DemoState, t: Task) => s.events.filter((e) => e.target.includes(t.title)).slice(0, 6);
const shortChild = (s: DemoState, id: string) => { const c = childById(id, s); return c ? c.first + " " + c.last.charAt(0) + "." : id; };
const canOpen = (s: DemoState, page: string) => roleDef(s.role).pages.includes(page);

function linkText(s: DemoState, type: LinkType, id: string): string {
  switch (type) {
    case "child": return childName(id, s);
    case "staff": return personName(id, s);
    case "policy": { const p = policyById(id, s); return p ? p.title + " v" + p.version : id; }
    case "room": return (roomById(id)?.name || id) + " room";
    case "site": return siteName(id as SiteId);
    case "invoice": return s.invoices.find((x) => x.id === id)?.number || id;
    case "funding": { const f = s.funding.find((x) => x.id === id); return f ? f.scheme + " item, " + childName(f.child, s) : id; }
    case "enquiry": { const e = s.enquiries.find((x) => x.id === id); return e ? "Enquiry from " + e.parent : id; }
    case "approval": return s.approvals.find((x) => x.id === id)?.title || id;
    case "task": return s.tasks.find((x) => x.id === id)?.title || id;
    case "family": return s.families.find((x) => x.id === id)?.name || id;
    case "message": return s.messages.find((x) => x.id === id)?.subject || id;
    default: return id;
  }
}
function LinkTo({ s, link }: { s: DemoState; link: Task["link"] }) {
  if (!link) return <span className="sh-faint">None</span>;
  if (s.role === "hr" && (link.type === "child" || link.type === "family")) return <span className="sh-faint">Child record (restricted for HR)</span>;
  return <RecordLink type={link.type} id={link.id}>{linkText(s, link.type, link.id)}</RecordLink>;
}

/* ── task actions (store actions plus an audit entry where the store adds none) ─ */
function tick(s: DemoState, t: Task, idx: number) {
  const item = t.checklist[idx];
  const allDoneAfter = t.checklist.every((c, i) => (i === idx ? !c.done : c.done));
  toggleCheck(t.id, idx);
  logEvent({ actor: actorOf(s), actorKind: "person", action: item.done ? "reopened checklist item" : "ticked checklist item", target: t.title + ": " + item.label, kind: "people", site: t.site, story: t.story });
  if (item.done && t.status === "done") setTaskStatus(t.id, "doing");
  else if (!item.done && allDoneAfter && t.status !== "done") {
    logEvent({ actor: actorOf(s), actorKind: "person", action: "completed task", target: t.title, kind: "people", site: t.site, story: t.story });
    toast("Every item ticked. " + t.title + " is complete.");
  }
}
function setStatus(t: Task, status: Task["status"]) {
  if (t.status === status) return;
  setTaskStatus(t.id, status);
  toast(status === "done" ? "Done. Logged against " + t.title + "." : "Moved to " + stOf(status).label + ".");
}
function decideAp(s: DemoState, a: Approval, d: "approved" | "declined") {
  const invId = a.id.startsWith("ap-rem-") ? a.id.slice(7) : null;
  const wasReviewed = invId ? s.invoices.find((i) => i.id === invId)?.status === "reviewed" : false;
  decide(a.id, d);
  if (invId && wasReviewed) update("invoices", invId, { status: "reviewed" });
  if (d === "approved" && a.id === "ap-fund1") toast("Approved. The funding item is marked reviewed; the portal change is keyed by a person.");
}
const canDecide = (s: DemoState, a: Approval) => s.role === "owner" || roleDef(s.role).personId === a.approver;

function Head({ s, site, title, sub, right }: P & { title: string; sub: ReactNode; right?: ReactNode }) {
  const locked = s.role === "manager-elm" || s.role === "manager-bal";
  return <PageHead title={title} sub={sub} right={<>{right}<Chip tone="outline">{locked && site !== "all" ? siteName(site) + " only" : scopeText(site)}</Chip><DemoTag /></>} />;
}

/* ── page ──────────────────────────────────────────────────────────────────── */
export default function WorkPage() {
  const s = useDemo();
  const site = effectiveSite(s);
  const tab = activeTab("Work", s);
  if (!canOpen(s, "Work")) return <Page><PageHead title="Work" right={<DemoTag />} /><Restricted what="Work" /></Page>;
  return (
    <Page>
      <div className="wk">
        {tab === "mine" && <MyWork s={s} site={site} />}
        {tab === "board" && <Board s={s} site={site} />}
        {tab === "approvals" && <Approvals s={s} site={site} />}
        {tab === "routines" && <Routines s={s} site={site} />}
        {tab === "workflows" && <Workflows s={s} site={site} />}
        {tab === "calendar" && <Calendar s={s} site={site} />}
      </div>
    </Page>
  );
}

/* ── My Work ───────────────────────────────────────────────────────────────── */
function TaskItem({ s, t, open, onOpen }: { s: DemoState; t: Task; open: boolean; onOpen: () => void }) {
  const st = stOf(t.status);
  const isDone = t.status === "done";
  const doneN = t.checklist.filter((c) => c.done).length;
  const hist = historyOf(s, t);
  return (
    <div className={"wk-task" + (open ? " open" : "") + (isDone ? " done" : "")}>
      <div className="wk-task-h">
        <button type="button" className={"wk-tick" + (isDone ? " on" : "")} aria-label={isDone ? "Reopen " + t.title : "Complete " + t.title}
          onClick={() => setStatus(t, isDone ? "todo" : "done")}>{isDone && <Icon d={IC.check} size={12} sw={2.6} />}</button>
        <button type="button" className="wk-task-t" onClick={onOpen} aria-expanded={open}>
          <span className="t">{t.title}</span>
          <span className="m">Due {t.due}, {siteText(t.site)}{t.checklist.length ? ", " + doneN + " of " + t.checklist.length + " ticked" : ""}{t.recurring ? ", " + t.recurring.toLowerCase() : ""}</span>
        </button>
        <span className="wk-chips"><Chip tone={prioTone(t.priority)}>{t.priority}</Chip><Chip tone={st.tone}>{isDone && t.doneAt ? "Done " + t.doneAt : st.label}</Chip></span>
        <span className="wk-caret"><Icon d={IC.down} size={14} /></span>
      </div>
      {open && (
        <div className="wk-task-b">
          <div className="wk-facts">
            <div><div className="k">Owner</div><div className="v sh-row" style={{ gap: 6 }}><Avatar initials={ini(s, t.owner)} name={personName(t.owner, s)} size={20} />{personName(t.owner, s)}</div></div>
            <div><div className="k">Centre</div><div className="v">{siteText(t.site)}</div></div>
            <div><div className="k">Due</div><div className="v">{t.due}</div></div>
            <div><div className="k">Priority</div><div className="v">{t.priority}</div></div>
            <div><div className="k">Linked record</div><div className="v"><LinkTo s={s} link={t.link} /></div></div>
            <div><div className="k">Repeats</div><div className="v">{t.recurring || "One-off"}</div></div>
          </div>
          {t.checklist.length > 0 && (
            <div>
              <div className="sh-eyebrow" style={{ marginBottom: 6 }}>Checklist</div>
              {t.checklist.map((c, k) => (
                <label key={k} className={"wk-check" + (c.done ? " done" : "")}>
                  <input type="checkbox" checked={c.done} onChange={() => tick(s, t, k)} />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          )}
          <div className="sh-row" style={{ gap: 6, flexWrap: "wrap" }}>
            {STATUSES.map((x) => <Btn key={x.id} size="sm" kind={x.id === t.status ? "primary" : "secondary"} onClick={() => setStatus(t, x.id)}>{x.label}</Btn>)}
            <Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => openDrawer("task", t.id)}>Open record</Btn>
          </div>
          <div>
            <div className="sh-eyebrow" style={{ marginBottom: 6 }}>Activity</div>
            {hist.length ? (
              <div className="sh-list">
                {hist.map((e) => (
                  <div key={e.id} className="sh-item" style={{ padding: "6px 0", alignItems: "flex-start" }}>
                    <span className="sh-num sh-faint" style={{ width: 44, flex: "none", fontSize: 11 }}>{e.at}</span>
                    <span style={{ fontSize: 12.5, lineHeight: 1.45 }}><b style={{ fontWeight: 500, color: "var(--ink)" }}>{e.actor}</b> {e.action}{e.target !== t.title ? ": " + e.target.replace(t.title + ": ", "") : ""}</span>
                  </div>
                ))}
              </div>
            ) : <div className="wk-s">No activity on this task yet today.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function MyWork({ s, site }: P) {
  const role = roleDef(s.role);
  const me = role.personId;
  const isOwner = s.role === "owner";
  const [open, setOpen] = useState<string | null>(null);
  const mine = s.tasks.filter((t) => t.owner === me && inSite(site, t.site));
  const active = mine.filter((t) => t.status === "todo" || t.status === "doing");
  const today = active.filter((t) => isToday(t.due));
  const later = active.filter((t) => !isToday(t.due));
  const blocked = mine.filter((t) => t.status === "blocked");
  const done = mine.filter((t) => t.status === "done");
  const waiting = s.approvals.filter((a) => a.status === "pending" && a.approver === me && inSite(site, a.site));
  const team = isOwner ? s.tasks.filter((t) => t.owner !== me && t.status !== "done" && t.priority === "High" && inSite(site, t.site)) : [];
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  const group = (label: string, list: Task[], empty: string) => (
    <div className="wk-group">
      <div className="wk-group-h">{label}<span className="n">{list.length}</span></div>
      {list.length ? list.map((t) => <TaskItem key={t.id} s={s} t={t} open={open === t.id} onOpen={() => toggle(t.id)} />) : <div className="wk-s">{empty}</div>}
    </div>
  );

  return (
    <>
      <Head s={s} site={site} title="My work" sub={role.person + ", " + TODAY_LABEL + ". Your own tasks and the decisions only you can make."} />
      <Grid cols={4}>
        <Stat label="Due today" value={String(today.length)} sub="Open tasks you own" />
        <Stat label="Blocked" value={String(blocked.length)} tone={blocked.length ? "bad" : "ok"} sub={blocked.length ? "Waiting on something outside your control" : "Nothing blocked"} />
        <Stat label="Done" value={String(done.length)} tone="ok" sub="Completed and logged today" />
        <Stat label={isOwner ? "Only you can decide" : "Waiting on your decision"} value={String(waiting.length)} tone={waiting.length ? "gold" : "ok"} sub="Pending approvals" onClick={() => navigate("Work", "approvals")} />
      </Grid>

      <Grid cols="main" style={{ marginTop: 12 }}>
        <Card title="Your tasks" sub="Tick checklist items as you go. Open a task for its owner, linked record and history.">
          {group("Today", today, isOwner ? "Nothing on your own list today. Your managers own the day; only decisions reach you." : "Nothing due today.")}
          {group("Blocked", blocked, "Nothing blocked.")}
          {later.length > 0 && group("Coming up", later, "")}
          {group("Done", done, "Nothing completed yet today.")}
        </Card>
        <div className="sh-stack">
          <Card title={isOwner ? "Things only you can do" : "Waiting on your decision"} sub={waiting.length ? "Approve here or open the full queue" : undefined}
            right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("Work", "approvals")}>Queue</Btn>}>
            {waiting.length ? (
              <div className="sh-list">
                {waiting.map((a, k) => (
                  <div key={a.id + k} style={{ padding: "10px 0" }}>
                    <RecordLink type="approval" id={a.id}>{a.title}</RecordLink>
                    <span className="wk-s">{a.requestedBy.startsWith("s") ? "From " + personName(a.requestedBy, s) : "Proposed by " + a.requestedBy + " (agent)"}</span>
                    <div className="sh-row" style={{ gap: 6, marginTop: 8 }}>
                      <Btn size="sm" kind="primary" icon={IC.check} onClick={() => decideAp(s, a, "approved")}>Approve</Btn>
                      <Btn size="sm" onClick={() => decideAp(s, a, "declined")}>Decline</Btn>
                    </div>
                  </div>
                ))}
              </div>
            ) : <Empty title="Nothing waiting on you" hint="New requests land here and on Home." />}
          </Card>
          {isOwner && (
            <Card title="Owned by your team" sub="High priority and open. Each has an owner and a due time, so you do not need to chase.">
              {team.length ? (
                <div className="sh-list">
                  {team.map((t) => (
                    <button key={t.id} type="button" className="sh-item click" onClick={() => openDrawer("task", t.id)}
                      style={{ width: "calc(100% + 16px)", border: 0, background: "none", font: "inherit", color: "inherit", textAlign: "left" }}>
                      <Avatar initials={ini(s, t.owner)} name={personName(t.owner, s)} size={26} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="sh-trunc strong" style={{ display: "block", fontSize: 13 }}>{t.title}</span>
                        <span className="wk-s">{personName(t.owner, s)}, due {t.due}</span>
                      </span>
                      <Chip tone={stOf(t.status).tone}>{stOf(t.status).label}</Chip>
                    </button>
                  ))}
                </div>
              ) : <Empty title="Nothing high priority open" />}
            </Card>
          )}
          <AddTask s={s} site={site} />
        </div>
      </Grid>
    </>
  );
}

function AddTask({ s, site }: P) {
  const role = roleDef(s.role);
  const me = role.personId;
  const owners = (role.id === "owner" || role.id === "hr" ? [{ id: "edel", name: "Edel Lyons" }] : [])
    .concat(s.staff.filter((x) => inSite(site, x.site) && x.access !== "Support").map((x) => ({ id: x.id, name: x.name + ", " + siteName(x.site) })));
  const siteOpts: Task["site"][] = site === "all" ? ["both", "elm", "bal"] : [site];
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(owners.some((o) => o.id === me) ? me : owners[0]?.id || "edel");
  const [where, setWhere] = useState<Task["site"]>(siteOpts[0]);
  const [due, setDue] = useState("Today");
  const [prio, setPrio] = useState<Task["priority"]>("Medium");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const tt = title.trim();
    if (!tt) { toast("Give the task a title first."); return; }
    addTask(tt, owner, where, due.trim() || "Today", prio);
    toast("Task added for " + personName(owner, s) + ". It is on the Team Board.");
    setTitle("");
  };
  return (
    <Card title="Add a task" sub="Lands on the owner's list and the Team Board">
      <form className="wk-form" onSubmit={submit}>
        <div>
          <label className="sh-label" htmlFor="wk-title">Task</label>
          <input id="wk-title" className="sh-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: confirm Christmas closure dates with families" />
        </div>
        <div className="two">
          <div>
            <label className="sh-label" htmlFor="wk-owner">Owner</label>
            <select id="wk-owner" className="sh-input" value={owner} onChange={(e) => setOwner(e.target.value)}>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="sh-label" htmlFor="wk-site">Centre</label>
            <select id="wk-site" className="sh-input" value={where} onChange={(e) => setWhere(e.target.value as Task["site"])}>
              {siteOpts.map((o) => <option key={o} value={o}>{siteText(o)}</option>)}
            </select>
          </div>
          <div>
            <label className="sh-label" htmlFor="wk-due">Due</label>
            <input id="wk-due" className="sh-input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="sh-label" htmlFor="wk-prio">Priority</label>
            <select id="wk-prio" className="sh-input" value={prio} onChange={(e) => setPrio(e.target.value as Task["priority"])}>
              {(["High", "Medium", "Low"] as const).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div><Btn type="submit" kind="primary" icon={IC.plus}>Add task</Btn></div>
      </form>
    </Card>
  );
}

/* ── Team Board ────────────────────────────────────────────────────────────── */
function ownerPool(s: DemoState, site: SiteFilter, t: Task) {
  const ids = s.staff.filter((x) => x.access !== "Support" && inSite(site, x.site) && (t.site === "both" || x.site === t.site)).map((x) => x.id);
  if (s.role === "owner" || s.role === "hr") ids.unshift("edel");
  if (!ids.includes(t.owner)) ids.unshift(t.owner);
  return ids;
}
function BoardCard({ s, site, t, dragging, onDrag }: { s: DemoState; site: SiteFilter; t: Task; dragging: boolean; onDrag: (id: string | null) => void }) {
  const idx = STATUSES.findIndex((x) => x.id === t.status);
  const prev = STATUSES[idx - 1];
  const next = STATUSES[idx + 1];
  const doneN = t.checklist.filter((c) => c.done).length;
  return (
    <div className={"wk-card" + (dragging ? " dragging" : "")} draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; onDrag(t.id); }}
      onDragEnd={() => onDrag(null)}>
      <div className="sh-row" style={{ alignItems: "flex-start", gap: 8 }}>
        <button type="button" className="t" style={{ flex: 1, minWidth: 0 }} onClick={() => openDrawer("task", t.id)}>{t.title}</button>
        <Chip tone={prioTone(t.priority)}>{t.priority}</Chip>
      </div>
      <span className="wk-s">Due {t.due}, {siteText(t.site)}{t.status === "done" && t.doneAt ? ", done " + t.doneAt : ""}</span>
      {t.checklist.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Bar value={doneN} max={t.checklist.length} tone={t.status === "done" ? "ok" : t.status === "blocked" ? "bad" : "accent"} />
          <span className="wk-s">{doneN} of {t.checklist.length} ticked</span>
        </div>
      )}
      {t.link && <span className="wk-s">Linked: <LinkTo s={s} link={t.link} /></span>}
      <div className="wk-card-f">
        <Avatar initials={ini(s, t.owner)} name={personName(t.owner, s)} size={24} />
        <select className="sh-input wk-sel" aria-label={"Owner of " + t.title} value={t.owner} style={{ flex: 1, minWidth: 0 }}
          onChange={(e) => { assignTask(t.id, e.target.value); toast("Reassigned to " + personName(e.target.value, s) + "."); }}>
          {ownerPool(s, site, t).map((id) => <option key={id} value={id}>{personName(id, s)}</option>)}
        </select>
      </div>
      <div className="wk-card-f" style={{ justifyContent: "space-between" }}>
        {prev ? <Btn size="sm" kind="ghost" icon={IC.back} onClick={() => setStatus(t, prev.id)}>{prev.label}</Btn> : <span />}
        {next && <Btn size="sm" kind="ghost" onClick={() => setStatus(t, next.id)}>{next.label}<Icon d={IC.arrow} size={13} /></Btn>}
      </div>
    </div>
  );
}

function Board({ s, site }: P) {
  const [fSite, setFSite] = useState<SiteFilter>("all");
  const [fOwner, setFOwner] = useState("all");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const scope: SiteFilter = site !== "all" ? site : fSite;
  const inScope = s.tasks.filter((t) => inSite(scope, t.site));
  const owners = Array.from(new Set(inScope.map((t) => t.owner)));
  const tasks = inScope.filter((t) => fOwner === "all" || t.owner === fOwner);
  const onDrop = (status: Task["status"]) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const id = drag || e.dataTransfer.getData("text/plain");
    setDrag(null); setOver(null);
    const t = s.tasks.find((x) => x.id === id);
    if (t) setStatus(t, status);
  };

  return (
    <>
      <Head s={s} site={site} title="Team board" sub="Every task across both centres, by status. Drag a card, or use the buttons, to move it. Reassign from the card." />
      <div className="sh-row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {site === "all"
          ? <Segmented value={fSite} onChange={(v) => { setFSite(v); setFOwner("all"); }} options={[{ id: "all", label: "Both centres" }, { id: "elm", label: "Elmgrove" }, { id: "bal", label: "Ballyneety" }]} />
          : <Chip tone="outline">{siteName(site)} and shared tasks only</Chip>}
        <label className="sh-label" htmlFor="wk-fowner" style={{ margin: "0 0 0 6px" }}>Owner</label>
        <select id="wk-fowner" className="sh-input" style={{ height: 34 }} value={fOwner} onChange={(e) => setFOwner(e.target.value)}>
          <option value="all">Everyone ({inScope.length})</option>
          {owners.map((id) => <option key={id} value={id}>{personName(id, s)} ({inScope.filter((t) => t.owner === id).length})</option>)}
        </select>
        <span className="wk-s" style={{ marginLeft: "auto" }}>{tasks.filter((t) => t.status !== "done").length} open, {tasks.filter((t) => t.status === "done").length} done</span>
      </div>
      <div className="wk-board">
        {STATUSES.map((col) => {
          const list = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className={"wk-col" + (over === col.id ? " over" : "")}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== col.id) setOver(col.id); }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={onDrop(col.id)}>
              <div className="wk-col-h"><Chip tone={col.tone}>{col.label}</Chip><span className="n">{list.length}</span></div>
              {list.length ? list.map((t) => <BoardCard key={t.id} s={s} site={site} t={t} dragging={drag === t.id} onDrag={setDrag} />)
                : <div className="wk-s" style={{ padding: "18px 6px", textAlign: "center" }}>{col.id === "blocked" ? "Nothing blocked." : "No tasks here."}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── Approvals ─────────────────────────────────────────────────────────────── */
const KIND: Record<Approval["kind"], { label: string; tone: Tone }> = {
  Policy: { label: "Policy version reminder", tone: "accent" },
  "Parent alert": { label: "Parent alert", tone: "gold" },
  Finance: { label: "Finance discrepancy", tone: "warn" },
  "Staff cover": { label: "Staff cover", tone: "accent" },
  Leave: { label: "Leave", tone: "outline" },
  "Parent reminder": { label: "Payment reminder", tone: "gold" },
};
function effectOf(s: DemoState, a: Approval): string {
  if (a.id === "ap-safesleep") return "Managers send the Safe Sleep v4.0 reminder to the " + s.staff.filter((x) => !x.safeSleepSigned).length + " staff who have not signed (simulated).";
  if (a.id === "ap-cover") return "The rota updates and the After-school coverage watch clears on Home and Overview.";
  if (a.id === "ap-fund1") return "The funding item is marked reviewed. A person keys the portal change; nothing is submitted.";
  if (a.id === "ap-notice") return "The Important notice goes to Toddlers families in the app (simulated).";
  if (a.id === "ap-leave") return "Leave is approved and the proposed cover is recorded.";
  if (a.id.startsWith("ap-rem-")) return "The reminder is queued (simulated, nothing is sent). The invoice stays unpaid.";
  return "The decision is recorded in Activity.";
}
function ApprovalCard({ s, a, mine }: { s: DemoState; a: Approval; mine: boolean }) {
  const k = KIND[a.kind];
  const agent = !a.requestedBy.startsWith("s");
  const may = canDecide(s, a);
  return (
    <div className={"wk-ap" + (mine && a.status === "pending" ? " mine" : "")}>
      <div className="sh-row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <Chip tone={k.tone}>{k.label}</Chip>
        <Chip tone="outline">{siteText(a.site)}</Chip>
        {agent ? <Chip tone="neutral">Agent proposal</Chip> : <Chip tone="neutral">Staff request</Chip>}
        {a.status !== "pending" && <Chip tone={a.status === "approved" ? "ok" : "bad"}>{a.status === "approved" ? "Approved" : "Declined"} {a.decidedAt || ""}</Chip>}
      </div>
      <div className="t">{a.title}</div>
      <div className="d">{a.detail}</div>
      <div className="sh-row" style={{ gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 12 }}>
        <span className="sh-muted">Requested by <b className="strong">{agent ? a.requestedBy : personName(a.requestedBy, s)}</b></span>
        <span className="sh-muted">Approver <b className="strong">{personName(a.approver, s)}</b></span>
        {a.link && <span className="sh-muted">Linked <LinkTo s={s} link={a.link} /></span>}
      </div>
      <div className="fx"><Icon d={IC.flag} size={14} style={{ marginTop: 2, color: "var(--accent)" }} /><span>{a.status === "pending" ? "On approval: " : a.status === "approved" ? "Done: " : "Declined: nothing happened. "}{a.status === "declined" ? "The request goes back to the requester." : effectOf(s, a)}</span></div>
      {a.status === "pending" && (
        <div className="sh-row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Btn size="sm" kind="primary" icon={IC.check} disabled={!may} onClick={() => decideAp(s, a, "approved")}
            title={may ? undefined : "Only " + personName(a.approver, s) + " or Edel can approve"}>{s.role === "owner" && a.approver !== "edel" ? "Approve as owner" : "Approve"}</Btn>
          <Btn size="sm" disabled={!may} onClick={() => decideAp(s, a, "declined")}>Decline</Btn>
          {!may && <span className="wk-s" style={{ margin: 0 }}>Waiting for {personName(a.approver, s)}. Only the named approver or Edel can decide.</span>}
        </div>
      )}
    </div>
  );
}
function Approvals({ s, site }: P) {
  const me = roleDef(s.role).personId;
  const all = s.approvals.filter((a) => inSite(site, a.site));
  const yours = all.filter((a) => a.status === "pending" && a.approver === me);
  const others = all.filter((a) => a.status === "pending" && a.approver !== me);
  const decided = all.filter((a) => a.status !== "pending");
  const [view, setView] = useState<"you" | "others" | "decided">(yours.length ? "you" : "others");
  const list = view === "you" ? yours : view === "others" ? others : decided;
  const agentN = all.filter((a) => !a.requestedBy.startsWith("s")).length;
  return (
    <>
      <Head s={s} site={site} title="Approvals" sub="Agents propose, people decide. Approving here updates the linked task, record and Home card at once." />
      <Grid cols={4}>
        <Stat label="Awaiting you" value={String(yours.length)} tone={yours.length ? "gold" : "ok"} onClick={() => setView("you")} sub={roleDef(s.role).person} />
        <Stat label="Awaiting others" value={String(others.length)} onClick={() => setView("others")} sub={s.role === "owner" ? "You can still approve as owner" : "Named approver decides"} />
        <Stat label="Decided" value={String(decided.length)} tone="ok" onClick={() => setView("decided")} sub="Today, logged in Activity" />
        <Stat label="Agent proposals" value={agentN + " of " + all.length} sub="Drafted by an agent, decided by a person" />
      </Grid>
      <div className="sh-row" style={{ margin: "14px 0 12px", flexWrap: "wrap" }}>
        <Segmented value={view} onChange={setView} options={[
          { id: "you", label: "Awaiting you (" + yours.length + ")" },
          { id: "others", label: "Awaiting others (" + others.length + ")" },
          { id: "decided", label: "Decided (" + decided.length + ")" },
        ]} />
      </div>
      {list.length ? list.map((a, k) => <ApprovalCard key={a.id + "-" + k} s={s} a={a} mine={view === "you"} />)
        : <Card><Empty title={view === "you" ? "Nothing waiting on you" : view === "others" ? "Nothing waiting on others" : "No decisions yet today"} hint={view === "you" ? "When an agent or a colleague needs your decision, it appears here and on Home." : undefined} /></Card>}
    </>
  );
}

/* ── Recurring Routines ────────────────────────────────────────────────────── */
type Today = { label: string; tone: Tone; doneAt: string | null };
interface Routine {
  id: string; name: string; cadence: string; owners: string[]; tasks: string[]; last: string; next: string;
  page: string; tab?: string; drawer?: { type: LinkType; id: string };
  today?: (s: DemoState, site: SiteFilter) => Today;
}
const routineOff: Record<string, boolean> = {};
const ROUTINES: Routine[] = [
  { id: "rt-open", name: "Room opening checks", cadence: "Daily, 07:30 Elmgrove, 08:00 Ballyneety", owners: ["s01", "s18"], tasks: ["t-open-elm", "t-open-bal"], last: "Yesterday 07:55", next: "Tomorrow 07:30", page: "Centres", tab: "today" },
  { id: "rt-roster", name: "Morning roster confirmation", cadence: "Daily, 08:00", owners: ["s01", "s18"], tasks: ["t-roster-elm", "t-roster-bal"], last: "Yesterday 08:12", next: "Tomorrow 08:00", page: "People", tab: "rota" },
  { id: "rt-clean", name: "Cleaning sign-offs", cadence: "Daily, 10:00, 13:00 and 16:00", owners: ["s07", "s22"], tasks: ["t-clean-tod"], last: "Yesterday 16:04", next: "Today 10:00", page: "Centres", tab: "cleaning",
    today: (s, site) => {
      const items = s.cleaning.filter((c) => inSite(site, c.site));
      const done = items.filter((c) => c.done);
      const late = items.filter((c) => !c.done && c.due === "Yesterday").length;
      const lastAt = done.map((c) => c.done || "").sort().pop() || null;
      return { label: done.length + " of " + items.length + " signed off" + (late ? ", " + late + " late" : ""), tone: done.length === items.length ? "ok" : late ? "bad" : "gold", doneAt: lastAt };
    } },
  { id: "rt-induction", name: "Induction follow-up", cadence: "Weekly, Monday", owners: ["s02"], tasks: ["t-ella"], last: dayLabel(-7), next: dayLabel(7), page: "People", tab: "onboarding",
    today: (s, site) => {
      const blocked = s.onboarding.filter((o) => inSite(site, o.site)).flatMap((o) => o.steps).filter((x) => x.state === "blocked").length;
      return { label: blocked ? blocked + " step blocked" : "On track", tone: blocked ? "bad" : "ok", doneAt: null };
    } },
  { id: "rt-policy", name: "Policy review", cadence: "Monthly, first Monday", owners: ["edel", "s18"], tasks: ["t-collection-v22"], last: dayLabel(-14), next: dayLabel(3), page: "Policies", tab: "library",
    today: (s) => {
      const n = s.policies.filter((p) => p.status !== "Published").length;
      return { label: n ? n + " in review" : "None in review", tone: n ? "gold" : "ok", doneAt: null };
    } },
  { id: "rt-ncs", name: "Monthly scheme reconciliation (NCS and ECCE)", cadence: "Monthly, first week", owners: ["s02"], tasks: ["t-ncs-month", "t-funding"], last: dayLabel(-32), next: dayLabel(5), page: "Finance", tab: "reconciliation",
    today: (s, site) => {
      const f = s.funding.filter((x) => inSite(site, x.site));
      const r = f.filter((x) => x.status === "reviewed").length;
      return { label: r + " of " + f.length + " mismatches reviewed", tone: f.length && r === f.length ? "ok" : "gold", doneAt: null };
    } },
  { id: "rt-obs", name: "Child observation review", cadence: "Weekly, room leaders", owners: ["s07", "s10"], tasks: ["t-obs-tod"], last: dayLabel(-7), next: "Today", page: "Centres", tab: "curriculum",
    today: (s, site) => {
      const n = s.careLogs.filter((l) => l.kind === "observation" && l.status === "pending-review" && inSite(site, childById(l.child, s)?.site || "elm")).length;
      return { label: n ? n + " drafts to review" : "All reviewed", tone: n ? "gold" : "ok", doneAt: null };
    } },
  { id: "rt-handover", name: "Manager handover", cadence: "Daily, 17:30", owners: ["s01", "s18"], tasks: ["t-handover"], last: "Yesterday 17:34", next: "Today 17:30", page: "Work", drawer: { type: "task", id: "t-handover" } },
];
function routineToday(s: DemoState, site: SiteFilter, r: Routine): Today {
  if (r.today) return r.today(s, site);
  const ts = r.tasks.map((id) => s.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t && inSite(site, t.site));
  if (!ts.length) return { label: "Not due today", tone: "outline", doneAt: null };
  const done = ts.filter((t) => t.status === "done");
  const doneAt = done.map((t) => t.doneAt || "").sort().pop() || null;
  if (done.length === ts.length) return { label: "Done" + (doneAt ? " " + doneAt : ""), tone: "ok", doneAt };
  if (ts.some((t) => t.status === "blocked")) return { label: "Blocked", tone: "bad", doneAt };
  if (ts.length === 1) return { label: "Due " + ts[0].due, tone: "gold", doneAt };
  return { label: done.length + " of " + ts.length + " done", tone: "gold", doneAt };
}
function Routines({ s, site }: P) {
  const [, setTick] = useState(0);
  const me = roleDef(s.role).personId;
  const rows = ROUTINES.map((r) => ({ r, t: routineToday(s, site, r), off: !!routineOff[r.id] }));
  const flip = (r: Routine, on: boolean) => {
    routineOff[r.id] = !on;
    setTick((n) => n + 1);
    logEvent({ actor: actorOf(s), actorKind: "person", action: on ? "resumed recurring routine" : "paused recurring routine", target: r.name, kind: "people", site: "both", story: null });
    toast(on ? r.name + " is back on. The next run creates its tasks as usual." : r.name + " paused. No new tasks are created until it is back on.");
  };
  const open = (r: Routine) => {
    if (r.drawer) openDrawer(r.drawer.type, r.drawer.id);
    else navigate(r.page, r.tab);
  };
  const doneN = rows.filter((x) => !x.off && x.t.tone === "ok").length;
  return (
    <>
      <Head s={s} site={site} title="Recurring routines" sub="The standards that repeat. Each routine creates its tasks on time, so nobody has to remember to chase them." />
      <Grid cols={4}>
        <Stat label="Routines on" value={rows.filter((x) => !x.off).length + " of " + rows.length} />
        <Stat label="On track today" value={String(doneN)} tone="ok" sub="Done or nothing outstanding" />
        <Stat label="Need attention" value={String(rows.filter((x) => !x.off && (x.t.tone === "gold" || x.t.tone === "bad")).length)} tone="gold" sub="Due, in progress or blocked" />
        <Stat label="Paused" value={String(rows.filter((x) => x.off).length)} sub="Switched off by a manager or Edel" />
      </Grid>
      <Card style={{ marginTop: 12 }} pad={false}>
        <div className="sh-scroll-x">
          <table className="sh-table">
            <thead><tr><th>Routine</th><th>Owner</th><th>Last run</th><th>Next run</th><th>Today</th><th>On</th><th /></tr></thead>
            <tbody>
              {rows.map(({ r, t, off }) => {
                const owners = r.owners.filter((id) => id === "edel" || inSite(site, staffById(id, s)?.site || "both"));
                const may = s.role === "owner" || s.role === "manager-elm" || s.role === "manager-bal" || r.owners.includes(me);
                const openable = r.drawer ? true : canOpen(s, r.page);
                return (
                  <tr key={r.id} style={off ? { opacity: 0.6 } : undefined}>
                    <td><span className="strong">{r.name}</span><span className="wk-s">{r.cadence}</span></td>
                    <td>
                      <div className="sh-row" style={{ gap: 4 }}>
                        {owners.map((id) => <Avatar key={id} initials={ini(s, id)} name={personName(id, s)} size={24} />)}
                        <span className="wk-s" style={{ margin: "0 0 0 4px" }}>{owners.map((id) => personName(id, s).split(" ")[0]).join(", ")}</span>
                      </div>
                    </td>
                    <td className="sh-num">{t.doneAt ? "Today " + t.doneAt : r.last}</td>
                    <td className="sh-num">{off ? "Paused" : r.next}</td>
                    <td>{off ? <Chip tone="outline">Paused</Chip> : <Chip tone={t.tone}>{t.label}</Chip>}</td>
                    <td>{may ? <Toggle on={!off} onChange={(v) => flip(r, v)} label={(off ? "Resume " : "Pause ") + r.name} /> : <Chip tone="outline">{off ? "Off" : "On"}</Chip>}</td>
                    <td className="r"><Btn size="sm" kind="ghost" icon={IC.arrow} disabled={!openable} title={openable ? undefined : r.page + " is not available to this role"} onClick={() => open(r)}>Open</Btn></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <div style={{ marginTop: 12 }}>
        <Note icon={IC.clock}>Today's state is read from the tasks, cleaning sign-offs, observations and funding items themselves, so it changes as people complete them. Pausing a routine is logged in Activity.</Note>
      </div>
    </>
  );
}

/* ── Workflows ─────────────────────────────────────────────────────────────── */
type StepKind = "trigger" | "agent" | "gate" | "effect" | "person";
const STEP_LABEL: Record<StepKind, string> = { trigger: "Trigger", agent: "Agent drafts", gate: "Human approval", effect: "Effect, after approval", person: "Person" };
interface Workflow {
  id: string; name: string; agent: string; steps: { kind: StepKind; label: string; who: string }[];
  history: [string, string, string, string][]; page: string; tab: string; live: (s: DemoState, site: SiteFilter) => string;
}
const WORKFLOWS: Workflow[] = [
  { id: "wf-urgent", name: "Urgent collection notice", agent: "Parent Communications", page: "Families", tab: "messaging",
    steps: [
      { kind: "trigger", label: "Room logs a temperature on the tablet", who: "Room educator" },
      { kind: "agent", label: "Drafts an Urgent notice to the guardian", who: "Parent Communications" },
      { kind: "gate", label: "Centre manager approves the notice", who: "Gráinne Twomey or Siobhán Barry" },
      { kind: "effect", label: "Urgent push and SMS to the guardian", who: "Sent only after approval (simulated)" },
      { kind: "person", label: "Acknowledged in 15 minutes, or phone escalation", who: "Manager phones guardian, then second contact" },
    ],
    history: [[dayLabel(-6), "Wobblers, temperature", "Gráinne Twomey", "Acknowledged in 4 minutes"], [dayLabel(-19), "Preschool, unwell after lunch", "Gráinne Twomey", "No acknowledgement in 15 minutes, guardian phoned, collected 11:40"], [dayLabel(-33), "Robins, temperature", "Siobhán Barry", "Acknowledged in 7 minutes"]],
    live: (s, site) => {
      const ms = s.messages.filter((m) => m.priority === "Urgent" && inSite(site, m.site));
      if (!ms.length) return "No urgent notices today at this centre.";
      return ms.map((m) => m.at + ", " + (m.child ? shortChild(s, m.child) : m.to) + ": " + (m.ackAt ? "acknowledged " + m.ackAt + " by " + m.ackBy + ", phone escalation not needed." : "awaiting acknowledgement, phone escalation on standby.")).join(" ");
    } },
  { id: "wf-ncs", name: "Monthly NCS and ECCE check", agent: "Funding Reconciler", page: "Finance", tab: "reconciliation",
    steps: [
      { kind: "trigger", label: "Acorn Cloud export", who: "Nightly, system of record" },
      { kind: "agent", label: "Compares bookings with scheme records imported by hand", who: "Funding Reconciler" },
      { kind: "gate", label: "A person reviews each mismatch", who: "Deirdre Nagle or the site manager" },
      { kind: "effect", label: "Correction keyed on the NCS or ECCE portal", who: "By a person. No live API, nothing submitted from here" },
      { kind: "person", label: "Evidence attached and item closed", who: "Reviewer" },
    ],
    history: [[dayLabel(-32), "October check", "Deirdre Nagle", "2 mismatches, corrected on the portal by hand"], [dayLabel(-63), "September check", "Deirdre Nagle", "4 mismatches, corrected within 3 days"]],
    live: (s, site) => {
      const f = s.funding.filter((x) => inSite(site, x.site));
      const n = (st: string) => f.filter((x) => x.status === st).length;
      return "This month: " + f.length + " mismatches, " + euro(f.reduce((t, x) => t + x.amount, 0)) + ". " + n("open") + " open, " + n("assigned") + " with a reviewer, " + n("reviewed") + " reviewed. Nothing submitted.";
    } },
  { id: "wf-policy", name: "Policy update", agent: "Policy Keeper", page: "Policies", tab: "versions",
    steps: [
      { kind: "agent", label: "Draft from Edel's notes, with change summary", who: "Policy Keeper" },
      { kind: "person", label: "Wording and sources reviewed", who: "Site manager" },
      { kind: "gate", label: "Approve for publication", who: "Edel Lyons" },
      { kind: "effect", label: "Distributed to the right staff and families", who: "After approval" },
      { kind: "person", label: "Each recipient reads and signs", who: "Staff, parents" },
      { kind: "gate", label: "Approve reminders to anyone unsigned", who: "Edel or the site manager" },
      { kind: "effect", label: "Reminders sent, version locked when complete", who: "After approval (simulated)" },
    ],
    history: [[dayLabel(-7), "Safe Sleep Policy v4.0", "Edel Lyons", "Published, signatures coming in"], [dayLabel(-1), "Parent Communications Policy v1.0", "Edel Lyons", "Sent to all families, acknowledgements coming in"], [dayLabel(-45), "Staff Induction Guide 2026 v1.3", "Deirdre Nagle", "Complete, all staff signed"]],
    live: (s, site) => {
      const stage = POLICY_STAGES.find((x) => x.id === s.policyFlow.stage)?.label || s.policyFlow.stage;
      const staff = s.staff.filter((x) => inSite(site, x.site));
      return "Collection Authorisation v2.2 is at " + stage + ". Safe Sleep v4.0: " + staff.filter((x) => x.safeSleepSigned).length + " of " + staff.length + " staff signed.";
    } },
  { id: "wf-fees", name: "Overdue fees", agent: "Billing check and Parent Communications", page: "Finance", tab: "outstanding",
    steps: [
      { kind: "trigger", label: "Billing check flags invoices past due", who: "Daily 09:05, from Acorn invoices" },
      { kind: "agent", label: "Drafts a respectful reminder", who: "Parent Communications" },
      { kind: "gate", label: "Site manager approves the wording", who: "Gráinne Twomey or Siobhán Barry" },
      { kind: "effect", label: "Reminder sent to the family", who: "Only after approval (simulated)" },
      { kind: "person", label: "Invoice marked reviewed", who: "Stays unpaid until a payment is recorded" },
    ],
    history: [[dayLabel(-31), "October run, 5 invoices", "Both site managers", "5 reminders approved, 3 paid within 7 days"], [dayLabel(-62), "September run, 4 invoices", "Both site managers", "4 reminders approved, all paid by month end"]],
    live: (s, site) => {
      const inv = s.invoices.filter((i) => inSite(site, i.site));
      const ap = (st: string) => inv.filter((i) => s.approvals.find((a) => a.id === "ap-rem-" + i.id)?.status === st).length;
      return inv.length + " overdue, " + euro(inv.reduce((t, i) => t + i.amount, 0)) + ". " + ap("pending") + " reminders awaiting approval, " + ap("approved") + " approved (simulated), " + inv.filter((i) => i.status === "reviewed").length + " reviewed. Paid: 0.";
    } },
];
function Workflows({ s, site }: P) {
  const gates = WORKFLOWS.reduce((n, w) => n + w.steps.filter((x) => x.kind === "gate").length, 0);
  const effects = WORKFLOWS.reduce((n, w) => n + w.steps.filter((x) => x.kind === "effect").length, 0);
  const ungated = WORKFLOWS.reduce((n, w) => n + w.steps.filter((x, i) => x.kind === "effect" && !w.steps.slice(0, i).some((y) => y.kind === "gate")).length, 0);
  return (
    <>
      <Head s={s} site={site} title="Workflows" sub="Agent workflows written as plain steps. Anything that reaches a family, a portal or a rota waits for a person first." />
      <Grid cols={4}>
        <Stat label="Workflows" value={String(WORKFLOWS.length)} sub="Running in the demo" />
        <Stat label="Human approval gates" value={String(gates)} tone="gold" sub="A named person decides" />
        <Stat label="Steps with an effect" value={String(effects)} sub="Sending, keying or publishing" />
        <Stat label="Effects without a person" value={String(ungated)} tone={ungated ? "bad" : "ok"} sub="Every effect sits behind an approval" />
      </Grid>
      <div className="sh-stack" style={{ marginTop: 12 }}>
        {WORKFLOWS.map((w) => {
          const openable = canOpen(s, w.page);
          return (
            <Card key={w.id} title={w.name} sub={"Run by " + w.agent + ", decided by people"}
              right={<Btn size="sm" kind="ghost" icon={IC.arrow} disabled={!openable} title={openable ? undefined : w.page + " is not available to this role"} onClick={() => navigate(w.page, w.tab)}>Open live item</Btn>}>
              <div className="wk-flow">
                {w.steps.map((st, k) => (
                  <div key={k} className={"wk-step " + st.kind}>
                    <span className="k">{st.kind === "gate" ? <Icon d={IC.shield} size={12} /> : st.kind === "effect" ? <Icon d={IC.lock} size={12} /> : <span className="sh-num">{k + 1}</span>}{STEP_LABEL[st.kind]}</span>
                    <span className="l">{st.label}</span>
                    <span className="w">{st.who}</span>
                  </div>
                ))}
              </div>
              <div className="wk-live"><Icon d={IC.spark} size={15} style={{ marginTop: 2, color: "var(--accent)" }} /><span><b className="strong">Today</b> {w.live(s, site)}</span></div>
              <div className="sh-scroll-x" style={{ marginTop: 12 }}>
                <table className="sh-table">
                  <thead><tr><th>Previous run (illustrative)</th><th>What</th><th>Approved by</th><th>Outcome</th></tr></thead>
                  <tbody>{w.history.map((h, k) => <tr key={k}><td className="sh-num">{h[0]}</td><td className="strong">{h[1]}</td><td>{h[2]}</td><td className="sh-muted">{h[3]}</td></tr>)}</tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

/* ── Calendar ──────────────────────────────────────────────────────────────── */
type CalKind = "Task" | "Routine" | "Visit" | "Training" | "Leave" | "Inspection prep";
const CAL_TONE: Record<CalKind, Tone> = { Task: "accent", Routine: "outline", Visit: "gold", Training: "ok", Leave: "warn", "Inspection prep": "neutral" };
interface CalItem { id: string; day: number; time: string; title: string; who: string; kind: CalKind; site: SiteId | "both"; done?: boolean; open: () => void }
function calendarItems(s: DemoState, site: SiteFilter): CalItem[] {
  const week = WEEKDAYS.map((_, i) => dayLabel(i - TODAY_IDX));
  const dayOf = (due: string): number | null => {
    if (due === "Today" || isTime(due)) return TODAY_IDX;
    const w = WEEKDAYS.indexOf(due);
    if (w >= 0) return w;
    const d = week.indexOf(due);
    return d >= 0 ? d : null;
  };
  const out: CalItem[] = [];
  s.tasks.filter((t) => inSite(site, t.site)).forEach((t) => {
    const d = dayOf(t.due);
    if (d === null) return;
    out.push({ id: t.id, day: d, time: isTime(t.due) ? t.due : "", title: t.title, who: personName(t.owner, s), kind: t.recurring ? "Routine" : "Task", site: t.site, done: t.status === "done", open: () => openDrawer("task", t.id) });
  });
  WEEKDAYS.forEach((_, d) => {
    if (d === TODAY_IDX) return;
    out.push({ id: "rt-day-" + d, day: d, time: "07:30", title: "Daily routines: opening checks, roster, cleaning, handover", who: "Centre managers", kind: "Routine", site: "both", open: () => navigate("Work", "routines") });
  });
  const DAYNAMES = ["Mon", "Tues", "Wednes", "Thurs", "Fri"];
  s.enquiries.filter((e) => e.status === "visit" && inSite(site, e.site)).forEach((e) => {
    const m = /(Mon|Tues|Wednes|Thurs|Fri)day (\d{1,2}:\d{2})/.exec(e.note);
    if (!m) return;
    out.push({ id: e.id, day: DAYNAMES.indexOf(m[1]), time: m[2], title: "Visit: " + e.parent + ", " + e.programme, who: personName(e.owner, s), kind: "Visit", site: e.site, open: () => openDrawer("enquiry", e.id) });
  });
  s.staff.filter((x) => x.status === "training" && inSite(site, x.site)).forEach((x) => {
    out.push({ id: "tr-" + x.id, day: TODAY_IDX, time: "", title: x.name + ": " + x.statusNote.toLowerCase(), who: "Off the floor today", kind: "Training", site: x.site, open: () => openDrawer("staff", x.id) });
  });
  s.leave.filter((l) => l.status !== "declined").forEach((l) => {
    const st = staffById(l.staff, s);
    if (!st || !inSite(site, st.site)) return;
    let a = -1, b = -1;
    if (l.dates.startsWith("Today")) {
      a = TODAY_IDX;
      const m = / to (.+)$/.exec(l.dates);
      b = m ? week.indexOf(m[1]) : a;
      if (b < 0) b = 4;
    } else {
      a = b = week.indexOf(l.dates);
    }
    if (a < 0) return;
    for (let d = a; d <= b; d++) {
      out.push({ id: l.id + "-" + d, day: d, time: "", title: st.name + ": " + l.kind.toLowerCase() + (l.status === "pending" ? " (pending)" : ""), who: l.cover, kind: l.kind === "Training" ? "Training" : "Leave", site: st.site, open: () => openDrawer("staff", st.id) });
    }
  });
  ([
    { id: "ins-bal", day: 2, time: "14:00", title: "Inspection readiness walk-through (internal)", who: "Siobhán Barry", site: "bal" },
    { id: "ins-elm", day: 3, time: "15:30", title: "Evidence vault check before policy review (internal)", who: "Gráinne Twomey", site: "elm" },
  ] as { id: string; day: number; time: string; title: string; who: string; site: SiteId }[])
    .filter((x) => inSite(site, x.site))
    .forEach((x) => out.push({ ...x, kind: "Inspection prep", open: () => navigate("Policies", "inspection") }));
  return out.sort((x, y) => (x.time || "00:00").localeCompare(y.time || "00:00"));
}
function Calendar({ s, site }: P) {
  const items = calendarItems(s, site);
  const [kind, setKind] = useState<CalKind | "all">("all");
  const shown = items.filter((x) => kind === "all" || x.kind === kind);
  const kinds = (Object.keys(CAL_TONE) as CalKind[]).filter((k) => items.some((x) => x.kind === k));
  const todayN = items.filter((x) => x.day === TODAY_IDX && !x.done).length;
  return (
    <>
      <Head s={s} site={site} title="Calendar" sub={"This week, Monday to Friday. Due tasks, routines, visits, training, leave and inspection prep in one place. Today is " + TODAY_LABEL + "."} />
      <div className="sh-row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="sh-scroll-x" style={{ maxWidth: "100%", minWidth: 0, paddingBottom: 2 }}><Segmented value={kind} onChange={setKind} options={[{ id: "all", label: "All (" + items.length + ")" }, ...kinds.map((k) => ({ id: k, label: k + " (" + items.filter((x) => x.kind === k).length + ")" }))]} /></div>
        <span className="wk-s" style={{ marginLeft: "auto" }}>{todayN} open items today</span>
      </div>
      <div className="wk-week">
        {WEEKDAYS.map((d, i) => {
          const list = shown.filter((x) => x.day === i);
          const isT = i === TODAY_IDX;
          return (
            <div key={d} className={"wk-day" + (isT ? " today" : "")} aria-current={isT ? "date" : undefined}>
              <div className="wk-day-h"><span className="d">{d}</span><span className="x">{dayLabel(i - TODAY_IDX)}</span>{isT && <span style={{ marginLeft: "auto" }}><Chip tone="accent">Today</Chip></span>}</div>
              {list.length ? list.map((x) => (
                <button key={x.id} type="button" className={"wk-ev" + (x.done ? " done" : "")} onClick={x.open}>
                  <span className="row"><span className="tm">{x.time || (x.kind === "Leave" || x.kind === "Training" ? "All day" : "Any time")}</span><Chip tone={CAL_TONE[x.kind]}>{x.done ? "Done" : x.kind}</Chip></span>
                  <span className="tt">{x.title}</span>
                  <span className="ww">{x.who}{x.site !== "both" && site === "all" ? ", " + siteName(x.site) : ""}</span>
                </button>
              )) : <div className="wk-s" style={{ padding: "10px 4px" }}>Nothing scheduled.</div>}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12 }}>
        <Note icon={IC.calendar}>Items come from tasks, enquiries, leave and the rota, so a completed task or approved leave shows here straight away. Inspection prep entries are internal walk-throughs, not scheduled inspections.</Note>
      </div>
    </>
  );
}
