/* Shournagh OS · Policies
   Edel's standard operating system: the policy library, How We Do It playbooks,
   versions and sign-offs (Story B), a regulation watch list for human review,
   inspection readiness per registered service, and the evidence vault.
   Nothing here claims compliance or a real inspection outcome. */
import { Fragment, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  useDemo, activeTab, effectiveSite, inSite, roleDef, personName, policyById, staffById, siteById, navigate, openDrawer, update,
  logEvent, toast, decide, sendSafeSleepReminders, signSafeSleep, advancePolicyFlow, resetPolicyFlow, POLICY_STAGES, addTask,
  nowLabel, type DemoState,
} from "../store";
import { POLICIES as SEED_POLICIES, ROOMS, DEMO_DATE, TODAY_LABEL, dayLabel, siteName } from "../seed";
import type { Policy, PolicyStage, SiteId, SiteFilter, Staff } from "../types";
import {
  Page, PageHead, Grid, Card, Stat, Chip, DemoTag, SiteChip, Bar, Btn, Segmented, Table, Empty, KV, Note, RecordLink, Modal,
  Restricted, Icon, IC, type Col, type Tone,
} from "../ui";
import "./policies.css";

/* ── Helpers ───────────────────────────────────────────────────────────────── */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (ago: number) => { const d = new Date(DEMO_DATE.getTime() - ago * 86400000); return MONTHS[d.getMonth()] + " " + d.getFullYear(); };
const dateAgo = (ago: number) => (ago === 0 ? "Today" : ago <= 60 ? dayLabel(-ago) : monthYear(ago));
const CAT_ICON: Record<Policy["category"], string> = { "Safeguarding": IC.shield, "Health & wellbeing": IC.pill, "Operations": IC.centres, "Parents": IC.families, "People": IC.people };
/** Cross-tab focus (which policy or playbook to open when another tab links here). */
const focus: { lib: string | null; ver: string | null; hwd: string | null } = { lib: null, ver: null, hwd: null };
const go = (tab: string, key?: "lib" | "ver" | "hwd", id?: string) => { if (key && id) focus[key] = id; navigate("Policies", tab); };

/** Day offset of the next review. Labels carry no year, so a published policy whose
    review label matches its effective label is read as a year on, not overdue. */
function reviewOffset(p: Policy): number | null {
  for (let k = -60; k <= 400; k++) if (dayLabel(k) === p.nextReview && !(k <= 0 && p.nextReview === p.effective && p.status === "Published")) return k;
  return null;
}
function reviewDate(p: Policy): string {
  const k = reviewOffset(p);
  return k === null ? p.nextReview : p.nextReview + " " + new Date(DEMO_DATE.getTime() + k * 86400000).getFullYear();
}
function reviewFlag(p: Policy): { label: string; tone: Tone } | null {
  const k = reviewOffset(p);
  if (k !== null && k <= 0) return { label: "Review overdue", tone: "bad" };
  if (k !== null && k <= 60) return { label: "Review in " + k + " days", tone: "gold" };
  if (p.status === "In review") return { label: "In review", tone: "gold" };
  return null;
}
interface Sig { who: string; signed: number; total: number; note?: string }
function sigInfo(s: DemoState, p: Policy, site: SiteFilter): Sig | null {
  if (!p.requiresSignature) return null;
  const staff = s.staff.filter((x) => inSite(site, x.site));
  const fams = s.families.filter((f) => inSite(site, f.site));
  if (p.id === "pol-safesleep") return { who: "Staff", signed: staff.filter((x) => x.safeSleepSigned).length, total: staff.length };
  if (p.id === "pol-parentcomms") return { who: "Families", signed: fams.filter((f) => f.ackParentComms).length, total: fams.length, note: "Acknowledged in the parent app" };
  if (p.id === "pol-collection" && ["distributed", "signatures", "reminders"].includes(s.policyFlow.stage)) return { who: "Staff (v2.2 rollout)", signed: s.policyFlow.signed, total: s.policyFlow.total };
  if (p.audience === "Parents") return { who: "Families", signed: fams.length, total: fams.length, note: "Acknowledged in enrolment forms" };
  return { who: "Staff", signed: staff.length, total: staff.length };
}
const sigLabel = (g: Sig | null) => (g ? g.signed + " of " + g.total + " " + g.who.toLowerCase().split(" ")[0] : "Not required");

/* ── How We Do It: Edel's playbooks (local demo content) ───────────────────── */
type Aud = "room" | "leaders" | "managers" | "new";
interface Playbook { id: string; title: string; when: string; owner: string; policy: string; aud: Aud[]; reviewed: number; steps: string[]; qa: { q: string; a: string }[] }
const PLAYBOOKS: Playbook[] = [
  { id: "pb-open", title: "Opening the centre", when: "Every morning, before the first child arrives", owner: "s01", policy: "pol-emergency", aud: ["leaders", "managers"], reviewed: 21,
    steps: ["Disarm the alarm and walk the building: exits clear, doors and gates secure.", "Check heating and hot water temperature and record both on the office tablet.", "Switch on every room tablet and confirm each one shows online.", "Check the garden and outdoor play area before any child goes out.", "Sign in the staff on duty and compare with the approved roster.", "Log opening checks complete. Any gap goes straight to the centre manager."],
    qa: [{ q: "A room tablet is offline at opening. What now?", a: "Use the backup sheet in the office and tell the manager. Entries are keyed in once the tablet is back, so nothing is lost." },
      { q: "Who opens if the manager is out?", a: "The first room leader on the roster opens, using the same checklist on the office tablet." }] },
  { id: "pb-close", title: "Closing and handover", when: "End of day, from 17:30", owner: "s01", policy: "pol-collection", aud: ["leaders", "managers"], reviewed: 21,
    steps: ["Check every child is signed out on the tablet against today's attendance.", "Tell the manager about any late collection before 17:45.", "Write the room handover: anything outstanding for tomorrow.", "Complete the 16:00 bathroom and nappy area sign-off if not done.", "Lock up windows, gates and alarm, then record the closing time."],
    qa: [{ q: "A parent is late. What do I do?", a: "Stay with the child, phone the guardian, then the second contact. Two staff remain until collection, and the late collection is logged on the tablet." }] },
  { id: "pb-urgent", title: "Urgent collection", when: "When a child becomes unwell at the centre", owner: "s01", policy: "pol-illness", aud: ["room", "leaders"], reviewed: 9,
    steps: ["Take and record the temperature or symptom on the room tablet.", "Tell the room leader. The manager approves the Urgent notice.", "Send the Urgent notice: the parent must tap Acknowledge.", "No acknowledgement in 15 minutes: phone the guardian, then the second contact.", "Hand over only to an authorised collector and log the time."],
    qa: [{ q: "What temperature means we ask for a collection?", a: "38°C or above, as set out in the Illness and Exclusion Policy, section 5.1." },
      { q: "Can I send the urgent notice myself?", a: "You draft it on the tablet. The room leader or manager approves it before it goes to the parent." }] },
  { id: "pb-accident", title: "Accident to parent, same day", when: "After any accident or incident", owner: "s18", policy: "pol-accident", aud: ["room", "leaders"], reviewed: 40,
    steps: ["Give first aid and make the child comfortable.", "Log the accident on the tablet: what, where, when and who saw it.", "The room leader reviews the entry and the manager approves it.", "Tell the parent at collection and share the parent copy the same day.", "Head injuries: phone the parent straight away, do not wait for collection."],
    qa: [{ q: "Does every bump need a report?", a: "Yes, every accident is logged. Minor ones take two taps and a short note on the tablet." },
      { q: "Who sees the accident report?", a: "The room leader and manager review it first, then the parent gets their copy the same day." }] },
  { id: "pb-sleep", title: "Safe sleep checks on the tablet", when: "Every sleep, every room with sleeping children", owner: "s03", policy: "pol-safesleep", aud: ["room", "new"], reviewed: 7,
    steps: ["Place babies on their backs, feet to the foot of the cot, nothing loose in the cot.", "Start the sleep timer on the tablet when the child settles.", "Check at least every 10 minutes, close enough to see the child breathing.", "Record each check on the tablet. It prompts you if a check is late.", "Record the wake time. The parent sees the sleep in the app."],
    qa: [{ q: "How often are sleep checks?", a: "At least every 10 minutes, recorded on the room tablet (Safe Sleep Policy v4.0, section 4.2)." },
      { q: "The tablet is flat during sleep time.", a: "Keep checking every 10 minutes on the paper backup sheet and tell the room leader. Key the checks in once the tablet is charged." }] },
  { id: "pb-new", title: "New starter week one", when: "First five days for every new educator", owner: "s02", policy: "pol-induction", aud: ["new", "managers"], reviewed: 45,
    steps: ["Day one: shadow your room leader. No unsupervised care.", "Read and sign the core policies on your phone.", "Learn the room tablet: personal PIN, care logs, sleep checks.", "Meet your key children and their families with the room leader.", "End of the week: induction review with the centre manager."],
    qa: [{ q: "When can I work unsupervised?", a: "Once your Garda vetting outcome, qualification copy and policy sign-offs are recorded and the manager signs off your room induction." },
      { q: "Where do I find the policies?", a: "In the staff app under Policies. Each one shows what changed and asks you to sign." }] },
  { id: "pb-meds", title: "Medication two-person check", when: "Every dose, every room", owner: "s01", policy: "pol-medication", aud: ["room", "leaders", "new"], reviewed: 30,
    steps: ["Check written parent consent is on file for this medicine and dose.", "Two staff check: right child, right medicine, right dose, right time.", "Give the dose. Both sign the record on the tablet.", "Record any reaction and tell the parent at collection.", "Store the medicine out of reach, labelled with the child's name."],
    qa: [{ q: "A parent phones asking us to give paracetamol. Can we?", a: "Only with written consent on file. A phone call alone is not enough; ask the manager." },
      { q: "Who can be the second person?", a: "Any educator on the floor in the room. Both names go on the record." }] },
  { id: "pb-end", title: "Ending the day with a parent", when: "At every collection", owner: "edel", policy: "pol-parentcomms", aud: ["room", "new"], reviewed: 1,
    steps: ["Check the child's day in the app is complete: meals, sleeps, nappies.", "Share one real moment from the day, in person.", "Mention anything the parent needs to do: spare clothes, forms, consents.", "Confirm the collector is authorised. One-time collectors show photo ID.", "Log the collection time on the tablet."],
    qa: [{ q: "Do we email parents about meals and naps?", a: "No. Routine updates stay in the app, as set out in the Parent Communications Policy v1.0." },
      { q: "Someone I don't know has come to collect.", a: "Check the authorised list on the tablet. If they are not on it, the manager phones the guardian and checks photo ID before any handover." }] },
];
const AUD_LABEL: Record<Aud, string> = { room: "Room staff", leaders: "Room leaders", managers: "Managers", new: "New starters" };
const AUD_SHORT: Record<Aud, string> = { room: "Room", leaders: "Leaders", managers: "Managers", new: "New" };
const STOP = new Set(["the", "and", "for", "what", "how", "does", "can", "with", "when", "who", "are", "our", "you", "your", "now", "has", "have", "this", "that", "from", "there", "they", "about", "need", "what's"]);

