/* Helios for Shournagh: canned but context-aware answers, built from the live
   demo state at the moment you ask. No LLM is called. Anything that changes
   data is offered as an approval card and only runs when you press it.
   Children are referred to by first name and initial only. */
import {
  getState, metrics, effectiveSite, roleDef, decide, navigate, assignFunding, euro, childById, personName,
  staffById, briefingLine, inSite, setTaskStatus, moveEnquiry,
} from "./store";
import { siteName } from "./seed";

export interface ChatAction { label: string; primary?: boolean; run?: () => string; ask?: string }
export interface ChatAnswer {
  text: string; tool: string; effect: "read" | "write";
  cols?: string[]; rows?: string[][];
  actions?: ChatAction[]; confirm?: boolean; confirmSummary?: string;
  sources?: string[];
}

const kid = (id: string) => { const c = childById(id); return c ? c.first + " " + c.last.charAt(0) + "." : "a child"; };
const scopeLabel = () => { const s = effectiveSite(); return s === "all" ? "both centres" : siteName(s); };

function safeSleepApproval(): ChatAction[] {
  const st = getState();
  const ap = st.approvals.find((a) => a.id === "ap-safesleep");
  if (!ap || ap.status !== "pending") return [];
  const role = roleDef(st.role);
  if (role.id !== "owner") return [{ label: "Open sign-offs", ask: undefined, run: () => { navigate("Policies", "versions"); return "Opened Versions & Sign-offs. The reminder is waiting on Edel's approval."; } }];
  return [
    { label: "Approve reminder", primary: true, run: () => { decide("ap-safesleep", "approved"); return "Approved. Gráinne is sending it to Ella at Elmgrove and Siobhán to Jack, Shauna and Michelle at Ballyneety. I'll tell you when the signatures land."; } },
    { label: "Not now", run: () => "Left it pending. It stays at the top of your exceptions until you decide." },
  ];
}

