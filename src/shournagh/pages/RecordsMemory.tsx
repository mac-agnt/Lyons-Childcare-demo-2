/* Records > Operating memory: Shournagh's standards and decisions written down
   once, plus a trace of one record showing every place it is used. */
import { useState } from "react";
import { useDemo, navigate, setRole, openDrawer, personName, euro, roleDef } from "../store";
import { Page, PageHead, Card, Grid, Chip, DemoTag, Icon, IC, Btn, Note, Segmented } from "../ui";

const MEMORY = [
  { area: "Standards", title: "Routine care logs stay in the app", text: "Meals, sleeps, nappies and activities are never emailed. Important notices are pushed. Urgent needs an acknowledgement and a phone call after 15 minutes.", source: "Parent Communications Policy v1.0", by: "Edel Lyons", link: { type: "policy" as const, id: "pol-parentcomms" } },
  { area: "Standards", title: "Sleep checks every 10 minutes, on the tablet", text: "A named educator checks every sleeping child and records it. Paper sleep sheets are retired.", source: "Safe Sleep Policy v4.0", by: "Edel Lyons", link: { type: "policy" as const, id: "pol-safesleep" } },
  { area: "Standards", title: "Two-person medication check", text: "No dose without written consent on file. Two staff check child, medicine, dose and time, and both sign.", source: "Medication Administration Policy v2.3", by: "Gráinne Twomey", link: { type: "policy" as const, id: "pol-medication" } },
  { area: "Decisions", title: "Managers own the day, Edel owns exceptions", text: "Opening checks, roster and callbacks sit with the centre managers. Only policy approvals and anything over a manager's limit escalate to Edel.", source: "Owner decision, Nov 2026", by: "Edel Lyons", link: null },
  { area: "Decisions", title: "Acorn stays the system of record for now", text: "Bookings and billing stay in Acorn Cloud until a one-site pilot proves the new workflows. No forced switch for parents.", source: "Delivery plan, phase 2", by: "Edel Lyons", link: null },
  { area: "Decisions", title: "Funding corrections are keyed by a person", text: "The NCS and ECCE portals are not connected. Mismatches are queued with provenance; Deirdre keys any correction on the portal.", source: "Fees and Funding Policy v2.1", by: "Deirdre Nagle", link: { type: "policy" as const, id: "pol-fees" } },
  { area: "Centre facts", title: "Two services, kept separate", text: "Elmgrove TU2015CC365 (77 places) and Ballyneety TU2015CC366 (55 sessional places). The Ballyneety school-age service TU2021CC067SA is registered on its own.", source: "Tusla register (public)", by: "Settings", link: { type: "site" as const, id: "bal" } },
  { area: "Centre facts", title: "After-school needs a floater on sick days", text: "When the After-school leader is out, cover comes from the Ballyneety floater with approved afternoon availability.", source: "Learned from rota history (demo)", by: "Siobhán Barry", link: { type: "room" as const, id: "bal-afterschool" } },
  { area: "People", title: "New starters sign 12 core policies before working unsupervised", text: "Induction checklist on the tablet; room leader signs off the room induction.", source: "Staff Induction Guide 2026 v1.3", by: "Deirdre Nagle", link: { type: "policy" as const, id: "pol-induction" } },
];

