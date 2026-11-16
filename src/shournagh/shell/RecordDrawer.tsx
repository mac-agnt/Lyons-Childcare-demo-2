/* The linked-record drawer. Open any child, family, staff member, invoice,
   funding item, policy, room, task, enquiry, approval or centre and see the
   records it connects to: entered once, visible everywhere it matters.
   Respects the preview role: a site manager cannot open the other centre. */
import { type ReactNode, useEffect } from "react";
import {
  useDemo, closeDrawer, openDrawer, roleDef, effectiveSite, inSite, childById, familyById, guardiansOf, staffById, roomById,
  siteById, policyById, personName, euro, draftReminder, markInvoiceReviewed, assignFunding, markFundingReviewed, decide,
  setTaskStatus, toggleCheck, moveEnquiry, ENQUIRY_FLOW, ENQUIRY_LABEL, checkOut, checkIn, navigate, signSafeSleep, type DemoState,
} from "../store";
import { ROOMS, ROOM_COUNTS, siteName } from "../seed";
import type { LinkType, SiteId } from "../types";
import { Btn, Chip, Icon, IC, KV, Note, DemoTag, Bar, Steps } from "../ui";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="sh-eyebrow" style={{ marginBottom: 9 }}>{title}</div>
      {children}
    </div>
  );
}
function Link({ type, id, label, sub }: { type: LinkType; id: string; label: ReactNode; sub?: ReactNode }) {
  const icon = type === "child" ? IC.user : type === "family" ? IC.families : type === "staff" ? IC.people : type === "invoice" ? IC.euro : type === "funding" ? IC.finance
    : type === "policy" ? IC.policies : type === "room" ? IC.door : type === "site" ? IC.centres : type === "task" ? IC.work : type === "enquiry" ? IC.message : IC.link;
  return (
    <button type="button" onClick={() => openDrawer(type, id)} className="sh-item click" style={{ width: "100%", border: 0, background: "none", font: "inherit", color: "inherit", textAlign: "left", margin: 0 }}>
      <span className="sh-avatar" style={{ width: 28, height: 28, borderRadius: 9, background: "var(--surface-2)", color: "var(--dim)" }}><Icon d={icon} size={13} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="sh-trunc" style={{ display: "block", fontSize: 13, color: "var(--ink)" }}>{label}</span>
        {sub && <span className="sh-trunc" style={{ display: "block", fontSize: 11.5, color: "var(--dim)" }}>{sub}</span>}
      </span>
      <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".1em" }}>{type}</span>
    </button>
  );
}
function Events({ s, match }: { s: DemoState; match: (t: string) => boolean }) {
  const ev = s.events.filter((e) => match(e.target + " " + e.action)).slice(0, 5);
  if (!ev.length) return <div style={{ fontSize: 12.5, color: "var(--dim)" }}>No events yet today.</div>;
  return (
    <div className="sh-list">
      {ev.map((e) => (
        <div key={e.id} className="sh-item" style={{ alignItems: "flex-start", padding: "8px 0" }}>
          <span className="sh-num" style={{ fontSize: 11, color: "var(--faint)", width: 44, flex: "none", paddingTop: 1 }}>{e.at.replace("Yesterday ", "Yest ")}</span>
          <span style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.45 }}><b style={{ color: "var(--ink)", fontWeight: 500 }}>{e.actor}</b> {e.action}: {e.target}</span>
        </div>
      ))}
    </div>
  );
}

function siteOf(s: DemoState, type: LinkType, id: string): SiteId | "both" | null {
  switch (type) {
    case "child": return childById(id, s)?.site || null;
    case "family": return familyById(id, s)?.site || null;
    case "staff": return staffById(id, s)?.site || null;
    case "invoice": return s.invoices.find((x) => x.id === id)?.site || null;
    case "funding": return s.funding.find((x) => x.id === id)?.site || null;
    case "room": return roomById(id)?.site || null;
    case "task": return s.tasks.find((x) => x.id === id)?.site || null;
    case "enquiry": return s.enquiries.find((x) => x.id === id)?.site || null;
    case "approval": return s.approvals.find((x) => x.id === id)?.site || null;
    case "site": return id as SiteId;
    default: return "both";
  }
}