export function answer(q: string): ChatAnswer {
  const s = q.toLowerCase();
  const st = getState();
  const m = metrics(st);
  const role = roleDef(st.role);

  if (/leave early|go home|head off|finish early|can i leave/.test(s)) {
    const open = st.exceptions.filter((e) => e.status !== "resolved" && inSite(effectiveSite(st), e.site));
    const ownerItems = open.filter((e) => e.status === "needs-owner");
    const rows = open.map((e) => [e.title, e.site === "both" ? "Both" : siteName(e.site), e.status === "needs-owner" ? "You" : personName(e.owner), e.status === "needs-owner" ? "Needs you" : "Assigned"]);
    const text = ownerItems.length
      ? "Yes, after one decision. Both centres are open and staffed: " + m.checkedIn + " of " + m.attending + " expected children are checked in and " + m.onDuty + " staff are on duty. " + open.length + " item" + (open.length === 1 ? " is" : "s are") + " open; " + (open.length - ownerItems.length) + " already sit with your managers. The only thing that needs you is the Safe Sleep v4.0 reminder."
      : "Yes. Both centres are open and staffed, and every open item is owned by a manager. If anything escalates it comes to your phone as an exception, not a pile of emails.";
    return { text, tool: "briefing.exceptions", effect: "read", cols: ["Item", "Site", "Owner", "State"], rows,
      confirm: ownerItems.length > 0, confirmSummary: ownerItems.length ? "Send the Safe Sleep v4.0 reminder to the 4 staff who haven't signed (1 Elmgrove, 3 Ballyneety). Managers send it from their own site." : undefined,
      actions: ownerItems.length ? safeSleepApproval() : [{ label: "Turn on away mode", ask: "Show me the owner away view" }],
      sources: ["Exceptions list", "Attendance (Acorn bookings, demo)", "Rota", "Approvals queue"] };
  }

  if (/overdue|behind|late|outstanding|what.*(due|open)/.test(s)) {
    const inv = st.invoices.filter((i) => inSite(effectiveSite(st), i.site));
    const fund = st.funding.filter((f) => inSite(effectiveSite(st), f.site) && f.status !== "reviewed");
    const pend = st.staff.filter((x) => !x.safeSleepSigned && inSite(effectiveSite(st), x.site));
    const blocked = st.tasks.filter((t) => t.status === "blocked" && inSite(effectiveSite(st), t.site));
    return {
      text: "Across " + scopeLabel() + ": " + inv.length + " invoices are past due (" + euro(inv.reduce((n, i) => n + i.amount, 0)) + "), " + fund.length + " funding mismatches are waiting for a person to check (" + euro(fund.reduce((n, f) => n + f.amount, 0)) + "), " + pend.length + " staff still owe a Safe Sleep v4.0 signature, and " + blocked.length + " task" + (blocked.length === 1 ? " is" : "s are") + " blocked. None of the overdue invoices has been marked paid; that only happens when a payment is recorded.",
      tool: "core.search", effect: "read",
      cols: ["What", "Count", "Value", "Owner"],
      rows: [
        ["Overdue invoices", String(inv.length), euro(inv.reduce((n, i) => n + i.amount, 0)), "Deirdre Nagle"],
        ["NCS/ECCE mismatches", String(fund.length), euro(fund.reduce((n, f) => n + f.amount, 0)), "Deirdre Nagle"],
        ["Safe Sleep signatures", String(pend.length), "", "Site managers"],
        ["Blocked tasks", String(blocked.length), "", blocked.map((t) => personName(t.owner).split(" ")[0]).join(", ") || "None"],
      ],
      actions: [{ label: "Open outstanding balances", primary: true, run: () => { navigate("Finance", "outstanding"); return "Opened Finance, Outstanding Balances."; } }, { label: "Why is NCS not reconciled?", ask: "Why is NCS not reconciled?" }],
      sources: ["Invoices (demo ledger)", "Funding queue", "Policy signatures", "Work"],
    };
  }

  if (/safe sleep|sign-?off|signature|signed/.test(s)) {
    const pend = st.staff.filter((x) => !x.safeSleepSigned);
    const signed = st.staff.length - pend.length;
    return {
      text: "Safe Sleep Policy v4.0 is at " + signed + " of " + st.staff.length + " signatures. " + (pend.length ? pend.length + " outstanding: " + pend.map((p) => p.name + " (" + siteName(p.site) + ")").join(", ") + "." : "Everyone has signed.") + (st.approvals.find((a) => a.id === "ap-safesleep")?.status === "pending" ? " The reminder is drafted and waiting for your approval." : Object.keys(st.safeSleepReminded).length ? " Reminders went out at " + Object.values(st.safeSleepReminded)[0] + "." : ""),
      tool: "policy.signatures", effect: "read",
      cols: ["Staff", "Site", "Role", "Status"],
      rows: pend.map((p) => [p.name, siteName(p.site), p.role, st.safeSleepReminded[p.id] ? "Reminded " + st.safeSleepReminded[p.id] : "Not reminded"]),
      confirm: st.approvals.find((a) => a.id === "ap-safesleep")?.status === "pending" && role.id === "owner",
      confirmSummary: "Send the targeted reminder to these " + pend.length + " staff. Managers send from their own site; nothing goes to parents.",
      actions: st.approvals.find((a) => a.id === "ap-safesleep")?.status === "pending" ? safeSleepApproval() : [{ label: "Open sign-offs", primary: true, run: () => { navigate("Policies", "versions"); return "Opened Policies, Versions & Sign-offs."; } }],
      sources: ["Safe Sleep Policy v4.0 (effective " + st.policies.find((p) => p.id === "pol-safesleep")!.effective + ")", "Signature register"],
    };
  }

  if (/ncs|ecce|funding|reconcil|subsid/.test(s)) {
    const items = st.funding.filter((f) => inSite(effectiveSite(st), f.site));
    const open = items.filter((f) => f.status !== "reviewed");
    return {
      text: open.length
        ? open.length + " items don't match between Acorn and the scheme records, worth " + euro(open.reduce((n, f) => n + f.amount, 0)) + " in total. They are an hours mismatch, a start-date mismatch and a lapsed award renewal. There is no live connection to the NCS or ECCE portals: the portal side is keyed by hand, which is why these drift. I've lined each one up side by side for a person to check; I won't submit anything."
        : "All funding items in " + scopeLabel() + " have been reviewed by a person. Any portal corrections still need to be keyed on the portal itself.",
      tool: "funding.compare", effect: "read",
      cols: ["Child", "Scheme", "Issue", "Amount"],
      rows: items.map((f) => [kid(f.child), f.scheme, f.issue.split(":")[0], euro(f.amount)]),
      actions: [
        { label: "Open reconciliation queue", primary: true, run: () => { navigate("Finance", "reconciliation"); return "Opened Finance, Reconciliation."; } },
        ...(open.some((f) => f.status === "open") ? [{ label: "Assign all to Deirdre", run: () => { open.filter((f) => f.status === "open").forEach((f) => assignFunding(f.id, "s02")); return "Assigned to Deirdre Nagle for review. She'll compare each one against the portal."; } }] : []),
      ],
      sources: ["Acorn export (Fri 17:02, demo)", "Portal entries keyed manually", "Fees and Funding Policy v2.1"],
    };
  }

  if (/cover|covering|after-?school|ratio|short/.test(s)) {
    const mich = staffById("s28")!;
    return {
      text: st.coverConfirmed
        ? "After-school at Ballyneety is covered: Michelle Coughlan is on 14:00 to 18:00 with Jack Hegarty and Shauna Kelleher. This is the approved roster, not a ratio calculation; statutory ratio rules aren't configured in this demo."
        : "Ciarán Moynihan is off sick, so After-school at Ballyneety has a gap from 14:00 to 18:00. Michelle Coughlan has approved availability for that slot and holds " + mich.qualification + ". Siobhán owns the decision. I'm showing this as a coverage watch, not a ratio breach, because statutory ratio rules aren't configured here.",
      tool: "rota.availability", effect: "read",
      cols: ["Room", "Shift", "Staff", "State"],
      rows: [["After-school", "13:00-18:30", "Jack Hegarty", "On"], ["After-school", "13:00-18:30", "Shauna Kelleher", "On"], ["After-school", "14:00-18:00", st.coverConfirmed ? "Michelle Coughlan" : "Gap (Ciarán off sick)", st.coverConfirmed ? "Covered" : "Watch"]],
      actions: !st.coverConfirmed && (role.id === "owner" || role.id === "manager-bal")
        ? [{ label: "Confirm Michelle", primary: true, run: () => { decide("ap-cover", "approved"); return "Confirmed. Michelle Coughlan is on After-school 14:00 to 18:00 and the coverage watch is cleared."; } }, { label: "Open Leave & Cover", run: () => { navigate("People", "leave"); return "Opened People, Leave & Cover."; } }]
        : [{ label: "Open Leave & Cover", run: () => { navigate("People", "leave"); return "Opened People, Leave & Cover."; } }],
      sources: ["Rota (approved availability)", "Sick leave log"],
    };
  }

  if (/urgent|parent message|collection|acknowledg/.test(s)) {
    const urg = st.messages.filter((x) => x.priority === "Urgent");
    const u = urg[0];
    return {
      text: urg.length
        ? "One Urgent notice today: a collection request to Laura Murphy for " + kid(u.child || "") + " (temperature), sent " + u.at + " with manager approval. " + (u.ackAt ? "Laura acknowledged at " + u.ackAt + ", so the phone escalation was not needed." : "Not yet acknowledged: phone follow-up starts at 15 minutes.") + " Routine logs went to the app only; no emails were sent for meals, naps or nappies."
        : "No urgent parent notices today.",
      tool: "messages.priority", effect: "read",
      cols: ["Priority", "To", "Subject", "Acknowledged"],
      rows: st.messages.filter((x) => x.priority !== "Routine").slice(0, 5).map((x) => [x.priority, x.to, x.subject, x.ackRequired ? (x.ackAt ? x.ackAt : "Waiting") : "Not required"]),
      actions: [{ label: "Open Parents & Messaging", primary: true, run: () => { navigate("Families", "messaging"); return "Opened Families, Parents & Messaging."; } }],
      sources: ["Parent Communications Policy v1.0", "Message log"],
    };
  }

  if (/enquir|waitlist|new famil|sarah|doyle|place/.test(s)) {
    const e = st.enquiries.find((x) => x.id === "enq-doyle")!;
    return {
      text: "One new website enquiry is waiting for a callback: " + e.parent + " wants a Toddlers place for " + e.child.split(" ")[0] + " (" + e.childAge + ") on Monday, Wednesday and Friday at Elmgrove from " + e.start + ". Toddlers has room on all three days, and Thursday is full, so there's no double booking. Gráinne owns it, callback due 11:00.",
      tool: "enquiries.find", effect: "read",
      cols: ["Day", "Booked", "Places", "With Fionn"],
      rows: [["Mon", "17", "20", "18 of 20"], ["Wed", "18", "20", "19 of 20"], ["Fri", "16", "20", "17 of 20"], ["Thu (not requested)", "20", "20", "Full"]],
      actions: e.status === "new"
        ? [{ label: "Mark contacted", primary: true, run: () => { moveEnquiry("enq-doyle", "contacted"); return "Moved to Contacted and logged. Gráinne's callback task is closed."; } }, { label: "Open enquiries", run: () => { navigate("Families", "enquiries"); return "Opened Families, Enquiries."; } }]
        : [{ label: "Open enquiries", primary: true, run: () => { navigate("Families", "enquiries"); return "Opened Families, Enquiries."; } }],
      sources: ["Website enquiry form", "Toddlers booking grid (demo)"],
    };
  }

  if (/away|offsite|owner away/.test(s)) {
    return { text: "Away mode shows the day as your managers run it: checks done, cover found, callbacks made, and only the one decision that needs you comes through. Turn it on from the widget rail.", tool: "briefing.away", effect: "read",
      actions: [{ label: "Close", run: () => "Okay." }], sources: ["Work", "Exceptions list"] };
  }

  if (/brief|morning|summary|today|how.*(going|things)/.test(s)) {
    return { text: briefingLine() + " " + m.checkedIn + " of " + m.attending + " expected children are checked in, " + m.onDuty + " of " + m.staffTotal + " staff are on duty.", tool: "briefing.today", effect: "read",
      actions: [{ label: "Can I leave early today?", ask: "Can I leave early today?" }, { label: "What's overdue?", ask: "What's overdue across the two centres?" }], sources: ["Exceptions list", "Attendance", "Rota"] };
  }

  if (/done|complete/.test(s) && /handover/.test(s)) {
    setTaskStatus("t-handover", "done");
    return { text: "Marked the manager handover done.", tool: "work.update", effect: "write", sources: ["Work"] };
  }

  return {
    text: "I can answer from Shournagh's own records and the permissions of whoever is asking. Try one of these, or ask about attendance, cover, sign-offs, fees, funding, enquiries or parent messages.",
    tool: "help", effect: "read",
    actions: [
      { label: "Can I leave early today?", ask: "Can I leave early today?" },
      { label: "What's overdue?", ask: "What's overdue across the two centres?" },
      { label: "Safe Sleep sign-offs", ask: "Show me the Safe Sleep sign-offs" },
      { label: "Why is NCS not reconciled?", ask: "Why is NCS not reconciled?" },
    ],
    sources: ["Role: " + role.label],
  };
}

export const HOME_PROMPTS = [
  "Can I leave early today?",
  "What's overdue across the two centres?",
  "Show me the Safe Sleep sign-offs",
  "Why is NCS not reconciled?",
];
