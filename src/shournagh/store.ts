/* Shournagh OS demo store: one in-memory state, plain actions, derived selectors.
   Every screen reads from here, so an action on one page updates every count,
   card and audit entry elsewhere. Nothing leaves the browser. */
import { useSyncExternalStore } from "react";
import type {
  SiteFilter, RoleId, LinkType, Child, Family, Guardian, Staff, Invoice, FundingItem, Policy,
  Task, Approval, Exception, DemoEvent, Message, Enquiry, CareLog, ProgressReport, Handover,
  CleaningItem, LeaveRequest, Onboarding, SiteId, PolicyStage, EnquiryStatus, CareKind, StoryId,
} from "./types";
import * as seed from "./seed";

/* ── Roles ─────────────────────────────────────────────────────────────────── */
export interface RoleDef {
  id: RoleId; label: string; person: string; personId: string; initials: string; title: string;
  site: SiteFilter | null;          // locked site, or null if the user can switch
  pages: string[];                  // admin pages this role can open
  surface: "admin" | "tablet" | "parent";
}
const ALL_PAGES = ["Home", "Agents", "Overview", "Centres", "Families", "People", "Policies", "Finance", "Work", "Records", "Activity", "Settings"];
export const ROLES: RoleDef[] = [
  { id: "owner", label: "Owner", person: "Edel Lyons", personId: "edel", initials: "EL", title: "Owner, Shournagh Childcare", site: null, pages: ALL_PAGES, surface: "admin" },
  { id: "manager-elm", label: "Site Manager · Elmgrove", person: "Gráinne Twomey", personId: "s01", initials: "GT", title: "Centre Manager, Elmgrove", site: "elm",
    pages: ["Home", "Agents", "Overview", "Centres", "Families", "People", "Policies", "Finance", "Work", "Records", "Activity", "Settings"], surface: "admin" },
  { id: "manager-bal", label: "Site Manager · Ballyneety", person: "Siobhán Barry", personId: "s18", initials: "SB", title: "Centre Manager, Ballyneety", site: "bal",
    pages: ["Home", "Agents", "Overview", "Centres", "Families", "People", "Policies", "Finance", "Work", "Records", "Activity", "Settings"], surface: "admin" },
  { id: "educator", label: "Room Educator", person: "Méabh Ryan", personId: "s08", initials: "MR", title: "Early Years Educator, Toddlers", site: "elm", pages: [], surface: "tablet" },
  { id: "hr", label: "HR Admin", person: "Deirdre Nagle", personId: "s02", initials: "DN", title: "HR and Finance Administrator", site: null,
    pages: ["Home", "Agents", "People", "Policies", "Work", "Records", "Activity", "Settings"], surface: "admin" },
  { id: "parent", label: "Parent", person: "Laura Murphy", personId: "fam-murphy-g1", initials: "LM", title: "Parent of Aoife and Darragh", site: "elm", pages: [], surface: "parent" },
];
export const roleDef = (id: RoleId) => ROLES.find((r) => r.id === id)!;

/* ── Page tabs (top bar) ───────────────────────────────────────────────────── */
export const PAGE_TABS: Record<string, { id: string; label: string }[]> = {
  Overview: [{ id: "executive", label: "Executive" }, { id: "elm", label: "Elmgrove" }, { id: "bal", label: "Ballyneety" }, { id: "weekly", label: "Weekly Operations" }, { id: "quality", label: "Quality & Risk" }],
  Centres: [{ id: "today", label: "Today" }, { id: "rooms", label: "Rooms" }, { id: "attendance", label: "Attendance" }, { id: "care", label: "Daily Care" }, { id: "curriculum", label: "Curriculum" }, { id: "cleaning", label: "Cleaning & Safety" }, { id: "handovers", label: "Handovers" }],
  Families: [{ id: "enquiries", label: "Enquiries" }, { id: "enrolments", label: "Enrolments" }, { id: "bookings", label: "Bookings" }, { id: "children", label: "Children" }, { id: "messaging", label: "Parents & Messaging" }, { id: "forms", label: "Permissions & Forms" }, { id: "app", label: "Parent App Preview" }],
  People: [{ id: "rota", label: "Rota" }, { id: "team", label: "Team" }, { id: "onboarding", label: "HR Onboarding" }, { id: "contracts", label: "Contracts" }, { id: "training", label: "Training & Vetting" }, { id: "leave", label: "Leave & Cover" }],
  Policies: [{ id: "library", label: "Policy Library" }, { id: "howwedo", label: "How We Do It" }, { id: "versions", label: "Versions & Sign-offs" }, { id: "regwatch", label: "Regulation Watch" }, { id: "inspection", label: "Inspection Readiness" }, { id: "evidence", label: "Evidence Vault" }],
  Finance: [{ id: "overview", label: "Overview" }, { id: "fees", label: "Fees & Invoices" }, { id: "payments", label: "Payments" }, { id: "schemes", label: "NCS & ECCE" }, { id: "reconciliation", label: "Reconciliation" }, { id: "outstanding", label: "Outstanding Balances" }],
  Work: [{ id: "mine", label: "My Work" }, { id: "board", label: "Team Board" }, { id: "approvals", label: "Approvals" }, { id: "routines", label: "Recurring Routines" }, { id: "workflows", label: "Workflows" }, { id: "calendar", label: "Calendar" }],
  Activity: [{ id: "all", label: "All Events" }, { id: "people", label: "People Actions" }, { id: "agent", label: "Agent Actions" }, { id: "data", label: "Data & Integrations" }, { id: "access", label: "Access Audit" }],
  Settings: [{ id: "org", label: "Organisation" }, { id: "centres", label: "Centres & Registrations" }, { id: "roles", label: "People & Roles" }, { id: "systems", label: "Connected Systems" }, { id: "notifications", label: "Notifications" }, { id: "governance", label: "Data & AI Governance" }, { id: "support", label: "Support & Handover" }],
};

