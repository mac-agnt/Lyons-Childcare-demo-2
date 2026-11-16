/* Shournagh OS · Finance (owner and site managers).
   Overview, fee schedules, a simulated payments ledger, how NCS and ECCE are handled
   today, funding reconciliation (story C) and outstanding balances (story D).
   Every figure is computed from the demo store. Amounts are illustrative, not current
   prices. Nothing is sent to families and nothing is submitted to the NCS or ECCE portals. */
import { useState, type ReactNode } from "react";
import {
  useDemo, activeTab, effectiveSite, inSite, roleDef, metrics, childById, familyById, personName, euro, roomById,
  navigate, logEvent, toast, update, assignFunding, markFundingReviewed, decide, draftReminder, markInvoiceReviewed,
  type DemoState,
} from "../store";
import { FEE_SCHEDULE, ROOMS, SITES, siteName, dayLabel, TODAY_LABEL } from "../seed";
import type { Invoice, FundingItem, SiteId, SiteFilter } from "../types";
import {
  Page, PageHead, Grid, Card, Stat, Chip, DemoTag, SiteChip, Bar, Btn, Segmented, Table, Empty, KV, Note, RecordLink, Steps,
  Restricted, Icon, IC, type Col,
} from "../ui";
import "./finance.css";

type P = { s: DemoState; site: SiteFilter };

/* ── helpers ───────────────────────────────────────────────────────────────── */
const money = (n: number): string => (n < 0 ? "-" + money(-n) : euro(n, n % 1 ? 2 : 0));
const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0);
const scopeLabel = (site: SiteFilter) => (site === "all" ? "Both centres" : siteName(site));
const fullName = (s: DemoState, id: string) => { const c = childById(id, s); return c ? c.first + " " + c.last : id; };
const shortName = (s: DemoState, id: string) => { const c = childById(id, s); return c ? c.first + " " + c.last.charAt(0) + "." : id; };
const famName = (s: DemoState, id: string) => familyById(id, s)?.name || id;
const canApprove = (s: DemoState, approver: string) => s.role === "owner" || roleDef(s.role).personId === approver;
const reminderOf = (s: DemoState, invId: string) => s.approvals.find((a) => a.id === "ap-rem-" + invId);
const when = (d: number) => (d === 0 ? "Today" : d === 1 ? "Yesterday" : dayLabel(-d));
const BUCKETS = ["1 to 14 days", "15 to 30 days", "31 days or more"];
const bucketOf = (d: number) => (d <= 14 ? 0 : d <= 30 ? 1 : 2);
const reminderApprover = (site: SiteId) => (site === "elm" ? "s01" : "s18");

/* Cross-tab focus: a click on Overview opens the right item on the detail tab. */
let reconFocus = "fx-1";
let invFocus = "inv-2611";
const goRecon = (id: string) => { reconFocus = id; navigate("Finance", "reconciliation"); };
const goInvoice = (id: string) => { invFocus = id; navigate("Finance", "outstanding"); };

/* Store quirk guard: drafting, approving or declining a reminder rewrites the invoice
   status, which would undo a human review. Keep "reviewed" once a person has reviewed. */
function keepReviewed(i: Invoice, fn: () => void) {
  const was = i.status === "reviewed";
  fn();
  if (was) update("invoices", i.id, { status: "reviewed" });
}

/* ── simulated payments ledger (local, illustrative) ───────────────────────── */
interface Payment {
  id: string; ref: string; family: string; site: SiteId; amount: number;
  method: "Standing order" | "Card" | "Bank transfer"; daysAgo: number; status: "matched" | "part" | "unmatched"; note: string;
}
const matchedByHand = new Set<string>();
const ELM_AMTS = [478, 418, 239, 312.5, 164, 199, 108];
const BAL_AMTS = [135, 90, 112, 62.5, 48];
const METHODS: Payment["method"][] = ["Standing order", "Card", "Bank transfer"];
const DAYS_AGO = [0, 0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 6];
function buildPayments(s: DemoState): Payment[] {
  const owing = new Set(s.invoices.map((i) => i.family));
  const take = (site: SiteId, n: number) => s.families.filter((f) => f.site === site && f.children.length > 0 && !owing.has(f.id)).slice(0, n);
  const fams = take("elm", ELM_AMTS.length).map((f, k) => ({ f, amount: ELM_AMTS[k] }))
    .concat(take("bal", BAL_AMTS.length).map((f, k) => ({ f, amount: BAL_AMTS[k] })));
  return fams.map(({ f, amount }, k) => {
    const id = "pay-" + k;
    const base: Payment["status"] = k === 4 ? "part" : k === 9 ? "unmatched" : "matched";
    const byHand = base === "unmatched" && matchedByHand.has(id);
    return {
      id, family: f.id, site: f.site, amount, daysAgo: DAYS_AGO[k] ?? 6,
      ref: base === "unmatched" ? "No reference" : "INV-26" + (21 + k),
      method: base === "unmatched" ? "Bank transfer" : METHODS[k % 3],
      status: byHand ? "matched" : base,
      note: base === "part" ? "Part payment, balance carried to next statement" : base === "unmatched" ? (byHand ? "Matched by a person" : "Transfer arrived with no reference") : "Matched by reference and amount",
    };
  });
}

/* ── shared bits ───────────────────────────────────────────────────────────── */
function Head({ s, site, title, sub }: P & { title: string; sub: ReactNode }) {
  const locked = s.role === "manager-elm" || s.role === "manager-bal";
  return (
    <PageHead title={title} sub={sub} right={<>
      <Chip tone="outline">{locked && site !== "all" ? siteName(site) + " only" : scopeLabel(site)}</Chip>
      <DemoTag>DEMO DATA · ILLUSTRATIVE AMOUNTS</DemoTag>
    </>} />
  );
}
function DemoBanner({ children }: { children: ReactNode }) {
  return <div className="fin-banner" role="note"><span className="fin-banner-k">DEMO DATA</span><span>{children}</span></div>;
}
function FundChip({ s, f }: { s: DemoState; f: FundingItem }) {
  if (f.status === "reviewed") return <Chip tone="ok">Reviewed, {personName(f.reviewer || "s02", s).split(" ")[0]}</Chip>;
  if (f.status === "assigned") return <Chip tone="gold">With {personName(f.reviewer || "", s)}</Chip>;
  return <Chip tone="warn">Open, no reviewer</Chip>;
}
function ReviewChip({ i }: { i: Invoice }) {
  return i.status === "reviewed" ? <Chip tone="ok">Reviewed</Chip> : <Chip tone="neutral">Awaiting review</Chip>;
}
function ReminderChip({ s, i }: { s: DemoState; i: Invoice }) {
  const ap = reminderOf(s, i.id);
  if (!ap) return <Chip tone="outline">No reminder</Chip>;
  if (ap.status === "pending") return <Chip tone="gold">Reminder awaiting approval</Chip>;
  if (ap.status === "approved") return <Chip tone="accent">Reminder approved, simulated</Chip>;
  return <Chip tone="outline">Reminder declined</Chip>;
}
function MoneyBars({ rows, max }: { rows: { label: ReactNode; value: number; note?: string }[]; max?: number }) {
  const m = max || Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="fin-bars">
      {rows.map((r, k) => (
        <div className="row" key={k}>
          <span className="sh-trunc" style={{ color: "var(--body)" }}>{r.label}{r.note && <span className="sh-faint"> · {r.note}</span>}</span>
          <span className="sh-num strong">{money(r.value)}</span>
          <Bar value={Math.abs(r.value)} max={m} tone={r.value < 0 ? "ok" : "accent"} />
        </div>
      ))}
    </div>
  );
}

