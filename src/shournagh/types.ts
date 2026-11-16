/* Shournagh OS demo: shared types for the synthetic dataset.
   Every record has a stable id; links between records are by id only. */

export type SiteId = "elm" | "bal";
export type SiteFilter = "all" | SiteId;
export type RoleId = "owner" | "manager-elm" | "manager-bal" | "educator" | "hr" | "parent";
export type StoryId = "A" | "B" | "C" | "D" | "E" | "F";

export interface Site {
  id: SiteId;
  name: string;            // "Elmgrove"
  full: string;            // "Shournagh Childcare"
  address: string;
  tusla: string;           // registration number
  capacity: number;        // registered places (reference only, never "attending")
  capacityLabel: string;   // "Registered capacity (full day)"
  serviceType: string;
  registryContact: string; // as publicly associated on the register
  manager: string;         // staff id
  extraRegistrations: { ref: string; label: string; note: string }[];
  programmes: string[];
}

export type Programme = "babies" | "wobblers" | "toddlers" | "preschool" | "ecce" | "afterschool";

export interface Room {
  id: string;
  site: SiteId;
  name: string;
  programme: Programme;
  ages: string;
  hours: string;
  leader: string;          // staff id
  placesPerDay: number;    // demo planning figure for booking grid, not a regulatory number
  bookedByDay: [number, number, number, number, number]; // Mon..Fri, existing bookings
  tabletId: string;
}

export interface Child {
  id: string;
  first: string;
  last: string;
  site: SiteId;
  room: string;
  age: string;
  family: string;          // family id
  pattern: string[];       // booked days e.g. ["Mon","Tue"]
  hours: string;           // booked hours per week label
  funding: "NCS" | "ECCE" | "ECCE + NCS" | "Private";
  attendingToday: boolean;
  expected: string;        // expected arrival e.g. "08:15"
  checkedIn: string | null;
  checkedOut: string | null;
  alert: string | null;    // allergy/medical placeholder (only where needed)
  consents: { photos: boolean; sunscreen: boolean; outings: boolean; firstAid: boolean };
  keyworker: string;       // staff id
}

export interface Guardian {
  id: string;
  name: string;
  relation: string;
  family: string;
  phone: string;           // masked
  email: string;           // masked
  authorisedCollect: boolean;
  primary: boolean;
}

export interface Family {
  id: string;
  name: string;            // "Murphy family"
  guardians: string[];
  children: string[];
  site: SiteId;
  balance: number;         // current balance due (not overdue)
  ackParentComms: boolean; // acknowledged Parent Communications Policy v1.0
}

export type StaffStatus = "on" | "leave" | "sick" | "off" | "training" | "onboarding";

export interface Staff {
  id: string;
  name: string;
  initials: string;
  role: string;            // job title
  access: "Owner" | "Site Manager" | "Room Leader" | "Early Years Educator" | "HR/Finance" | "Support";
  site: SiteId;
  room: string | null;
  status: StaffStatus;
  statusNote: string;
  shift: string;           // today's shift, "" if off
  week: string[];          // Mon..Fri shift labels
  contract: "Signed 2026" | "Awaiting signature" | "Draft";
  qualification: string;
  vetting: { status: "Valid" | "Renewal due" | "Pending"; date: string };
  firstAid: string;        // expiry label
  childrenFirst: string;   // completion label
  induction: "Complete" | "In progress";
  safeSleepSigned: string | null; // time/date signed or null
  started: string;
}

export interface Invoice {
  id: string;
  number: string;
  family: string;
  child: string;
  site: SiteId;
  amount: number;
  period: string;
  issued: string;
  due: string;
  daysOverdue: number;
  status: "overdue" | "reminder-drafted" | "reminder-approved" | "reviewed";
  lines: { label: string; qty: string; amount: number }[];
}

export interface FundingItem {
  id: string;
  scheme: "NCS" | "ECCE";
  child: string;
  site: SiteId;
  amount: number;
  issue: string;
  acorn: string;
  portal: string;
  booking: string;
  status: "open" | "assigned" | "reviewed";
  reviewer: string | null;
  source: string;
}

export type PolicyStage = "draft" | "review" | "approved" | "distributed" | "signatures" | "reminders" | "complete";