/* ── State ─────────────────────────────────────────────────────────────────── */
export interface DemoState {
  site: SiteFilter;
  role: RoleId;
  tabs: Record<string, string>;
  drawer: { type: LinkType; id: string } | null;
  toast: { id: number; text: string } | null;
  away: boolean;
  awayFeed: { at: string; who: string; text: string; tone: "ok" | "info" | "owner" }[];
  tour: number | null;
  reassureOpen: boolean;
  deliveryOpen: boolean;
  children: Child[]; families: Family[]; guardians: Guardian[]; staff: Staff[];
  invoices: Invoice[]; funding: FundingItem[]; policies: Policy[]; tasks: Task[]; approvals: Approval[];
  exceptions: Exception[]; events: DemoEvent[]; messages: Message[]; enquiries: Enquiry[];
  careLogs: CareLog[]; progress: ProgressReport[]; handovers: Handover[]; cleaning: CleaningItem[];
  leave: LeaveRequest[]; onboarding: Onboarding[];
  safeSleepReminded: Record<string, string>;      // staff id -> time reminded
  coverConfirmed: boolean;
  parentPrefs: { routine: "In-app only" | "Daily digest"; important: "Push" | "Push + email digest"; urgent: "Push + SMS + phone escalation" };
  parentChild: string;
  policyFlow: { stage: PolicyStage; signed: number; total: number; reminded: boolean };
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function initial(): DemoState {
  return {
    site: "all", role: "owner", tabs: {}, drawer: null, toast: null, away: false, awayFeed: [], tour: null,
    reassureOpen: false, deliveryOpen: false,
    children: clone(seed.CHILDREN), families: clone(seed.FAMILIES), guardians: clone(seed.GUARDIANS), staff: clone(seed.STAFF),
    invoices: clone(seed.INVOICES), funding: clone(seed.FUNDING), policies: clone(seed.POLICIES), tasks: clone(seed.TASKS),
    approvals: clone(seed.APPROVALS), exceptions: clone(seed.EXCEPTIONS), events: clone(seed.EVENTS), messages: clone(seed.MESSAGES),
    enquiries: clone(seed.ENQUIRIES), careLogs: clone(seed.CARE_LOGS), progress: clone(seed.PROGRESS), handovers: clone(seed.HANDOVERS),
    cleaning: clone(seed.CLEANING), leave: clone(seed.LEAVE), onboarding: clone(seed.ONBOARDING),
    safeSleepReminded: {}, coverConfirmed: false,
    parentPrefs: { routine: "In-app only", important: "Push", urgent: "Push + SMS + phone escalation" },
    parentChild: "c-aoife",
    policyFlow: { stage: "draft", signed: 0, total: 30, reminded: false },
  };
}

let state: DemoState = initial();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function getState(): DemoState { return state; }
export function setState(patch: Partial<DemoState> | ((s: DemoState) => Partial<DemoState>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  emit();
}
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
/** The whole demo state; re-renders on any change. */
export function useDemo(): DemoState { return useSyncExternalStore(subscribe, getState, getState); }

/* ── Clock: demo time starts at 09:42 and moves with real minutes ─────────── */
const loadedAt = Date.now();
export function nowLabel(): string {
  const [h, m] = seed.DEMO_NOW.split(":").map(Number);
  const total = h * 60 + m + Math.floor((Date.now() - loadedAt) / 60000);
  return String(Math.floor(total / 60) % 24).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

/* ── Lookups ───────────────────────────────────────────────────────────────── */
export const staffById = (id: string, s: DemoState = state) => s.staff.find((x) => x.id === id);
export const personName = (id: string, s: DemoState = state): string =>
  id === "edel" ? "Edel Lyons" : staffById(id, s)?.name || s.guardians.find((g) => g.id === id)?.name || id;
export const childById = (id: string, s: DemoState = state) => s.children.find((c) => c.id === id);
export const childName = (id: string, s: DemoState = state) => { const c = childById(id, s); return c ? c.first + " " + c.last : id; };
export const familyById = (id: string, s: DemoState = state) => s.families.find((f) => f.id === id);
export const guardiansOf = (familyId: string, s: DemoState = state) => s.guardians.filter((g) => g.family === familyId);
export const primaryGuardian = (familyId: string, s: DemoState = state) => guardiansOf(familyId, s).find((g) => g.primary) || guardiansOf(familyId, s)[0];
export const roomById = (id: string) => seed.ROOMS.find((r) => r.id === id);
export const siteById = (id: SiteId) => seed.SITES.find((x) => x.id === id)!;
export const policyById = (id: string, s: DemoState = state) => s.policies.find((p) => p.id === id);
export const euro = (n: number, dp = 0) => "€" + n.toLocaleString("en-IE", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Records with site "both" always show; others only when they match the filter. */
export function inSite(filter: SiteFilter, site: SiteId | "both"): boolean {
  return filter === "all" || site === "both" || site === filter;
}
/** Effective site filter for the current role (managers are locked to their centre). */
export function effectiveSite(s: DemoState = state): SiteFilter {
  const r = roleDef(s.role);
  return r.site && r.surface === "admin" && r.id !== "owner" && r.id !== "hr" ? r.site : s.site;
}

/* ── Derived numbers (the single place every count comes from) ─────────────── */
export function metrics(s: DemoState = state, site: SiteFilter = effectiveSite(s)) {
  const kids = s.children.filter((c) => inSite(site, c.site));
  const staff = s.staff.filter((x) => inSite(site, x.site));
  const inv = s.invoices.filter((i) => inSite(site, i.site));
  const fund = s.funding.filter((f) => inSite(site, f.site));
  const signed = staff.filter((x) => x.safeSleepSigned).length;
  const ex = s.exceptions.filter((e) => inSite(site, e.site));
  const openEx = ex.filter((e) => e.status !== "resolved");
  const urgent = s.messages.filter((m) => m.priority === "Urgent" && inSite(site, m.site));
  const coverageWatch = site !== "elm" && !s.coverConfirmed ? 1 : 0;
  return {
    booked: kids.length,
    attending: kids.filter((c) => c.attendingToday).length,
    checkedIn: kids.filter((c) => c.checkedIn && !c.checkedOut).length,
    checkedOut: kids.filter((c) => c.checkedOut).length,
    staffTotal: staff.length,
    onDuty: staff.filter((x) => x.status === "on").length,
    away: staff.filter((x) => x.status !== "on").length,
    safeSleepSigned: signed,
    safeSleepTotal: staff.length,
    overdueCount: inv.length,
    overdueTotal: inv.reduce((n, i) => n + i.amount, 0),
    overdueToReview: inv.filter((i) => i.status !== "reviewed").length,
    fundingOpen: fund.filter((f) => f.status !== "reviewed").length,
    fundingOpenTotal: fund.filter((f) => f.status !== "reviewed").reduce((n, f) => n + f.amount, 0),
    fundingTotal: fund.reduce((n, f) => n + f.amount, 0),
    fundingCount: fund.length,
    exceptionsOpen: openEx.length,
    exceptionsAssigned: openEx.filter((e) => e.status === "assigned").length,
    exceptionsOwner: openEx.filter((e) => e.status === "needs-owner").length,
    urgentSent: urgent.length,
    urgentAwaitingAck: urgent.filter((m) => m.ackRequired && !m.ackAt).length,
    enquiriesNew: s.enquiries.filter((e) => e.status === "new" && inSite(site, e.site)).length,
    approvalsPending: s.approvals.filter((a) => a.status === "pending" && inSite(site, a.site)).length,
    tasksOpen: s.tasks.filter((t) => t.status !== "done" && inSite(site, t.site)).length,
    tasksDoneToday: s.tasks.filter((t) => t.status === "done" && inSite(site, t.site)).length,
    roomsCovered: seed.ROOMS.filter((r) => inSite(site, r.site)).length - coverageWatch,
    roomsTotal: seed.ROOMS.filter((r) => inSite(site, r.site)).length,
    coverageWatch,
    capacity: seed.SITES.filter((x) => inSite(site, x.id)).reduce((n, x) => n + x.capacity, 0),
  };
}

/** Owner briefing sentence: always reconciles to the exception list. */
export function briefingLine(s: DemoState = state): string {
  const m = metrics(s, "all");
  const both = "Both centres are running.";
  if (m.exceptionsOpen === 0) return both + " Nothing needs attention right now.";
  const n = m.exceptionsOpen;
  const words = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
  const lead = both + " " + (words[n] || String(n)) + " item" + (n === 1 ? " needs" : "s need") + " attention";
  const assigned = m.exceptionsAssigned;
  const tail = m.exceptionsOwner === 0
    ? "; all are owned by your managers. Nothing needs your approval."
    : "; " + String(words[assigned] || assigned).toLowerCase() + (assigned === 1 ? " is" : " are") + " already assigned. You only need to approve " + (m.exceptionsOwner === 1 ? "one" : m.exceptionsOwner) + ".";
  return lead + tail;
}

/* ── Navigation bridge (PulseLogic registers the real router) ──────────────── */
let navigator: ((page: string, recSection?: string) => void) | null = null;
let currentPage = () => "Home";
export function registerNavigator(fn: (page: string, recSection?: string) => void, pageGetter: () => string) { navigator = fn; currentPage = pageGetter; }
export function getPage() { return currentPage(); }
export function navigate(page: string, tab?: string) {
  if (tab && PAGE_TABS[page]) setState((s) => ({ tabs: { ...s.tabs, [page]: tab } }));
  if (navigator) navigator(page, page === "Records" ? tab : undefined);
  setState({ drawer: null });
}
export function activeTab(page: string, s: DemoState = state) {
  const tabs = PAGE_TABS[page];
  return (tabs && (s.tabs[page] || tabs[0].id)) || "";
}
export function setTab(page: string, tab: string) { setState((s) => ({ tabs: { ...s.tabs, [page]: tab } })); }

/* ── Small helpers for actions ─────────────────────────────────────────────── */
let evN = 1000;
export function logEvent(e: Omit<DemoEvent, "id" | "at" | "fresh"> & { at?: string }) {
  const ev: DemoEvent = { id: "ev" + (++evN), at: e.at || nowLabel(), fresh: true, ...e } as DemoEvent;
  setState((s) => ({ events: [ev].concat(s.events) }));
  setTimeout(() => setState((s) => ({ events: s.events.map((x) => (x.id === ev.id ? { ...x, fresh: false } : x)) })), 2600);
}
let toastN = 0;
export function toast(text: string) {
  const id = ++toastN;
  setState({ toast: { id, text } });
  setTimeout(() => { if (state.toast && state.toast.id === id) setState({ toast: null }); }, 3200);
}
type Coll = "children" | "families" | "guardians" | "staff" | "invoices" | "funding" | "policies" | "tasks" | "approvals" | "exceptions" | "messages" | "enquiries" | "careLogs" | "progress" | "handovers" | "cleaning" | "leave" | "onboarding";
/** Generic patch of one record by id in any collection. */
export function update<K extends Coll>(coll: K, id: string, patch: Partial<DemoState[K][number]>) {
  setState((s) => ({ [coll]: (s[coll] as any[]).map((r: any) => (r.id === id ? { ...r, ...patch } : r)) } as Partial<DemoState>));
}
/** Generic insert at the top of a collection. */
export function add<K extends Coll>(coll: K, item: DemoState[K][number]) {
  setState((s) => ({ [coll]: [item as any].concat(s[coll] as any[]) } as Partial<DemoState>));
}
const actorName = () => roleDef(state.role).person;
const actorKind = (): DemoEvent["actorKind"] => (state.role === "parent" ? "parent" : "person");

/* ── Role and site ─────────────────────────────────────────────────────────── */
export function setSite(site: SiteFilter) {
  const r = roleDef(state.role);
  if (r.site && (r.id === "manager-elm" || r.id === "manager-bal")) { toast("Your access is limited to " + seed.siteName(r.site as SiteId) + "."); return; }
  setState({ site });
}
export function setRole(role: RoleId) {
  const r = roleDef(role);
  setState({ role, site: r.id === "owner" || r.id === "hr" ? "all" : (r.site as SiteFilter), drawer: null });
  logEvent({ actor: r.person, actorKind: r.surface === "parent" ? "parent" : "person", action: "signed in", target: r.surface === "tablet" ? "Toddlers tablet (TAB-E3), personal PIN" : r.surface === "parent" ? "Parent app" : "Shournagh OS as " + r.label, kind: "access", site: r.site && r.site !== "all" ? (r.site as SiteId) : "both", story: null });
  if (r.surface === "admin" && navigator && !r.pages.includes(currentPage())) navigator("Home");
}
export function openDrawer(type: LinkType, id: string) { setState({ drawer: { type, id } }); }
export function closeDrawer() { setState({ drawer: null }); }

/* ── Story B: Safe Sleep v4.0 ──────────────────────────────────────────────── */
const SAFE_SLEEP_PENDING_SITES = (s: DemoState) => s.staff.filter((x) => !x.safeSleepSigned);
export function sendSafeSleepReminders(site?: SiteId) {
  const pend = SAFE_SLEEP_PENDING_SITES(state).filter((x) => !site || x.site === site);
  if (!pend.length) return;
  const at = nowLabel();
  setState((s) => {
    const rem = { ...s.safeSleepReminded };
    pend.forEach((p) => { rem[p.id] = at; });
    return { safeSleepReminded: rem };
  });
  const bySite: Record<string, Staff[]> = {};
  pend.forEach((p) => { (bySite[p.site] = bySite[p.site] || []).push(p); });
  Object.keys(bySite).forEach((st) => {
    const mgr = st === "elm" ? "Gráinne Twomey" : "Siobhán Barry";
    logEvent({ actor: mgr, actorKind: "person", action: "sent Safe Sleep v4.0 reminder (simulated)", target: bySite[st].map((x) => x.name).join(", "), kind: "people", site: st as SiteId, story: "B" });
  });
  setState((s) => ({
    tasks: s.tasks.map((t) => t.id === "t-safesleep" ? { ...t, status: "doing", checklist: t.checklist.map((c, i) => (i === 0 || (i === 1 && (!site || site === "elm")) || (i === 2 && (!site || site === "bal")) ? { ...c, done: true } : c)) } : t),
    policies: s.policies.map((p) => (p.id === "pol-safesleep" ? { ...p, stage: "reminders" } : p)),
  }));
}
export function signSafeSleep(staffId: string) {
  const st = staffById(staffId);
  if (!st || st.safeSleepSigned) return;
  update("staff", staffId, { safeSleepSigned: "Today " + nowLabel() });
  logEvent({ actor: st.name, actorKind: "person", action: "signed Safe Sleep Policy v4.0", target: "Signature recorded (simulated)", kind: "people", site: st.site, story: "B" });
  const left = SAFE_SLEEP_PENDING_SITES(state).length;
  if (left === 0) {
    setState((s) => ({
      policies: s.policies.map((p) => (p.id === "pol-safesleep" ? { ...p, stage: "complete" } : p)),
      exceptions: s.exceptions.map((e) => (e.id === "x-safesleep" ? { ...e, status: "resolved" } : e)),
      tasks: s.tasks.map((t) => (t.id === "t-safesleep" ? { ...t, status: "done", doneAt: nowLabel(), checklist: t.checklist.map((c) => ({ ...c, done: true })) } : t)),
    }));
    logEvent({ actor: "Policy Keeper", actorKind: "agent", action: "marked complete", target: "Safe Sleep v4.0, 30 of 30 signed", kind: "agent", site: "both", story: "B" });
  }
}

/* ── Approvals (with story side effects) ───────────────────────────────────── */
export function decide(approvalId: string, decision: "approved" | "declined") {
  const ap = state.approvals.find((a) => a.id === approvalId);
  if (!ap || ap.status !== "pending") return;
  update("approvals", approvalId, { status: decision, decidedAt: nowLabel() });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: decision === "approved" ? "approved" : "declined", target: ap.title, kind: "people", site: ap.site, story: ap.story });
  if (decision === "declined") {
    if (approvalId.startsWith("ap-rem-")) { const iv = state.invoices.find((x) => x.id === approvalId.replace("ap-rem-", "")); if (iv && iv.status !== "reviewed") update("invoices", iv.id, { status: "overdue" }); }
    toast("Declined. The request goes back to " + (ap.requestedBy.startsWith("s") ? personName(ap.requestedBy) : ap.requestedBy) + ".");
    return;
  }
  if (approvalId === "ap-safesleep") {
    setState((s) => ({ exceptions: s.exceptions.map((e) => (e.id === "x-safesleep" ? { ...e, status: "assigned", owner: "s01", detail: "Approved by Edel. Gráinne and Siobhán are sending reminders to the 4 staff." } : e)) }));
    toast("Approved. Managers are sending the reminder to 4 staff.");
    setTimeout(() => sendSafeSleepReminders(), 900);
  } else if (approvalId === "ap-cover") {
    setState((s) => ({
      coverConfirmed: true,
      staff: s.staff.map((x) => (x.id === "s28" ? { ...x, shift: "08:30-12:30, 14:00-18:00", statusNote: "Covering After-school 14:00-18:00" } : x)),
      exceptions: s.exceptions.map((e) => (e.id === "x-cover" ? { ...e, status: "resolved", detail: "Michelle Coughlan confirmed for After-school 14:00-18:00." } : e)),
      tasks: s.tasks.map((t) => (t.id === "t-cover" ? { ...t, status: "done", doneAt: nowLabel(), checklist: t.checklist.map((c) => ({ ...c, done: true })) } : t)),
    }));
    logEvent({ actor: "Rota Coordinator", actorKind: "agent", action: "updated rota after approval", target: "Michelle Coughlan, After-school 14:00-18:00", kind: "agent", site: "bal", story: "A" });
    toast("Cover confirmed. The coverage watch is cleared.");
  } else if (approvalId === "ap-fund1") {
    markFundingReviewed("fx-1", true);
  } else if (approvalId === "ap-notice") {
    const toddlerFamilies = Array.from(new Set(state.children.filter((c) => c.room === "elm-toddlers").map((c) => c.family)));
    add("messages", { id: "m-library", family: "fam-murphy", child: "c-aoife", from: "Aisling Corcoran, Toddlers", fromKind: "room", to: "Toddlers families (" + toddlerFamilies.length + ")",
      priority: "Important", site: "elm", subject: "Library visit on Thursday: consent needed",
      body: "We're walking to Blarney library on Thursday morning. Please give consent for the outing in the app by Wednesday 17:00.",
      at: nowLabel(), ackRequired: true, ackAt: null, ackBy: null, escalation: [] });
    logEvent({ actor: "Parent Communications", actorKind: "agent", action: "delivered Important notice (simulated)", target: toddlerFamilies.length + " Toddlers families, push only", kind: "agent", site: "elm", story: "E" });
    toast("Notice sent to " + toddlerFamilies.length + " Toddlers families as Important (simulated).");
  } else if (approvalId === "ap-leave") {
    update("leave", "lv3", { status: "approved" });
    toast("Leave approved. Cover: Joanne Cotter.");
  } else if (approvalId.startsWith("ap-rem-")) {
    const invId = approvalId.replace("ap-rem-", "");
    const iv = state.invoices.find((x) => x.id === invId);
    if (iv && iv.status !== "reviewed") update("invoices", invId, { status: "reminder-approved" });
    toast("Reminder approved and queued (simulated, nothing is sent from the demo).");
  } else {
    toast("Approved.");
  }
}

/* ── Story C: funding reconciliation (human review only) ───────────────────── */
export function assignFunding(id: string, staffId: string) {
  update("funding", id, { status: "assigned", reviewer: staffId });
  const f = state.funding.find((x) => x.id === id)!;
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "assigned reviewer", target: f.scheme + " item for " + childName(f.child) + " to " + personName(staffId), kind: "people", site: f.site, story: "C" });
}
export function markFundingReviewed(id: string, quiet = false) {
  const f = state.funding.find((x) => x.id === id);
  if (!f || f.status === "reviewed") return;
  update("funding", id, { status: "reviewed", reviewer: f.reviewer || "s02" });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "marked reviewed (portal correction to be keyed by a person)", target: f.scheme + " " + euro(f.amount) + ", " + childName(f.child), kind: "people", site: f.site, story: "C" });
  if (state.funding.every((x) => x.status === "reviewed")) {
    setState((s) => ({ exceptions: s.exceptions.map((e) => (e.id === "x-funding" ? { ...e, status: "resolved" } : e)) }));
  }
  if (!quiet) toast("Marked reviewed. Nothing was submitted to the NCS or ECCE portals.");
}