/* ── page ──────────────────────────────────────────────────────────────────── */
export default function Finance() {
  const s = useDemo();
  const site = effectiveSite(s);
  const tab = activeTab("Finance", s);
  if (!roleDef(s.role).pages.includes("Finance")) {
    return <Page><PageHead title="Finance" right={<DemoTag />} /><Restricted what="Finance" /></Page>;
  }
  return (
    <Page>
      <div className="fin">
        {tab === "overview" && <Overview s={s} site={site} />}
        {tab === "fees" && <Fees s={s} site={site} />}
        {tab === "payments" && <Payments s={s} site={site} />}
        {tab === "schemes" && <Schemes s={s} site={site} />}
        {tab === "reconciliation" && <Reconciliation s={s} site={site} />}
        {tab === "outstanding" && <Outstanding s={s} site={site} />}
      </div>
    </Page>
  );
}

/* ── Overview ──────────────────────────────────────────────────────────────── */
function Overview({ s, site }: P) {
  const m = metrics(s, site);
  const inv = s.invoices.filter((i) => inSite(site, i.site));
  const fund = s.funding.filter((f) => inSite(site, f.site));
  const pays = buildPayments(s).filter((p) => inSite(site, p.site)).sort((a, b) => a.daysAgo - b.daysAgo);
  const received = sum(pays.map((p) => p.amount));
  const byAge = inv.slice().sort((a, b) => b.daysOverdue - a.daysOverdue);
  const oldest = byAge[0];
  const newest = byAge[byAge.length - 1];
  const dueRange = oldest ? "Due " + oldest.due + " to " + newest.due : "None due";
  const notReviewed = inv.filter((i) => i.status !== "reviewed");
  const remPending = inv.filter((i) => reminderOf(s, i.id)?.status === "pending");
  const sites = SITES.filter((x) => inSite(site, x.id));
  const cell = (st: SiteId | null, b: number | null) => {
    const rows = inv.filter((i) => (st === null || i.site === st) && (b === null || bucketOf(i.daysOverdue) === b));
    return { n: rows.length, total: sum(rows.map((i) => i.amount)) };
  };
  const MCell = ({ n, total, strong }: { n: number; total: number; strong?: boolean }) => (
    <td className="r">
      <span className="sh-num" style={{ color: n ? "var(--ink)" : "var(--faint)", fontWeight: strong ? 600 : 500 }}>{euro(total)}</span>
      <span className="fin-s">{n} {n === 1 ? "invoice" : "invoices"}</span>
    </td>
  );

  type Row = { id: string; item: string; amount: number; count: string; period: string; state: ReactNode; go: () => void };
  const rows: Row[] = [
    { id: "od", item: "Overdue fees", amount: m.overdueTotal, count: m.overdueCount + " invoices", period: dueRange, state: <Chip tone="bad">Unpaid</Chip>, go: () => navigate("Finance", "outstanding") },
    { id: "rv", item: "Of which not yet reviewed", amount: sum(notReviewed.map((i) => i.amount)), count: notReviewed.length + " invoices", period: dueRange, state: <Chip tone="neutral">Needs a person</Chip>, go: () => navigate("Finance", "outstanding") },
    { id: "rm", item: "Reminders awaiting approval", amount: sum(remPending.map((i) => i.amount)), count: remPending.length + " drafts", period: "Drafted today", state: <Chip tone="gold">Nothing sent</Chip>, go: () => navigate("Work", "approvals") },
    { id: "fx", item: "NCS/ECCE mismatches open", amount: m.fundingOpenTotal, count: m.fundingOpen + " of " + m.fundingCount + " items", period: "Current term, Sep to Dec", state: <Chip tone="warn">Held for human review</Chip>, go: () => navigate("Finance", "reconciliation") },
    { id: "py", item: "Payments received", amount: received, count: pays.length + " payments", period: "Last 7 days to " + TODAY_LABEL, state: <Chip tone="outline">Simulated</Chip>, go: () => navigate("Finance", "payments") },
  ];
  const cols: Col<Row>[] = [
    { key: "i", label: "Position", render: (r) => <span className="strong">{r.item}</span> },
    { key: "a", label: "Amount (EUR)", align: "r", render: (r) => <span className="sh-num strong">{money(r.amount)}</span> },
    { key: "c", label: "Count", render: (r) => <span className="sh-num">{r.count}</span> },
    { key: "p", label: "Period", render: (r) => <span className="sh-muted">{r.period}</span> },
    { key: "s", label: "State", render: (r) => r.state },
  ];

  const xFees = s.exceptions.find((e) => e.id === "x-fees");
  const xFund = s.exceptions.find((e) => e.id === "x-funding");
  const edelFinance = s.approvals.filter((a) => a.status === "pending" && a.approver === "edel" && (a.kind === "Finance" || a.kind === "Parent reminder")).length;

  return (
    <>
      <Head s={s} site={site} title="Finance" sub={"Where the money stands at " + scopeLabel(site).toLowerCase() + " today, " + TODAY_LABEL + ". Each figure shows its period and unit."} />
      <DemoBanner>Fees, invoices and payments on these pages are illustrative examples for the demo. They are not Shournagh Childcare's current prices.</DemoBanner>
      <Grid cols={4}>
        <Stat label="Overdue fees" value={euro(m.overdueTotal)} tone={m.overdueCount ? "bad" : "ok"} onClick={() => navigate("Finance", "outstanding")}
          sub={m.overdueCount + " invoices past due, oldest " + (oldest ? oldest.daysOverdue : 0) + " days, as at " + TODAY_LABEL} />
        <Stat label="Funding exceptions open" value={euro(m.fundingOpenTotal)} tone={m.fundingOpen ? "warn" : "ok"} onClick={() => navigate("Finance", "reconciliation")}
          sub={m.fundingOpen + " of " + m.fundingCount + " NCS/ECCE items, current term, " + euro(m.fundingTotal) + " in all"} />
        <Stat label="Payments received (simulated)" value={money(received)} onClick={() => navigate("Finance", "payments")}
          sub={pays.length + " payments, last 7 days"} />
        <Stat label="Overdue invoices awaiting review" value={m.overdueToReview + " of " + m.overdueCount} onClick={() => navigate("Finance", "outstanding")}
          sub="Reviewed means checked by a person, not paid" />
      </Grid>

      <Grid cols="main" style={{ marginTop: 12 }}>
        <Card title="Money position" sub="Plain figures with their period. No targets, no projections." pad={false}>
          <Table cols={cols} rows={rows} rowKey={(r) => r.id} onRow={(r) => r.go()} />
        </Card>
        <Card title="Billing cadence" sub="Demo assumption, to confirm with Deirdre Nagle">
          <Steps steps={[
            { label: "Bookings live in Acorn Cloud", note: "System of record for days booked. Not re-keyed here.", state: "done" },
            { label: "Invoices issued fortnightly in arrears", note: "Built from the Acorn booking export: days, extras, subsidies.", state: "done" },
            { label: "Due 14 days after issue", note: "Same terms at both centres.", state: "done" },
            { label: "Billing check, each morning at 09:05", note: inv.length + " invoices past due today, " + euro(m.overdueTotal) + ".", state: "done" },
            { label: "Reminder drafted, a manager approves", note: remPending.length ? remPending.length + " awaiting approval. Nothing reaches a family until a person approves." : "Nothing reaches a family until a person approves.", state: remPending.length ? "current" : "todo" },
            { label: "Payment recorded, invoice closed", note: "Only a recorded payment clears an invoice. Review does not.", state: "todo" },
          ]} />
        </Card>
      </Grid>

      <Grid cols={2} style={{ marginTop: 12 }}>
        <Card title="Overdue fees by centre and age" sub={"Euro and number of invoices, by days past due date, as at " + TODAY_LABEL} pad={false}>
          {inv.length ? (
            <div className="sh-scroll-x">
              <table className="sh-table fin-matrix">
                <thead><tr><th>Centre</th>{BUCKETS.map((b) => <th key={b} className="r">{b}</th>)}<th className="r">Total</th></tr></thead>
                <tbody>
                  {sites.map((st) => (
                    <tr key={st.id}>
                      <td className="strong">{st.name}</td>
                      {BUCKETS.map((_, b) => <MCell key={b} {...cell(st.id, b)} />)}
                      <MCell {...cell(st.id, null)} strong />
                    </tr>
                  ))}
                  {sites.length > 1 && (
                    <tr className="tot">
                      <td className="strong">Both centres</td>
                      {BUCKETS.map((_, b) => <MCell key={b} {...cell(null, b)} />)}
                      <MCell {...cell(null, null)} strong />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No overdue invoices" />}
        </Card>
        <Card title="Funding exceptions" sub={fund.length + " NCS/ECCE items where Acorn and the scheme record disagree, " + euro(sum(fund.map((f) => f.amount))) + " in question"}>
          {fund.length ? (
            <div className="sh-list">
              {fund.map((f) => (
                <button key={f.id} type="button" className="sh-item click fin-rowbtn" onClick={() => goRecon(f.id)}>
                  <Chip tone="outline">{f.scheme}</Chip>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="fin-t sh-trunc">{fullName(s, f.child)}, {roomById(childById(f.child, s)?.room || "")?.name}</span>
                    <span className="fin-s sh-trunc">{f.issue}</span>
                  </span>
                  <span className="sh-num strong">{euro(f.amount)}</span>
                  <FundChip s={s} f={f} />
                </button>
              ))}
            </div>
          ) : <Empty title="No funding exceptions at this centre" />}
          <div className="fin-cap">Nothing is submitted to the NCS or ECCE portals from Shournagh OS. A person keys every correction.</div>
        </Card>
      </Grid>

      <Grid cols="main" style={{ marginTop: 12 }}>
        <Card title="Payments, last 7 days" sub="Simulated ledger. Card, bank transfer and standing order." right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("Finance", "payments")}>All payments</Btn>}>
          <div className="sh-list">
            {pays.slice(0, 5).map((p) => (
              <div key={p.id} className="sh-item">
                <span className="sh-num sh-faint" style={{ width: 72, flex: "none", fontSize: 12 }}>{when(p.daysAgo)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <RecordLink type="family" id={p.family}>{famName(s, p.family)}</RecordLink>
                  <span className="fin-s">{p.method}, {p.ref}</span>
                </span>
                <span className="sh-num strong">{money(p.amount)}</span>
                <Chip tone={p.status === "unmatched" ? "warn" : p.status === "part" ? "gold" : "ok"}>{p.status === "unmatched" ? "Needs a person" : p.status === "part" ? "Part payment" : "Matched"}</Chip>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Who owns it" sub="Accountability without Edel chasing">
          <div className="sh-list">
            <div className="sh-item">
              <span style={{ flex: 1 }}><span className="fin-t">Overdue fees</span><span className="fin-s">Review and reminders</span></span>
              <span className="fin-t">{xFees ? personName(xFees.owner, s) : "Deirdre Nagle"}</span>
              {xFees && <Chip tone={xFees.status === "resolved" ? "ok" : "accent"}>{xFees.status === "resolved" ? "All reviewed" : "Assigned"}</Chip>}
            </div>
            <div className="sh-item">
              <span style={{ flex: 1 }}><span className="fin-t">NCS/ECCE mismatches</span><span className="fin-s">Human review, portal keyed by hand</span></span>
              <span className="fin-t">{xFund ? personName(xFund.owner, s) : "Deirdre Nagle"}</span>
              {xFund && <Chip tone={xFund.status === "resolved" ? "ok" : "accent"}>{xFund.status === "resolved" ? "All reviewed" : "Assigned"}</Chip>}
            </div>
            <div className="sh-item">
              <span style={{ flex: 1 }}><span className="fin-t">Reminder approvals</span><span className="fin-s">Each centre approves its own</span></span>
              <span className="fin-t" style={{ textAlign: "right" }}>{site !== "bal" && "Gráinne Twomey"}{site === "all" && <br />}{site !== "elm" && "Siobhán Barry"}</span>
            </div>
            <div className="sh-item">
              <span style={{ flex: 1 }}><span className="fin-t">Edel Lyons</span><span className="fin-s">Sees exceptions only</span></span>
              <Chip tone={edelFinance ? "gold" : "ok"}>{edelFinance ? edelFinance + " finance approval for you" : "Nothing needs you here"}</Chip>
            </div>
          </div>
        </Card>
      </Grid>
    </>
  );
}

/* ── Fees & Invoices ───────────────────────────────────────────────────────── */
function feeUnit(label: string, fee: number) {
  if (fee === 0) return "Funded, no charge";
  if (/per day/i.test(label)) return "per day";
  if (/hour/i.test(label)) return "per hour";
  return "per week";
}
function perDay(label: string, fee: number) {
  const m = /^(\d) days$/.exec(label);
  return m ? euro(fee / Number(m[1]), 2) : "";
}
function serviceOf(label: string, amount: number) {
  if (amount < 0) return "Subsidies and deductions";
  if (/brought forward/i.test(label)) return "Balance brought forward";
  if (/Full day care|Additional day/i.test(label)) return "Full day care and extra days";
  if (/After-school|camp/i.test(label)) return "After-school and camps";
  if (/ECCE wrap|Lunch club/i.test(label)) return "ECCE wrap-around and lunch club";
  return "Extras: late collection, holiday days, outings";
}
function Fees({ s, site }: P) {
  const inv = s.invoices.filter((i) => inSite(site, i.site));
  const rooms = ROOMS.filter((r) => inSite(site, r.site));
  const lines = inv.flatMap((i) => i.lines.map((l) => ({ ...l, inv: i })));
  const services = Array.from(new Set(lines.map((l) => serviceOf(l.label, l.amount))))
    .map((k) => ({ label: k, value: sum(lines.filter((l) => serviceOf(l.label, l.amount) === k).map((l) => l.amount)) }))
    .sort((a, b) => b.value - a.value);
  const periods = Array.from(new Set(inv.map((i) => i.period)))
    .map((p) => ({ period: p, rows: inv.filter((i) => i.period === p) }));
  const subsidyLines = lines.filter((l) => /NCS subsidy/i.test(l.label));
  const ecceLines = lines.filter((l) => /ECCE hours/i.test(l.label));

  type RoomRow = { id: string; name: string; site: SiteId; booked: number; ecce: boolean; ncs: number; eccek: number };
  const roomRows: RoomRow[] = rooms.map((r) => {
    const kids = s.children.filter((c) => c.room === r.id);
    return { id: r.id, name: r.name, site: r.site, booked: sum(r.bookedByDay), ecce: r.programme === "ecce", ncs: kids.filter((c) => c.funding.includes("NCS")).length, eccek: kids.filter((c) => c.funding.includes("ECCE")).length };
  });
  const roomCols: Col<RoomRow>[] = [
    { key: "r", label: "Room", render: (r) => <RecordLink type="room" id={r.id}>{r.name}</RecordLink> },
    { key: "s", label: "Centre", render: (r) => siteName(r.site) },
    { key: "b", label: "Booked child-days", align: "r", render: (r) => <span className="sh-num strong">{r.booked}</span> },
    { key: "c", label: "Charged child-days", align: "r", render: (r) => <span className="sh-num">{r.ecce ? "0 core" : r.booked}</span> },
    { key: "f", label: "Scheme support", render: (r) => <span className="sh-muted">{[r.ncs ? r.ncs + " on NCS" : "", r.eccek ? r.eccek + " on ECCE" : ""].filter(Boolean).join(", ") || "Private only"}</span> },
    { key: "k", label: "Check", render: (r) => (r.ecce ? <Chip tone="accent">Core sessions funded</Chip> : <Chip tone="ok">Matches Acorn</Chip>) },
  ];
  const invCols: Col<Invoice>[] = [
    { key: "n", label: "Invoice", render: (i) => <span className="strong">{i.number}</span> },
    { key: "f", label: "Family", render: (i) => famName(s, i.family) },
    { key: "c", label: "Child", render: (i) => shortName(s, i.child) },
    { key: "s", label: "Centre", render: (i) => <SiteChip site={i.site} /> },
    { key: "p", label: "Period", render: (i) => <span className="sh-muted">{i.period}</span> },
    { key: "a", label: "Amount", align: "r", render: (i) => <span className="sh-num strong">{euro(i.amount)}</span> },
    { key: "d", label: "Days overdue", align: "r", render: (i) => <span className="sh-num">{i.daysOverdue}</span> },
    { key: "r", label: "Reminder", render: (i) => <ReminderChip s={s} i={i} /> },
  ];

  return (
    <>
      <Head s={s} site={site} title="Fees and invoices" sub="Fee schedules by programme, booked days against charged days, and how the overdue invoices break down." />
      <DemoBanner>Fee examples below are illustrative for the demo. They are not current prices and may change.</DemoBanner>

      <Grid cols={2}>
        {FEE_SCHEDULE.map((p) => (
          <Card key={p.programme} title={p.programme} sub="Illustrative fee example, may change" right={<Chip tone="outline">Example</Chip>} pad={false}>
            <table className="sh-table fin-fee">
              <thead><tr><th>Booking pattern</th><th className="r">Fee</th><th>Unit</th><th className="r">Per day</th></tr></thead>
              <tbody>
                {p.rows.map(([label, fee]) => (
                  <tr key={label}>
                    <td className="strong">{label}</td>
                    <td className="r sh-num strong">{fee === 0 ? "€0" : euro(fee)}</td>
                    <td className="sh-muted">{feeUnit(label, fee)}</td>
                    <td className="r sh-num sh-muted">{perDay(label, fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </Grid>

      <Grid cols="main" style={{ marginTop: 12 }}>
        <Card title="Booked days against charged days" sub="Child-days this week, Mon to Fri. Charged days come from the Acorn booking export, so nothing is keyed twice." pad={false}>
          <Table cols={roomCols} rows={roomRows} rowKey={(r) => r.id} />
          <div className="fin-cap" style={{ padding: "0 18px 16px" }}>
            {sum(roomRows.map((r) => r.booked))} booked child-days in {roomRows.length} rooms. ECCE core sessions are state-funded; wrap-around hours and lunch club are billed separately.
          </div>
        </Card>
        <Card title="Discounts and subsidies" sub="Placeholders until Edel sets the rules">
          <div className="sh-list">
            <div className="sh-item"><span style={{ flex: 1 }}><span className="fin-t">NCS subsidy</span><span className="fin-s">Per child award, taken from the NCS record keyed by hand. On {subsidyLines.length} overdue invoices, {money(-sum(subsidyLines.map((l) => l.amount)))}.</span></span><Chip tone="accent">On invoice</Chip></div>
            <div className="sh-item"><span style={{ flex: 1 }}><span className="fin-t">ECCE</span><span className="fin-s">Core 3-hour session not charged, 38 weeks. ECCE hours deducted on {ecceLines.length} overdue invoice{ecceLines.length === 1 ? "" : "s"}.</span></span><Chip tone="accent">Funded</Chip></div>
            <div className="sh-item"><span style={{ flex: 1 }}><span className="fin-t">Sibling discount</span><span className="fin-s">Rate to be set by Edel</span></span><Chip tone="outline">Placeholder</Chip></div>
            <div className="sh-item"><span style={{ flex: 1 }}><span className="fin-t">Payment plan</span><span className="fin-s">Agreed case by case by a centre manager</span></span><Chip tone="outline">Placeholder</Chip></div>
            <div className="sh-item"><span style={{ flex: 1 }}><span className="fin-t">Early payment</span><span className="fin-s">Not offered in the demo</span></span><Chip tone="outline">Placeholder</Chip></div>
          </div>
        </Card>
      </Grid>

      <Grid cols={2} style={{ marginTop: 12 }}>
        <Card title="Overdue invoices by service" sub={"Statement lines across " + inv.length + " overdue invoices, euro. Subsidies shown as deductions."}>
          {services.length ? <MoneyBars rows={services} /> : <Empty title="No overdue invoices" />}
          <div className="fin-cap">Lines add up to {euro(sum(inv.map((i) => i.amount)))}, the overdue total.</div>
        </Card>
        <Card title="Overdue invoices by billing period" sub="Fortnightly or multi-week periods, as invoiced" pad={false}>
          {periods.length ? (
            <table className="sh-table">
              <thead><tr><th>Period</th><th>Invoices</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.period}>
                    <td className="strong">{p.period}</td>
                    <td>{p.rows.map((i, k) => <span key={i.id}>{k > 0 && ", "}<RecordLink type="invoice" id={i.id}>{i.number}</RecordLink></span>)}</td>
                    <td className="r sh-num strong">{euro(sum(p.rows.map((i) => i.amount)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty title="No overdue invoices" />}
        </Card>
      </Grid>

      <Card title="Overdue invoices" sub="Open any row for the statement, linked child and family" style={{ marginTop: 12 }} pad={false}
        right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("Finance", "outstanding")}>Work the queue</Btn>}>
        <Table cols={invCols} rows={inv} rowKey={(i) => i.id} onRow={(i) => goInvoice(i.id)} empty="No overdue invoices at this centre" />
      </Card>
    </>
  );
}

/* ── Payments ──────────────────────────────────────────────────────────────── */
function Payments({ s, site }: P) {
  const [, setTick] = useState(0);
  const pays = buildPayments(s).filter((p) => inSite(site, p.site)).sort((a, b) => a.daysAgo - b.daysAgo);
  const inv = s.invoices.filter((i) => inSite(site, i.site));
  const total = sum(pays.map((p) => p.amount));
  const auto = pays.filter((p) => p.status !== "unmatched" && !matchedByHand.has(p.id));
  const open = pays.filter((p) => p.status === "unmatched");
  const paidOverdue = inv.filter((i) => pays.some((p) => p.ref === i.number)).length;
  const methods = (["Standing order", "Card", "Bank transfer"] as const).map((mt) => {
    const rows = pays.filter((p) => p.method === mt);
    return { label: mt, value: sum(rows.map((p) => p.amount)), note: rows.length + " payments" };
  });
  const match = (p: Payment) => {
    matchedByHand.add(p.id);
    logEvent({ actor: roleDef(s.role).person, actorKind: "person", action: "matched payment by hand (simulated)", target: money(p.amount) + " bank transfer, " + famName(s, p.family), kind: "people", site: p.site, story: null });
    toast("Matched to the " + famName(s, p.family) + " account (simulated). No overdue invoice changed.");
    setTick((n) => n + 1);
  };
  const cols: Col<Payment>[] = [
    { key: "d", label: "Date", render: (p) => <span className="sh-num">{when(p.daysAgo)}</span> },
    { key: "f", label: "Family", render: (p) => <><RecordLink type="family" id={p.family}>{famName(s, p.family)}</RecordLink><span className="fin-s">{siteName(p.site)}</span></> },
    { key: "r", label: "Reference", render: (p) => <span className="sh-num">{p.ref}</span> },
    { key: "m", label: "Method", render: (p) => p.method },
    { key: "a", label: "Amount", align: "r", render: (p) => <span className="sh-num strong">{money(p.amount)}</span> },
    { key: "s", label: "Matching", render: (p) => <><Chip tone={p.status === "unmatched" ? "warn" : p.status === "part" ? "gold" : "ok"}>{p.status === "unmatched" ? "Needs a person" : p.status === "part" ? "Part payment" : "Matched"}</Chip><span className="fin-s">{p.note}</span></> },
    { key: "x", label: "", render: (p) => (p.status === "unmatched" ? <Btn size="sm" icon={IC.link} onClick={() => match(p)}>Match to {famName(s, p.family).replace(" family", "")}</Btn> : <Chip tone="outline">Simulated</Chip>) },
  ];

  return (
    <>
      <Head s={s} site={site} title="Payments" sub="Recent payments against family accounts, and how each was matched. Only a person can match an unclear payment." />
      <DemoBanner>Simulated ledger. These card, bank transfer and standing order payments are not real transactions.</DemoBanner>
      <Grid cols={4}>
        <Stat label="Received, last 7 days" value={money(total)} sub={pays.length + " payments, simulated"} />
        <Stat label="Matched automatically" value={auto.length + " of " + pays.length} sub="By invoice reference and amount" tone="ok" />
        <Stat label="Needs a person" value={String(open.length)} tone={open.length ? "warn" : "ok"} sub={open.length ? "No reference on the transfer" : "Nothing waiting"} />
        <Stat label="Overdue invoices paid" value={paidOverdue + " of " + inv.length} tone={inv.length ? "bad" : "ok"} sub={"No payment received, " + euro(sum(inv.map((i) => i.amount))) + " still overdue"} onClick={() => navigate("Finance", "outstanding")} />
      </Grid>

      <Grid cols="main" style={{ marginTop: 12 }}>
        <Card title="Payments ledger" sub={"Last 7 days to " + TODAY_LABEL + ", newest first"} pad={false}>
          <Table cols={cols} rows={pays} rowKey={(p) => p.id} empty="No payments in the last 7 days" />
        </Card>
        <div className="sh-stack">
          <Card title="By method" sub="Euro received, last 7 days">
            <MoneyBars rows={methods} />
          </Card>
          <Card title="How matching works">
            <Steps steps={[
              { label: "Card processor and bank export", note: "Imported each morning (simulated in the demo).", state: "done" },
              { label: "Matched by reference and amount", note: auto.length + " matched without anyone keying them.", state: "done" },
              { label: "Anything unclear goes to a person", note: open.length ? open.length + " waiting for a person to match." : "Nothing waiting.", state: open.length ? "current" : "done" },
              { label: "Overdue invoices close only on a recorded payment", note: "Review or reminders never mark an invoice paid.", state: "todo" },
            ]} />
          </Card>
        </div>
      </Grid>

      <Card title="Overdue invoices: no payment received" sub="These stay unpaid. Nothing on this page marks them paid." style={{ marginTop: 12 }}>
        {inv.length ? (
          <div className="sh-list">
            {inv.map((i) => (
              <div key={i.id} className="sh-item">
                <RecordLink type="invoice" id={i.id}>{i.number}</RecordLink>
                <span className="sh-trunc" style={{ flex: 1, fontSize: 13 }}>{famName(s, i.family)}, {i.period}</span>
                <span className="sh-num strong">{euro(i.amount)}</span>
                <Chip tone="bad">No payment received</Chip>
              </div>
            ))}
          </div>
        ) : <Empty title="No overdue invoices at this centre" />}
      </Card>
    </>
  );
}

/* ── NCS & ECCE ────────────────────────────────────────────────────────────── */
function Schemes({ s, site }: P) {
  const m = metrics(s, site);
  const fund = s.funding.filter((f) => inSite(site, f.site));
  const reviewed = fund.filter((f) => f.status === "reviewed").length;
  const allDone = fund.length > 0 && reviewed === fund.length;
  const sites = SITES.filter((x) => inSite(site, x.id));
  const counts = (st: SiteId | null) => {
    const kids = s.children.filter((c) => (st === null ? inSite(site, c.site) : c.site === st));
    const n = (f: string) => kids.filter((c) => c.funding === f).length;
    return { total: kids.length, ncs: n("NCS"), ecce: n("ECCE"), both: n("ECCE + NCS"), priv: n("Private") };
  };
  const Row = ({ label, c, strong }: { label: string; c: ReturnType<typeof counts>; strong?: boolean }) => (
    <tr className={strong ? "tot" : ""}>
      <td className="strong">{label}</td>
      <td className="r sh-num">{c.ncs}</td>
      <td className="r sh-num">{c.ecce}</td>
      <td className="r sh-num">{c.both}</td>
      <td className="r sh-num">{c.priv}</td>
      <td className="r sh-num strong">{c.total}</td>
      <td className="r sh-num strong">{c.ncs + c.both}</td>
      <td className="r sh-num strong">{c.ecce + c.both}</td>
    </tr>
  );

  return (
    <>
      <Head s={s} site={site} title="NCS and ECCE" sub="How the schemes are handled today: bookings in Acorn Cloud, scheme records on the portals, a person in between." />
      <Card title="Where scheme data lives" right={<><Chip tone="warn">No live API</Chip><Chip tone="outline">Manual review and import</Chip></>}>
        <div className="fin-flow">
          <div className="fin-pane">
            <div className="h">Acorn Cloud</div>
            <div className="v">System of record</div>
            <p>Bookings, attendance and hours for every child. Exported each night.</p>
            <div><Chip tone="ok">Existing system</Chip></div>
          </div>
          <div className="arr"><Icon d={IC.arrow} size={18} /></div>
          <div className="fin-pane accent">
            <div className="h">Shournagh OS</div>
            <div className="v">Compare and queue</div>
            <p>Compares the Acorn export with a manual import of the scheme records, queues each mismatch and records who checked it.</p>
            <div><Chip tone="accent">Read-only comparison</Chip></div>
          </div>
          <div className="arr"><Icon d={IC.arrow} size={18} /></div>
          <div className="fin-pane">
            <div className="h">NCS and ECCE portals</div>
            <div className="v">Early Years Hive</div>
            <p>Registrations and claims. A separate system, keyed by hand by Deirdre Nagle. Shournagh OS never writes to it.</p>
            <div><Chip tone="warn">Keyed by hand</Chip></div>
          </div>
        </div>
      </Card>

      <Grid cols="main" style={{ marginTop: 12 }}>
        <Card title="Children by scheme" sub="Booked children, computed from each child's funding on the Acorn record" pad={false}>
          <div className="sh-scroll-x">
            <table className="sh-table fin-matrix">
              <thead><tr><th>Centre</th><th className="r">NCS only</th><th className="r">ECCE only</th><th className="r">ECCE and NCS</th><th className="r">Private</th><th className="r">Booked</th><th className="r">Any NCS</th><th className="r">Any ECCE</th></tr></thead>
              <tbody>
                {sites.map((st) => <Row key={st.id} label={st.name} c={counts(st.id)} />)}
                {sites.length > 1 && <Row label="Both centres" c={counts(null)} strong />}
              </tbody>
            </table>
          </div>
          <div className="fin-cap" style={{ padding: "0 18px 16px" }}>Ballyneety school-age children are counted under their own registration (TU2021CC067SA), never added to the 55 sessional places.</div>
        </Card>
        <Card title="Monthly check: manual review workflow" sub="Planned steps. Each correction is made by a person on the portal." right={<Btn size="sm" kind="ghost" icon={IC.arrow} onClick={() => navigate("Finance", "reconciliation")}>Open</Btn>}>
          <Steps steps={[
            { label: "Acorn export", note: "Nightly export compared at 09:12 today, " + m.booked + " bookings.", state: "done" },
            { label: "Compare with scheme records", note: "Scheme records imported by hand, no live connection. " + fund.length + " mismatches, " + euro(sum(fund.map((f) => f.amount))) + ".", state: "done" },
            { label: "A person corrects the portal", note: reviewed + " of " + fund.length + " reviewed. Deirdre Nagle keys each change on the portal.", state: allDone ? "done" : "current" },
            { label: "Evidence attached", note: "Portal reference or screenshot saved to the item, then closed.", state: allDone ? "current" : "todo" },
          ]} />
        </Card>
      </Grid>

      <Note icon={IC.clock}>
        The comparison is ready each morning, so the monthly check starts from a short list of {fund.length} mismatches instead of {m.booked} bookings. Rules come from the <RecordLink type="policy" id="pol-fees">Fees and Funding Policy v2.1</RecordLink>. Shournagh OS does not hold scheme approval or make claims.
      </Note>
    </>
  );
}

/* ── Reconciliation (story C) ──────────────────────────────────────────────── */
function Reconciliation({ s, site }: P) {
  const m = metrics(s, site);
  const fund = s.funding.filter((f) => inSite(site, f.site));
  const [sel, setSel] = useState(reconFocus);
  const cur = fund.find((f) => f.id === sel) || fund[0];
  const pending = fund.filter((f) => f.status !== "reviewed");
  const reviewed = fund.filter((f) => f.status === "reviewed");
  const matched = m.booked - m.fundingCount;
  const exKids = new Set(s.funding.map((f) => f.child));
  const sample = s.children.filter((c) => inSite(site, c.site) && c.funding !== "Private" && !exKids.has(c.id)).slice(0, 8);
  const pick = (id: string) => { reconFocus = id; setSel(id); };

  return (
    <>
      <Head s={s} site={site} title="Reconciliation" sub={"Acorn bookings compared with scheme records keyed by hand. " + euro(m.fundingOpenTotal) + " across " + m.fundingOpen + " items still needs a person."} />
      <Grid cols={4}>
        <Stat label="Bookings matched" value={String(matched)} tone="ok" sub={"Of " + m.booked + " booked: Acorn and scheme record agree, or private"} />
        <Stat label="Pending review" value={String(pending.length)} tone={pending.length ? "warn" : "ok"} sub={euro(sum(pending.map((f) => f.amount))) + ", open or with a reviewer"} />
        <Stat label="Reviewed, portal change by hand" value={String(reviewed.length)} sub={euro(sum(reviewed.map((f) => f.amount))) + ", a person keys it on the portal"} />
        <Stat label="Value in question" value={euro(m.fundingTotal)} sub={m.fundingCount + " items, current term"} />
      </Grid>
      <Note tone="warn" icon={IC.lock}>Nothing is submitted to NCS or ECCE from Shournagh OS. There is no connection to the portals; every correction is keyed by a person and the evidence is attached here.</Note>

      {fund.length ? (
        <div className="fin-split" style={{ marginTop: 12 }}>
          <Card title="Discrepancies" sub="Select one to compare side by side">
            {fund.map((f) => (
              <button key={f.id} type="button" className={"fin-pick" + (cur && cur.id === f.id ? " on" : "")} onClick={() => pick(f.id)} aria-pressed={cur && cur.id === f.id}>
                <Chip tone="outline">{f.scheme}</Chip>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="fin-t">{fullName(s, f.child)}</span>
                  <span className="fin-s">{f.issue.split(":")[0]}, {siteName(f.site)}</span>
                  <span style={{ display: "inline-flex", marginTop: 6 }}><FundChip s={s} f={f} /></span>
                </span>
                <span className="sh-num strong">{euro(f.amount)}</span>
              </button>
            ))}
            <div className="fin-cap">Total {euro(sum(fund.map((f) => f.amount)))} across {fund.length} items.</div>
          </Card>
          {cur && <FundingPanel key={cur.id} s={s} f={cur} />}
        </div>
      ) : <Card style={{ marginTop: 12 }}><Empty title="No discrepancies at this centre" hint="Every booking matches its scheme record." /></Card>}

      <Card title={"Matched bookings (" + matched + ")"} sub="Sample of scheme-funded bookings where Acorn and the scheme record agree. No action needed." style={{ marginTop: 12 }} pad={false}>
        <Table rows={sample} rowKey={(c) => c.id} cols={[
          { key: "c", label: "Child", render: (c) => <RecordLink type="child" id={c.id}>{c.first} {c.last}</RecordLink> },
          { key: "r", label: "Room", render: (c) => roomById(c.room)?.name + ", " + siteName(c.site) },
          { key: "f", label: "Scheme", render: (c) => <Chip tone="accent">{c.funding}</Chip> },
          { key: "a", label: "Acorn booking", render: (c) => <span className="sh-muted">{c.pattern.length} days, {c.hours}</span> },
          { key: "p", label: "Scheme record", render: () => <span className="sh-muted">Agrees</span> },
          { key: "s", label: "", render: () => <Chip tone="ok">Matched</Chip> },
        ]} />
      </Card>
    </>
  );
}

function FundingPanel({ s, f }: { s: DemoState; f: FundingItem }) {
  const c = childById(f.child, s);
  const reviewers = ["s02"].concat(f.site === "elm" ? ["s01"] : ["s18", "s29"]);
  const [who, setWho] = useState(f.reviewer && reviewers.includes(f.reviewer) ? f.reviewer : "s02");
  const ap = f.id === "fx-1" ? s.approvals.find((a) => a.id === "ap-fund1") : undefined;
  const history = s.events.filter((e) => e.story === "C" && c && e.target.includes(c.first + " " + c.last)).slice(0, 4);
  const assign = () => {
    assignFunding(f.id, who);
    toast("Assigned to " + personName(who, s) + ". They review it and key any portal change by hand.");
  };
  const approve = () => {
    if (!ap) return;
    decide(ap.id, "approved");
    toast("Approved. " + shortName(s, f.child) + " item marked reviewed; the portal change is keyed by a person.");
  };
  return (
    <Card title={f.scheme + " · " + euro(f.amount) + " · " + fullName(s, f.child)} sub={f.booking + ", " + siteName(f.site)} right={<FundChip s={s} f={f} />}>
      <Note tone="warn" icon={IC.alert}>{f.issue}</Note>
      <div className="fin-cmp">
        <div className="fin-pane">
          <div className="h">Recorded booking</div>
          <div className="src">Acorn Cloud, system of record</div>
          <p>{f.acorn}</p>
          <p style={{ fontSize: 12 }}>{c ? <RecordLink type="child" id={c.id}>{c.first} {c.last}</RecordLink> : null}, {f.booking}</p>
        </div>
        <div className="fin-pane">
          <div className="h">Entered scheme record</div>
          <div className="src">{f.scheme} portal, keyed by hand</div>
          <p>{f.portal}</p>
        </div>
        <div className={"fin-pane" + (f.status === "reviewed" ? " accent" : "")}>
          <div className="h">Manual verification</div>
          <div className="src">Human review in Shournagh OS</div>
          <div className={"v" + (f.status === "reviewed" ? " ok" : "")}>{f.status === "reviewed" ? "Reviewed" : f.status === "assigned" ? "With reviewer" : "Not started"}</div>
          <p style={{ fontSize: 12 }}>Reviewer: {f.reviewer ? personName(f.reviewer, s) : "not assigned"}</p>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <KV rows={[["Provenance", f.source], ["Booking", f.booking], ["Next step", f.status === "reviewed" ? "A person keys the correction on the portal and attaches the reference" : "Choose a reviewer, then mark reviewed once checked"]]} />
      </div>

      {f.status !== "reviewed" && (
        <div className="sh-row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <label className="sh-label" htmlFor={"rv-" + f.id} style={{ margin: 0 }}>Reviewer</label>
          <select id={"rv-" + f.id} className="sh-input" value={who} onChange={(e) => setWho(e.target.value)} style={{ height: 32 }}>
            {reviewers.map((id) => <option key={id} value={id}>{personName(id, s)}</option>)}
          </select>
          <Btn size="sm" icon={IC.user} onClick={assign} disabled={f.status === "assigned" && f.reviewer === who} title={f.status === "assigned" && f.reviewer === who ? "Already with this reviewer" : undefined}>
            {f.status === "assigned" ? "Reassign" : "Assign"}
          </Btn>
          <Btn size="sm" kind="primary" icon={IC.check} onClick={() => markFundingReviewed(f.id)}>Mark reviewed</Btn>
        </div>
      )}
      {f.status === "reviewed" && (
        <div style={{ marginTop: 14 }}><Note tone="accent" icon={IC.check}>Reviewed by a person. The correction is keyed on the {f.scheme} portal by hand; nothing was submitted from here.</Note></div>
      )}

      {ap && (
        <div className="fin-pane" style={{ marginTop: 14 }}>
          <div className="h">Linked approval</div>
          <div className="sh-row" style={{ marginTop: 6, flexWrap: "wrap", gap: 8 }}>
            <RecordLink type="approval" id={ap.id}>{ap.title}</RecordLink>
            <Chip tone={ap.status === "pending" ? "gold" : ap.status === "approved" ? "ok" : "bad"}>{ap.status === "pending" ? "Awaiting " + personName(ap.approver, s) : ap.status === "approved" ? "Approved " + (ap.decidedAt || "") : "Declined"}</Chip>
          </div>
          <p>{ap.detail}</p>
          <div className="fin-s">Proposed by {ap.requestedBy} (agent proposal). Approver: {personName(ap.approver, s)}.</div>
          {ap.status === "pending" && (
            <div className="sh-row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Btn size="sm" kind="primary" icon={IC.check} onClick={approve} disabled={!canApprove(s, ap.approver)} title={canApprove(s, ap.approver) ? undefined : "Only " + personName(ap.approver, s) + " or Edel can approve"}>Approve</Btn>
              <Btn size="sm" onClick={() => decide(ap.id, "declined")} disabled={!canApprove(s, ap.approver)}>Decline</Btn>
              {!canApprove(s, ap.approver) && <span className="fin-s">Only {personName(ap.approver, s)} or Edel can decide this.</span>}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <div className="sh-eyebrow" style={{ marginBottom: 8 }}>Audit trail</div>
        {history.length ? (
          <div className="sh-list">
            {history.map((e) => (
              <div key={e.id} className="sh-item" style={{ padding: "7px 0", alignItems: "flex-start" }}>
                <span className="sh-num sh-faint" style={{ width: 44, flex: "none", fontSize: 11 }}>{e.at}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.45 }}><b style={{ fontWeight: 500, color: "var(--ink)" }}>{e.actor}</b> {e.action}</span>
              </div>
            ))}
          </div>
        ) : <div className="fin-s">Queued for review by the Funding Reconciler at 09:35. No human action yet.</div>}
      </div>
    </Card>
  );
}

/* ── Outstanding balances (story D) ────────────────────────────────────────── */
function Outstanding({ s, site }: P) {
  const m = metrics(s, site);
  const [sort, setSort] = useState<"amount" | "age">("amount");
  const [sel, setSel] = useState(invFocus);
  const inv = s.invoices.filter((i) => inSite(site, i.site)).slice()
    .sort((a, b) => (sort === "amount" ? b.amount - a.amount : b.daysOverdue - a.daysOverdue));
  const cur = inv.find((i) => i.id === sel) || inv[0];
  const sites = SITES.filter((x) => inSite(site, x.id));
  const oldest = inv.reduce((n, i) => Math.max(n, i.daysOverdue), 0);
  const remPending = inv.filter((i) => reminderOf(s, i.id)?.status === "pending").length;
  const remApproved = inv.filter((i) => reminderOf(s, i.id)?.status === "approved").length;
  const pick = (id: string) => { invFocus = id; setSel(id); };

  return (
    <>
      <Head s={s} site={site} title="Outstanding balances" sub={m.overdueCount + " overdue invoices, " + euro(m.overdueTotal) + ". Reviewing an invoice never marks it paid."} />
      <Grid cols={4}>
        <Stat label="Overdue total" value={euro(m.overdueTotal)} tone="bad" sub="Changes only when a payment is recorded" />
        <Stat label="Overdue invoices" value={String(m.overdueCount)} sub={"Oldest " + oldest + " days past due, as at " + TODAY_LABEL} />
        <Stat label="Awaiting review" value={String(m.overdueToReview)} tone={m.overdueToReview ? "warn" : "ok"} sub="Invoices a person has not yet checked" />
        <Stat label="Reminders" value={remPending + " awaiting"} sub={remApproved + " approved (simulated, nothing sent)"} onClick={() => navigate("Work", "approvals")} />
      </Grid>
      <Note tone="accent" icon={IC.eye}>
        Two different things. <b>Reviewed</b> means a person checked the statement and agreed the next step. <b>Paid</b> means money arrived. Marking an invoice reviewed lowers the awaiting review count only; it stays unpaid and the overdue total stays at {euro(m.overdueTotal)}.
      </Note>

      {inv.length ? (
        <div className="fin-split q" style={{ marginTop: 12 }}>
          <Card title="Overdue queue" sub="Select a row to work it" pad={false}
            right={<Segmented value={sort} onChange={setSort} options={[{ id: "amount", label: "Largest first" }, { id: "age", label: "Oldest first" }]} />}>
            <div className="sh-scroll-x">
              <table className="sh-table fin-sel fin-table">
                <thead><tr><th>Invoice</th><th>Family and child</th><th>Centre</th><th className="r">Amount</th><th className="r">Days</th><th>Review</th><th>Payment</th></tr></thead>
                <tbody>
                  {inv.map((i) => (
                    <tr key={i.id} className={"click" + (cur && cur.id === i.id ? " on" : "")} onClick={() => pick(i.id)} aria-selected={cur && cur.id === i.id}>
                      <td><span className="strong sh-num" style={{ whiteSpace: "nowrap" }}>{i.number}</span></td>
                      <td><span className="strong">{famName(s, i.family)}</span><span className="fin-s">{shortName(s, i.child)}, {roomById(childById(i.child, s)?.room || "")?.name}</span></td>
                      <td>{siteName(i.site)}</td>
                      <td className="r sh-num strong">{euro(i.amount)}</td>
                      <td className="r sh-num">{i.daysOverdue}</td>
                      <td><ReviewChip i={i} /></td>
                      <td><Chip tone="bad">Unpaid</Chip></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Total overdue, {inv.length} invoices</td><td className="r sh-num">{euro(sum(inv.map((i) => i.amount)))}</td><td colSpan={3} /></tr></tfoot>
              </table>
            </div>
            <div className="sh-row" style={{ padding: "4px 18px 16px", flexWrap: "wrap", gap: 8 }}>
              {sites.map((st) => {
                const rows = inv.filter((i) => i.site === st.id);
                return <Chip key={st.id} tone="outline">{st.name}: {euro(sum(rows.map((i) => i.amount)))}, {rows.length} invoices</Chip>;
              })}
            </div>
          </Card>
          {cur && <InvoicePanel key={cur.id} s={s} i={cur} />}
        </div>
      ) : <Card style={{ marginTop: 12 }}><Empty title="No overdue invoices at this centre" /></Card>}
    </>
  );
}

function InvoicePanel({ s, i }: { s: DemoState; i: Invoice }) {
  const fam = familyById(i.family, s);
  const c = childById(i.child, s);
  const room = c ? roomById(c.room) : undefined;
  const ap = reminderOf(s, i.id);
  const approver = ap ? ap.approver : reminderApprover(i.site);
  const may = canApprove(s, approver);
  const reviewedEv = s.events.find((e) => e.action.startsWith("marked reviewed") && e.target.startsWith(i.number));
  const msgs = s.messages.filter((x) => x.family === i.family && x.fromKind === "guardian");
  const draft = () => keepReviewed(i, () => draftReminder(i.id));
  const approve = () => { if (ap) keepReviewed(i, () => decide(ap.id, "approved")); };
  const decline = () => { if (ap) keepReviewed(i, () => decide(ap.id, "declined")); };

  return (
    <Card title={i.number + " · " + euro(i.amount)} sub={(fam ? fam.name : "") + ", " + i.period} right={<RecordLink type="invoice" id={i.id}>Open record</RecordLink>}>
      <div className="fin-two">
        <div className={"fin-pane" + (i.status === "reviewed" ? " accent" : "")}>
          <div className="h">Review</div>
          <div className={"v" + (i.status === "reviewed" ? " ok" : "")}>{i.status === "reviewed" ? "Reviewed" : "Awaiting review"}</div>
          <div className="fin-s">{i.status === "reviewed" ? "Checked by " + (reviewedEv ? reviewedEv.actor + " at " + reviewedEv.at : "a person") : "A person checks the statement and next step"}</div>
        </div>
        <div className="fin-pane">
          <div className="h">Payment</div>
          <div className="v bad">Unpaid, {euro(i.amount)}</div>
          <div className="fin-s">{i.daysOverdue} days past due ({i.due}). Clears only on a recorded payment.</div>
        </div>
      </div>

      <div className="sh-eyebrow" style={{ margin: "16px 0 8px" }}>Linked booking</div>
      <KV rows={[
        ["Child", c ? <RecordLink type="child" id={c.id}>{c.first} {c.last}</RecordLink> : i.child],
        ["Family", fam ? <RecordLink type="family" id={fam.id}>{fam.name}</RecordLink> : i.family],
        ["Room", room ? <RecordLink type="room" id={room.id}>{room.name}, {siteName(room.site)}</RecordLink> : "-"],
        ["Current booking (Acorn)", c ? c.pattern.join(", ") + " (" + c.hours + ")" : "-"],
        ["Funding", c ? c.funding : "-"],
        ["Issued, due", i.issued + ", " + i.due],
      ]} />

      <div className="sh-eyebrow" style={{ margin: "16px 0 6px" }}>Statement lines (illustrative)</div>
      <table className="sh-table fin-table">
        <tbody>
          {i.lines.map((l, k) => (
            <tr key={k}><td>{l.label}</td><td className="r sh-faint">{l.qty}</td><td className="r sh-num strong">{money(l.amount)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td>Total due</td><td /><td className="r sh-num">{euro(i.amount)}</td></tr></tfoot>
      </table>

      {msgs.length > 0 && (
        <>
          <div className="sh-eyebrow" style={{ margin: "16px 0 6px" }}>From the family</div>
          {msgs.map((x) => <div key={x.id} className="fin-quote"><b style={{ fontWeight: 500, color: "var(--ink)" }}>{x.from}</b>, {x.at}: {x.body}</div>)}
        </>
      )}

      <div className="sh-eyebrow" style={{ margin: "16px 0 8px" }}>Reminder</div>
      {!ap || ap.status === "declined" ? (
        <div className="sh-stack" style={{ gap: 8 }}>
          {ap && <div className="fin-s">Previous draft was declined. You can draft a new one.</div>}
          <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Btn size="sm" kind="primary" icon={IC.message} onClick={draft}>Draft respectful reminder</Btn>
            <span className="fin-s">Parent Communications drafts it. {personName(approver, s)} approves before anything is sent.</span>
          </div>
        </div>
      ) : (
        <div className="sh-stack" style={{ gap: 8 }}>
          <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <ReminderChip s={s} i={i} />
            <span className="fin-s">Approver: {personName(ap.approver, s)}{ap.decidedAt ? ", decided " + ap.decidedAt : ""}</span>
          </div>
          <div className="fin-draft">{ap.detail}</div>
          {ap.status === "pending" ? (
            <div className="sh-row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Btn size="sm" kind="primary" icon={IC.check} onClick={approve} disabled={!may} title={may ? undefined : "Only " + personName(ap.approver, s) + " or Edel can approve"}>Approve reminder</Btn>
              <Btn size="sm" onClick={decline} disabled={!may}>Decline</Btn>
              {!may && <span className="fin-s">Waiting for {personName(ap.approver, s)}.</span>}
            </div>
          ) : (
            <div className="fin-s">Approved and queued, simulated. Nothing is sent from the demo, and the invoice stays unpaid.</div>
          )}
        </div>
      )}

      <div className="sh-row" style={{ gap: 8, marginTop: 16, flexWrap: "wrap", paddingTop: 14, borderTop: "1px solid var(--border)" }}>
        {i.status !== "reviewed"
          ? <Btn size="sm" icon={IC.check} onClick={() => markInvoiceReviewed(i.id)}>Mark reviewed</Btn>
          : <Chip tone="ok">Reviewed, still unpaid</Chip>}
        <span className="fin-s" style={{ flex: "1 1 200px" }}>Lowers the awaiting review count. The invoice stays unpaid and in the {euro(sum(s.invoices.filter((x) => inSite(effectiveSite(s), x.site)).map((x) => x.amount)))} overdue total.</span>
      </div>
    </Card>
  );
}
