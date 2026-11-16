/* Home right-hand widget rail for Shournagh: briefings, exceptions, today's
   numbers, manager actions and the owner-away scenario. The Home centre column
   stays clean (pill, greeting, subline, ask box, thread). */
import { useDemo, metrics, effectiveSite, inSite, roleDef, personName, navigate, setAway, decide, euro, openDrawer } from "./store";
import { TODAY_LABEL } from "./seed";
import { Icon, IC, Chip, Btn, Bar, Toggle } from "./ui";

function W({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="sh-card" style={{ padding: "14px 16px 15px" }}>
      <div className="sh-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-.2px" }}>{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function HomeRail() {
  const s = useDemo();
  const role = roleDef(s.role);
  const site = effectiveSite(s);
  const m = metrics(s);
  const ex = s.exceptions.filter((e) => inSite(site, e.site));
  const open = ex.filter((e) => e.status !== "resolved");
  const mine = s.tasks.filter((t) => t.status !== "done" && inSite(site, t.site) && (role.id === "owner" ? ["s01", "s18", "s02"].includes(t.owner) : t.owner === role.personId)).slice(0, 5);
  const ownerAp = s.approvals.find((a) => a.id === "ap-safesleep");
  const urgent = s.messages.filter((x) => x.priority === "Urgent" && inSite(site, x.site));

  const tiles: { label: string; value: string; sub: string; tone?: string; go: () => void }[] = [
    { label: "Children", value: m.checkedIn + " / " + m.attending, sub: "checked in of expected", go: () => navigate("Centres", "attendance") },
    { label: "Room coverage", value: m.roomsCovered + " / " + m.roomsTotal, sub: m.coverageWatch ? m.coverageWatch + " coverage watch" : "all rooms covered", tone: m.coverageWatch ? "var(--warn)" : undefined, go: () => navigate("People", "leave") },
    { label: "Safe Sleep v4.0", value: m.safeSleepSigned + " / " + m.safeSleepTotal, sub: "staff signed", go: () => navigate("Policies", "versions") },
    { label: "Fees overdue", value: euro(m.overdueTotal), sub: m.overdueCount + " invoices, " + m.overdueToReview + " to review", tone: "var(--bad)", go: () => navigate("Finance", "outstanding") },
    { label: "Funding checks", value: String(m.fundingOpen), sub: euro(m.fundingOpenTotal) + " NCS/ECCE pending", go: () => navigate("Finance", "reconciliation") },
    { label: "Urgent parent", value: String(m.urgentSent), sub: m.urgentAwaitingAck ? m.urgentAwaitingAck + " awaiting ack" : "all acknowledged", go: () => navigate("Families", "messaging") },
    { label: "Enquiries", value: String(m.enquiriesNew), sub: "awaiting a callback", go: () => navigate("Families", "enquiries") },
    { label: "Manager actions", value: String(m.tasksOpen), sub: m.tasksDoneToday + " done today", go: () => navigate("Work", "board") },
  ];

  return (
    <div className="sh-stack" style={{ gap: 12 }}>
      <div className="sh-row" style={{ justifyContent: "space-between", padding: "0 2px" }}>
        <span className="sh-eyebrow">Demo day · {TODAY_LABEL}</span>
        <span className="sh-demo">SAMPLE DATA</span>
      </div>

      {role.id === "owner" && (
        <W title={s.away ? "You're offsite" : "Away mode"} right={<Toggle on={s.away} onChange={setAway} label="Owner away mode" />}>
          {!s.away && <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5 }}>See the day as your managers run it. Only exceptions reach you.</div>}
          {s.away && (
            <div className="sh-stack" style={{ gap: 8 }}>
              {s.awayFeed.length === 0 && <div style={{ fontSize: 12.5, color: "var(--dim)" }}>Managers are picking up the morning...</div>}
              {s.awayFeed.map((f, i) => (
                <div key={i} className="sh-row" style={{ alignItems: "flex-start", gap: 9, animation: "shPop .35s var(--ease) both", padding: f.tone === "owner" ? "9px 10px" : 0, borderRadius: 12, background: f.tone === "owner" ? "var(--gold-soft)" : "none" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 7, marginTop: 6, flex: "none", background: f.tone === "owner" ? "var(--gold)" : f.tone === "ok" ? "var(--ok)" : "var(--accent)" }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, color: "var(--faint)" }}><span className="sh-num">{f.at}</span> · {f.who}</div>
                    <div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.45, marginTop: 1 }}>{f.text}</div>
                    {f.tone === "owner" && ownerAp?.status === "pending" && (
                      <div className="sh-row" style={{ gap: 6, marginTop: 8 }}>
                        <Btn size="sm" kind="primary" onClick={() => decide("ap-safesleep", "approved")}>Approve from phone</Btn>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </W>
      )}

      <W title={role.id === "owner" ? "Exceptions" : "Needs attention"} right={<Chip tone={m.exceptionsOwner ? "gold" : "ok"}>{open.length} open{role.id === "owner" ? " · " + m.exceptionsOwner + " need you" : ""}</Chip>}>
        <div className="sh-list">
          {ex.map((e) => (
            <button key={e.id} type="button" onClick={() => navigate(e.page, e.tab)} className="sh-item click" style={{ width: "100%", border: 0, background: "none", color: "inherit", font: "inherit", textAlign: "left", alignItems: "flex-start", margin: 0, opacity: e.status === "resolved" ? 0.55 : 1 }}>
              <span style={{ width: 7, height: 7, borderRadius: 7, marginTop: 6, flex: "none", background: e.status === "needs-owner" ? "var(--gold)" : e.status === "resolved" ? "var(--ok)" : "var(--accent)" }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, color: "var(--ink)", lineHeight: 1.35, textDecoration: e.status === "resolved" ? "line-through" : "none" }}>{e.title}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--dim)", marginTop: 2 }}>
                  {e.status === "needs-owner" ? "Needs your approval" : e.status === "resolved" ? "Done" : "Owned by " + personName(e.owner)} · {e.site === "both" ? "Both sites" : e.site === "elm" ? "Elmgrove" : "Ballyneety"}
                </span>
              </span>
              <Icon d={IC.chevron} size={13} style={{ color: "var(--faint)", marginTop: 4 }} />
            </button>
          ))}
        </div>
        {role.id === "owner" && ownerAp?.status === "pending" && (
          <div style={{ marginTop: 10, padding: "11px 12px", borderRadius: 14, border: "1px solid var(--accent-line)", background: "var(--accent-faint)" }}>
            <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.45 }}>{ownerAp.title}</div>
            <div className="sh-row" style={{ gap: 6, marginTop: 9 }}>
              <Btn size="sm" kind="primary" icon={IC.check} onClick={() => decide("ap-safesleep", "approved")}>Approve</Btn>
              <Btn size="sm" kind="ghost" onClick={() => openDrawer("approval", "ap-safesleep")}>Details</Btn>
            </div>
          </div>
        )}
      </W>

      <W title="Today's numbers" right={<span style={{ fontSize: 11, color: "var(--faint)" }}>{site === "all" ? "Both centres" : site === "elm" ? "Elmgrove" : "Ballyneety"}</span>}>
        <div className="sh-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {tiles.map((t) => (
            <button key={t.label} type="button" onClick={t.go} className="sh-stat" style={{ padding: "10px 11px", gap: 3, cursor: "pointer" }}>
              <span className="l" style={{ fontSize: 11 }}>{t.label}</span>
              <span className="v" style={{ fontSize: 18, color: t.tone }}>{t.value}</span>
              <span className="x" style={{ fontSize: 10.5 }}>{t.sub}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="sh-row" style={{ fontSize: 11, color: "var(--faint)", justifyContent: "space-between", marginBottom: 5 }}><span>Safe Sleep sign-off</span><span className="sh-num">{Math.round((m.safeSleepSigned / Math.max(1, m.safeSleepTotal)) * 100)}%</span></div>
          <Bar value={m.safeSleepSigned} max={m.safeSleepTotal} />
        </div>
      </W>

      {urgent.length > 0 && (
        <W title="Parent communications" right={<Chip tone="bad">Urgent</Chip>}>
          {urgent.map((u) => (
            <div key={u.id} style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--body)" }}>
              {u.subject} <span style={{ color: "var(--dim)" }}>· sent {u.at} · {u.ackAt ? "acknowledged " + u.ackAt + " by " + u.ackBy : "awaiting acknowledgement"}</span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>Routine meals, naps and nappies stayed in the app. No emails sent.</div>
        </W>
      )}

      <W title={role.id === "owner" ? "Manager actions today" : "My work"} right={<button type="button" className="sh-link" style={{ fontSize: 12 }} onClick={() => navigate("Work", role.id === "owner" ? "board" : "mine")}>Open</button>}>
        <div className="sh-list">
          {mine.map((t) => (
            <button key={t.id} type="button" onClick={() => openDrawer("task", t.id)} className="sh-item click" style={{ width: "100%", border: 0, background: "none", color: "inherit", font: "inherit", textAlign: "left", margin: 0 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="sh-trunc" style={{ display: "block", fontSize: 12.5 }}>{t.title}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--dim)" }}>{personName(t.owner)} · {t.due}</span>
              </span>
              <Chip tone={t.status === "blocked" ? "bad" : t.status === "doing" ? "gold" : "neutral"}>{t.status === "doing" ? "In progress" : t.status === "blocked" ? "Blocked" : "To do"}</Chip>
            </button>
          ))}
          {mine.length === 0 && <div style={{ fontSize: 12.5, color: "var(--dim)", padding: "8px 0" }}>Nothing open.</div>}
        </div>
      </W>

      <W title="Recent activity" right={<button type="button" className="sh-link" style={{ fontSize: 12 }} onClick={() => navigate("Activity", "all")}>All</button>}>
        <div className="sh-stack" style={{ gap: 8 }}>
          {s.events.filter((e) => inSite(site, e.site)).slice(0, 5).map((e) => (
            <div key={e.id} className={e.fresh ? "sh-fresh" : ""} style={{ fontSize: 12, lineHeight: 1.45, color: "var(--body)", borderRadius: 8 }}>
              <span className="sh-num" style={{ color: "var(--faint)", marginRight: 6 }}>{e.at.replace("Yesterday ", "")}</span>
              <b style={{ fontWeight: 500, color: "var(--ink)" }}>{e.actor}</b> {e.action}
            </div>
          ))}
        </div>
      </W>
    </div>
  );
}