/* ── Story D: overdue fees ─────────────────────────────────────────────────── */
export function draftReminder(invoiceId: string) {
  const i = state.invoices.find((x) => x.id === invoiceId);
  if (!i) return;
  // A review is a separate fact from the reminder: never undo it.
  if (i.status !== "reviewed") update("invoices", invoiceId, { status: "reminder-drafted" });
  const fam = familyById(i.family)!;
  const g = primaryGuardian(fam.id)!;
  add("approvals", { id: "ap-rem-" + invoiceId, kind: "Parent reminder", title: "Payment reminder to " + g.name + " (" + i.number + ", " + euro(i.amount) + ")",
    detail: "Hi " + g.name.split(" ")[0] + ", a quick note that " + i.number + " for " + euro(i.amount) + " (" + i.period + ") is now " + i.daysOverdue + " days past due. If you've already paid, thank you and please ignore this. If it would help to spread the balance, just reply and we'll sort out a plan.",
    requestedBy: "Parent Communications", approver: i.site === "elm" ? "s01" : "s18", site: i.site, status: "pending", link: { type: "invoice", id: invoiceId }, story: "D", decidedAt: null });
  logEvent({ actor: "Parent Communications", actorKind: "agent", action: "drafted payment reminder for approval", target: i.number + ", " + fam.name, kind: "agent", site: i.site, story: "D" });
  toast("Reminder drafted and sent for approval. Nothing goes to the family yet.");
}
export function markInvoiceReviewed(invoiceId: string) {
  const i = state.invoices.find((x) => x.id === invoiceId);
  if (!i) return;
  update("invoices", invoiceId, { status: "reviewed" });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "marked reviewed (still unpaid)", target: i.number + ", " + euro(i.amount), kind: "people", site: i.site, story: "D" });
  if (state.invoices.every((x) => x.status === "reviewed")) {
    setState((s) => ({ exceptions: s.exceptions.map((e) => (e.id === "x-fees" ? { ...e, status: "resolved", detail: "All 6 reviewed. Still unpaid, €2,940 outstanding." } : e)) }));
  }
  toast(i.number + " marked reviewed. It stays unpaid until a payment is recorded.");
}

