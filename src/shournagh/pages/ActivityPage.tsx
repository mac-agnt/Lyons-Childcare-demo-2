/* Activity: a transparent trail of what people, agents and systems did today.
   Reads s.events (newest first). Every store action elsewhere lands here
   immediately; new rows flash once. Visual audit trail for the demo only. */
import { useEffect, useState, type ReactNode } from "react";
import {
  useDemo, activeTab, effectiveSite, inSite, roleDef, setSite, navigate, openDrawer, ROLES, type DemoState,
} from "../store";
import type { DemoEvent, LinkType, StoryId, SiteFilter } from "../types";
import { Page, PageHead, Grid, Card, Stat, Chip, DemoTag, SiteChip, Btn, Segmented, Empty, KV, Note, HBars, Icon, IC } from "../ui";

const STORIES: Record<StoryId, string> = {
  A: "Owner away", B: "Policies", C: "Funding", D: "Fees", E: "Parent comms", F: "Enrolment",
};
const STORY_PAGE: Record<StoryId, [string, string]> = {
  A: ["Overview", "executive"], B: ["Policies", "versions"], C: ["Finance", "reconciliation"],
  D: ["Finance", "fees"], E: ["Families", "messaging"], F: ["Families", "enquiries"],
};
const STORY_WHY: Record<StoryId, string> = {
  A: "Part of the owner-away routine: managers run the day and only exceptions reach Edel.",
  B: "Policy rollout: the system remembers the standard and records who has read and signed it.",
  C: "Funding reconciliation: mismatches between Acorn, the portals and bookings are queued for a person to review. Nothing is submitted.",
  D: "Overdue fees: reminders are drafted for a manager to approve. Nothing reaches a family without approval.",
  E: "Parent communications: routine stays in the app, important and urgent notices are tracked to acknowledgement.",
  F: "Enrolment: enquiries are followed up and moved along the pipeline by a person.",
};
type ActorKind = DemoEvent["actorKind"];
const ACTOR_LABEL: Record<ActorKind, string> = { person: "Staff", agent: "AI agent", system: "System", parent: "Parent" };
const ACTOR_ICON: Record<ActorKind, string> = { person: IC.user, agent: IC.spark, system: IC.refresh, parent: IC.families };
const KIND_LABEL: Record<DemoEvent["kind"], string> = { people: "People", agent: "Agent", data: "Data & integrations", access: "Access" };

