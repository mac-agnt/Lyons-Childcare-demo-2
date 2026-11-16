/* Settings: organisation, registrations, roles, connected systems, notification
   routing, data and AI governance, and support and handover (including the
   "How we'd implement this" delivery walkthrough). Honest by design: nothing is
   shown as fully integrated, guaranteed or contracted when it is not. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  useDemo, activeTab, effectiveSite, inSite, metrics, roleDef, navigate, openDrawer, setRole, logEvent, toast, addTask,
  personName, euro, type DemoState,
} from "../store";
import { SITES, ROOMS, TODAY_LABEL, DEMO_DATE } from "../seed";
import type { RoleId, SiteId } from "../types";
import {
  Page, PageHead, Grid, Card, Stat, Chip, DemoTag, Btn, Toggle, KV, Note, RecordLink, Steps, Icon, IC, type Tone,
} from "../ui";

export default function SettingsPage() {
  const s = useDemo();
  const tab = activeTab("Settings", s);
  return (
    <Page>
      {tab === "org" && <OrgTab s={s} />}
      {tab === "centres" && <CentresTab s={s} />}
      {tab === "roles" && <RolesTab s={s} />}
      {tab === "systems" && <SystemsTab s={s} />}
      {tab === "notifications" && <NotificationsTab s={s} />}
      {tab === "governance" && <GovernanceTab s={s} />}
      {tab === "support" && <SupportTab s={s} />}
    </Page>
  );
}

/* ── Small shared bits ─────────────────────────────────────────────────────── */
function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ margin: 0, padding: "0 0 0 17px", display: "flex", flexDirection: "column", gap: 7, fontSize: 13, lineHeight: 1.5, color: "var(--body)" }}>
      {items.map((x, i) => <li key={i}>{x}</li>)}
    </ul>
  );
}
function Swatch({ v, label }: { v: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 54 }}>
      <span style={{ width: 30, height: 30, borderRadius: 999, background: "var(" + v + ")", border: "1px solid var(--border-strong)" }} />
      <span style={{ fontSize: 11, color: "var(--dim)" }}>{label}</span>
    </div>
  );
}
const actor = (s: DemoState) => roleDef(s.role).person;

/* ═══ Organisation ════════════════════════════════════════════════════════════ */
function OrgTab({ s }: { s: DemoState }) {
  const m = metrics(s, "all");
  const elm = s.staff.filter((x) => x.site === "elm").length;
  const bal = s.staff.filter((x) => x.site === "bal").length;
  const regs = SITES.reduce((n, x) => n + 1 + x.extraRegistrations.length, 0);
  const published = s.policies.filter((p) => p.status === "Published").length;
  return (
    <>
      <PageHead title="Organisation" sub="Shournagh Childcare, Blarney, Co. Cork. Family-run for over 25 years." right={<DemoTag />} />
      <Grid cols="main">
        <Card title="Organisation profile" sub="Used on documents, parent messages and reports">
          <KV rows={[
            ["Name", "Shournagh Childcare"],
            ["Location", "Shournagh Road, Blarney, Co. Cork"],
            ["Owner", "Edel Lyons"],
            ["Ownership", "Family-run for over 25 years"],
            ["Centres", <span key="c"><RecordLink type="site" id="elm">Elmgrove</RecordLink> and <RecordLink type="site" id="bal">Ballyneety</RecordLink>, {regs} Tusla registrations</span>],
            ["Rooms", ROOMS.length + " across both centres"],
            ["Staff", m.staffTotal + " (" + elm + " Elmgrove, " + bal + " Ballyneety), plus the owner"],
            ["Families", s.families.length + " with a current booking"],
            ["Product", "Shournagh OS, powered by Pulse"],
          ]} />
          <div style={{ marginTop: 14 }}><Note>Organisation details are confirmed in discovery. Nothing here is a legal or registration record.</Note></div>
        </Card>
        <div className="sh-stack">
          <Card title="Brand" sub="Placeholder until the approved logo file is supplied">
            <div className="sh-row" style={{ gap: 14, marginBottom: 14 }}>
              <span aria-label="S monogram placeholder" style={{ width: 56, height: 56, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--forest)", color: "var(--ivory)", fontSize: 26, fontWeight: 600, flex: "none" }}>S</span>
              <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5 }}>"S" monogram placeholder. Replace with the approved logo and colours before anything goes to families.</div>
            </div>
            <div className="sh-row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <Swatch v="--pine" label="Pine" /><Swatch v="--forest" label="Forest" /><Swatch v="--sage" label="Sage" />
              <Swatch v="--ivory" label="Ivory" /><Swatch v="--gold" label="Gold" /><Swatch v="--coral" label="Coral" />
            </div>
            <Note tone="warn">Demo palette, not verified corporate identity.</Note>
          </Card>
          <Card title="Locale and formats">
            <KV rows={[
              ["Language", "English (Ireland)"], ["Currency", "EUR, e.g. " + euro(1234.5, 2)], ["Time zone", "Europe/Dublin"],
              ["Dates and times", TODAY_LABEL + " " + DEMO_DATE.getFullYear() + ", 24-hour clock"], ["Week starts", "Monday"],
            ]} />
          </Card>
        </div>
      </Grid>
      <Card title="What Shournagh OS is for" sub="A business that follows Edel's standards without depending on Edel to chase everything." style={{ marginTop: 12 }}>
        <Grid cols={4}>
          <Stat label="Open exceptions" value={m.exceptionsOpen} sub={m.exceptionsAssigned + " owned by managers, " + m.exceptionsOwner + " need Edel"} onClick={() => navigate("Home")} />
          <Stat label="Approvals waiting" value={m.approvalsPending} sub="Agents draft, people decide" onClick={() => navigate("Work", "approvals")} />
          <Stat label="Safe Sleep v4.0 signed" value={m.safeSleepSigned + " of " + m.safeSleepTotal} tone={m.safeSleepSigned === m.safeSleepTotal ? "ok" : "gold"} sub="Tracked, not chased by hand" onClick={() => navigate("Policies", "versions")} />
          <Stat label="Published policies" value={published} sub="One library for both centres" onClick={() => navigate("Policies", "library")} />
        </Grid>
      </Card>
    </>
  );
}