/* ── Story E: parent messaging ─────────────────────────────────────────────── */
export function ackMessage(id: string, by?: string) {
  const m = state.messages.find((x) => x.id === id);
  if (!m || m.ackAt) return;
  const who = by || actorName();
  update("messages", id, { ackAt: nowLabel(), ackBy: who });
  if (id === "m-policy") update("families", m.family, { ackParentComms: true });
  logEvent({ actor: who, actorKind: "parent", action: "acknowledged " + m.priority + " notice", target: m.subject, kind: "people", site: m.site, story: "E" });
}
export function sendMessage(msg: Omit<Message, "id" | "at" | "ackAt" | "ackBy" | "escalation">) {
  const id = "m" + Date.now();
  add("messages", { ...msg, id, at: nowLabel(), ackAt: null, ackBy: null, escalation: [] });
  logEvent({ actor: msg.from, actorKind: msg.fromKind === "guardian" ? "parent" : "person", action: "sent " + msg.priority + " message", target: msg.subject, kind: "people", site: msg.site, story: "E" });
}
export function setParentPref(key: keyof DemoState["parentPrefs"], value: string) {
  setState((s) => ({ parentPrefs: { ...s.parentPrefs, [key]: value } as DemoState["parentPrefs"] }));
  logEvent({ actor: "Laura Murphy", actorKind: "parent", action: "changed notification preference", target: key + ": " + value, kind: "access", site: "elm", story: "E" });
}