export default function RecordDrawer() {
  const s = useDemo();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  if (!s.drawer) return null;
  const { type, id } = s.drawer;
  const role = roleDef(s.role);
  const site = siteOf(s, type, id);
  const allowed = site === null || inSite(effectiveSite(s), site);
  const hrNoChild = role.id === "hr" && (type === "child" || type === "family");

  let eyebrow = type.toUpperCase(), title: ReactNode = id, chips: ReactNode = null, body: ReactNode = null;

  if (!allowed || hrNoChild) {
    eyebrow = "RESTRICTED";
    title = "Not visible to " + role.label;
    body = <Note icon={IC.lock}>This record belongs to {site && site !== "both" ? siteName(site) : "another service"}{hrNoChild ? " and contains child records outside the HR role" : ""}. Each registered service keeps its own records; this role sees only its own centre. The request was logged in the access audit.</Note>;
  } else if (type === "child") {
    const c = childById(id, s)!;
    const fam = familyById(c.family, s)!;
    const room = roomById(c.room)!;
    const inv = s.invoices.filter((i) => i.child === id);
    const fund = s.funding.filter((f) => f.child === id);
    const logs = s.careLogs.filter((l) => l.child === id).slice(0, 6);
    eyebrow = "CHILD · " + siteName(c.site).toUpperCase();
    title = c.first + " " + c.last;
    chips = <>{c.attendingToday ? (c.checkedOut ? <Chip tone="neutral">Collected {c.checkedOut}</Chip> : c.checkedIn ? <Chip tone="ok" dot>In since {c.checkedIn}</Chip> : <Chip tone="warn">Expected {c.expected}</Chip>) : <Chip tone="outline">Not booked today</Chip>}<Chip tone="accent">{c.funding}</Chip></>;
    body = (
      <>
        <KV rows={[["Room", room.name + ", " + siteName(c.site)], ["Age", c.age], ["Booked days", c.pattern.join(", ") + " (" + c.hours + ")"], ["Keyworker", personName(c.keyworker, s)],
          ["Care plan", c.alert ? <span style={{ color: "var(--warn)" }}>{c.alert}</span> : "None on file"],
          ["Consents", [c.consents.photos ? null : "photos missing", c.consents.sunscreen ? null : "sunscreen missing", c.consents.outings ? null : "outings missing"].filter(Boolean).join(", ") || "All current"]]} />
        {c.attendingToday && !c.checkedOut && (role.id !== "hr") && (
          <div className="sh-row" style={{ marginTop: 14, gap: 8, flexWrap: "wrap" }}>
            {!c.checkedIn && <Btn size="sm" kind="primary" icon={IC.check} onClick={() => checkIn(c.id)}>Check in</Btn>}
            {c.checkedIn && <Btn size="sm" icon={IC.door} onClick={() => checkOut(c.id, guardiansOf(c.family, s).find((g) => g.primary)?.name || "guardian")}>Hand over to {guardiansOf(c.family, s).find((g) => g.primary)?.name.split(" ")[0]}</Btn>}
          </div>
        )}
        <Section title="Connected records">
          <div className="sh-list">
            <Link type="family" id={fam.id} label={fam.name} sub={guardiansOf(fam.id, s).map((g) => g.name + " (" + g.relation.toLowerCase() + ")").join(", ")} />
            <Link type="room" id={room.id} label={room.name + " room"} sub={room.ages + ", leader " + personName(room.leader, s)} />
            <Link type="site" id={c.site} label={siteById(c.site).full} sub={"Tusla " + siteById(c.site).tusla} />
            {inv.map((i) => <Link key={i.id} type="invoice" id={i.id} label={i.number + ", " + euro(i.amount)} sub={i.daysOverdue + " days overdue"} />)}
            {fund.map((f) => <Link key={f.id} type="funding" id={f.id} label={f.scheme + " mismatch, " + euro(f.amount)} sub={f.issue} />)}
            {s.tasks.filter((t) => t.link?.type === "child" && t.link.id === id).map((t) => <Link key={t.id} type="task" id={t.id} label={t.title} sub={personName(t.owner, s)} />)}
          </div>
        </Section>
        <Section title="Today's log (human-entered)">
          {logs.length ? (
            <div className="sh-list">
              {logs.map((l) => (
                <div key={l.id} className="sh-item" style={{ padding: "8px 0", alignItems: "flex-start" }}>
                  <span className="sh-num" style={{ fontSize: 11, color: "var(--faint)", width: 44, flex: "none" }}>{l.at}</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.45, flex: 1 }}><b style={{ fontWeight: 500 }}>{l.title}</b> <span style={{ color: "var(--dim)" }}>{l.detail}</span></span>
                  {l.status === "pending-review" && <Chip tone="warn">Review</Chip>}
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 12.5, color: "var(--dim)" }}>No care entries yet today.</div>}
        </Section>
      </>
    );
  } else if (type === "family") {
    const f = familyById(id, s)!;
    const gs = guardiansOf(id, s);
    const inv = s.invoices.filter((i) => i.family === id);
    const msgs = s.messages.filter((m) => m.family === id);
    eyebrow = "FAMILY · " + siteName(f.site).toUpperCase();
    title = f.name;
    chips = <>{f.ackParentComms ? <Chip tone="ok">Comms policy acknowledged</Chip> : <Chip tone="warn">Comms policy not acknowledged</Chip>}</>;
    body = (
      <>
        <KV rows={[["Current balance", euro(f.balance, 2)], ["Overdue", inv.length ? euro(inv.reduce((n, i) => n + i.amount, 0)) : "None"], ["Guardians", gs.length + (gs.some((g) => !g.authorisedCollect) ? " (1 not authorised to collect)" : "")]]} />
        <Section title="Guardians">
          <div className="sh-list">{gs.map((g) => <div key={g.id} className="sh-item"><span className="sh-avatar">{g.name.split(" ").map((p) => p[0]).join("")}</span><span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 13 }}>{g.name} {g.primary && <Chip tone="accent">Primary</Chip>}</span><span style={{ fontSize: 11.5, color: "var(--dim)" }}>{g.relation} · {g.phone} · {g.email}</span></span>{g.authorisedCollect ? <Chip tone="ok">Can collect</Chip> : <Chip tone="bad">Cannot collect</Chip>}</div>)}</div>
        </Section>
        <Section title="Children and money">
          <div className="sh-list">
            {f.children.map((cid) => { const c = childById(cid, s)!; return <Link key={cid} type="child" id={cid} label={c.first + " " + c.last} sub={roomById(c.room)?.name + ", " + siteName(c.site)} />; })}
            {inv.map((i) => <Link key={i.id} type="invoice" id={i.id} label={i.number + ", " + euro(i.amount)} sub={i.period + ", " + i.daysOverdue + " days overdue"} />)}
          </div>
        </Section>
        <Section title="Messages">
          {msgs.length ? <div className="sh-list">{msgs.slice(0, 4).map((m) => <div key={m.id} className="sh-item" style={{ padding: "8px 0" }}><Chip tone={m.priority === "Urgent" ? "bad" : m.priority === "Important" ? "gold" : "neutral"}>{m.priority}</Chip><span className="sh-trunc" style={{ flex: 1, fontSize: 12.5 }}>{m.subject}</span><span className="sh-num" style={{ fontSize: 11, color: "var(--faint)" }}>{m.at}</span></div>)}</div> : <div style={{ fontSize: 12.5, color: "var(--dim)" }}>No messages.</div>}
        </Section>
      </>
    );
  } else if (type === "staff") {
    const p = staffById(id, s)!;
    const ob = s.onboarding.find((o) => o.staff === id);
    eyebrow = "STAFF · " + siteName(p.site).toUpperCase();
    title = p.name;
    chips = <>{p.status === "on" ? <Chip tone="ok" dot>On duty {p.shift}</Chip> : <Chip tone="warn">{p.statusNote}</Chip>}<Chip tone="outline">{p.access}</Chip></>;
    body = (
      <>
        <KV rows={[["Role", p.role], ["Room", p.room ? roomById(p.room)?.name : "Floats / office"], ["Qualification", p.qualification], ["Contract", p.contract],
          ["Garda vetting", p.vetting.status + " (" + p.vetting.date + ")"], ["First aid", p.firstAid], ["Children First", p.childrenFirst], ["Induction", p.induction],
          ["Safe Sleep v4.0", p.safeSleepSigned ? "Signed " + p.safeSleepSigned : (s.safeSleepReminded[id] ? "Reminded " + s.safeSleepReminded[id] : "Not signed")]]} />
        {!p.safeSleepSigned && <div style={{ marginTop: 12 }}><Btn size="sm" icon={IC.check} onClick={() => signSafeSleep(id)}>Simulate signature</Btn></div>}
        <Section title="This week">
          <div className="sh-grid" style={{ gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
            {p.week.map((w, i) => <div key={i} style={{ padding: "8px 6px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center" }}><div className="sh-eyebrow" style={{ fontSize: 9 }}>{["Mon", "Tue", "Wed", "Thu", "Fri"][i]}</div><div style={{ fontSize: 11, marginTop: 4, color: w === "Off" ? "var(--faint)" : "var(--ink)" }}>{w}</div></div>)}
          </div>
        </Section>
        {ob && <Section title="Onboarding"><Steps steps={ob.steps.map((x) => ({ label: x.label, note: x.note, state: x.state }))} /></Section>}
        <Section title="Activity"><Events s={s} match={(t) => t.includes(p.name)} /></Section>
      </>
    );
  } else if (type === "invoice") {
    const i = s.invoices.find((x) => x.id === id)!;
    const fam = familyById(i.family, s)!;
    const c = childById(i.child, s)!;
    const ap = s.approvals.find((a) => a.id === "ap-rem-" + id);
    eyebrow = "INVOICE · " + siteName(i.site).toUpperCase();
    title = i.number + " · " + euro(i.amount);
    chips = <><Chip tone="bad">{i.daysOverdue} days overdue</Chip><Chip tone={i.status === "reviewed" ? "ok" : i.status === "overdue" ? "neutral" : "gold"}>{i.status === "overdue" ? "Not yet reviewed" : i.status === "reminder-drafted" ? "Reminder awaiting approval" : i.status === "reminder-approved" ? "Reminder approved (simulated)" : "Reviewed, still unpaid"}</Chip></>;
    body = (
      <>
        <KV rows={[["Family", fam.name], ["Child", c.first + " " + c.last + ", " + roomById(c.room)?.name], ["Period", i.period], ["Issued", i.issued], ["Due", i.due]]} />
        <Section title="Statement (illustrative amounts)">
          <table className="sh-table"><tbody>{i.lines.map((l, k) => <tr key={k}><td>{l.label}</td><td className="r sh-faint">{l.qty}</td><td className="r sh-num strong">{euro(l.amount, l.amount % 1 ? 2 : 0)}</td></tr>)}<tr><td className="strong">Total due</td><td /><td className="r sh-num strong">{euro(i.amount)}</td></tr></tbody></table>
        </Section>
        <div className="sh-row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {i.status === "overdue" && <Btn size="sm" kind="primary" icon={IC.message} onClick={() => draftReminder(id)}>Draft respectful reminder</Btn>}
          {ap && ap.status === "pending" && <Btn size="sm" kind="primary" icon={IC.check} onClick={() => decide(ap.id, "approved")}>Approve reminder</Btn>}
          {i.status !== "reviewed" && <Btn size="sm" icon={IC.check} onClick={() => markInvoiceReviewed(id)}>Mark reviewed</Btn>}
        </div>
        {ap && <Section title="Reminder draft"><div className="sh-note accent" style={{ display: "block" }}>{ap.detail}</div><div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>Approver: {personName(ap.approver, s)} · {ap.status}. Nothing is sent from this demo.</div></Section>}
        <Section title="Connected records">
          <div className="sh-list">
            <Link type="family" id={fam.id} label={fam.name} sub={guardiansOf(fam.id, s).map((g) => g.name).join(", ")} />
            <Link type="child" id={c.id} label={c.first + " " + c.last} sub={c.pattern.join(", ") + " · " + c.funding} />
            <Link type="room" id={c.room} label={roomById(c.room)?.name + " room"} sub={siteName(c.site)} />
            <Link type="task" id="t-fees" label="Review 6 overdue invoices" sub="Deirdre Nagle" />
          </div>
        </Section>
      </>
    );
  } else if (type === "funding") {
    const f = s.funding.find((x) => x.id === id)!;
    const c = childById(f.child, s)!;
    eyebrow = f.scheme + " RECONCILIATION · " + siteName(f.site).toUpperCase();
    title = f.scheme + " mismatch · " + euro(f.amount);
    chips = <><Chip tone={f.status === "reviewed" ? "ok" : f.status === "assigned" ? "gold" : "warn"}>{f.status === "reviewed" ? "Reviewed by a person" : f.status === "assigned" ? "With " + personName(f.reviewer || "", s) : "Open"}</Chip><Chip tone="outline">Manual portal workflow</Chip></>;
    body = (
      <>
        <Note tone="warn" icon={IC.alert}>{f.issue}</Note>
        <div className="sh-grid sh-cols-2" style={{ marginTop: 12 }}>
          <div className="sh-card" style={{ padding: 14 }}><div className="sh-eyebrow">Acorn (system of record)</div><div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{f.acorn}</div></div>
          <div className="sh-card" style={{ padding: 14 }}><div className="sh-eyebrow">Scheme record (keyed by hand)</div><div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{f.portal}</div></div>
        </div>
        <KV rows={[["Child", c.first + " " + c.last], ["Booking", f.booking], ["Provenance", f.source]]} />
        <div className="sh-row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {f.status === "open" && <Btn size="sm" icon={IC.user} onClick={() => assignFunding(id, "s02")}>Assign to Deirdre Nagle</Btn>}
          {f.status !== "reviewed" && <Btn size="sm" kind="primary" icon={IC.check} onClick={() => markFundingReviewed(id)}>Mark reviewed</Btn>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 8 }}>No connection to the NCS or ECCE portals exists. Corrections are keyed by a person on the portal.</div>
        <Section title="Connected records">
          <div className="sh-list">
            <Link type="child" id={c.id} label={c.first + " " + c.last} sub={roomById(c.room)?.name + ", " + siteName(c.site)} />
            <Link type="family" id={c.family} label={familyById(c.family, s)?.name || ""} />
            <Link type="policy" id="pol-fees" label="Fees and Funding Policy v2.1" />
          </div>
        </Section>
      </>
    );
  } else if (type === "policy") {
    const p = policyById(id, s)!;
    const signers = p.requiresSignature && p.audience !== "Parents" ? s.staff : [];
    const signed = id === "pol-safesleep" ? s.staff.filter((x) => x.safeSleepSigned).length : signers.length;
    eyebrow = "POLICY · " + p.category.toUpperCase();
    title = p.title + " v" + p.version;
    chips = <><Chip tone={p.status === "Published" ? "ok" : "gold"}>{p.status}</Chip><Chip tone="outline">{p.audience}</Chip></>;
    body = (
      <>
        <KV rows={[["Owner", personName(p.owner, s)], ["Author", personName(p.author, s)], ["Effective", p.effective], ["Next review", p.nextReview], ["Applies to", p.appliesTo], ["Change summary", p.changeSummary]]} />
        {signers.length > 0 && <Section title={"Staff signatures · " + signed + " of " + signers.length}><Bar value={signed} max={signers.length} /></Section>}
        <Section title="Approved excerpt">{p.excerpt.map((e, k) => <div key={k} style={{ marginBottom: 10 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{e.heading}</div><div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.6, marginTop: 3 }}>{e.text}</div></div>)}</Section>
        <Section title="Sources">{p.sources.map((x) => <div key={x} style={{ fontSize: 12.5, color: "var(--dim)" }}>{x}</div>)}</Section>
        <div style={{ marginTop: 14 }}><Btn size="sm" icon={IC.arrow} onClick={() => navigate("Policies", id === "pol-safesleep" ? "versions" : "library")}>Open in Policies</Btn></div>
      </>
    );
  } else if (type === "room") {
    const r = roomById(id)!;
    const cnt = ROOM_COUNTS[id];
    const kids = s.children.filter((c) => c.room === id && c.attendingToday);
    const staffIn = s.staff.filter((x) => x.room === id);
    eyebrow = "ROOM · " + siteName(r.site).toUpperCase();
    title = r.name;
    chips = <><Chip tone="ok">{kids.filter((k) => k.checkedIn && !k.checkedOut).length} in</Chip><Chip tone="outline">{cnt.attending} expected · {cnt.booked} booked</Chip></>;
    body = (
      <>
        <KV rows={[["Ages", r.ages], ["Hours", r.hours], ["Room leader", personName(r.leader, s)], ["Tablet", r.tabletId + " (shared device, personal PIN sign-in)"], ["Planning places per day", r.placesPerDay + " (demo planning figure, not a ratio rule)"]]} />
        <Section title="Staff allocated">
          <div className="sh-list">{staffIn.map((x) => <Link key={x.id} type="staff" id={x.id} label={x.name} sub={x.status === "on" ? x.shift : x.statusNote} />)}</div>
        </Section>
        <Section title={"Children expected today · " + kids.length}>
          <div className="sh-row" style={{ flexWrap: "wrap", gap: 6 }}>
            {kids.map((k) => <button key={k.id} type="button" className="sh-chip outline" style={{ cursor: "pointer", font: "inherit", fontSize: 11 }} onClick={() => openDrawer("child", k.id)}>{k.first} {k.last.charAt(0)}.</button>)}
          </div>
        </Section>
      </>
    );
  } else if (type === "site") {
    const st = siteById(id as SiteId);
    const rooms = ROOMS.filter((r) => r.site === id);
    eyebrow = "REGISTERED SERVICE";
    title = st.full;
    chips = <><Chip tone="accent">Tusla {st.tusla}</Chip><Chip tone="outline">{st.capacityLabel}: {st.capacity}</Chip></>;
    body = (
      <>
        <KV rows={[["Address", st.address], ["Service", st.serviceType], ["Register contact", st.registryContact + " (public register)"], ["Manager", personName(st.manager, s)]]} />
        {st.extraRegistrations.map((x) => <Note key={x.ref}>{x.label}: {x.ref}. {x.note}</Note>)}
        <Section title="Rooms"><div className="sh-list">{rooms.map((r) => <Link key={r.id} type="room" id={r.id} label={r.name} sub={ROOM_COUNTS[r.id].attending + " expected today"} />)}</div></Section>
      </>
    );
  } else if (type === "task") {
    const t = s.tasks.find((x) => x.id === id)!;
    eyebrow = "TASK · " + (t.site === "both" ? "BOTH SITES" : siteName(t.site).toUpperCase());
    title = t.title;
    chips = <><Chip tone={t.status === "done" ? "ok" : t.status === "blocked" ? "bad" : t.status === "doing" ? "gold" : "neutral"}>{t.status === "done" ? "Done " + (t.doneAt || "") : t.status === "doing" ? "In progress" : t.status === "blocked" ? "Blocked" : "To do"}</Chip><Chip tone="outline">{t.priority}</Chip></>;
    body = (
      <>
        <KV rows={[["Owner", personName(t.owner, s)], ["Due", t.due], ["Recurring", t.recurring || "One-off"]]} />
        <Section title="Checklist">
          {t.checklist.map((c, k) => (
            <label key={k} className="sh-row" style={{ padding: "6px 0", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={c.done} onChange={() => toggleCheck(id, k)} style={{ accentColor: "var(--accent)" }} />
              <span style={{ color: c.done ? "var(--dim)" : "var(--ink)", textDecoration: c.done ? "line-through" : "none" }}>{c.label}</span>
            </label>
          ))}
        </Section>
        <div className="sh-row" style={{ gap: 8, marginTop: 12 }}>
          {t.status !== "done" ? <Btn size="sm" kind="primary" icon={IC.check} onClick={() => setTaskStatus(id, "done")}>Mark done</Btn> : <Btn size="sm" onClick={() => setTaskStatus(id, "todo")}>Reopen</Btn>}
        </div>
        {t.link && <Section title="Linked record"><Link type={t.link.type} id={t.link.id} label={"Open linked " + t.link.type} /></Section>}
      </>
    );
  } else if (type === "enquiry") {
    const e = s.enquiries.find((x) => x.id === id)!;
    const r = roomById(e.room)!;
    eyebrow = "ENQUIRY · " + siteName(e.site).toUpperCase();
    title = e.parent + " · " + e.child;
    chips = <Chip tone={e.status === "new" ? "warn" : "accent"}>{ENQUIRY_LABEL[e.status]}</Chip>;
    body = (
      <>
        <KV rows={[["Child", e.child + ", " + e.childAge], ["Programme", e.programme], ["Days", e.days.join(", ")], ["Start", e.start], ["Source", e.source + ", " + e.received], ["Owner", personName(e.owner, s)], ["Note", e.note]]} />
        <Section title={"Capacity check · " + r.name}>
          <div className="sh-grid" style={{ gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, k) => {
              const wants = e.days.includes(d); const booked = r.bookedByDay[k]; const full = booked >= r.placesPerDay;
              return <div key={d} style={{ padding: "8px 4px", borderRadius: 10, textAlign: "center", border: "1px solid " + (wants ? (full ? "var(--bad)" : "var(--accent-line)") : "var(--border)"), background: wants ? (full ? "var(--bad-soft)" : "var(--accent-faint)") : "var(--surface-2)" }}>
                <div className="sh-eyebrow" style={{ fontSize: 9 }}>{d}</div>
                <div className="sh-num" style={{ fontSize: 12, marginTop: 4 }}>{booked + (wants && !full ? 1 : 0)}/{r.placesPerDay}</div>
                <div style={{ fontSize: 9.5, color: full ? "var(--bad)" : "var(--faint)", marginTop: 2 }}>{full ? "Full" : wants ? "Fits" : ""}</div>
              </div>;
            })}
          </div>
        </Section>
        <Section title="Move along the pipeline">
          <div className="sh-row" style={{ gap: 6, flexWrap: "wrap" }}>
            {ENQUIRY_FLOW.map((st) => <Btn key={st} size="sm" kind={e.status === st ? "primary" : "secondary"} onClick={() => moveEnquiry(id, st)}>{ENQUIRY_LABEL[st]}</Btn>)}
          </div>
        </Section>
      </>
    );
  } else if (type === "approval") {
    const a = s.approvals.find((x) => x.id === id)!;
    eyebrow = "APPROVAL · " + a.kind.toUpperCase();
    title = a.title;
    chips = <Chip tone={a.status === "pending" ? "gold" : a.status === "approved" ? "ok" : "bad"}>{a.status}</Chip>;
    body = (
      <>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--body)" }}>{a.detail}</div>
        <KV rows={[["Requested by", a.requestedBy.startsWith("s") ? personName(a.requestedBy, s) : a.requestedBy + " (agent proposal)"], ["Approver", personName(a.approver, s)], ["Decided", a.decidedAt || "Not yet"]]} />
        {a.status === "pending" && <div className="sh-row" style={{ gap: 8, marginTop: 14 }}><Btn kind="primary" size="sm" icon={IC.check} onClick={() => decide(id, "approved")}>Approve</Btn><Btn size="sm" onClick={() => decide(id, "declined")}>Decline</Btn></div>}
        {a.link && <Section title="Linked record"><Link type={a.link.type} id={a.link.id} label={"Open linked " + a.link.type} /></Section>}
      </>
    );
  } else {
    body = <div style={{ fontSize: 13, color: "var(--dim)" }}>No detail view for this record type.</div>;
  }

  return (
    <div className="sh-drawer-scrim" onClick={closeDrawer}>
      <aside className="sh-drawer" onClick={(e) => e.stopPropagation()} aria-label="Record">
        <div style={{ flex: "none", padding: "20px 22px 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="sh-row" style={{ justifyContent: "space-between" }}>
            <span className="sh-eyebrow">{eyebrow}</span>
            <div className="sh-row" style={{ gap: 6 }}><DemoTag /><button type="button" className="sh-btn ghost sm" onClick={closeDrawer} aria-label="Close"><Icon d={IC.x} size={12} sw={2.2} /></button></div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.4px", marginTop: 8, lineHeight: 1.25 }}>{title}</div>
          {chips && <div className="sh-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>{chips}</div>}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 22px 28px" }}>{body}</div>
      </aside>
    </div>
  );
}