/* ═══ Centres & Registrations ════════════════════════════════════════════════ */
function CentresTab({ s }: { s: DemoState }) {
  const site = effectiveSite(s);
  const sites = SITES.filter((x) => inSite(site, x.id));
  const locked = s.role === "manager-elm" || s.role === "manager-bal";
  return (
    <>
      <PageHead title="Centres & Registrations" sub="Two separately registered services, one operating picture. Registration details as associated on the public Tusla register." right={<DemoTag />} />
      <div style={{ marginBottom: 12 }}>
        <Note tone="warn">Whether Edel has authority over both registrations and whether they are the same legal entity is to be confirmed in discovery.</Note>
      </div>
      <Grid cols={sites.length > 1 ? 2 : "1fr"}>
        {sites.map((x) => {
          const mm = metrics(s, x.id);
          const rooms = ROOMS.filter((r) => r.site === x.id);
          return (
            <Card key={x.id} title={<RecordLink type="site" id={x.id}>{x.name}</RecordLink>} sub={x.address} right={<Chip tone="accent">{x.tusla}</Chip>}>
              <KV rows={[
                ["Tusla registration", <span className="sh-num" key="t">{x.tusla}</span>],
                [x.capacityLabel, x.capacity + " places"],
                ["Service type", x.serviceType],
                ["Register contact", x.registryContact + " (as publicly associated on the register)"],
                ["Centre manager", <RecordLink key="m" type="staff" id={x.manager}>{personName(x.manager, s)}</RecordLink>],
                ["Attending today", mm.attending + " of " + mm.booked + " booked (capacity is a registration figure, not attendance)"],
              ]} />
              <div className="sh-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 12 }}>{x.programmes.map((p) => <Chip key={p} tone="outline">{p}</Chip>)}</div>
              {x.extraRegistrations.map((r) => (
                <div key={r.ref} style={{ marginTop: 12 }}>
                  <Note icon={IC.file}><b style={{ color: "var(--ink)", fontWeight: 600 }}>{r.ref}</b>, {r.label}. {r.note} Capacity for this registration is not added to any figure here.</Note>
                </div>
              ))}
              <div className="sh-scroll-x" style={{ marginTop: 14 }}>
                <table className="sh-table">
                  <thead><tr><th>Room</th><th>Ages</th><th>Hours</th><th>Room leader</th><th>Tablet</th></tr></thead>
                  <tbody>
                    {rooms.map((r) => (
                      <tr key={r.id}>
                        <td><RecordLink type="room" id={r.id}>{r.name}</RecordLink></td>
                        <td style={{ minWidth: 140 }}>{r.ages}</td>
                        <td className="sh-num" style={{ whiteSpace: "nowrap" }}>{r.hours}</td>
                        <td><RecordLink type="staff" id={r.leader}>{personName(r.leader, s)}</RecordLink></td>
                        <td className="sh-num">{r.tabletId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sh-row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <Btn size="sm" icon={IC.centres} onClick={() => openDrawer("site", x.id)}>Open centre record</Btn>
                <Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("Centres", "rooms")}>Rooms today</Btn>
              </div>
            </Card>
          );
        })}
      </Grid>
      {locked && <div style={{ marginTop: 12 }}><Note icon={IC.lock}>Your access is limited to {site === "elm" ? "Elmgrove" : "Ballyneety"}. The other centre's registration details are not shown to this role.</Note></div>}
    </>
  );
}

/* ═══ People & Roles ═════════════════════════════════════════════════════════ */
const ROLE_COLS: { id: string; preview: RoleId | null; site: string }[] = [
  { id: "Owner", preview: "owner", site: "Both centres, can switch" },
  { id: "Site Manager", preview: "manager-elm", site: "Locked to own centre" },
  { id: "Room Leader", preview: null, site: "Own room, own centre" },
  { id: "Early Years Educator", preview: "educator", site: "Own room tablet only" },
  { id: "HR/Finance", preview: "hr", site: "Both centres, staff and finance only" },
  { id: "Parent/Guardian", preview: "parent", site: "Own family only" },
];
const MATRIX: [string, string[]][] = [
  ["View child records", ["All", "Own centre", "Own room", "Own room", "No", "Own children"]],
  ["View the other centre", ["Yes", "No", "No", "No", "Staff and finance", "No"]],
  ["Approve policy", ["Yes", "Review only", "No", "No", "No", "No"]],
  ["Approve fees reminder", ["Yes", "Own centre", "No", "No", "Draft only", "No"]],
  ["See finance", ["All", "Own centre", "No", "No", "All", "Own invoices"]],
  ["Edit rota", ["Yes", "Own centre", "Request swaps", "Request swaps", "View only", "No"]],
  ["Log care events", ["No", "Yes", "Yes", "Yes", "No", "No"]],
  ["Review observations and incidents", ["Yes", "Incidents", "Observations", "No", "No", "No"]],
  ["Acknowledge parent notices", ["No", "No", "No", "No", "No", "Yes"]],
  ["Export data", ["Yes, logged", "Own centre, logged", "No", "No", "Staff and payroll, logged", "Own data on request"]],
];
const cellTone = (v: string): Tone => (v === "Yes" || v === "All" ? "ok" : v === "No" ? "neutral" : "accent");
const LIMITS: [string, string, string][] = [
  ["Payment reminder to a family", "Site manager", "Own centre. Balances over €1,000 go to Edel."],
  ["Urgent parent notice", "Site manager", "Own centre. Edel is told after it is sent."],
  ["Staff cover and rota change", "Site manager", "Own centre. Agency cover goes to Edel."],
  ["Leave request", "Site manager", "Own centre. Overlapping leave in one room goes to Edel."],
  ["Policy publication", "Owner", "Site managers review the wording first."],
  ["Funding correction", "HR/Finance reviews", "A person keys any correction in the portal."],
  ["Refund, credit or write-off", "Owner", "Any amount."],
];

function RolesTab({ s }: { s: DemoState }) {
  const usersOf = (id: string): { count: number; ids: string[] } => {
    if (id === "Owner") return { count: 1, ids: [] };
    if (id === "Parent/Guardian") return { count: s.guardians.length, ids: [] };
    const ids = s.staff.filter((x) => x.access === id).map((x) => x.id);
    return { count: ids.length, ids };
  };
  const support = s.staff.filter((x) => x.access === "Support");
  return (
    <>
      <PageHead title="People & Roles" sub="Least-privilege access: each role sees what its job needs and nothing else. Users per role come from the staff list." right={<DemoTag />} />
      <Grid cols={3} style={{ marginBottom: 12 }}>
        {ROLE_COLS.map((r) => {
          const u = usersOf(r.id);
          return (
            <Card key={r.id} title={r.id} sub={r.site} right={<span className="sh-num" style={{ fontSize: 20, fontWeight: 600 }}>{u.count}</span>}>
              <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6, minHeight: 40 }}>
                {r.id === "Owner" ? "Edel Lyons"
                  : r.id === "Parent/Guardian" ? "Guardians with parent app access, " + s.families.length + " families"
                  : u.ids.slice(0, 5).map((id, i) => <span key={id}>{i > 0 && ", "}<RecordLink type="staff" id={id}>{personName(id, s)}</RecordLink></span>)}
                {u.ids.length > 5 && <span>, and {u.ids.length - 5} more</span>}
              </div>
              <div className="sh-row" style={{ gap: 8, marginTop: 10 }}>
                {r.preview
                  ? <Btn size="sm" icon={IC.eye} onClick={() => setRole(r.preview as RoleId)} disabled={s.role === r.preview}>{s.role === r.preview ? "Previewing" : "Preview this role"}</Btn>
                  : <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Same access as an educator, plus observation review</span>}
              </div>
            </Card>
          );
        })}
      </Grid>

      <Card title="Permission matrix" sub="Rows are capabilities, columns are roles. Demo settings, agreed during requirements." pad={false}>
        <div className="sh-scroll-x">
          <table className="sh-table">
            <thead><tr><th>Capability</th>{ROLE_COLS.map((r) => <th key={r.id}>{r.id}</th>)}</tr></thead>
            <tbody>
              {MATRIX.map(([cap, vals]) => (
                <tr key={cap}>
                  <td className="strong" style={{ minWidth: 190 }}>{cap}</td>
                  {vals.map((v, i) => <td key={i}><Chip tone={cellTone(v)}>{v}</Chip></td>)}
                </tr>
              ))}
              <tr>
                <td className="strong">Site filter</td>
                {ROLE_COLS.map((r) => <td key={r.id} style={{ fontSize: 12, color: "var(--dim)", minWidth: 120 }}>{r.site}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 18px 14px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--dim)" }}>
          Support staff ({support.length}: {support.map((x) => x.name).join(", ")}) see kitchen and cleaning checklists only. Every role change and sign-in is written to the <button type="button" className="sh-link" onClick={() => navigate("Activity", "access")}>access audit</button>.
        </div>
      </Card>

      <Card title="Approval limits" sub="Who can approve what, and when it goes to Edel. Demo settings, to be agreed." style={{ marginTop: 12 }} pad={false}>
        <div className="sh-scroll-x">
          <table className="sh-table">
            <thead><tr><th>Decision</th><th>Approved by</th><th>Limit or rule</th></tr></thead>
            <tbody>{LIMITS.map(([d, w, r]) => <tr key={d}><td className="strong">{d}</td><td>{w}</td><td style={{ minWidth: 240 }}>{r}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ═══ Connected Systems ══════════════════════════════════════════════════════ */
type SysTag = "EXISTING" | "DEMO" | "PLANNED" | "NEEDS VALIDATION";
const TAG_TONE: Record<SysTag, Tone> = { EXISTING: "ok", DEMO: "neutral", PLANNED: "accent", "NEEDS VALIDATION": "warn" };
interface Sys { id: string; name: string; tag: SysTag; mode: string; role: string; detail: string; actor?: string }
const SYSTEMS: Sys[] = [
  { id: "acorn", name: "Acorn Cloud", tag: "EXISTING", mode: "System of record", actor: "Acorn Cloud",
    role: "Bookings, children, families and billing today.", detail: "Reportedly about €6,000 a year. Stays the system of record until data is verified. Export or API feasibility to assess in phase 2." },
  { id: "web", name: "Website enquiry form", tag: "DEMO", mode: "Demo form", actor: "Website form",
    role: "New enquiries land in Families, Enquiries.", detail: "Demo form only. Where the live website form sends enquiries today needs checking." },
  { id: "portals", name: "Early Years Hive, NCS and ECCE portals", tag: "EXISTING", mode: "Manual portal workflow",
    role: "Government funding and programme portals.", detail: "No API is assumed. Shournagh OS flags mismatches for a person to correct in the portal. Nothing is submitted." },
  { id: "email", name: "Email", tag: "NEEDS VALIDATION", mode: "Provider not assumed",
    role: "Digests and staff notices.", detail: "Which email service Shournagh uses today is to be confirmed. No provider is assumed." },
  { id: "finance", name: "Finance and payroll system", tag: "NEEDS VALIDATION", mode: "Unconfirmed",
    role: "Accounts, payroll and bank reconciliation.", detail: "Unconfirmed. We have not assumed a package or the accountant's workflow." },
  { id: "tusla", name: "Tusla and official sources", tag: "DEMO", mode: "Reference links only",
    role: "Regulation Watch and policy references.", detail: "Reference links only. No connection to Tusla systems, no submissions, no approval implied." },
  { id: "whatsapp", name: "WhatsApp", tag: "NEEDS VALIDATION", mode: "Unconfirmed",
    role: "Informal staff or parent groups, if any.", detail: "Unconfirmed whether it is used today. Child information should not travel through personal messaging groups." },
  { id: "sms", name: "SMS and phone escalation", tag: "PLANNED", mode: "Simulated in the demo",
    role: "Urgent parent notices.", detail: "Provider to be chosen. Every SMS and call in the demo is simulated." },
  { id: "tablets", name: "Room tablets", tag: "DEMO", mode: "Shared devices, personal PINs",
    role: "Care logs, sleep checks, check-in and check-out.", detail: "Hardware and device management to be agreed. One tablet per room." },
];

function SystemsTab({ s }: { s: DemoState }) {
  const m = metrics(s, "all");
  const count = (t: SysTag) => SYSTEMS.filter((x) => x.tag === t).length;
  const discoveryTitle = (x: Sys) => "Confirm for discovery: " + x.name;
  const lastFor = (x: Sys) => (x.actor ? s.events.find((e) => e.actor === x.actor) : x.id === "tablets" ? s.events.find((e) => /tablet/i.test(e.target) || (e.kind === "data" && /logged/.test(e.action))) : undefined);

  function action(x: Sys): ReactNode {
    if (x.id === "acorn") return <Btn size="sm" icon={IC.refresh} onClick={() => {
      logEvent({ actor: "Acorn Cloud", actorKind: "system", action: "export check run (simulated)", target: m.booked + " bookings compared, " + m.fundingOpen + " funding mismatches still open", kind: "data", site: "both", story: "C" });
      toast("Export check simulated: " + m.booked + " bookings compared. Nothing was written to Acorn.");
    }}>Run export check (simulated)</Btn>;
    if (x.id === "web") return <Btn size="sm" icon={IC.arrow} onClick={() => navigate("Families", "enquiries")}>Open enquiries</Btn>;
    if (x.id === "portals") return <Btn size="sm" icon={IC.arrow} onClick={() => navigate("Finance", "reconciliation")}>Open reconciliation</Btn>;
    if (x.id === "tusla") return <Btn size="sm" icon={IC.arrow} onClick={() => navigate("Policies", "regwatch")}>Open Regulation Watch</Btn>;
    if (x.id === "sms") return <Btn size="sm" icon={IC.bell} onClick={() => navigate("Settings", "notifications")}>Notification policy</Btn>;
    if (x.id === "tablets") return <Btn size="sm" icon={IC.tablet} onClick={() => setRole("educator")}>Preview Toddlers tablet</Btn>;
    const added = s.tasks.some((t) => t.title === discoveryTitle(x));
    return <Btn size="sm" icon={added ? IC.check : IC.plus} disabled={added} onClick={() => {
      addTask(discoveryTitle(x), "edel", "both", "Discovery", "Low");
      toast("Added to the discovery list as a task for Edel.");
    }}>{added ? "On the discovery list" : "Add to discovery list"}</Btn>;
  }

  return (
    <>
      <PageHead title="Connected Systems" sub="What Shournagh OS would sit alongside, and how. Nothing here is shown as fully synced." right={<DemoTag />} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Existing systems" value={count("EXISTING")} tone="ok" sub="In use today, kept running" />
        <Stat label="Demo only" value={count("DEMO")} sub="Shown with synthetic data" />
        <Stat label="Planned" value={count("PLANNED")} tone="accent" sub="Provider to be chosen" />
        <Stat label="Needs validation" value={count("NEEDS VALIDATION")} tone="warn" sub="Not assumed until confirmed" />
      </Grid>
      <Grid cols={3}>
        {SYSTEMS.map((x) => {
          const last = lastFor(x);
          return (
            <Card key={x.id} title={x.name} sub={x.mode} right={<Chip tone={TAG_TONE[x.tag]}>{x.tag}</Chip>}>
              <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>{x.role}</div>
              <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.55, marginTop: 6, minHeight: 58 }}>{x.detail}</div>
              <div style={{ fontSize: 11.5, color: "var(--faint)", margin: "10px 0" }}>
                {last ? "Last activity " + last.at + ": " + last.action : x.tag === "NEEDS VALIDATION" ? "No connection" : "No activity recorded today"}
              </div>
              {action(x)}
            </Card>
          );
        })}
      </Grid>
      <div style={{ marginTop: 12 }}>
        <Note>Integrations are assessed in phase 2, before anything is promised. Where no API or lawful export route exists, the workflow stays manual and Shournagh OS helps a person do it faster and with fewer mistakes.</Note>
      </div>
    </>
  );
}

/* ═══ Notifications ══════════════════════════════════════════════════════════ */
const ROUTING: { p: "Routine" | "Important" | "Urgent" | "Mandatory"; parents: string; staff: string; ack: string; silence: string; tone: Tone }[] = [
  { p: "Routine", parents: "In-app log only (optional daily digest)", staff: "In-app", ack: "Not needed", silence: "Yes", tone: "neutral" },
  { p: "Important", parents: "Push, with an optional email digest", staff: "Push", ack: "Tracked", silence: "Push can be muted, stays in the app", tone: "gold" },
  { p: "Urgent", parents: "Push + SMS + phone escalation within 15 min", staff: "Push + SMS to the manager on duty", ack: "Required", silence: "No", tone: "bad" },
  { p: "Mandatory", parents: "Mandatory service communications, in-app and email", staff: "In-app", ack: "As set on the notice", silence: "Cannot be silenced", tone: "accent" },
];
const STAFF_ALERTS: { id: string; label: string; who: string; locked?: boolean }[] = [
  { id: "sleep", label: "Sleep check overdue", who: "Room tablet and room leader", locked: true },
  { id: "urgent", label: "Urgent parent notice not acknowledged in 15 min", who: "Manager on duty, then Edel", locked: true },
  { id: "incident", label: "Incident or accident awaiting review", who: "Centre manager" },
  { id: "cover", label: "Coverage watch changes", who: "Centre manager" },
  { id: "policy", label: "Policy signature reminders", who: "Staff who have not signed" },
  { id: "funding", label: "Funding mismatches found", who: "HR/Finance" },
  { id: "briefing", label: "Morning briefing at 07:30", who: "Edel" },
  { id: "digest", label: "Weekly operations digest by email", who: "Edel and both managers" },
];
// Kept for the session so the choices survive switching tabs.
const alertPrefs: Record<string, boolean> = { sleep: true, urgent: true, incident: true, cover: true, policy: true, funding: true, briefing: true, digest: false };

function NotificationsTab({ s }: { s: DemoState }) {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ ...alertPrefs });
  const site = effectiveSite(s);
  const msgs = s.messages.filter((x) => inSite(site, x.site));
  const by = (p: string) => msgs.filter((x) => x.priority === p).length;
  const awaiting = msgs.filter((x) => x.ackRequired && !x.ackAt).length;
  return (
    <>
      <PageHead title="Notifications" sub="One routing policy for parents and staff. Routine stays quiet, urgent gets through." right={<DemoTag />} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Routine messages" value={by("Routine")} sub="In the app, no buzz" />
        <Stat label="Important" value={by("Important")} tone="gold" sub="Push, tracked" />
        <Stat label="Urgent" value={by("Urgent")} tone="bad" sub="Escalates until acknowledged" />
        <Stat label="Awaiting acknowledgement" value={awaiting} tone={awaiting ? "warn" : "ok"} sub="Open Parents & Messaging" onClick={() => navigate("Families", "messaging")} />
      </Grid>
      <Card title="Routing policy" sub="Applies to every message from both centres" pad={false}>
        <div className="sh-scroll-x">
          <table className="sh-table">
            <thead><tr><th>Priority</th><th>Parents and guardians</th><th>Staff</th><th>Acknowledgement</th><th>Can be silenced</th></tr></thead>
            <tbody>
              {ROUTING.map((r) => (
                <tr key={r.p}>
                  <td><Chip tone={r.tone}>{r.p}</Chip></td>
                  <td style={{ minWidth: 210 }} className="strong">{r.parents}</td>
                  <td style={{ minWidth: 160 }}>{r.staff}</td>
                  <td>{r.ack}</td>
                  <td style={{ minWidth: 150 }}>{r.silence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Grid cols="main" style={{ marginTop: 12 }}>
        <Card title="Staff alerts" sub="Who is told about what. Safety alerts cannot be switched off.">
          <div className="sh-list">
            {STAFF_ALERTS.map((a) => (
              <div key={a.id} className="sh-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: "var(--ink)" }}>{a.label}</div>
                  <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{a.who}{a.locked ? ", always on" : ""}</div>
                </div>
                {a.locked ? (
                  <span className="sh-row" style={{ gap: 5, fontSize: 11.5, color: "var(--faint)" }}><Icon d={IC.lock} size={12} />Required</span>
                ) : (
                  <Toggle on={prefs[a.id]} label={a.label} onChange={(v) => {
                    alertPrefs[a.id] = v;
                    setPrefs({ ...alertPrefs });
                    logEvent({ actor: actor(s), actorKind: "person", action: (v ? "turned on" : "turned off") + " staff alert", target: a.label + " (" + a.who + ")", kind: "people", site: "both", story: null });
                    toast(a.label + (v ? " turned on." : " turned off."));
                  }} />
                )}
              </div>
            ))}
          </div>
        </Card>
        <div className="sh-stack">
          <Card title="Urgent escalation" sub="Simulated in the demo">
            <Steps steps={[
              { label: "Push to every guardian on the child's record", state: "done", note: "Sent straight away" },
              { label: "SMS if not opened", state: "done", note: "After 2 minutes" },
              { label: "Phone call from the manager on duty", state: "current", note: "By 15 minutes, logged with the outcome" },
              { label: "Edel told if still unreached", state: "todo", note: "With the full timeline attached" },
            ]} />
          </Card>
          <Card title="Laura Murphy's settings" sub="Set by the parent in the parent app">
            <KV rows={[["Routine", s.parentPrefs.routine], ["Important", s.parentPrefs.important], ["Urgent", s.parentPrefs.urgent + " (fixed)"]]} />
          </Card>
          <Note>Quiet hours: routine and important messages wait until 07:00. Urgent and mandatory service communications are always delivered.</Note>
        </div>
      </Grid>
    </>
  );
}

/* ═══ Data & AI Governance ═══════════════════════════════════════════════════ */
function GovernanceTab({ s }: { s: DemoState }) {
  const site = effectiveSite(s);
  const kids = s.children.filter((c) => inSite(site, c.site));
  const photos = kids.filter((c) => c.consents.photos).length;
  const outings = kids.filter((c) => c.consents.outings).length;
  const review = s.careLogs.filter((l) => l.status === "pending-review").length;
  const agentToday = s.events.filter((e) => e.kind === "agent" && !e.at.startsWith("Yesterday")).length;
  const accessToday = s.events.filter((e) => e.kind === "access" && !e.at.startsWith("Yesterday")).length;
  return (
    <>
      <PageHead title="Data & AI Governance" sub="How children's and families' data would be protected, and where AI is allowed to help. Design considerations, validated in contract and implementation." right={<DemoTag />} />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Photo consent on file" value={photos + " of " + kids.length} sub={outings + " of " + kids.length + " with outings consent"} onClick={() => navigate("Families", "forms")} />
        <Stat label="Care entries awaiting review" value={review} tone={review ? "gold" : "ok"} sub="Not visible to parents until approved" onClick={() => navigate("Centres", "care")} />
        <Stat label="Agent actions today" value={agentToday} sub="Every one logged, none final without a person" onClick={() => navigate("Activity", "agent")} />
        <Stat label="Access events today" value={accessToday} sub="Sign-ins and record views" onClick={() => navigate("Activity", "access")} />
      </Grid>
      <Grid cols={2}>
        <Card title="GDPR design considerations">
          <Bullets items={[
            "Lawful basis recorded for each kind of data: contract, legal obligation, consent where needed",
            "Collect only what each job needs; no child data on personal phones or messaging groups",
            "A data protection impact assessment before any real child data is used",
            "Parents' rights handled with a logged workflow: access, correction, erasure where lawful, portability",
          ]} />
        </Card>
        <Card title="Who is responsible">
          <KV rows={[
            ["Controller", "Shournagh Childcare (to be validated in contract)"],
            ["Processor", "The delivery partner (to be validated in contract)"],
            ["Sub-processors", "Hosting, email and SMS providers, listed in the DPA"],
            ["Agreement", "Data processing agreement signed before any real data"],
          ]} />
        </Card>
        <Card title="Hosting, security and backups">
          <Bullets items={[
            "EU hosting options, region chosen and written into the contract",
            "Encryption in transit and at rest",
            <span key="a">Access logs for every role, visible in the <button type="button" className="sh-link" onClick={() => navigate("Activity", "access")}>access audit</button></span>,
            <span key="b">Nightly encrypted backups with scheduled restore tests, shown in <button type="button" className="sh-link" onClick={() => navigate("Settings", "support")}>Support & Handover</button></span>,
            "Two-step sign-in for owner, manager and HR accounts",
          ]} />
        </Card>
        <Card title="Retention, export and deletion">
          <Bullets items={[
            "Retention schedule agreed per record type, checked against Tusla and Revenue requirements",
            "Full data export in open formats at any time, and at the end of the contract",
            "Deletion by request goes through approval and is logged",
          ]} />
          <div style={{ marginTop: 12 }}>
            <Btn size="sm" icon={IC.file} onClick={() => {
              logEvent({ actor: actor(s), actorKind: "person", action: "requested a full data export (simulated)", target: "All records for " + (site === "all" ? "both centres" : site === "elm" ? "Elmgrove" : "Ballyneety") + ", open formats", kind: "data", site: site === "all" ? "both" : (site as SiteId), story: null });
              toast("Export request logged. Nothing is downloaded in the demo.");
            }}>Request data export (simulated)</Btn>
          </div>
        </Card>
        <Card title="Child-data safeguards">
          <Bullets items={[
            "Room tablets show one room's children, with personal PIN sign-in",
            "Site managers are locked to their own centre; HR sees staff and finance, not child records",
            "Observations, incidents and medication records are reviewed before parents see them",
            "Collection only to authorised guardians, checked on the tablet",
            "Consent and privacy notices recorded per child and per guardian",
          ]} />
        </Card>
        <Card title="AI exposure controls">
          <Bullets items={[
            "Role-scoped retrieval: an agent only sees what the person asking is allowed to see",
            "No training on identifiable child records",
            "AI never invents care events; only educators write them",
            "AI makes no developmental, medical or safeguarding decisions",
            "Every AI output is a draft for a named person to approve, and every agent action is logged",
          ]} />
        </Card>
      </Grid>
      <Card title="What we will not promise" sub="Some claims sound reassuring and are not true" style={{ marginTop: 12 }}>
        <Grid cols={3}>
          <Note tone="warn" icon={IC.x}>"We can never access your data." Support access may be needed; it should be consented, logged and revocable.</Note>
          <Note tone="warn" icon={IC.x}>"It never goes down." Realistic service levels, monitoring and tested restores are what to agree.</Note>
          <Note tone="warn" icon={IC.x}>"It syncs with the government portals." Only if an API or lawful export route exists, assessed first.</Note>
        </Grid>
      </Card>
    </>
  );
}

/* ═══ Support & Handover ═════════════════════════════════════════════════════ */
const PHASES: { title: string; body: string; gate: string }[] = [
  { title: "Detailed requirements and workflow map", body: "A written PRD and workflow map with Edel and both managers. Confirm the operational and legal boundaries: registrations, roles, data and what stays manual.", gate: "Edel signs off the PRD" },
  { title: "Acorn and data feasibility", body: "Assess Acorn export or API options, map the data, document NCS, ECCE and portal realities, and agree role access and retention.", gate: "Data map and access model approved" },
  { title: "Build and test with synthetic data", body: "Build and test the owner, site manager, room and parent journeys with synthetic data first. No real child data until testing is signed off.", gate: "Journeys accepted in walk-through tests" },
  { title: "Pilot one site", body: "Train staff, check billing and funding outputs, run parent acceptance and data accuracy tests. No forced switch.", gate: "Pilot signed off by the site manager and Edel" },
  { title: "Second site and handover", body: "Only after the sign-offs: documented handover, a support agreement and a tested fallback.", gate: "Support agreement signed, fallback tested" },
];
const MIGRATION = ["Acorn read or export assessment", "Controlled data mapping", "One-site pilot", "Staff and parent acceptance tests", "Verified cutover or coexistence", "Handover"];
const DOCS: [string, string][] = [
  ["Owner and manager guide", "Written in phase 3"], ["Room tablet quick card", "Written in phase 3"], ["Parent onboarding guide", "Written in phase 4"],
  ["Data map and Acorn field mapping", "Phase 2"], ["Runbook: backups, restore and incidents", "Before the pilot"], ["Data processing agreement", "Before any real data"],
];

function SupportTab({ s }: { s: DemoState }) {
  const [step, setStep] = useState(-1);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);
  const m = metrics(s, "all");
  const lastRestore = s.events.find((e) => e.action === "completed restore test (simulated)");
  const RESTORE = [
    { label: "Pick the latest nightly backup", note: "02:10 encrypted backup, demo environment" },
    { label: "Restore into an isolated test copy", note: "Live records are not touched" },
    { label: "Compare record counts", note: s.children.length + " children, " + s.staff.length + " staff, " + s.families.length + " families, " + s.policies.length + " policies" },
    { label: "Spot-check five records", note: "Aoife Murphy, INV-2611, Safe Sleep v4.0, Méabh Ryan, the Doyle enquiry" },
    { label: "Sign off and log the result", note: "Result written to Activity" },
  ];
  function runRestore() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setStep(0);
    RESTORE.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => {
        setStep(i + 1);
        if (i === RESTORE.length - 1) {
          logEvent({ actor: "Restore test", actorKind: "system", action: "completed restore test (simulated)", target: "Backup 02:10 restored to an isolated copy, " + s.children.length + " children and " + s.staff.length + " staff matched", kind: "data", site: "both", story: null });
          toast("Restore test complete (simulated). Counts matched and the result is logged.");
        }
      }, (i + 1) * 850));
    });
  }
  const running = step >= 0 && step < RESTORE.length;

  const tests: { label: string; ok: boolean; page: [string, string] | null; where: string }[] = [
    { label: "Owner approves an agent draft", ok: s.approvals.some((a) => a.status !== "pending" && !!a.decidedAt), page: ["Work", "approvals"], where: "Work, Approvals" },
    { label: "Room tablet entry reaches the parent app", ok: s.careLogs.some((l) => l.id.length > 6 && l.parentVisible), page: null, where: "Preview as Room Educator" },
    { label: "Funding mismatch reviewed by a person", ok: s.funding.some((f) => f.status === "reviewed"), page: ["Finance", "reconciliation"], where: "Finance, Reconciliation" },
    { label: "Policy signature recorded", ok: s.staff.some((x) => !!x.safeSleepSigned && x.safeSleepSigned.startsWith("Today")), page: ["Policies", "versions"], where: "Policies, Versions & Sign-offs" },
    { label: "Cover confirmed by the site manager", ok: s.coverConfirmed, page: ["People", "leave"], where: "People, Leave & Cover" },
    { label: "Enquiry followed up", ok: s.enquiries.some((e) => e.id === "enq-doyle" && e.status !== "new"), page: ["Families", "enquiries"], where: "Families, Enquiries" },
    { label: "Restore from backup demonstrated", ok: !!lastRestore, page: null, where: "Run the restore test on this page" },
  ];
  const passed = tests.filter((t) => t.ok).length;

  return (
    <>
      <PageHead title="Support & Handover" sub="How this would be delivered, owned and supported. Quietly, in gated phases, with nothing forced." right={<DemoTag />} />

      <Grid cols="main">
        <Card title="How we'd implement this" sub="Five gated phases. Each one ends with a sign-off before the next starts.">
          <div className="sh-stack" style={{ gap: 0 }}>
            {PHASES.map((p, i) => (
              <div key={p.title} style={{ display: "flex", gap: 14, padding: "14px 0", borderTop: i ? "1px solid var(--border)" : 0 }}>
                <span className="sh-num" style={{ width: 28, height: 28, flex: "none", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--accent-line)", color: "var(--accent)", fontSize: 12, fontWeight: 600 }}>{i + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{p.title}</div>
                  <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.55, marginTop: 4 }}>{p.body}</div>
                  <div className="sh-row" style={{ gap: 6, marginTop: 7, fontSize: 12, color: "var(--dim)" }}><Icon d={IC.flag} size={12} style={{ color: "var(--accent)" }} />Gate: {p.gate}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <div className="sh-stack">
          <Card title="Migration path" sub="Acorn stays the system of record until the data is verified">
            <div className="sh-stack" style={{ gap: 6 }}>
              {MIGRATION.map((x, i) => (
                <div key={x} className="sh-row" style={{ gap: 10 }}>
                  <span className="sh-num" style={{ fontSize: 11, color: "var(--faint)", width: 16 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--ink)", padding: "7px 11px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>{x}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}><Note>Parents are not moved to a new app before the data and the pilot are validated.</Note></div>
          </Card>
          <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px dashed var(--border-strong)", fontSize: 12, lineHeight: 1.6, color: "var(--dim)" }}>
            <div className="sh-row" style={{ gap: 6, marginBottom: 4, color: "var(--faint)", fontSize: 11 }}><Icon d={IC.note} size={12} />Commercial note</div>
            About 12 weeks was an earlier indicative estimate, not a guarantee. The €24,500 figure was an earlier full-scope discussion, not an approved scope or price for everything shown here. Delivery would be scoped in modular phases.
          </div>
        </div>
      </Grid>

      <Grid cols={2} style={{ marginTop: 12 }}>
        <Card title="Business ownership handover" sub="What Shournagh Childcare holds at the end">
          <KV rows={[
            ["Data", "Yours, with a full export in open formats on request"],
            ["Configuration", "Roles, rooms, policies and templates, documented and exportable"],
            ["Code", "Ownership or licence as set out in the contract"],
            ["Accounts", "Hosting, domain and email held by, or transferable to, Shournagh Childcare"],
            ["Admin access", "Edel holds the owner account; vendor support access is logged and revocable"],
          ]} />
        </Card>
        <Card title="Documentation" sub="Delivered with the handover, written as each phase lands">
          <div className="sh-list">
            {DOCS.map(([d, w]) => (
              <div key={d} className="sh-item" style={{ padding: "9px 0" }}>
                <Icon d={IC.file} size={14} style={{ color: "var(--accent)" }} />
                <span style={{ flex: 1, fontSize: 13 }}>{d}</span>
                <Chip tone="outline">{w}</Chip>
              </div>
            ))}
          </div>
        </Card>
      </Grid>

      <Grid cols="main" style={{ marginTop: 12 }}>
        <Card title="Acceptance walk-through" sub={passed + " of " + tests.length + " seen in this demo session. Demo walk-through, not a formal acceptance test."}>
          <div className="sh-list">
            {tests.map((t) => (
              <div key={t.label} className="sh-item">
                <span className="sh-avatar" style={{ width: 24, height: 24, background: t.ok ? "var(--ok-soft)" : "var(--track)", color: t.ok ? "var(--ok)" : "var(--faint)" }}><Icon d={t.ok ? IC.check : IC.clock} size={12} sw={2.2} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--ink)" }}>{t.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--dim)" }}>{t.where}</div>
                </div>
                {t.ok ? <Chip tone="ok">Seen</Chip> : t.page ? <Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate(t.page![0], t.page![1])}>Try it</Btn> : <Chip tone="outline">Not yet</Chip>}
              </div>
            ))}
          </div>
        </Card>
        <Card title="Backup and restore" sub={lastRestore ? "Last restore test " + lastRestore.at + ", simulated" : "Backups are only useful if restores are tested"}>
          <Steps steps={RESTORE.map((r, i) => ({ label: r.label, note: r.note, state: step < 0 ? "todo" : i < step ? "done" : i === step ? "current" : "todo" }))} />
          <div className="sh-row" style={{ gap: 8, marginTop: 14 }}>
            <Btn kind="primary" size="sm" icon={IC.refresh} disabled={running} onClick={runRestore}>{running ? "Running restore test" : step >= RESTORE.length ? "Run it again" : "Run restore test (simulated)"}</Btn>
          </div>
        </Card>
      </Grid>

      <Card title="Named escalation" sub="Who to call, by severity" style={{ marginTop: 12 }} right={<Chip tone="warn">Ongoing support plan: TO BE CONTRACTED</Chip>} pad={false}>
        <div className="sh-scroll-x">
          <table className="sh-table">
            <thead><tr><th>Severity</th><th>Example</th><th>First contact</th><th>Response target</th></tr></thead>
            <tbody>
              <tr><td><Chip tone="bad">Urgent</Chip></td><td style={{ minWidth: 220 }}>Urgent notices not reaching parents, or a data access concern</td><td>Named delivery lead (named in the contract)</td><td>To agree</td></tr>
              <tr><td><Chip tone="gold">High</Chip></td><td>A centre cannot log care or check children in</td><td>Support desk, then the delivery lead</td><td>To agree</td></tr>
              <tr><td><Chip tone="neutral">Normal</Chip></td><td>Questions, small changes, new templates</td><td>Support desk</td><td>To agree</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 18px 16px", borderTop: "1px solid var(--border)", fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6 }}>
          Client-side owners: Edel Lyons (owner), <RecordLink type="staff" id="s01">Gráinne Twomey</RecordLink> (Elmgrove), <RecordLink type="staff" id="s18">Siobhán Barry</RecordLink> (Ballyneety) and <RecordLink type="staff" id="s02">Deirdre Nagle</RecordLink> (HR and finance). {m.staffTotal} staff trained by their own managers, with the room tablet quick card.
        </div>
      </Card>
    </>
  );
}