/* ── Story F: enquiries ────────────────────────────────────────────────────── */
export const ENQUIRY_FLOW: EnquiryStatus[] = ["new", "contacted", "visit", "offered", "enrolled"];
export const ENQUIRY_LABEL: Record<EnquiryStatus, string> = { new: "New", contacted: "Contacted", visit: "Visit arranged", offered: "Offered", enrolled: "Enrolled", waitlist: "Waitlist" };
export function moveEnquiry(id: string, status: EnquiryStatus) {
  const e = state.enquiries.find((x) => x.id === id);
  if (!e || e.status === status) return;
  update("enquiries", id, { status });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "moved enquiry to " + ENQUIRY_LABEL[status], target: e.parent + " (" + e.child + ")", kind: "people", site: e.site, story: "F" });
  if (id === "enq-doyle" && status !== "new") {
    setState((s) => ({
      exceptions: s.exceptions.map((x) => (x.id === "x-enquiry" ? { ...x, status: "resolved", detail: "Sarah Doyle contacted. Visit to be arranged." } : x)),
      tasks: s.tasks.map((t) => (t.id === "t-doyle" ? { ...t, status: "done", doneAt: nowLabel(), checklist: t.checklist.map((c) => ({ ...c, done: true })) } : t)),
    }));
  }
}