export interface Policy {
  id: string;
  title: string;
  version: string;
  category: "Safeguarding" | "Health & wellbeing" | "Operations" | "Parents" | "People";
  audience: "Staff" | "Parents" | "Staff and parents";
  appliesTo: string;
  owner: string;           // staff id or "edel"
  author: string;
  effective: string;
  nextReview: string;
  status: "Published" | "Draft" | "In review";
  changeSummary: string;
  sources: string[];
  requiresSignature: boolean;
  stage: PolicyStage;
  excerpt: { heading: string; text: string }[];
}

export interface Task {
  id: string;
  title: string;
  owner: string;           // staff id or "edel"
  site: SiteId | "both";
  due: string;
  priority: "High" | "Medium" | "Low";
  status: "todo" | "doing" | "blocked" | "done";
  link: { type: LinkType; id: string } | null;
  story: StoryId | null;
  checklist: { label: string; done: boolean }[];
  recurring: string | null;
  doneAt: string | null;
}

export interface Approval {
  id: string;
  title: string;
  detail: string;
  kind: "Policy" | "Parent alert" | "Finance" | "Staff cover" | "Leave" | "Parent reminder";
  requestedBy: string;     // staff id or agent name
  approver: string;        // staff id or "edel"
  site: SiteId | "both";
  status: "pending" | "approved" | "declined";
  link: { type: LinkType; id: string } | null;
  story: StoryId | null;
  decidedAt: string | null;
}

export interface Exception {
  id: string;
  title: string;
  detail: string;
  story: StoryId;
  site: SiteId | "both";
  owner: string;           // staff id or "edel"
  status: "assigned" | "needs-owner" | "resolved";
  page: string;
  tab: string;
}

export type EventKind = "people" | "agent" | "data" | "access";

export interface DemoEvent {
  id: string;
  at: string;              // "09:12"
  actor: string;
  actorKind: "person" | "agent" | "system" | "parent";
  action: string;
  target: string;
  kind: EventKind;
  site: SiteId | "both";
  story: StoryId | null;
  fresh?: boolean;
}

export interface Message {
  id: string;
  family: string;
  child: string | null;
  from: string;
  fromKind: "centre" | "room" | "guardian";
  to: string;
  priority: "Routine" | "Important" | "Urgent";
  subject: string;
  body: string;
  at: string;
  ackRequired: boolean;
  ackAt: string | null;
  ackBy: string | null;
  escalation: { step: string; state: "done" | "skipped" | "standby" }[];
  site: SiteId;
}

export type EnquiryStatus = "new" | "contacted" | "visit" | "offered" | "enrolled" | "waitlist";

export interface Enquiry {
  id: string;
  parent: string;
  child: string;
  childAge: string;
  programme: string;
  site: SiteId;
  room: string;
  days: string[];
  start: string;
  status: EnquiryStatus;
  received: string;
  owner: string;
  source: string;
  note: string;
}

export type CareKind = "meal" | "sleep" | "nappy" | "drink" | "activity" | "observation" | "incident" | "medication" | "arrival" | "note";

export interface CareLog {
  id: string;
  child: string;
  kind: CareKind;
  at: string;
  title: string;
  detail: string;
  by: string;              // staff id
  status: "logged" | "pending-review" | "approved";
  parentVisible: boolean;
}

export interface ProgressReport {
  id: string;
  child: string;
  period: "Weekly" | "Monthly";
  label: string;
  status: "draft" | "approved";
  reviewedBy: string | null;
  reviewedAt: string | null;
  aistear: string[];
  body: string[];
}

export interface Handover {
  id: string;
  room: string;
  kind: "Shift" | "Room to room" | "Parent";
  from: string;
  to: string;
  at: string;
  note: string;
  read: boolean;
  outstanding: string | null;
}

export interface CleaningItem {
  id: string;
  site: SiteId;
  area: string;
  task: string;
  due: string;
  owner: string;
  done: string | null;     // time completed
  evidence: string | null;
}

export interface LeaveRequest {
  id: string;
  staff: string;
  dates: string;
  kind: "Annual leave" | "Training" | "Unpaid" | "Medical";
  status: "pending" | "approved" | "declined";
  cover: string;
}

export interface OnboardingStep { label: string; state: "done" | "current" | "todo" | "blocked"; note: string }
export interface Onboarding {
  id: string;
  name: string;
  role: string;
  site: SiteId;
  start: string;
  staff: string | null;    // staff id once in the 30
  steps: OnboardingStep[];
}

export type LinkType = "child" | "family" | "staff" | "invoice" | "funding" | "policy" | "room" | "task" | "enquiry" | "approval" | "message" | "site";