/** Short, stable, hash-like reference for an event (illustrative, not cryptographic). */
function hashOf(e: DemoEvent | undefined): string {
  if (!e) return "00000000";
  const str = e.id + "|" + e.at + "|" + e.actor + "|" + e.action + "|" + e.target;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Role and permission scope for whoever appears in the access audit. */
function permissionFor(e: DemoEvent, s: DemoState): { role: string; scope: string } {
  if (e.actorKind === "agent") return { role: "AI agent", scope: "Role-scoped retrieval, drafts only" };
  if (e.actorKind === "system") return { role: "Service account", scope: "Scheduled job, no decisions" };
  if (e.actorKind === "parent" || s.guardians.some((g) => g.name === e.actor)) return { role: "Parent/Guardian", scope: "Own children only" };
  if (e.actor === "Edel Lyons") return { role: "Owner", scope: "Both centres, all records" };
  const st = s.staff.find((x) => x.name === e.actor);
  if (!st) return { role: "Unknown", scope: "Not mapped" };
  const scope = st.access === "Site Manager" ? (st.site === "elm" ? "Elmgrove only" : "Ballyneety only")
    : st.access === "HR/Finance" ? "Staff and finance records, no child records"
    : st.access === "Support" ? "Kitchen and cleaning checklists"
    : st.room ? "Own room tablet only" : "Own centre, assigned rooms";
  return { role: st.access, scope };
}

/** Best-effort link from the event text back to the record it touched. */
function linkedRecords(e: DemoEvent, s: DemoState): { type: LinkType; id: string; label: string }[] {
  const text = e.target + " " + e.action;
  const out: { type: LinkType; id: string; label: string }[] = [];
  const seen = new Set<string>();
  const push = (type: LinkType, id: string, label: string) => { if (!seen.has(type + id) && out.length < 4) { seen.add(type + id); out.push({ type, id, label }); } };
  s.staff.forEach((x) => { if (text.includes(x.name)) push("staff", x.id, x.name); });
  s.children.forEach((c) => {
    if (text.includes(c.first + " " + c.last) || text.includes(c.first + " " + c.last.charAt(0) + ".")) push("child", c.id, c.first + " " + c.last);
  });
  s.invoices.forEach((i) => { if (text.includes(i.number)) push("invoice", i.id, i.number); });
  s.policies.forEach((p) => { if (text.includes(p.title) || (p.id === "pol-safesleep" && text.includes("Safe Sleep")) || (p.id === "pol-collection" && text.includes("Collection Authorisation"))) push("policy", p.id, p.title + " v" + p.version); });
  s.enquiries.forEach((q) => { if (text.includes(q.parent)) push("enquiry", q.id, "Enquiry: " + q.parent); });
  s.tasks.forEach((t) => { if (text.includes(t.title)) push("task", t.id, t.title); });
  return out;
}

function whyText(e: DemoEvent, s: DemoState): string {
  const st = s.staff.find((x) => x.name === e.actor);
  const base = e.actorKind === "agent"
    ? (/after approval/.test(e.action)
      ? e.actor + " is an AI agent. This ran only after a person approved the change."
      : e.actor + " is an AI agent. It watches, drafts and queues work for a person; it cannot send, submit or approve on its own.")
    : e.actorKind === "system"
      ? "Automated check or job. No person or agent made a decision here."
      : e.actorKind === "parent"
        ? e.actor + " did this in the parent app."
        : e.kind === "access"
          ? "Sign-ins, sign-outs and record views are written to the access log for every role."
          : e.actor + " did this in Shournagh OS" + (st ? " as " + st.access + "." : e.actor === "Edel Lyons" ? " as Owner." : ".");
  return e.story ? base + " " + STORY_WHY[e.story] : base;
}

function linkedPage(e: DemoEvent): [string, string] | null {
  if (e.kind === "access") return ["Activity", "access"];
  if (e.story) return STORY_PAGE[e.story];
  if (/tablet|lunch|snack|sleep|nappy|meal|drink|observation|handover|checked in|handed over|collector|cleaning|supplies|medication|accident|incident|Toddlers/i.test(e.action + " " + e.target)) return ["Centres", "care"];
  if (/task/i.test(e.action)) return ["Work", "board"];
  if (/backup|restore/i.test(e.action)) return ["Settings", "support"];
  if (/leave|onboarding|document/i.test(e.action)) return ["People", "team"];
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function ActivityPage() {
  const s = useDemo();
  const tab = activeTab("Activity", s);
  const site = effectiveSite(s);
  const role = roleDef(s.role);
  const locked = role.id === "manager-elm" || role.id === "manager-bal";
  const [story, setStory] = useState<StoryId | "all">("all");
  const [actor, setActor] = useState<ActorKind | "all">("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!openId) return;
    const k = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpenId(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [openId]);

  const scoped = s.events.filter((e) => inSite(site, e.site));
  const todays = scoped.filter((e) => !e.at.startsWith("Yesterday"));
  const byKind = (k: DemoEvent["kind"]) => todays.filter((e) => e.kind === k).length;
  const agentPending = s.approvals.filter((a) => a.status === "pending" && inSite(site, a.site) && !/^s\d+$/.test(a.requestedBy) && a.requestedBy !== "edel");
  const pendingReview = s.careLogs.filter((l) => l.status === "pending-review").length;

  const kindFilter: DemoEvent["kind"] | null = tab === "people" || tab === "agent" || tab === "data" || tab === "access" ? tab : null;
  const needle = q.trim().toLowerCase();
  const rows = scoped.filter((e) =>
    (!kindFilter || e.kind === kindFilter) &&
    (story === "all" || e.story === story) &&
    (actor === "all" || e.actorKind === actor) &&
    (!needle || (e.actor + " " + e.action + " " + e.target + " " + hashOf(e)).toLowerCase().includes(needle)));

  const title = tab === "access" ? "Access Audit" : tab === "people" ? "People Actions" : tab === "agent" ? "Agent Actions" : tab === "data" ? "Data & Integrations" : "Activity";
  const sub = tab === "access"
    ? "Every sign-in, sign-out and record view, with the role and permission it ran under."
    : tab === "agent"
      ? "What the AI agents watched, drafted and queued. Agents prepare; people approve."
      : tab === "data"
        ? "Imports, comparisons, care logs from room tablets and scheduled jobs."
        : tab === "people"
          ? "Approvals, messages, check-ins and changes made by staff and parents."
          : "A transparent trail of staff, system and AI actions across both centres. Nothing happens off the record.";

  const opened = openId ? s.events.find((e) => e.id === openId) || null : null;

  const trail = (
    <Card title={tab === "access" ? "Access log" : "Event trail"} sub={"Showing " + rows.length + " of " + scoped.length + " events, newest first"} pad={false}
      right={<Chip tone="outline">Read-only</Chip>}>
      {rows.length === 0 ? <Empty title="No events match these filters" hint="Clear the search or pick another story." /> : tab === "access"
        ? <AccessTable rows={rows} s={s} onOpen={setOpenId} />
        : <EventTable rows={rows} onOpen={setOpenId} />}
      <div style={{ padding: "10px 18px 14px", borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--faint)" }}>
        Visual representation for the demo, not a tamper-proof ledger.
      </div>
    </Card>
  );

  const filters = (
    <Card pad style={{ marginBottom: 12 }}>
      <div className="sh-row" style={{ gap: 10, flexWrap: "wrap" }}>
        <div className="sh-row" style={{ flex: "1 1 240px", gap: 8, height: 36, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-2)" }}>
          <Icon d={IC.search} size={14} style={{ color: "var(--faint)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, actions, records or a reference" aria-label="Search events"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "none", color: "var(--ink)", font: "inherit", fontSize: 13 }} />
          {q && <button type="button" className="sh-btn ghost sm" style={{ height: 24, padding: "0 6px" }} onClick={() => setQ("")} aria-label="Clear search"><Icon d={IC.x} size={11} sw={2.2} /></button>}
        </div>
        {locked ? (
          <span className="sh-row" style={{ gap: 6, fontSize: 12, color: "var(--dim)" }}><Icon d={IC.lock} size={12} />{site === "elm" ? "Elmgrove" : "Ballyneety"} only</span>
        ) : (
          <Segmented<SiteFilter> value={s.site} onChange={(v) => setSite(v)} options={[{ id: "all", label: "Both" }, { id: "elm", label: "Elmgrove" }, { id: "bal", label: "Ballyneety" }]} />
        )}
        <Segmented<ActorKind | "all"> value={actor} onChange={setActor} options={[{ id: "all", label: "Everyone" }, { id: "person", label: "Staff" }, { id: "agent", label: "Agents" }, { id: "system", label: "System" }, { id: "parent", label: "Parents" }]} />
      </div>
      <div className="sh-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        <span style={{ fontSize: 11.5, color: "var(--faint)", marginRight: 2 }}>Story</span>
        <button type="button" className={"sh-btn sm" + (story === "all" ? " primary" : "")} onClick={() => setStory("all")}>All</button>
        {(Object.keys(STORIES) as StoryId[]).map((k) => (
          <button key={k} type="button" className={"sh-btn sm" + (story === k ? " primary" : "")} onClick={() => setStory(story === k ? "all" : k)}>
            <span className="sh-num" style={{ fontWeight: 600 }}>{k}</span>{STORIES[k]}
          </button>
        ))}
      </div>
    </Card>
  );

  return (
    <>
      <Page>
        <PageHead title={title} sub={sub} right={<><DemoTag /><Btn size="sm" icon={IC.check} onClick={() => navigate("Work", "approvals")}>Approvals</Btn></>} />

        <Grid cols={4} style={{ marginBottom: 12 }}>
          <Stat label="Events today" value={todays.length} sub={byKind("people") + " people, " + byKind("agent") + " agent, " + byKind("data") + " data, " + byKind("access") + " access"} />
          <Stat label="Agent actions today" value={byKind("agent")} sub="Watches, drafts and queues. None sent on their own." />
          <Stat label="Agent drafts awaiting a person" value={agentPending.length} tone={agentPending.length ? "gold" : "ok"} sub={agentPending.length ? "Open Approvals to decide" : "Nothing waiting"} onClick={() => navigate("Work", "approvals")} />
          {tab === "access"
            ? <Stat label="Sign-ins today" value={todays.filter((e) => e.kind === "access" && /signed in/.test(e.action)).length} sub="Admin, room tablet and parent app" />
            : <Stat label="Care entries awaiting review" value={pendingReview} tone={pendingReview ? "gold" : "ok"} sub="Observations, incidents, medication" onClick={() => navigate("Centres", "care")} />}
        </Grid>

        {filters}

        {tab === "access" ? (
          <div className="sh-stack">
            {trail}
            <Grid cols={2}>
              <Card title="Sign-ins by role" sub="Preview role switches are logged as sign-ins">
                <KV rows={ROLES.map((r) => [r.label, String(scoped.filter((e) => e.kind === "access" && /signed in/.test(e.action) && e.actor === r.person).length)] as [ReactNode, ReactNode])} />
              </Card>
              <Card title="Access rules in force" sub="Least privilege, set in People & Roles" right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("Settings", "roles")}>Roles</Btn>}>
                <div className="sh-list">
                  {[
                    ["Room tablets", "One room's children, personal PIN per educator"],
                    ["Site managers", "Locked to their own centre"],
                    ["HR/Finance", "Staff and finance records, no child records"],
                    ["Parents", "Their own children only"],
                    ["AI agents", "Only what the person asking may see, drafts only"],
                  ].map(([k, v]) => (
                    <div key={k} className="sh-item" style={{ padding: "8px 0" }}>
                      <Icon d={IC.lock} size={13} style={{ color: "var(--accent)" }} />
                      <span style={{ width: 120, fontSize: 13, color: "var(--ink)" }}>{k}</span>
                      <span style={{ flex: 1, fontSize: 12.5, color: "var(--dim)" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </Grid>
          </div>
        ) : (
        <Grid cols="main">
          {trail}

          <div className="sh-stack">
            <Card title="By kind" sub="Today, in the current site view">
              <HBars rows={[
                { label: "People", value: byKind("people") },
                { label: "Agent", value: byKind("agent"), tone: "gold" },
                { label: "Data & integrations", value: byKind("data"), tone: "ok" },
                { label: "Access", value: byKind("access"), tone: "neutral" },
              ]} />
            </Card>
            <Card title="By story" sub="Tap a story to filter">
              <div className="sh-list">
                {(Object.keys(STORIES) as StoryId[]).map((k) => {
                  const n = scoped.filter((e) => e.story === k).length;
                  return (
                    <button key={k} type="button" className="sh-item click" onClick={() => setStory(story === k ? "all" : k)}
                      style={{ width: "100%", border: 0, background: story === k ? "var(--surface-2)" : "none", font: "inherit", color: "inherit", textAlign: "left", margin: 0 }}>
                      <span className="sh-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{k}</span>
                      <span style={{ flex: 1, fontSize: 13 }}>{STORIES[k]}</span>
                      <span className="sh-num" style={{ fontSize: 12.5, color: "var(--dim)" }}>{n}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
            <Note icon={IC.shield}>
              Agents never send, submit or approve on their own. Every agent draft waits for a named person, and care events are written by educators on the room tablet, never by AI.
            </Note>
          </div>
        </Grid>
        )}
      </Page>

      {opened && <EventDetail e={opened} s={s} prev={s.events[s.events.indexOf(opened) + 1]} onClose={() => setOpenId(null)} />}
    </>
  );
}

/* ── Tables ────────────────────────────────────────────────────────────────── */
function ActorCell({ e }: { e: DemoEvent }) {
  return (
    <span className="sh-row" style={{ gap: 8 }}>
      <span className="sh-avatar" title={ACTOR_LABEL[e.actorKind]} style={{ width: 26, height: 26, borderRadius: 9, background: e.actorKind === "agent" ? "var(--gold-soft)" : e.actorKind === "system" ? "var(--track)" : "var(--accent-soft)", color: e.actorKind === "agent" ? "var(--gold)" : e.actorKind === "system" ? "var(--dim)" : "var(--accent)" }}>
        <Icon d={ACTOR_ICON[e.actorKind]} size={13} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="strong sh-trunc" style={{ display: "block", maxWidth: 170 }}>{e.actor}</span>
        <span style={{ display: "block", fontSize: 11, color: "var(--faint)" }}>{ACTOR_LABEL[e.actorKind]}</span>
      </span>
    </span>
  );
}

function EventTable({ rows, onOpen }: { rows: DemoEvent[]; onOpen: (id: string) => void }) {
  return (
    <div className="sh-scroll-x" style={{ maxHeight: 640, overflowY: "auto" }}>
      <table className="sh-table">
        <thead><tr><th>Time and ref</th><th>Actor</th><th>Action</th><th>Site and story</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className={"click" + (e.fresh ? " sh-fresh" : "")} onClick={() => onOpen(e.id)} tabIndex={0} onKeyDown={(k) => { if (k.key === "Enter") onOpen(e.id); }}>
              <td>
                <span className="sh-num" style={{ display: "block", fontSize: 12, whiteSpace: "nowrap", color: "var(--ink)" }}>{e.at.replace("Yesterday ", "Yest ")}</span>
                <span className="sh-num" style={{ display: "block", fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}>{hashOf(e).slice(0, 7)}</span>
              </td>
              <td><ActorCell e={e} /></td>
              <td style={{ minWidth: 220 }}><span style={{ color: "var(--ink)" }}>{e.action}</span><span style={{ display: "block", fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{e.target}</span></td>
              <td>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                  <SiteChip site={e.site} />
                  {e.story && <Chip tone="accent" title={STORIES[e.story]}>{e.story} {STORIES[e.story]}</Chip>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccessTable({ rows, s, onOpen }: { rows: DemoEvent[]; s: DemoState; onOpen: (id: string) => void }) {
  return (
    <div className="sh-scroll-x" style={{ maxHeight: 640, overflowY: "auto" }}>
      <table className="sh-table">
        <thead><tr><th>Time</th><th>Person</th><th>Role and permission</th><th>Event</th><th>Device or record</th><th>Site</th></tr></thead>
        <tbody>
          {rows.map((e) => {
            const p = permissionFor(e, s);
            return (
              <tr key={e.id} className={"click" + (e.fresh ? " sh-fresh" : "")} onClick={() => onOpen(e.id)} tabIndex={0} onKeyDown={(k) => { if (k.key === "Enter") onOpen(e.id); }}>
                <td><span className="sh-num" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{e.at.replace("Yesterday ", "Yest ")}</span></td>
                <td><ActorCell e={e} /></td>
                <td><span style={{ color: "var(--ink)" }}>{p.role}</span><span style={{ display: "block", fontSize: 11.5, color: "var(--dim)", marginTop: 2 }}>{p.scope}</span></td>
                <td>{e.action}</td>
                <td style={{ minWidth: 200, color: "var(--dim)" }}>{e.target}</td>
                <td><SiteChip site={e.site} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Detail panel ──────────────────────────────────────────────────────────── */
function EventDetail({ e, s, prev, onClose }: { e: DemoEvent; s: DemoState; prev: DemoEvent | undefined; onClose: () => void }) {
  const links = linkedRecords(e, s);
  const page = linkedPage(e);
  const perm = permissionFor(e, s);
  const hrNoChild = s.role === "hr";
  return (
    <div className="sh-drawer-scrim" onClick={onClose}>
      <aside className="sh-drawer" onClick={(x) => x.stopPropagation()} aria-label="Event detail">
        <div style={{ flex: "none", padding: "20px 22px 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="sh-row" style={{ justifyContent: "space-between" }}>
            <span className="sh-eyebrow">Event {hashOf(e)}</span>
            <div className="sh-row" style={{ gap: 6 }}><DemoTag /><button type="button" className="sh-btn ghost sm" onClick={onClose} aria-label="Close"><Icon d={IC.x} size={12} sw={2.2} /></button></div>
          </div>
          <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.4px", marginTop: 8, lineHeight: 1.3 }}>{e.actor} {e.action}</div>
          <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 5 }}>{e.target}</div>
          <div className="sh-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <Chip tone={e.actorKind === "agent" ? "gold" : "accent"}>{ACTOR_LABEL[e.actorKind]}</Chip>
            <Chip tone="neutral">{KIND_LABEL[e.kind]}</Chip>
            <SiteChip site={e.site} />
            {e.story && <Chip tone="accent">{e.story} {STORIES[e.story]}</Chip>}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 22px 28px" }}>
          <div className="sh-eyebrow" style={{ marginBottom: 8 }}>Why it happened</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--body)" }}>{whyText(e, s)}</div>

          <div className="sh-eyebrow" style={{ margin: "20px 0 9px" }}>Record of the event</div>
          <KV rows={[
            ["Time", e.at],
            ["Actor", e.actor + " (" + ACTOR_LABEL[e.actorKind].toLowerCase() + ")"],
            ["Role and permission", perm.role + ", " + perm.scope.toLowerCase()],
            ["Site", e.site === "both" ? "Both centres" : e.site === "elm" ? "Elmgrove" : "Ballyneety"],
            ["Reference", <span className="sh-num" key="h">{hashOf(e)}</span>],
            ["Previous reference", <span className="sh-num" key="p">{prev ? hashOf(prev) : "Start of trail"}</span>],
          ]} />

          <div className="sh-eyebrow" style={{ margin: "20px 0 9px" }}>What record</div>
          {links.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--dim)" }}>No single record is linked to this event.</div> : (
            <div className="sh-list">
              {links.map((l) => {
                const blocked = hrNoChild && l.type === "child";
                return (
                  <button key={l.type + l.id} type="button" className="sh-item click" disabled={blocked} onClick={() => { onClose(); openDrawer(l.type, l.id); }}
                    style={{ width: "100%", border: 0, background: "none", font: "inherit", color: "inherit", textAlign: "left", margin: 0, opacity: blocked ? 0.5 : 1, cursor: blocked ? "not-allowed" : "pointer" }}>
                    <Icon d={blocked ? IC.lock : IC.link} size={14} style={{ color: "var(--accent)" }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{l.label}{blocked && <span style={{ color: "var(--faint)" }}> (child records not available to HR)</span>}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".1em" }}>{l.type}</span>
                  </button>
                );
              })}
            </div>
          )}

          {page && (
            <div style={{ marginTop: 18 }}>
              <Btn kind="primary" size="sm" icon={IC.arrow} onClick={() => { onClose(); navigate(page[0], page[1]); }}>Open {page[0]}</Btn>
            </div>
          )}
          <div style={{ marginTop: 20 }}>
            <Note>Visual representation for the demo, not a tamper-proof ledger. A production audit log would be append-only, time-stamped by the server and retained under the agreed retention policy.</Note>
          </div>
        </div>
      </aside>
    </div>
  );
}