/* ── Room tablet: care logs and attendance ─────────────────────────────────── */
export function addCareLog(child: string, kind: CareKind, title: string, detail: string, by = "s08") {
  const needsReview = kind === "incident" || kind === "observation" || kind === "medication";
  const log: CareLog = { id: "l" + Date.now() + Math.floor(Math.random() * 99), child, kind, at: nowLabel(), title, detail, by,
    status: needsReview ? "pending-review" : "logged", parentVisible: !needsReview };
  add("careLogs", log);
  const c = childById(child);
  logEvent({ actor: personName(by), actorKind: "person", action: "logged " + title.toLowerCase() + (needsReview ? " (awaiting review)" : ""), target: c ? c.first + " " + c.last.charAt(0) + "., " + (roomById(c.room)?.name || "") : child, kind: "data", site: c ? c.site : "elm", story: child === "c-aoife" ? "E" : null });
  return log;
}
export function approveCareLog(id: string) {
  const l = state.careLogs.find((x) => x.id === id);
  if (!l) return;
  update("careLogs", id, { status: "approved", parentVisible: true });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "approved " + l.kind, target: childName(l.child), kind: "people", site: childById(l.child)?.site || "elm", story: null });
}
export function checkIn(childId: string) {
  const c = childById(childId);
  if (!c || c.checkedIn) return;
  update("children", childId, { checkedIn: nowLabel() });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "checked in", target: c.first + " " + c.last.charAt(0) + "., " + roomById(c.room)?.name, kind: "data", site: c.site, story: "A" });
}
export function checkOut(childId: string, collector: string) {
  const c = childById(childId);
  if (!c || c.checkedOut) return;
  update("children", childId, { checkedOut: nowLabel(), alert: childId === "c-darragh" ? null : c.alert });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "handed over to " + collector, target: c.first + " " + c.last.charAt(0) + "., " + roomById(c.room)?.name, kind: "people", site: c.site, story: childId === "c-darragh" ? "E" : null });
  if (childId === "c-darragh") setState((s) => ({ tasks: s.tasks.map((t) => (t.id === "t-darragh" ? { ...t, status: "done", doneAt: nowLabel(), checklist: t.checklist.map((x) => ({ ...x, done: true })) } : t)) }));
}