export default function RecordsMemory() {
  const s = useDemo();
  const [area, setArea] = useState<string>("All");
  const role = roleDef(s.role);
  const aoifeLogs = s.careLogs.filter((l) => l.child === "c-aoife" && l.parentVisible);
  const latest = aoifeLogs.filter((l) => /^\d\d:\d\d$/.test(l.at)).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const inv = s.invoices.find((i) => i.id === "inv-2611")!;
  const shown = MEMORY.filter((m) => area === "All" || m.area === area);

  const traces = [
    {
      key: "care", label: "A care log for Aoife M.",
      what: latest ? latest.title + " at " + latest.at + ": " + latest.detail : "No log yet",
      places: [
        { name: "Toddlers room tablet", note: "Where it was entered, by " + (latest ? personName(latest.by) : "the educator"), go: () => setRole("educator") },
        { name: "Parent app, Today", note: "Laura sees it in the timeline. No email sent.", go: () => setRole("parent") },
        { name: "Child record", note: "Today's log on Aoife's record", go: () => openDrawer("child", "c-aoife") },
        { name: "Centres, Daily Care", note: "Room-level view for the room leader", go: () => navigate("Centres", "care") },
        { name: "Activity", note: "Audit entry with time and author", go: () => navigate("Activity", "data") },
      ],
    },
    {
      key: "invoice", label: inv.number + ", " + euro(inv.amount),
      what: "Overdue " + inv.daysOverdue + " days, " + (inv.status === "reviewed" ? "reviewed, still unpaid" : inv.status === "overdue" ? "not yet reviewed" : "reminder in approval"),
      places: [
        { name: "Finance, Outstanding Balances", note: "Queue Deirdre works from", go: () => navigate("Finance", "outstanding") },
        { name: "Brennan family record", note: "Balance and statement", go: () => openDrawer("family", "fam-brennan") },
        { name: "Oisín's booking", note: "Wobblers, the days behind the charge", go: () => openDrawer("child", "c-oisin") },
        { name: "Home exceptions", note: "Counted in the €" + s.invoices.reduce((n, i) => n + i.amount, 0).toLocaleString("en-IE") + " overdue", go: () => navigate("Home") },
        { name: "Work, Approvals", note: "Reminder drafts wait here", go: () => navigate("Work", "approvals") },
      ],
    },
    {
      key: "policy", label: "Safe Sleep Policy v4.0",
      what: s.staff.filter((x) => x.safeSleepSigned).length + " of " + s.staff.length + " staff signed",
      places: [
        { name: "Policies, Versions & Sign-offs", note: "Signature register and reminders", go: () => navigate("Policies", "versions") },
        { name: "Each staff record", note: "Signed version on the person", go: () => openDrawer("staff", "s16") },
        { name: "HR Onboarding", note: "A step in Ella's induction", go: () => navigate("People", "onboarding") },
        { name: "Room tablet", note: "10-minute sleep check prompts", go: () => setRole("educator") },
        { name: "Ontology", note: "Staff → Room → Policy signature", go: () => navigate("Records", "ontology") },
      ],
    },
  ];
  const [trace, setTrace] = useState("care");
  const t = traces.find((x) => x.key === trace)!;

  return (
    <Page>
      <PageHead title="Operating memory" sub="How Shournagh runs, written down once and connected to everything. Standards don't live in one person's head." right={<DemoTag />} />
      <Card title="Entered once, used everywhere" sub="Pick a record and follow it through the system. This is the demo's data model, not a live integration." right={<Segmented options={traces.map((x) => ({ id: x.key, label: x.key === "care" ? "Care log" : x.key === "invoice" ? "Invoice" : "Policy" }))} value={trace} onChange={setTrace} />}>
        <div className="sh-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, alignItems: "center" }}>
          <div style={{ padding: 16, borderRadius: 16, border: "1px solid var(--accent-line)", background: "var(--accent-faint)" }}>
            <div className="sh-eyebrow" style={{ color: "var(--accent)" }}>The record</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{t.label}</div>
            <div style={{ fontSize: 12.5, color: "var(--body)", marginTop: 6, lineHeight: 1.5 }}>{t.what}</div>
          </div>
          <div className="sh-stack" style={{ gap: 8 }}>
            {t.places.map((p, i) => (
              <button key={p.name} type="button" onClick={p.go} className="sh-item click" style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-2)", color: "inherit", font: "inherit", textAlign: "left", margin: 0, padding: "10px 12px", animation: "shPop .3s var(--ease) both", animationDelay: i * 50 + "ms" }}>
                <Icon d={IC.link} size={14} style={{ color: "var(--accent)" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--dim)" }}>{p.note}</span>
                </span>
                <Icon d={IC.arrow} size={13} style={{ color: "var(--faint)" }} />
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 12 }}>
        <Card title="Relationships Shournagh OS models" sub="The same paths the Ontology graph draws. Each record is entered once and linked, not copied.">
          <div className="sh-stack" style={{ gap: 10 }}>
            {[
              ["Child", "Guardian", "Booking", "Room", "Centre", "Invoice", "Funding entry"],
              ["Staff", "Room", "Qualification", "Policy signature"],
              ["Policy", "Version", "Recipient", "Acknowledgement"],
              ["Site", "Registration", "Inspection evidence"],
            ].map((chain) => (
              <div key={chain.join()} className="sh-row" style={{ flexWrap: "wrap", gap: 6 }}>
                {chain.map((n, i) => (
                  <span key={n} className="sh-row" style={{ gap: 6 }}>
                    <span className="sh-chip outline" style={{ color: "var(--ink)" }}>{n}</span>
                    {i < chain.length - 1 && <Icon d={IC.arrow} size={12} style={{ color: "var(--faint)" }} />}
                  </span>
                ))}
              </div>
            ))}
            <div><Btn size="sm" icon={IC.arrow} onClick={() => navigate("Records", "ontology")}>Open the Ontology graph</Btn></div>
          </div>
        </Card>
      </div>

      <div className="sh-row" style={{ margin: "22px 0 12px", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Standards, decisions and facts</div>
        <Segmented options={["All", "Standards", "Decisions", "Centre facts", "People"].map((x) => ({ id: x, label: x }))} value={area} onChange={setArea} />
      </div>
      <Grid cols={3}>
        {shown.map((m) => (
          <Card key={m.title}>
            <div className="sh-row" style={{ justifyContent: "space-between" }}><Chip tone={m.area === "Standards" ? "accent" : m.area === "Decisions" ? "gold" : "neutral"}>{m.area}</Chip><span style={{ fontSize: 11, color: "var(--faint)" }}>{m.by}</span></div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10, lineHeight: 1.35 }}>{m.title}</div>
            <div style={{ fontSize: 12.5, color: "var(--body)", marginTop: 6, lineHeight: 1.55 }}>{m.text}</div>
            <div className="sh-row" style={{ marginTop: 10, justifyContent: "space-between" }}>
              <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Source: {m.source}</span>
              {m.link && <Btn size="sm" kind="ghost" onClick={() => openDrawer(m.link!.type, m.link!.id)}>Open</Btn>}
            </div>
          </Card>
        ))}
      </Grid>
      <div style={{ marginTop: 14 }}>
        <Note>Helios answers from this memory and the records your role can open ({role.label}). It is not trained on identifiable child records.</Note>
      </div>
    </Page>
  );
}