/* ── Version history (illustrative earlier versions) ───────────────────────── */
interface Ver { v: string; ago: number; by: string; summary: string; signoff: string }
const HISTORY: Record<string, Ver[]> = {
  "pol-safesleep": [{ v: "3.2", ago: 372, by: "s01", summary: "Sleep room sign-in sheet introduced; cot spacing guidance clarified.", signoff: "All staff in post" }, { v: "3.1", ago: 610, by: "s01", summary: "Sleep room temperature range added.", signoff: "All staff in post" }, { v: "3.0", ago: 980, by: "edel", summary: "Rewritten after a review of HSE safe sleep guidance.", signoff: "All staff in post" }],
  "pol-illness": [{ v: "3.0", ago: 560, by: "s01", summary: "Exclusion table added for common childhood illnesses.", signoff: "Not required" }, { v: "2.4", ago: 900, by: "edel", summary: "Temperature threshold set at 38°C.", signoff: "Not required" }],
  "pol-collection": [{ v: "2.0", ago: 720, by: "s18", summary: "Authorised collectors held on the child's record, not on paper.", signoff: "All staff in post" }, { v: "1.4", ago: 1090, by: "edel", summary: "Password system for one-time collectors.", signoff: "All staff in post" }],
  "pol-safeguarding": [{ v: "5.1", ago: 525, by: "edel", summary: "Deputy Designated Liaison Persons named per service.", signoff: "All staff in post" }, { v: "5.0", ago: 890, by: "edel", summary: "Separate statements for each registered service.", signoff: "All staff in post" }],
  "pol-medication": [{ v: "2.2", ago: 455, by: "s01", summary: "Medication storage and labelling rules.", signoff: "All staff in post" }, { v: "2.1", ago: 820, by: "edel", summary: "Written consent required for every medicine.", signoff: "All staff in post" }],
  "pol-accident": [{ v: "2.4", ago: 500, by: "s18", summary: "Head injury: phone the parent straight away.", signoff: "All staff in post" }],
  "pol-cleaning": [{ v: "3.3", ago: 240, by: "s01", summary: "Bathroom checks at 10:00, 13:00 and 16:00.", signoff: "Not required" }, { v: "3.2", ago: 600, by: "s01", summary: "Nappy area cleaning after every change.", signoff: "Not required" }],
  "pol-emergency": [{ v: "2.1", ago: 615, by: "s29", summary: "Drill log moved to a termly schedule per room.", signoff: "All staff in post" }],
  "pol-parentcomms": [],
  "pol-complaints": [{ v: "1.2", ago: 1100, by: "edel", summary: "Written response from the centre manager.", signoff: "Not required" }],
  "pol-induction": [{ v: "1.2", ago: 230, by: "s02", summary: "Room induction checklist added.", signoff: "All staff in post" }, { v: "1.1", ago: 400, by: "s02", summary: "Week one shadowing made mandatory.", signoff: "All staff in post" }],
  "pol-fees": [{ v: "2.0", ago: 440, by: "s02", summary: "ECCE wrap-around hours charged separately.", signoff: "Families at enrolment" }],
};

/* ── Regulation watch (illustrative prompts for a person to check) ─────────── */
interface Watch { id: string; title: string; summary: string; source: { label: string; url: string }; policies: string[]; suggested: string }
const TUSLA = { label: "Tusla early years", url: "https://www.tusla.ie/services/preschool-services/" };
const WATCH: Watch[] = [
  { id: "w-sleep", title: "How sleep checks are evidenced at inspection", summary: "Read the current Tusla early years material and confirm the Safe Sleep v4.0 tablet records would show checks clearly to an inspector.", source: TUSLA, policies: ["pol-safesleep"], suggested: "s01" },
  { id: "w-ecce", title: "ECCE programme rules for the next programme year", summary: "Check the Department of Children's published programme rules for any change to session times or registration steps before September enrolments open.", source: { label: "Department of Children", url: "https://www.gov.ie/en/organisation/department-of-children-equality-disability-integration-and-youth/" }, policies: ["pol-fees"], suggested: "s18" },
  { id: "w-ncs", title: "NCS award renewals and subsidy pauses", summary: "Confirm the current NCS guidance on award renewal timing, so the 30-day family reminder in the Fees and Funding Policy still fits.", source: { label: "NCS", url: "https://www.ncs.gov.ie/" }, policies: ["pol-fees"], suggested: "s02" },
  { id: "w-hive", title: "Provider notices on Early Years Hive", summary: "Look for new provider notices that affect scheme registrations, deadlines or how corrections are submitted.", source: { label: "Early Years Hive", url: "https://www.earlyyearshive.ncs.gov.ie/" }, policies: ["pol-fees"], suggested: "s02" },
  { id: "w-hse", title: "Exclusion periods for common childhood illnesses", summary: "Compare the exclusion table in the Illness and Exclusion Policy with the HSE's current guidance for childcare settings.", source: { label: "HSE", url: "https://www.hse.ie/" }, policies: ["pol-illness", "pol-cleaning"], suggested: "s01" },
  { id: "w-cf", title: "Child Safeguarding Statement review", summary: "Confirm the review timing and contents of each service's Child Safeguarding Statement against Tusla's Children First material.", source: TUSLA, policies: ["pol-safeguarding"], suggested: "edel" },
];
const REVIEWERS = ["edel", "s01", "s18", "s02"];

/* ── Registered services (inspection packs and evidence never mix) ─────────── */
interface Svc { id: "elm" | "bal" | "sa"; reg: string; site: SiteId; name: string; manager: string; rooms: string[]; capacity: string; address: string }
const SERVICES: Svc[] = (() => {
  const e = siteById("elm"), b = siteById("bal");
  const sa = b.extraRegistrations[0];
  return [
    { id: "elm", reg: e.tusla, site: "elm", name: "Elmgrove, full day care", manager: e.manager, rooms: ROOMS.filter((r) => r.site === "elm").map((r) => r.id), capacity: e.capacityLabel + ": " + e.capacity, address: e.address },
    { id: "bal", reg: b.tusla, site: "bal", name: "Ballyneety, sessional playschool", manager: b.manager, rooms: ROOMS.filter((r) => r.site === "bal" && r.programme === "ecce").map((r) => r.id), capacity: b.capacityLabel + ": " + b.capacity, address: b.address },
    { id: "sa", reg: sa.ref, site: "bal", name: "Ballyneety, school-age service", manager: b.manager, rooms: ROOMS.filter((r) => r.programme === "afterschool").map((r) => r.id), capacity: sa.note, address: b.address },
  ];
})();
const svcStaff = (s: DemoState, v: Svc) => s.staff.filter((x) => x.site === v.site && (x.room ? v.rooms.includes(x.room) : v.id !== "sa"));
const AUDITS: Record<Svc["id"], { ago: number; by: string; title: string; result: string }[]> = {
  elm: [{ ago: 21, by: "edel", title: "Owner walk-through", result: "2 actions raised, both closed" }, { ago: 63, by: "s01", title: "Staff files audit", result: "Complete except one qualification copy" }],
  bal: [{ ago: 28, by: "s18", title: "Records audit, Robins and Wrens", result: "Attendance and consents complete" }, { ago: 70, by: "edel", title: "Owner walk-through", result: "1 action: termly drill schedule" }],
  sa: [{ ago: 35, by: "s29", title: "School-age records check", result: "Collection records complete at the time" }],
};

/* ── Shared bits ───────────────────────────────────────────────────────────── */
/** Overlays render into the theme root: .sh-page keeps a transform from its entry
    animation, which would otherwise trap position:fixed inside the page box. */