/* ── Work ──────────────────────────────────────────────────────────────────── */
export function setTaskStatus(id: string, status: Task["status"]) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  update("tasks", id, { status, doneAt: status === "done" ? nowLabel() : null, checklist: status === "done" ? t.checklist.map((c) => ({ ...c, done: true })) : t.checklist });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: status === "done" ? "completed task" : "moved task to " + status, target: t.title, kind: "people", site: t.site, story: t.story });
}
export function toggleCheck(taskId: string, idx: number) {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) return;
  const checklist = t.checklist.map((c, i) => (i === idx ? { ...c, done: !c.done } : c));
  update("tasks", taskId, { checklist, status: checklist.every((c) => c.done) ? "done" : t.status === "todo" ? "doing" : t.status, doneAt: checklist.every((c) => c.done) ? nowLabel() : null });
}
export function assignTask(id: string, owner: string) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  update("tasks", id, { owner });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "assigned task to " + personName(owner), target: t.title, kind: "people", site: t.site, story: t.story });
}
export function addTask(title: string, owner: string, site: Task["site"], due = "Today", priority: Task["priority"] = "Medium") {
  const t: Task = { id: "t" + Date.now(), title, owner, site, due, priority, status: "todo", link: null, story: null, checklist: [], recurring: null, doneAt: null };
  add("tasks", t);
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "created task", target: title + " (" + personName(owner) + ")", kind: "people", site, story: null });
  return t;
}

/* ── People ────────────────────────────────────────────────────────────────── */
export function requestDocument(onboardingId: string) {
  const o = state.onboarding.find((x) => x.id === onboardingId);
  if (!o) return;
  update("onboarding", onboardingId, { steps: o.steps.map((st) => (st.state === "blocked" ? { ...st, note: "Certificate copy requested from " + o.name + " at " + nowLabel() + " (secure upload link, simulated)" } : st)) });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "requested document", target: o.name + ": QQI Level 6 certificate copy", kind: "people", site: o.site, story: null });
  toast("Upload request sent to " + o.name + " (simulated).");
}
export function verifyStep(onboardingId: string) {
  const o = state.onboarding.find((x) => x.id === onboardingId);
  if (!o) return;
  const steps = o.steps.slice();
  const i = steps.findIndex((st) => st.state === "blocked" || st.state === "current");
  if (i < 0) return;
  steps[i] = { ...steps[i], state: "done", note: (steps[i].label === "Qualifications checked" ? "Certificate verified by Deirdre Nagle " : "Completed ") + nowLabel() };
  const nxt = steps.findIndex((st, k) => k > i && st.state !== "done");
  if (nxt > -1 && steps[nxt].state === "todo") steps[nxt] = { ...steps[nxt], state: "current" };
  update("onboarding", onboardingId, { steps });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "completed onboarding step", target: o.name + ": " + steps[i].label, kind: "people", site: o.site, story: null });
  if (o.staff === "s16" && steps[i].label === "Qualifications checked") {
    setState((s) => ({ tasks: s.tasks.map((t) => (t.id === "t-ella" ? { ...t, status: "done", doneAt: nowLabel(), checklist: t.checklist.map((c) => ({ ...c, done: true })) } : t)) }));
  }
}
export function decideLeave(id: string, status: "approved" | "declined") {
  const l = state.leave.find((x) => x.id === id);
  if (!l) return;
  update("leave", id, { status });
  if (id === "lv3") update("approvals", "ap-leave", { status, decidedAt: nowLabel() });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: status + " leave", target: personName(l.staff) + ", " + l.dates, kind: "people", site: staffById(l.staff)?.site || "both", story: null });
}

/* ── Centres ───────────────────────────────────────────────────────────────── */
export function completeCleaning(id: string) {
  const c = state.cleaning.find((x) => x.id === id);
  if (!c || c.done) return;
  update("cleaning", id, { done: nowLabel(), evidence: "Tablet checklist, " + actorName() });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "signed off cleaning", target: c.area + ": " + c.task, kind: "people", site: c.site, story: null });
}
export function readHandover(id: string) { update("handovers", id, { read: true }); }
export function addHandover(h: Omit<Handover, "id" | "at" | "read">) {
  add("handovers", { ...h, id: "h" + Date.now(), at: nowLabel(), read: false });
  logEvent({ actor: personName(h.from), actorKind: "person", action: "wrote " + h.kind.toLowerCase() + " handover", target: roomById(h.room)?.name || h.room, kind: "people", site: roomById(h.room)?.site || "elm", story: null });
}
export function approveProgress(id: string) {
  const p = state.progress.find((x) => x.id === id);
  if (!p) return;
  update("progress", id, { status: "approved", reviewedBy: roleDef(state.role).personId.startsWith("s") ? roleDef(state.role).personId : "s07", reviewedAt: "Today " + nowLabel() });
  logEvent({ actor: actorName(), actorKind: actorKind(), action: "reviewed and released " + p.period.toLowerCase() + " summary", target: childName(p.child), kind: "people", site: childById(p.child)?.site || "elm", story: "F" });
}