function Layer({ children }: { children: ReactNode }) {
  const host = typeof document === "undefined" ? null : (document.querySelector("[data-theme]") as HTMLElement | null) || document.body;
  return host ? createPortal(children, host) : <>{children}</>;
}
function Head({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return <PageHead title={title} sub={sub} right={<><DemoTag />{right}</>} />;
}
function Sec({ title, children }: { title: string; children: ReactNode }) {
  return <div className="policies-sec"><div className="h">{title}</div>{children}</div>;
}

/* ── Tab: Policy Library ───────────────────────────────────────────────────── */
function Library({ s, site }: { s: DemoState; site: SiteFilter }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [aud, setAud] = useState<"all" | "Staff" | "Parents">("all");
  const [sel, setSel] = useState<string>(focus.lib || "pol-safesleep");
  const needle = q.trim().toLowerCase();
  const list = s.policies.filter((p) =>
    (cat === "all" || p.category === cat) &&
    (aud === "all" || p.audience === aud || p.audience === "Staff and parents") &&
    (!needle || [p.title, p.category, p.appliesTo, p.changeSummary, ...p.excerpt.map((e) => e.heading + " " + e.text)].join(" ").toLowerCase().includes(needle)));
  const p = policyById(sel, s) || list[0];
  const sig = p ? sigInfo(s, p, site) : null;
  const published = s.policies.filter((x) => x.status === "Published").length;
  const review = s.policies.filter((x) => { const f = reviewFlag(x); return f && (f.tone === "bad" || x.status === "In review"); }).length;
  const awaiting = s.policies.filter((x) => { const g = sigInfo(s, x, site); return g && g.signed < g.total; }).length;
  const cats = Array.from(new Set(s.policies.map((x) => x.category)));
  const books = p ? PLAYBOOKS.filter((b) => b.policy === p.id) : [];
  const perSite = p && sig && sig.who === "Staff" && p.id === "pol-safesleep" ? (["elm", "bal"] as SiteId[]).filter((x) => inSite(site, x)).map((x) => { const st = s.staff.filter((y) => y.site === x); return { x, signed: st.filter((y) => y.safeSleepSigned).length, total: st.length }; }) : [];
  return (
    <>
      <Head title="Policy library" sub="Every staff and parent policy in one place, with who owns it, what changed, who has signed and when it is next reviewed." />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Published" value={published} sub={s.policies.length + " policies and procedures"} />
        <Stat label="Need review" value={review} tone={review ? "warn" : "ok"} sub="Overdue or in review now" />
        <Stat label="Awaiting signatures" value={awaiting} tone={awaiting ? "gold" : "ok"} sub="Staff or family sign-off open" onClick={() => go("versions")} />
        <Stat label="How We Do It playbooks" value={PLAYBOOKS.length} sub="Linked to the policy they put into practice" onClick={() => go("howwedo")} />
      </Grid>
      <div className="policies-lib">
        <div style={{ order: 2, minWidth: 0 }}>
          {p ? (
            <Card title={<span className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>{p.title} <span className="sh-num sh-muted" style={{ fontSize: 13 }}>v{p.version}</span></span>}
              sub={p.category + ", for " + p.audience.toLowerCase()} right={<span className="sh-row" style={{ gap: 6 }}><Chip tone={p.status === "Published" ? "ok" : "gold"}>{p.status}</Chip></span>}>
              <KV rows={[
                ["Owner", personName(p.owner, s)], ["Author", personName(p.author, s)], ["Effective", p.effective],
                ["Next review", <span key="r" className="sh-row" style={{ gap: 8, display: "inline-flex" }}>{reviewDate(p)}{reviewFlag(p) && <Chip tone={reviewFlag(p)!.tone}>{reviewFlag(p)!.label}</Chip>}</span>],
                ["Applies to", p.appliesTo], ["Signatures required", p.requiresSignature ? (p.audience === "Parents" ? "Yes, families acknowledge" : p.audience === "Staff" ? "Yes, every staff member, each version" : "Yes, staff sign and families acknowledge") : "No, read and acknowledge in the library"],
              ]} />
              <Sec title="What changed">
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--body)" }}>{p.changeSummary}</div>
              </Sec>
              {sig && (
                <Sec title={"Signature progress, " + sig.who.toLowerCase()}>
                  <div className="sh-row" style={{ gap: 12 }}>
                    <Bar value={sig.signed} max={sig.total || 1} tone={sig.signed >= sig.total ? "ok" : "accent"} style={{ flex: 1 }} />
                    <span className="sh-num" style={{ fontSize: 13, color: "var(--ink)" }}>{sig.signed} / {sig.total}</span>
                  </div>
                  {perSite.length > 1 && <div className="sh-row" style={{ gap: 16, marginTop: 8, fontSize: 12, color: "var(--dim)" }}>{perSite.map((x) => <span key={x.x}>{siteName(x.x)} {x.signed}/{x.total}</span>)}</div>}
                  {sig.note && <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 6 }}>{sig.note}</div>}
                  {p.id === "pol-safesleep" && sig.signed < sig.total && <Btn size="sm" style={{ marginTop: 10 }} icon={IC.arrow} onClick={() => go("versions")}>See who is still to sign</Btn>}
                </Sec>
              )}
              <Sec title="Approved excerpt">
                {p.excerpt.map((e) => <div key={e.heading} className="policies-excerpt"><div className="eh">{e.heading}</div><div className="et">{e.text}</div></div>)}
              </Sec>
              <Sec title="Supporting sources">
                {p.sources.map((x) => <div key={x} style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6 }}>{x}</div>)}
              </Sec>
              {books.length > 0 && (
                <Sec title="Put into practice by">
                  {books.map((b) => <button key={b.id} type="button" className="sh-link" style={{ display: "block", fontSize: 13, marginBottom: 4 }} onClick={() => go("howwedo", "hwd", b.id)}>{b.title}</button>)}
                </Sec>
              )}
              <div className="sh-row" style={{ gap: 8, marginTop: 18, flexWrap: "wrap" }}>
                <Btn size="sm" icon={IC.link} onClick={() => openDrawer("policy", p.id)}>Linked records</Btn>
                <Btn size="sm" icon={IC.clock} onClick={() => go("versions", "ver", p.id)}>Version history</Btn>
                <Btn size="sm" kind="ghost" icon={IC.file} onClick={() => toast("PDF download is simulated. No file is created.")}>Download PDF</Btn>
              </div>
            </Card>
          ) : <Card><Empty title="Choose a policy" /></Card>}
        </div>
        <Card pad={false} style={{ order: 1, alignSelf: "start" }}>
          <div className="sh-stack" style={{ padding: "14px 14px 10px", gap: 8, borderBottom: "1px solid var(--border)" }}>
            <input className="sh-input" placeholder="Search policies, e.g. sleep, collection, exclusion" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search policies" />
            <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
              <select className="sh-input" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} style={{ height: 32, flex: "1 1 140px" }}>
                <option value="all">All categories</option>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Segmented options={[{ id: "all" as const, label: "All" }, { id: "Staff" as const, label: "Staff" }, { id: "Parents" as const, label: "Parents" }]} value={aud} onChange={setAud} />
            </div>
          </div>
          <div className="policies-list" style={{ padding: 8, maxHeight: 760, overflowY: "auto" }}>
            {list.length ? list.map((x) => {
              const f = reviewFlag(x);
              const g = sigInfo(s, x, site);
              return (
                <button key={x.id} type="button" className={"policies-item" + (p && x.id === p.id ? " on" : "")} onClick={() => { setSel(x.id); focus.lib = x.id; }}>
                  <span className="policies-ico"><Icon d={CAT_ICON[x.category]} size={14} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="t" style={{ display: "block" }}>{x.title} <span className="sh-num" style={{ color: "var(--faint)", fontWeight: 400 }}>v{x.version}</span></span>
                    <span className="m" style={{ display: "block" }}>{x.category}, {x.audience.toLowerCase()}{g && g.signed < g.total ? ", " + g.signed + "/" + g.total + " signed" : ""}</span>
                  </span>
                  {f ? <Chip tone={f.tone}>{f.label}</Chip> : x.status !== "Published" ? <Chip tone="gold">{x.status}</Chip> : null}
                </button>
              );
            }) : <Empty title="No policies match" hint="Try a different word or clear the filters." />}
          </div>
        </Card>
      </div>
    </>
  );
}

/* ── Tab: How We Do It ─────────────────────────────────────────────────────── */
function HowWeDo({ s }: { s: DemoState }) {
  const [aud, setAud] = useState<"all" | Aud>("all");
  const [open, setOpen] = useState<string>(focus.hwd || PLAYBOOKS[0].id);
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/[^a-z0-9áéíóú°']+/).filter((w) => w.length > 2 && !STOP.has(w));
  const hits = words.length ? PLAYBOOKS.flatMap((b) => b.qa.map((x) => {
    const hay = (x.q + " " + x.a + " " + b.title + " " + b.steps.join(" ")).toLowerCase();
    const score = words.filter((w) => hay.includes(w)).length + words.filter((w) => x.q.toLowerCase().includes(w)).length;
    return { b, x, score };
  })).filter((h) => h.score > 0).sort((a, b) => b.score - a.score) : [];
  const topScore = hits.length ? hits[0].score : 0;
  const shownHits = hits.filter((h) => h.score >= Math.max(1, Math.ceil(topScore / 2))).slice(0, 4);
  const books = PLAYBOOKS.filter((b) => aud === "all" || b.aud.includes(aud));
  const b = PLAYBOOKS.find((x) => x.id === open) || PLAYBOOKS[0];
  const pol = policyById(b.policy, s);
  const r = roleDef(s.role);
  const suggestions = ["How often are sleep checks?", "A parent is late", "Medication by phone", "Temperature for collection", "Someone I don't know is collecting"];
  return (
    <>
      <Head title="How We Do It" sub="Edel's procedures and centre playbooks: the way things are done at Shournagh, written down once and used by every room." />
      <div style={{ marginBottom: 12 }}>
        <Note tone="accent" icon={IC.spark}>Her procedures don't live in one person's head. Each playbook has an owner, the policy it puts into practice, and the quick answers staff ask most, so a new educator in Wrens does it the same way as a room leader in Babies.</Note>
      </div>
      <Card title="Quick answers" sub="Searches the approved playbooks only. Answers are quoted from them, not generated." style={{ marginBottom: 12 }}>
        <input className="sh-input" style={{ width: "100%" }} placeholder="Ask a question, e.g. what do I do if a parent is late" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask a quick question" />
        <div className="sh-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {suggestions.map((x) => <button key={x} type="button" className="policies-sugg" onClick={() => setQ(x)}>{x}</button>)}
        </div>
        {words.length > 0 && (
          <div className="sh-grid sh-cols-2" style={{ marginTop: 14 }}>
            {shownHits.length ? shownHits.map((h) => (
              <div key={h.b.id + h.x.q} className="policies-qa">
                <div className="q">{h.x.q}</div>
                <div className="a">{h.x.a}</div>
                <div className="src">From <button type="button" className="sh-link" onClick={() => setOpen(h.b.id)}>{h.b.title}</button>, owner {personName(h.b.owner, s)}</div>
              </div>
            )) : <div style={{ gridColumn: "1 / -1" }}><Empty title="No playbook answers that yet" hint="Ask the centre manager, then add it to the playbook so the next person can find it." /></div>}
          </div>
        )}
      </Card>
      <Grid cols="main">
        <Card title={b.title} sub={b.when} right={<Chip tone="outline">{b.aud.map((x) => AUD_LABEL[x]).join(", ")}</Chip>}>
          <div className="sh-row" style={{ gap: 18, flexWrap: "wrap", fontSize: 12.5, color: "var(--dim)", marginBottom: 12 }}>
            <span>Owner: {b.owner.startsWith("s") ? <RecordLink type="staff" id={b.owner}>{personName(b.owner, s)}</RecordLink> : <b style={{ color: "var(--ink)", fontWeight: 500 }}>{personName(b.owner, s)}</b>}</span>
            <span>Policy: {pol ? <RecordLink type="policy" id={pol.id}>{pol.title} v{pol.version}</RecordLink> : b.policy}</span>
            <span>Reviewed {dateAgo(b.reviewed)}</span>
          </div>
          <ol className="policies-steps">{b.steps.map((x) => <li key={x}>{x}</li>)}</ol>
          <Sec title="Quick answers">
            {b.qa.map((x) => <div key={x.q} className="policies-qa"><div className="q">{x.q}</div><div className="a">{x.a}</div></div>)}
          </Sec>
          <div className="sh-row" style={{ gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <Btn size="sm" icon={IC.tablet} onClick={() => {
              logEvent({ actor: r.person, actorKind: "person", action: "pinned playbook to room tablets (simulated)", target: b.title, kind: "people", site: "both", story: null });
              toast(b.title + " pinned to the room tablets (simulated).");
            }}>Pin to room tablets</Btn>
            {pol && <Btn size="sm" kind="ghost" icon={IC.policies} onClick={() => go("library", "lib", pol.id)}>Open the policy</Btn>}
          </div>
        </Card>
        <Card pad={false}>
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)" }}>
            <Segmented style={{ flexWrap: "wrap" }} options={[{ id: "all" as const, label: "All" }, ...(Object.keys(AUD_SHORT) as Aud[]).map((x) => ({ id: x, label: AUD_SHORT[x] }))]} value={aud} onChange={setAud} />
          </div>
          <div className="policies-list" style={{ padding: 8 }}>
            {books.map((x) => (
              <button key={x.id} type="button" className={"policies-item" + (x.id === b.id ? " on" : "")} onClick={() => { setOpen(x.id); focus.hwd = x.id; }}>
                <span className="policies-ico"><Icon d={IC.note} size={14} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t" style={{ display: "block" }}>{x.title}</span>
                  <span className="m" style={{ display: "block" }}>{x.steps.length} steps, owner {personName(x.owner, s)}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </Grid>
    </>
  );
}

/* ── Tab: Versions and sign-offs (Story B) ─────────────────────────────────── */
const FLOW_WHO: Record<PolicyStage, string> = {
  draft: "Policy Keeper drafts from Edel's notes",
  review: "Siobhán Barry, author",
  approved: "Edel Lyons, owner",
  distributed: "Sent to staff and families (simulated)",
  signatures: "Each person signs in their app",
  reminders: "Centre managers remind anyone unsigned",
  complete: "Version locked and archived",
};
function SafeSleep({ s, site }: { s: DemoState; site: SiteFilter }) {
  const r = roleDef(s.role);
  const pol = policyById("pol-safesleep", s);
  const scope = s.staff.filter((x) => inSite(site, x.site));
  const signed = scope.filter((x) => x.safeSleepSigned).length;
  const pending = scope.filter((x) => !x.safeSleepSigned);
  const allPending = s.staff.filter((x) => !x.safeSleepSigned);
  const recent = scope.filter((x) => x.safeSleepSigned && x.safeSleepSigned.startsWith("Today"));
  const ap = s.approvals.find((a) => a.id === "ap-safesleep");
  const mgrSite: SiteId | null = r.id === "manager-elm" ? "elm" : r.id === "manager-bal" ? "bal" : null;
  const sites = (["elm", "bal"] as SiteId[]).filter((x) => inSite(site, x));
  const sendSite = (x: SiteId) => {
    const n = s.staff.filter((y) => y.site === x && !y.safeSleepSigned).length;
    sendSafeSleepReminders(x);
    toast("Reminder sent to " + n + " staff at " + siteName(x) + " (simulated).");
  };
  const cols: Col<Staff>[] = [
    { key: "n", label: "Staff member", render: (x) => <div><RecordLink type="staff" id={x.id}>{x.name}</RecordLink><div style={{ fontSize: 11.5, color: "var(--faint)" }}>{x.role}</div></div> },
    { key: "s", label: "Centre", render: (x) => <SiteChip site={x.site} /> },
    { key: "r", label: "Reminder", render: (x) => s.safeSleepReminded[x.id] ? <Chip tone="accent" dot>Reminded {s.safeSleepReminded[x.id]} by {personName(x.site === "elm" ? "s01" : "s18", s).split(" ")[0]}</Chip> : <Chip tone="neutral">Not reminded yet</Chip> },
    { key: "a", label: "", align: "r", render: (x) => <Btn size="sm" icon={IC.check} onClick={() => { signSafeSleep(x.id); toast(x.name + " signed Safe Sleep v4.0 (simulated)."); }}>Simulate signature</Btn> },
  ];
  return (
    <Card title={<span className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>{pol ? <RecordLink type="policy" id={pol.id}>{pol.title} v{pol.version}</RecordLink> : "Safe Sleep"}<Chip tone={pending.length ? "gold" : "ok"}>{pending.length ? "Signatures open" : "All signed"}</Chip></span>}
      sub={"Effective " + (pol?.effective || "") + ". Every staff member at both sites signs each version."}
      right={ap ? <Chip tone={ap.status === "approved" ? "ok" : ap.status === "declined" ? "neutral" : "warn"} dot>Reminder {ap.status === "pending" ? "awaiting Edel" : ap.status + (ap.decidedAt ? " " + ap.decidedAt : "")}</Chip> : undefined}>
      <Grid cols="main" gap={20}>
        <div>
          <div className="sh-row" style={{ alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-1.4px", fontVariantNumeric: "tabular-nums" }}>{signed}</span>
            <span style={{ fontSize: 15, color: "var(--dim)" }}>of {scope.length} signed</span>
          </div>
          <Bar value={signed} max={scope.length || 1} tone={pending.length ? "accent" : "ok"} style={{ height: 8, marginTop: 10 }} />
          <div className="sh-stack" style={{ gap: 10, marginTop: 16 }}>
            {sites.map((x) => {
              const st = s.staff.filter((y) => y.site === x);
              const sg = st.filter((y) => y.safeSleepSigned).length;
              return (
                <div key={x}>
                  <div className="sh-row" style={{ fontSize: 12.5, marginBottom: 5 }}><span style={{ flex: 1 }}>{siteName(x)}</span><span className="sh-num" style={{ color: "var(--ink)" }}>{sg}/{st.length}</span>{sg < st.length && <span style={{ color: "var(--faint)", fontSize: 11.5 }}>{st.length - sg} to sign</span>}</div>
                  <Bar value={sg} max={st.length} tone={sg === st.length ? "ok" : "accent"} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="sh-stack" style={{ gap: 10 }}>
          <div className="sh-eyebrow">Who acts</div>
          {ap?.status === "pending" && (r.id === "owner" ? (
            <>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--body)" }}>{ap.detail}</div>
              <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Btn kind="primary" size="sm" icon={IC.check} onClick={() => decide("ap-safesleep", "approved")}>Approve reminder to {allPending.length} staff</Btn>
                <Btn size="sm" kind="ghost" onClick={() => decide("ap-safesleep", "declined")}>Decline</Btn>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Once you approve, Gráinne and Siobhán send it from their own centre. Nothing else needs you.</div>
            </>
          ) : (
            <>
              <Chip tone="warn">Waiting for Edel to approve the reminder</Chip>
              {mgrSite && <Btn size="sm" disabled title="Edel approves the reminder first">Send reminder to {siteName(mgrSite)} staff</Btn>}
              <div style={{ fontSize: 11.5, color: "var(--faint)" }}>The Policy Keeper drafted it. Edel approves, then each manager sends to their own centre.</div>
            </>
          ))}
          {ap?.status === "approved" && (
            <>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--body)" }}>Approved by Edel{ap.decidedAt ? " at " + ap.decidedAt : ""}. Managers send to their own centre.</div>
              {(mgrSite ? [mgrSite] : sites).filter((x) => s.staff.some((y) => y.site === x && !y.safeSleepSigned)).map((x) => (
                <Btn key={x} size="sm" kind={mgrSite ? "primary" : "secondary"} icon={IC.bell} onClick={() => sendSite(x)}>
                  {s.staff.some((y) => y.site === x && !y.safeSleepSigned && s.safeSleepReminded[y.id]) ? "Remind again" : "Send reminder"}, {siteName(x)} ({s.staff.filter((y) => y.site === x && !y.safeSleepSigned).length})
                </Btn>
              ))}
            </>
          )}
          {ap?.status === "declined" && <Chip tone="neutral">Edel declined this reminder</Chip>}
          {!pending.length && <Note icon={IC.check}>Everyone in scope has signed v{pol?.version}. The register is ready for the inspection pack.</Note>}
          <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Reminders and signatures are simulated in the demo. Nothing is sent.</div>
        </div>
      </Grid>
      {pending.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="sh-eyebrow" style={{ marginBottom: 4 }}>Still to sign, {pending.length}</div>
          <Table cols={cols} rows={pending} rowKey={(x) => x.id} />
        </div>
      )}
      {recent.length > 0 && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 12 }}>Signed today: {recent.map((x) => x.name + " " + (x.safeSleepSigned || "").replace("Today ", "")).join(", ")}</div>}
    </Card>
  );
}
function Flow({ s }: { s: DemoState }) {
  const flow = s.policyFlow;
  const idx = POLICY_STAGES.findIndex((x) => x.id === flow.stage);
  const next = POLICY_STAGES[idx + 1];
  const col = policyById("pol-collection", s);
  const sigIdx = POLICY_STAGES.findIndex((x) => x.id === "signatures");
  const advance = () => {
    if (!next) return;
    advancePolicyFlow();
    toast("Collection Authorisation v2.2: " + next.label + ". " + next.note);
  };
  const reset = () => {
    resetPolicyFlow();
    const base = SEED_POLICIES.find((x) => x.id === "pol-collection");
    if (base) update("policies", base.id, { version: base.version, status: base.status, stage: base.stage, effective: base.effective });
    logEvent({ actor: roleDef(s.role).person, actorKind: "person", action: "reset policy update simulation", target: "Collection Authorisation v2.2", kind: "people", site: "both", story: "B" });
    toast("Simulation reset to draft.");
  };
  return (
    <Card title={<span className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>Policy update, end to end: {col ? <RecordLink type="policy" id={col.id}>Collection Authorisation v2.2</RecordLink> : "Collection Authorisation v2.2"}</span>}
      sub="Draft to complete with a named person at every step. Each step is logged to Activity."
      right={<Chip tone={flow.stage === "complete" ? "ok" : "accent"} dot>{POLICY_STAGES[idx]?.label}</Chip>}>
      <Note>{SEED_POLICIES.find((x) => x.id === "pol-collection")?.changeSummary}</Note>
      <div className="sh-scroll-x" style={{ marginTop: 14 }}>
        <div className="policies-flow">
          {POLICY_STAGES.map((st, i) => (
            <div key={st.id} className={"policies-stage" + (i < idx || flow.stage === "complete" ? " done" : i === idx ? " cur" : "")}>
              <div className="n">{String(i + 1).padStart(2, "0")}</div>
              <div className="l">{st.label}</div>
              <div className="w">{FLOW_WHO[st.id]}</div>
              {i === idx && <div className="w" style={{ marginTop: 8, color: "var(--body)" }}>{st.note}</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="sh-row" style={{ gap: 14, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px" }}>
          <div className="sh-row" style={{ fontSize: 12.5, marginBottom: 6 }}><span style={{ flex: 1, color: "var(--dim)" }}>Staff signed v2.2</span><span className="sh-num" style={{ color: "var(--ink)" }}>{flow.signed} / {flow.total}</span></div>
          <Bar value={flow.signed} max={flow.total} tone={flow.stage === "complete" ? "ok" : "accent"} />
          <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>{idx < sigIdx ? "Signatures open after distribution." : flow.reminded ? "Reminders went to anyone unsigned after 48 hours (simulated)." : "Signature requests out (simulated)."}</div>
        </div>
        <div className="sh-row" style={{ gap: 8 }}>
          {next ? <Btn kind="primary" icon={IC.arrow} onClick={advance}>Move to {next.label.toLowerCase()}</Btn> : <Chip tone="ok" dot>Complete, version locked</Chip>}
          <Btn kind="ghost" icon={IC.refresh} onClick={reset} disabled={flow.stage === "draft"} title={flow.stage === "draft" ? "Already at the start" : undefined}>Reset</Btn>
        </div>
      </div>
    </Card>
  );
}
function History({ s, site }: { s: DemoState; site: SiteFilter }) {
  const [sel, setSel] = useState<string>(focus.ver || "pol-safesleep");
  const p = policyById(sel, s);
  if (!p) return null;
  const base = SEED_POLICIES.find((x) => x.id === p.id);
  const rows: { v: string; when: string; by: string; summary: string; signoff: string; status: ReactNode }[] = [];
  const sig = sigInfo(s, p, site);
  if (p.id === "pol-collection" && base) {
    const v21 = { v: base.version, when: base.effective, by: personName(base.author, s), summary: "Authorised collectors held on the child's record; one-time collectors named in advance with photo ID.", signoff: "All staff in post" };
    const v22 = p.changeSummary.replace(/^v2\.2 draft:\s*/, "");
    const done = s.policyFlow.stage === "complete" || (p.version !== base.version && p.status === "Published");
    if (done) {
      rows.push({ v: p.version, when: p.effective, by: personName(p.author, s), summary: v22, signoff: sigLabel(sig), status: <Chip tone="ok">Current</Chip> });
      rows.push({ ...v21, status: <Chip tone="outline">Archived</Chip> });
    } else {
      rows.push({ v: "2.2", when: "On completion", by: personName(p.author, s), summary: v22, signoff: s.policyFlow.signed + " of " + s.policyFlow.total + " staff", status: <Chip tone="gold">{POLICY_STAGES.find((x) => x.id === s.policyFlow.stage)?.label}</Chip> });
      rows.push({ ...v21, status: <Chip tone="ok">Current</Chip> });
    }
  } else {
    rows.push({ v: p.version, when: p.effective, by: personName(p.author, s), summary: p.changeSummary, signoff: sigLabel(sig), status: <Chip tone={p.status === "Published" ? "ok" : "gold"}>{p.status === "Published" ? "Current" : p.status}</Chip> });
  }
  (HISTORY[p.id] || []).forEach((h) => rows.push({ v: h.v, when: monthYear(h.ago), by: personName(h.by, s), summary: h.summary, signoff: h.signoff, status: <Chip tone="outline">Archived</Chip> }));
  type Row = typeof rows[number];
  const cols: Col<Row>[] = [
    { key: "v", label: "Version", render: (x) => <span className="sh-num strong">v{x.v}</span>, width: 80 },
    { key: "w", label: "Effective", render: (x) => x.when },
    { key: "b", label: "Author", render: (x) => x.by },
    { key: "s", label: "What changed", render: (x) => <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{x.summary}</span> },
    { key: "o", label: "Sign-off", render: (x) => <span style={{ fontSize: 12.5 }}>{x.signoff}</span> },
    { key: "t", label: "Status", render: (x) => x.status },
  ];
  return (
    <Card title="Version history" sub={"Approved by " + personName(p.owner, s) + ". Earlier versions stay readable, with who signed them."} pad={false}
      right={<select className="sh-input" aria-label="Policy" value={sel} onChange={(e) => { setSel(e.target.value); focus.ver = e.target.value; }} style={{ height: 32, maxWidth: 260 }}>
        {s.policies.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
      </select>}>
      <div style={{ paddingTop: 8 }}><Table cols={cols} rows={rows} rowKey={(x) => x.v + x.when} /></div>
      {p.id === "pol-parentcomms" && <div style={{ padding: "0 18px 16px", fontSize: 12, color: "var(--faint)" }}>First version. It replaced ad hoc emails and paper notes home.</div>}
    </Card>
  );
}
function Versions({ s, site }: { s: DemoState; site: SiteFilter }) {
  return (
    <>
      <Head title="Versions and sign-offs" sub="The system remembers Edel's standards and proves who has followed them: every version, every signature, every reminder, with a name and a time." />
      <div className="sh-stack">
        <SafeSleep s={s} site={site} />
        <Flow s={s} />
        <History s={s} site={site} />
      </div>
    </>
  );
}

/* ── Tab: Regulation Watch ─────────────────────────────────────────────────── */
function RegWatch({ s }: { s: DemoState }) {
  const r = roleDef(s.role);
  const stateOf = (w: Watch) => {
    const evs = s.events.filter((e) => e.target === w.title);
    const asg = evs.find((e) => e.action.startsWith("assigned watch item to "));
    const out = evs.find((e) => e.action === "marked watch item: no change needed" || e.action === "started policy update draft from watch item");
    const reviewerName = asg ? asg.action.replace("assigned watch item to ", "") : null;
    return { reviewer: reviewerName ? REVIEWERS.find((id) => personName(id, s) === reviewerName) || null : null, outcome: out ? (out.action.includes("no change") ? "nochange" : "draft") : null, at: out?.at || null };
  };
  const assign = (w: Watch, id: string) => {
    logEvent({ actor: r.person, actorKind: "person", action: "assigned watch item to " + personName(id, s), target: w.title, kind: "people", site: "both", story: null });
    toast("Assigned to " + personName(id, s) + ".");
  };
  const noChange = (w: Watch) => {
    logEvent({ actor: r.person, actorKind: "person", action: "marked watch item: no change needed", target: w.title, kind: "people", site: "both", story: null });
    toast("Recorded: no change needed, with your name and the time.");
  };
  const draft = (w: Watch, reviewer: string | null) => {
    const p = policyById(w.policies[0], s);
    logEvent({ actor: r.person, actorKind: "person", action: "started policy update draft from watch item", target: w.title, kind: "people", site: "both", story: null });
    if (p) {
      logEvent({ actor: "Policy Keeper", actorKind: "agent", action: "drafted update for human review", target: p.title + " v" + p.version, kind: "agent", site: "both", story: null });
      addTask("Review draft update: " + p.title + " (from Regulation Watch)", reviewer || "edel", "both", dayLabel(7), "Medium");
    }
    toast("Draft started for human review. Nothing is published until Edel approves it.");
  };
  const counts = WATCH.map((w) => stateOf(w));
  return (
    <>
      <Head title="Regulation watch" sub="Prompts for a person to read the source and decide whether Edel's policies need a change. A watch list, not a compliance engine." />
      <Grid cols={4} style={{ marginBottom: 12 }}>
        <Stat label="Watch items" value={WATCH.length} />
        <Stat label="Need a reader" value={counts.filter((x) => !x.reviewer && !x.outcome).length} tone="warn" />
        <Stat label="With a reviewer" value={counts.filter((x) => x.reviewer && !x.outcome).length} tone="gold" />
        <Stat label="Decided" value={counts.filter((x) => x.outcome).length} tone="ok" sub="No change, or a draft for review" />
      </Grid>
      <div style={{ marginBottom: 12 }}>
        <Note tone="warn" icon={IC.alert}>These are illustrative watch items, not real circulars or announcements. Shournagh OS does not read regulators' websites automatically, does not interpret the law and cannot make a service compliant. Each item links to the source: a person reads it and decides.</Note>
      </div>
      <Card pad={false}>
        {WATCH.map((w, i) => {
          const st = counts[i];
          return (
            <div key={w.id} className="policies-watch">
              <div style={{ minWidth: 0 }}>
                <div className="sh-row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <Chip tone="outline">Illustrative watch item, verify with the source</Chip>
                  {st.outcome === "nochange" ? <Chip tone="ok" dot>No change needed {st.at}</Chip> : st.outcome === "draft" ? <Chip tone="accent" dot>Draft update started {st.at}</Chip> : st.reviewer ? <Chip tone="gold" dot>With {personName(st.reviewer, s)}</Chip> : <Chip tone="warn" dot>Needs a reader</Chip>}
                </div>
                <div className="t">{w.title}</div>
                <div className="d">{w.summary}</div>
                <div className="sh-row" style={{ gap: 14, marginTop: 10, flexWrap: "wrap", fontSize: 12.5, color: "var(--dim)" }}>
                  <a className="policies-ext" href={w.source.url} target="_blank" rel="noopener noreferrer"><Icon d={IC.link} size={13} />{w.source.label}</a>
                  <span>Affects: {w.policies.map((id, k) => { const p = policyById(id, s); return <Fragment key={id}>{k > 0 && ", "}<RecordLink type="policy" id={id}>{p ? p.title + " v" + p.version : id}</RecordLink></Fragment>; })}</span>
                </div>
              </div>
              <div className="sh-stack" style={{ gap: 8 }}>
                <label className="sh-label" htmlFor={"rv-" + w.id} style={{ marginBottom: 0 }}>Reviewer</label>
                <select id={"rv-" + w.id} className="sh-input" value={st.reviewer || ""} onChange={(e) => { if (e.target.value) assign(w, e.target.value); }} style={{ height: 32 }}>
                  <option value="">Assign a reviewer</option>
                  {REVIEWERS.map((id) => <option key={id} value={id}>{personName(id, s)}{id === w.suggested ? " (suggested)" : ""}</option>)}
                </select>
                <div className="sh-row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <Btn size="sm" icon={IC.check} disabled={!!st.outcome} title={st.outcome ? "Already decided" : undefined} onClick={() => noChange(w)}>No change needed</Btn>
                  <Btn size="sm" kind="primary" icon={IC.policies} disabled={!!st.outcome} title={st.outcome ? "Already decided" : undefined} onClick={() => draft(w, st.reviewer)}>Draft policy update</Btn>
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}

/* ── Tab: Inspection readiness ─────────────────────────────────────────────── */
interface Check { label: string; ok: boolean; evidence: string; fix?: { label: string; go: () => void } }
function checklist(s: DemoState, v: Svc): Check[] {
  const role = roleDef(s.role);
  const staff = svcStaff(s, v);
  const vet = staff.filter((x) => x.vetting.status !== "Valid");
  const unsigned = staff.filter((x) => !x.safeSleepSigned);
  const qual = staff.filter((x) => /outstanding/i.test(x.qualification));
  const contracts = staff.filter((x) => x.contract !== "Signed 2026");
  const sg = policyById("pol-safeguarding", s), cp = policyById("pol-complaints", s), ss = policyById("pol-safesleep", s);
  const med = policyById("pol-medication", s), em = policyById("pol-emergency", s);
  const drill = s.tasks.find((t) => t.id === "t-drill-bal");
  const people = role.pages.includes("People");
  const items: Check[] = [
    { label: "Registration certificate displayed", ok: true, evidence: "Certificate " + v.reg + " at the entrance; scan in the evidence vault" },
    { label: "Child Safeguarding Statement on display", ok: sg?.status === "Published", evidence: (sg ? "v" + sg.version + ", " : "") + "this service's own statement and Designated Liaison Person" },
    { label: "Garda vetting register", ok: !vet.length, evidence: vet.length ? vet.map((x) => x.name + ": renewal due " + x.vetting.date).join("; ") : staff.length + " of " + staff.length + " valid, outcomes recorded from the NVB", fix: vet.length && people ? { label: "Training and vetting", go: () => navigate("People", "training") } : undefined },
    { label: "Qualifications on file", ok: !qual.length, evidence: qual.length ? qual.map((x) => x.name + ": certificate copy outstanding").join("; ") : "Copies on file for every staff member", fix: qual.length && people ? { label: "Onboarding", go: () => navigate("People", "onboarding") } : undefined },
    { label: "Safe Sleep v" + (ss?.version || "") + " signature register", ok: !unsigned.length, evidence: (staff.length - unsigned.length) + " of " + staff.length + " signed" + (unsigned.length ? ", waiting on " + unsigned.map((x) => x.name).join(", ") : ""), fix: unsigned.length ? { label: "Sign-offs", go: () => navigate("Policies", "versions") } : undefined },
    { label: "2026 staff contracts", ok: !contracts.length, evidence: contracts.length ? contracts.map((x) => x.name).join(", ") + " awaiting signature" : "All signed", fix: contracts.length && people ? { label: "Contracts", go: () => navigate("People", "contracts") } : undefined },
    v.id === "bal"
      ? { label: "Fire drill log this term", ok: drill?.status === "done", evidence: drill?.status === "done" ? "Robins and Wrens drills logged" : "Term drill for Robins and Wrens due " + (drill?.due || "") + ", owner " + personName(drill?.owner || "s29", s) }
      : { label: "Fire drill log this term", ok: true, evidence: v.id === "elm" ? "Drill logged " + dayLabel(-18) + " in all four rooms" : "After-school drill logged " + dayLabel(-25) },
    { label: "Complaints Policy in date", ok: cp?.status === "Published", evidence: cp ? "v" + cp.version + (cp.status === "Published" ? ", current" : ", review overdue and in review") : "", fix: cp && cp.status !== "Published" ? { label: "Open policy", go: () => go("library", "lib", cp.id) } : undefined },
    { label: "Insurance certificate", ok: true, evidence: "Public liability, renewed " + monthYear(40) },
  ];
  if (v.id !== "sa") {
    const cl = s.cleaning.filter((c) => c.site === v.site);
    const now = nowLabel();
    const late = cl.filter((c) => !c.done && (c.due === "Yesterday" || c.due < now));
    items.push({ label: "Cleaning and safety checks", ok: !late.length, evidence: cl.filter((c) => c.done).length + " of " + cl.length + " signed off today" + (late.length ? "; overdue: " + late.map((c) => c.area).join(", ") : ""), fix: late.length && role.pages.includes("Centres") ? { label: "Cleaning", go: () => navigate("Centres", "cleaning") } : undefined });
  }
  if (v.id === "elm") {
    items.push({ label: "Medication records with two-person sign-off", ok: true, evidence: "Tablet medication log, " + (med ? med.title + " v" + med.version : "") });
    items.push({ label: "Menus with allergen information", ok: true, evidence: "Autumn menu cycle and allergen matrix, " + personName("s14", s) });
  }
  if (v.id === "bal") {
    items.push({ label: "Emergency evacuation plan for the building", ok: true, evidence: (em ? em.title + " v" + em.version : "") + ", Ballyneety building plan" });
    items.push({ label: "ECCE attendance records", ok: true, evidence: "Daily attendance from the Robins and Wrens tablets" });
  }
  if (v.id === "sa") {
    const m = s.messages.find((x) => x.id === "m-dempsey");
    items.push({ label: "Collection authorisation records", ok: !m || !!m.ackAt, evidence: !m || m.ackAt ? "All collectors on file" : "One-time collector for Ellie D. (grandmother) to be confirmed with photo ID" });
    items.push({ label: "School-age places kept on their own registration", ok: true, evidence: v.capacity });
  }
  return items;
}
function PackModal({ s, v, onClose }: { s: DemoState; v: Svc | null; onClose: () => void }) {
  if (!v) return null;
  const items = checklist(s, v);
  const staff = svcStaff(s, v);
  const ok = items.filter((x) => x.ok).length;
  const site = siteById(v.site);
  const pols = s.policies.filter((p) => p.status === "Published" || p.status === "In review");
  return (
    <Layer><Modal open onClose={onClose} width={720} title={"Inspection pack preview: " + v.reg} sub={v.name + ". Prepared " + TODAY_LABEL + " " + nowLabel() + "."}
      footer={<>
        <Btn kind="ghost" onClick={onClose}>Close</Btn>
        <Btn icon={IC.file} onClick={() => { logEvent({ actor: roleDef(s.role).person, actorKind: "person", action: "exported inspection pack preview (simulated)", target: v.reg + ", " + v.name, kind: "data", site: v.site, story: null }); toast("Pack export is simulated. No file is created."); }}>Download pack (simulated)</Btn>
      </>}>
      <div className="policies-doc">
        <div className="sh-row" style={{ gap: 8, marginBottom: 10 }}><DemoTag>INTERNAL PREPARATION PACK</DemoTag></div>
        <h3>{site.full}</h3>
        <div style={{ color: "var(--dim)", marginTop: 4 }}>{v.name}, Tusla registration {v.reg}</div>
        <h4>1. Service details</h4>
        <table><tbody>
          <tr><td>Address</td><td>{v.address}</td></tr>
          <tr><td>Registration</td><td>{v.reg}</td></tr>
          <tr><td>Places</td><td>{v.capacity}</td></tr>
          <tr><td>Person in charge</td><td>{personName(v.manager, s)}</td></tr>
          <tr><td>Contact on the register</td><td>{site.registryContact}</td></tr>
          <tr><td>Rooms</td><td>{v.rooms.map((id) => ROOMS.find((r) => r.id === id)?.name).join(", ")}</td></tr>
        </tbody></table>
        <h4>2. Readiness checklist, {ok} of {items.length} ready</h4>
        <ul>{items.map((x) => <li key={x.label}><b style={{ color: x.ok ? "var(--ink)" : "var(--warn)", fontWeight: 500 }}>{x.ok ? "Ready" : "Outstanding"}:</b> {x.label}. <span style={{ color: "var(--dim)" }}>{x.evidence}.</span></li>)}</ul>
        <h4>3. Staff register summary</h4>
        <table><tbody>
          <tr><td>Staff attached to this service</td><td>{staff.length}</td></tr>
          <tr><td>Garda vetting valid (NVB outcomes)</td><td>{staff.filter((x) => x.vetting.status === "Valid").length} of {staff.length}</td></tr>
          <tr><td>Children First training complete</td><td>{staff.filter((x) => /^Completed/.test(x.childrenFirst)).length} of {staff.length}</td></tr>
          <tr><td>Safe Sleep v4.0 signed</td><td>{staff.filter((x) => x.safeSleepSigned).length} of {staff.length}</td></tr>
        </tbody></table>
        <h4>4. Policies in force</h4>
        <ul>{pols.map((p) => <li key={p.id}>{p.title} v{p.version}, effective {p.effective}{p.status !== "Published" ? " (in review)" : ""}</li>)}</ul>
        <h4>5. Internal audit records</h4>
        <ul>{AUDITS[v.id].map((a) => <li key={a.title}>{dateAgo(a.ago)}: {a.title} by {personName(a.by, s)}. {a.result}.</li>)}</ul>
        <div style={{ marginTop: 18, fontSize: 12, color: "var(--faint)", lineHeight: 1.5 }}>Prepared from Shournagh OS records for internal use. This pack covers {v.reg} only and is never combined with another registered service. It does not represent or predict a Tusla inspection outcome.</div>
      </div>
    </Modal></Layer>
  );
}
function Inspection({ s, site }: { s: DemoState; site: SiteFilter }) {
  const [pack, setPack] = useState<Svc | null>(null);
  const svcs = SERVICES.filter((v) => inSite(site, v.site));
  return (
    <>
      <Head title="Inspection readiness" sub="One readiness pack per registered service, built from the records staff already keep. Outstanding items have a named owner, so nothing is found for the first time on the day." />
      <div style={{ marginBottom: 12 }}>
        <Note icon={IC.shield}>An internal preparation view. It does not represent, predict or guarantee a Tusla inspection outcome, and each registered service keeps its own pack.</Note>
      </div>
      <Grid cols={svcs.length === 1 ? 2 : 3}>
        {svcs.map((v) => {
          const items = checklist(s, v);
          const ok = items.filter((x) => x.ok).length;
          const out = items.filter((x) => !x.ok);
          const pct = Math.round((ok / items.length) * 100);
          return (
            <Card key={v.id} title={v.name} sub={"Tusla " + v.reg} right={<Chip tone={out.length ? "gold" : "ok"}>{out.length ? out.length + " outstanding" : "Ready"}</Chip>}>
              <div className="sh-row" style={{ gap: 14, marginBottom: 6 }}>
                <div className="policies-ring"><b>{pct}%</b><span style={{ fontSize: 12.5, color: "var(--dim)" }}>{ok} of {items.length} ready</span></div>
              </div>
              <Bar value={ok} max={items.length} tone={out.length ? "accent" : "ok"} />
              <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 12 }}>Responsible manager: <RecordLink type="staff" id={v.manager}>{personName(v.manager, s)}</RecordLink></div>
              <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 3 }}>{v.capacity}</div>
              <div style={{ marginTop: 12 }}>
                {items.map((x) => (
                  <div key={x.label} className="policies-check">
                    <span className={"ic " + (x.ok ? "ok" : "no")}><Icon d={x.ok ? IC.check : IC.alert} size={11} sw={2.4} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="l">{x.label}</div>
                      <div className="e">{x.evidence}</div>
                      {x.fix && <button type="button" className="sh-link" style={{ fontSize: 12, marginTop: 3 }} onClick={x.fix.go}>Open {x.fix.label}</button>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="policies-sec">
                <div className="h">Audit records</div>
                {AUDITS[v.id].map((a) => <div key={a.title} style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.5, marginBottom: 4 }}><span className="sh-faint">{dateAgo(a.ago)}</span> {a.title}, {personName(a.by, s)}. {a.result}.</div>)}
              </div>
              <Btn kind="primary" size="sm" icon={IC.eye} style={{ marginTop: 14 }} onClick={() => setPack(v)}>Preview inspection pack</Btn>
            </Card>
          );
        })}
      </Grid>
      <PackModal s={s} v={pack} onClose={() => setPack(null)} />
    </>
  );
}

/* ── Tab: Evidence vault ───────────────────────────────────────────────────── */
type DocKind = "Registration" | "Safety" | "Cleaning" | "Signed registers" | "People" | "Insurance" | "Food" | "Children's records";
interface Doc { id: string; svc: Svc["id"]; title: string; kind: DocKind; ago: number; owner: string; source: string; child: boolean; note?: (s: DemoState) => string }
const cleanNote = (site: SiteId) => (s: DemoState) => { const c = s.cleaning.filter((x) => x.site === site); return c.filter((x) => x.done).length + " of " + c.length + " checks signed off today"; };
const sleepNote = (v: Svc["id"]) => (s: DemoState) => { const st = svcStaff(s, SERVICES.find((x) => x.id === v)!); return st.filter((x) => x.safeSleepSigned).length + " of " + st.length + " staff signed"; };
const vetNote = (v: Svc["id"]) => (s: DemoState) => { const st = svcStaff(s, SERVICES.find((x) => x.id === v)!); return st.filter((x) => x.vetting.status === "Valid").length + " of " + st.length + " valid"; };
const DOCS: Doc[] = [
  { id: "e1", svc: "elm", title: "Registration certificate", kind: "Registration", ago: 400, owner: "edel", source: "Scanned original", child: false },
  { id: "e2", svc: "elm", title: "Fire drill log, autumn term", kind: "Safety", ago: 18, owner: "s01", source: "Tablet drill log export", child: false },
  { id: "e3", svc: "elm", title: "Daily cleaning log", kind: "Cleaning", ago: 0, owner: "s01", source: "Room tablet checklists", child: false, note: cleanNote("elm") },
  { id: "e4", svc: "elm", title: "Safe Sleep v4.0 signature register", kind: "Signed registers", ago: 0, owner: "edel", source: "Generated from staff sign-offs", child: false, note: sleepNote("elm") },
  { id: "e5", svc: "elm", title: "Staff Garda vetting register", kind: "People", ago: 3, owner: "s02", source: "NVB outcomes recorded by HR", child: false, note: vetNote("elm") },
  { id: "e6", svc: "elm", title: "Insurance certificate, public liability", kind: "Insurance", ago: 40, owner: "edel", source: "Broker PDF", child: false },
  { id: "e7", svc: "elm", title: "Autumn menu cycle and allergen matrix", kind: "Food", ago: 30, owner: "s14", source: "Kitchen, signed by the cook", child: false },
  { id: "e8", svc: "elm", title: "Accident and incident log", kind: "Children's records", ago: 0, owner: "s01", source: "Room tablets, manager reviewed", child: true },
  { id: "e9", svc: "elm", title: "Medication administration log", kind: "Children's records", ago: 0, owner: "s01", source: "Room tablets, two-person sign-off", child: true },
  { id: "e10", svc: "elm", title: "Sleep check log, Babies", kind: "Children's records", ago: 0, owner: "s03", source: "Babies tablet (TAB-E1)", child: true },
  { id: "b1", svc: "bal", title: "Registration certificate", kind: "Registration", ago: 400, owner: "edel", source: "Scanned original", child: false },
  { id: "b2", svc: "bal", title: "Fire drill log, Robins and Wrens", kind: "Safety", ago: 75, owner: "s29", source: "Tablet drill log export", child: false, note: (s) => (s.tasks.find((t) => t.id === "t-drill-bal")?.status === "done" ? "This term's drills logged" : "This term's drill not yet logged") },
  { id: "b3", svc: "bal", title: "Daily cleaning log", kind: "Cleaning", ago: 0, owner: "s29", source: "Room tablet checklists", child: false, note: cleanNote("bal") },
  { id: "b4", svc: "bal", title: "Safe Sleep v4.0 signature register", kind: "Signed registers", ago: 0, owner: "edel", source: "Generated from staff sign-offs", child: false, note: sleepNote("bal") },
  { id: "b5", svc: "bal", title: "Staff Garda vetting register", kind: "People", ago: 3, owner: "s02", source: "NVB outcomes recorded by HR", child: false, note: vetNote("bal") },
  { id: "b6", svc: "bal", title: "Emergency evacuation plan, Ballyneety building", kind: "Safety", ago: 250, owner: "s29", source: "Emergency Planning v2.2 appendix", child: false },
  { id: "b7", svc: "bal", title: "ECCE attendance records", kind: "Children's records", ago: 0, owner: "s18", source: "Robins and Wrens tablets", child: true },
  { id: "b8", svc: "bal", title: "Insurance certificate, public liability", kind: "Insurance", ago: 40, owner: "edel", source: "Broker PDF", child: false },
  { id: "a1", svc: "sa", title: "Registration certificate (school-age service)", kind: "Registration", ago: 300, owner: "edel", source: "Scanned original", child: false },
  { id: "a2", svc: "sa", title: "After-school collection authorisation records", kind: "Children's records", ago: 0, owner: "s18", source: "Parent app and After-school tablet", child: true },
  { id: "a3", svc: "sa", title: "After-school fire drill log", kind: "Safety", ago: 25, owner: "s29", source: "Tablet drill log export", child: false },
  { id: "a4", svc: "sa", title: "School-age staff Garda vetting register", kind: "People", ago: 3, owner: "s02", source: "NVB outcomes recorded by HR", child: false, note: vetNote("sa") },
  { id: "a5", svc: "sa", title: "Safe Sleep v4.0 signature register", kind: "Signed registers", ago: 0, owner: "edel", source: "Generated from staff sign-offs", child: false, note: sleepNote("sa") },
  { id: "a6", svc: "sa", title: "Insurance schedule, school-age cover", kind: "Insurance", ago: 40, owner: "edel", source: "Broker PDF", child: false },
];
function Evidence({ s, site }: { s: DemoState; site: SiteFilter }) {
  const r = roleDef(s.role);
  const svcs = SERVICES.filter((v) => inSite(site, v.site));
  const [reg, setReg] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [q, setQ] = useState("");
  const [doc, setDoc] = useState<Doc | null>(null);
  const regF = svcs.some((v) => v.id === reg) ? reg : svcs.length === 1 ? svcs[0].id : "all";
  const shown = regF === "all" ? svcs : svcs.filter((v) => v.id === regF);
  const locked = (d: Doc) => d.child && r.id === "hr";
  const needle = q.trim().toLowerCase();
  const docsFor = (v: Svc) => DOCS.filter((d) => d.svc === v.id && (kind === "all" || d.kind === kind) && (!needle || (d.title + " " + d.source + " " + d.kind).toLowerCase().includes(needle)));
  const openDoc = (d: Doc) => {
    if (locked(d)) {
      logEvent({ actor: r.person, actorKind: "person", action: "was refused access to", target: d.title + " (child records)", kind: "access", site: SERVICES.find((v) => v.id === d.svc)!.site, story: null });
      toast("Child records are not available to " + r.label + ". The attempt is in the access audit.");
      return;
    }
    setDoc(d);
  };
  const cols: Col<Doc>[] = [
    { key: "t", label: "Document", render: (d) => <div><div className="strong">{d.title}</div><div style={{ fontSize: 11.5, color: "var(--faint)" }}>{d.source}</div></div> },
    { key: "k", label: "Category", render: (d) => <Chip tone={d.child ? "gold" : "outline"}>{d.kind}</Chip> },
    { key: "n", label: "Status", render: (d) => <span style={{ fontSize: 12.5 }}>{d.note ? d.note(s) : "On file"}</span> },
    { key: "d", label: "Dated", render: (d) => dateAgo(d.ago) },
    { key: "o", label: "Owner", render: (d) => personName(d.owner, s) },
    { key: "a", label: "", align: "r", render: (d) => locked(d) ? <span className="policies-lock"><Icon d={IC.lock} size={12} />Not for HR</span> : <Icon d={IC.chevron} size={13} style={{ color: "var(--faint)" }} /> },
  ];
  const dsvc = doc ? SERVICES.find((v) => v.id === doc.svc) : undefined;
  return (
    <>
      <Head title="Evidence vault" sub="Fire drills, cleaning logs, signed policy registers, vetting registers, insurance and menus, each filed under exactly one registered service." right={<Btn size="sm" icon={IC.plus} onClick={() => toast("Upload is simulated. A real upload is filed under one registered service only.")}>Upload evidence</Btn>} />
      <div className="sh-row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {svcs.length > 1 && <Segmented style={{ maxWidth: "100%", overflowX: "auto" }} options={[{ id: "all", label: "All services" }, ...svcs.map((v) => ({ id: v.id as string, label: v.reg }))]} value={regF} onChange={setReg} />}
        <select className="sh-input" aria-label="Category" value={kind} onChange={(e) => setKind(e.target.value)} style={{ height: 34 }}>
          <option value="all">All categories</option>
          {Array.from(new Set(DOCS.map((d) => d.kind))).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input className="sh-input" placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 200px" }} aria-label="Search documents" />
      </div>
      {regF === "all" && shown.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <Note tone="warn" icon={IC.alert}><b style={{ color: "var(--ink)" }}>{shown.length} separately registered services are shown.</b> Each keeps its own evidence. They are listed in separate sections and are never combined in one inspection pack. Pick a registration above to work on one service.</Note>
        </div>
      )}
      <div className="sh-stack" style={{ gap: 16 }}>
        {shown.map((v) => {
          const rows = docsFor(v);
          return (
            <section key={v.id} className="sh-card">
              <div className="policies-band">
                <span className="ref">{v.reg}</span>
                <span className="nm">{v.name}</span>
                <span className="ad">{v.address}</span>
                <span style={{ flex: 1 }} />
                <span className="ad">Responsible: {personName(v.manager, s)}</span>
              </div>
              <div style={{ paddingTop: 6 }}>
                <Table cols={cols} rows={rows} rowKey={(d) => d.id} onRow={openDoc} empty="No documents match in this service" />
              </div>
            </section>
          );
        })}
      </div>
      {r.id === "hr" && <div style={{ marginTop: 12 }}><Note icon={IC.lock}>Children's records stay with the centres. HR Admin sees staff, policy and safety evidence only.</Note></div>}
      <Layer><Modal open={!!doc} onClose={() => setDoc(null)} width={520} title={doc?.title || ""} sub={dsvc ? dsvc.reg + ", " + dsvc.name : ""}
        footer={doc && dsvc ? <>
          <Btn kind="ghost" onClick={() => setDoc(null)}>Close</Btn>
          <Btn icon={IC.file} onClick={() => toast("Download is simulated. No file is created.")}>Download</Btn>
          <Btn kind="primary" icon={IC.plus} onClick={() => {
            logEvent({ actor: r.person, actorKind: "person", action: "added evidence to inspection pack", target: doc.title + ", " + dsvc.reg, kind: "data", site: dsvc.site, story: null });
            toast("Added to the " + dsvc.reg + " pack only.");
            setDoc(null);
          }}>Add to {dsvc.reg} pack</Btn>
        </> : undefined}>
        {doc && dsvc && (
          <>
            <KV rows={[["Registered service", dsvc.reg + ", " + dsvc.name], ["Category", doc.kind], ["Dated", dateAgo(doc.ago)], ["Owner", personName(doc.owner, s)], ["Source", doc.source], ["Status", doc.note ? doc.note(s) : "On file"]]} />
            <div style={{ marginTop: 14 }}><Note>Filed under {dsvc.reg} only. It cannot be attached to another service's pack. Preview and download are simulated in the demo.</Note></div>
          </>
        )}
      </Modal></Layer>
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function Policies() {
  const s = useDemo();
  const role = roleDef(s.role);
  const tab = activeTab("Policies", s);
  const site = effectiveSite(s);
  if (!role.pages.includes("Policies")) {
    return <Page><PageHead title="Policies" right={<DemoTag />} /><Restricted what="Policies" /></Page>;
  }
  return (
    <Page>
      {tab === "library" && <Library s={s} site={site} />}
      {tab === "howwedo" && <HowWeDo s={s} />}
      {tab === "versions" && <Versions s={s} site={site} />}
      {tab === "regwatch" && <RegWatch s={s} />}
      {tab === "inspection" && <Inspection s={s} site={site} />}
      {tab === "evidence" && <Evidence s={s} site={site} />}
    </Page>
  );
}