/* ── Policy update simulation (Collection Authorisation v2.2) ──────────────── */
export const POLICY_STAGES: { id: PolicyStage; label: string; note: string }[] = [
  { id: "draft", label: "Draft", note: "Policy Keeper drafted v2.2 from Edel's notes. Change summary attached." },
  { id: "review", label: "Human review", note: "Siobhán Barry reviews the wording and sources." },
  { id: "approved", label: "Approved", note: "Edel approves v2.2 for publication." },
  { id: "distributed", label: "Targeted distribution", note: "Sent to 30 staff and to families at both sites." },
  { id: "signatures", label: "Signature requests", note: "Each recipient asked to read and sign." },
  { id: "reminders", label: "Reminders", note: "Automatic reminder to anyone unsigned after 48 hours." },
  { id: "complete", label: "Complete", note: "All staff signed. Version locked and archived." },
];
export function advancePolicyFlow() {
  const order = POLICY_STAGES.map((x) => x.id);
  const cur = state.policyFlow.stage;
  const i = order.indexOf(cur);
  if (i >= order.length - 1) return;
  const next = order[i + 1];
  const signed = next === "signatures" ? 18 : next === "reminders" ? 27 : next === "complete" ? 30 : state.policyFlow.signed;
  setState((s) => ({ policyFlow: { ...s.policyFlow, stage: next, signed, reminded: next === "reminders" || s.policyFlow.reminded } }));
  const who = next === "review" ? "Siobhán Barry" : next === "approved" ? "Edel Lyons" : actorName();
  logEvent({ actor: who, actorKind: who === "Policy Keeper" ? "agent" : "person", action: "moved Collection Authorisation v2.2 to " + POLICY_STAGES[i + 1].label, target: POLICY_STAGES[i + 1].note, kind: who === "Policy Keeper" ? "agent" : "people", site: "both", story: "B" });
  if (next === "approved") setState((s) => ({ policies: s.policies.map((p) => (p.id === "pol-collection" ? { ...p, status: "In review", version: "2.2", stage: "approved" } : p)) }));
  if (next === "complete") setState((s) => ({ policies: s.policies.map((p) => (p.id === "pol-collection" ? { ...p, status: "Published", version: "2.2", stage: "complete", effective: seed.dayLabel(0) } : p)) }));
}
export function resetPolicyFlow() { setState({ policyFlow: { stage: "draft", signed: 0, total: 30, reminded: false } }); }

/* ── Owner away: managers run the day, only exceptions reach Edel ──────────── */
let awayTimers: number[] = [];
export function setAway(on: boolean) {
  awayTimers.forEach((t) => clearTimeout(t));
  awayTimers = [];
  if (!on) { setState({ away: false, awayFeed: [] }); return; }
  setState({ away: true, awayFeed: [] });
  const steps: [number, string, string, "ok" | "info" | "owner", () => void][] = [
    [600, "Gráinne Twomey", "Elmgrove opening checks done, 13 on duty, all rooms open.", "ok", () => {}],
    [1700, "Siobhán Barry", "Ballyneety opening checks done, Robins and Wrens open.", "ok", () => {}],
    [2900, "Rota Coordinator", "Ciarán off sick. Michelle Coughlan has approved availability for After-school. Sent to Siobhán.", "info", () => {}],
    [4100, "Gráinne Twomey", "Called Sarah Doyle back about a toddler place. Visit to be booked.", "ok", () => { if (state.enquiries.find((e) => e.id === "enq-doyle")?.status === "new") moveEnquiry("enq-doyle", "contacted"); }],
    [5300, "Deirdre Nagle", "Picked up the 3 NCS/ECCE mismatches for review. Nothing submitted.", "info", () => { state.funding.filter((f) => f.status === "open").forEach((f) => assignFunding(f.id, "s02")); }],
    [6500, "Escalated to you", "Safe Sleep v4.0 reminder needs your approval. Everything else is handled.", "owner", () => {}],
  ];
  steps.forEach(([ms, who, text, tone, fx]) => {
    awayTimers.push(window.setTimeout(() => {
      fx();
      setState((s) => ({ awayFeed: s.awayFeed.concat([{ at: nowLabel(), who, text, tone }]) }));
    }, ms));
  });
}

/* ── Guided tour for Edel (6 stops) ────────────────────────────────────────── */
export const TOUR: { title: string; line: string; go: () => void }[] = [
  { title: "Overview", line: "Two centres, 104 children today, 30 staff. Only the exceptions surface.", go: () => { setRole("owner"); navigate("Overview", "executive"); } },
  { title: "Two sites", line: "Two registered services, one picture. Each keeps its own registration and accountability.", go: () => { setRole("owner"); setState({ site: "bal" }); navigate("Overview", "bal"); } },
  { title: "Policy", line: "The system remembers your standards and proves who has followed them. Safe Sleep v4.0 is at 26 of 30.", go: () => { setRole("owner"); setState({ site: "all" }); navigate("Policies", "versions"); } },
  { title: "Room tablet", line: "Staff do childcare, not admin. Log a meal in two taps and it lands in the parent's timeline.", go: () => setRole("educator") },
  { title: "Parent phone", line: "No more inbox noise. Routine stays in the app, urgent needs a tap.", go: () => setRole("parent") },
  { title: "Finance", line: "Find the €432 funding mismatch before it costs the office an afternoon.", go: () => { setRole("owner"); setState({ site: "all" }); navigate("Finance", "reconciliation"); } },
];
export function startTour() { setState({ tour: 0 }); TOUR[0].go(); }
export function tourStep(i: number) {
  if (i < 0) return;
  if (i >= TOUR.length) { endTour(); return; }
  setState({ tour: i });
  TOUR[i].go();
}
export function endTour() { setState({ tour: null }); setRole("owner"); setState({ site: "all" }); navigate("Home"); }

/* ── Reset ─────────────────────────────────────────────────────────────────── */
export function resetDemo() {
  awayTimers.forEach((t) => clearTimeout(t));
  const keepRole = state.role;
  state = initial();
  state.role = keepRole;
  emit();
  toast("Demo data reset to the start of the day.");
}

export type { StoryId };
