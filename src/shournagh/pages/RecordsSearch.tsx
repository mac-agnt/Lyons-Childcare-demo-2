/* Records > Search: one box across children, families, staff, invoices, forms,
   policies, routines and enquiries, masked by the preview role. */
import { useMemo, useState } from "react";
import { useDemo, openDrawer, roleDef, effectiveSite, inSite, roomById, euro, personName } from "../store";
import { siteName } from "../seed";
import type { LinkType, SiteId } from "../types";
import { Page, PageHead, Card, Chip, DemoTag, Icon, IC, Empty, Note } from "../ui";

interface Hit { type: LinkType; id: string; title: string; meta: string; kind: string; site: SiteId | "both"; sensitive: boolean }

const SUGGEST = ["Murphy", "Toddlers", "Safe Sleep", "INV-2611", "Ballyneety", "consent", "NCS", "opening checks"];

export default function RecordsSearch() {
  const s = useDemo();
  const [q, setQ] = useState("");
  const role = roleDef(s.role);
  const site = effectiveSite(s);

  const all: Hit[] = useMemo(() => {
    const out: Hit[] = [];
    s.children.forEach((c) => out.push({ type: "child", id: c.id, title: c.first + " " + c.last, meta: roomById(c.room)?.name + ", " + siteName(c.site) + " · " + c.funding + (c.consents.photos && c.consents.outings && c.consents.sunscreen ? "" : " · consent missing"), kind: "Child", site: c.site, sensitive: true }));
    s.families.forEach((f) => out.push({ type: "family", id: f.id, title: f.name, meta: s.guardians.filter((g) => g.family === f.id).map((g) => g.name).join(", ") + " · " + siteName(f.site), kind: "Family", site: f.site, sensitive: true }));
    s.staff.forEach((x) => out.push({ type: "staff", id: x.id, title: x.name, meta: x.role + " · " + siteName(x.site), kind: "Staff", site: x.site, sensitive: false }));
    s.invoices.forEach((i) => out.push({ type: "invoice", id: i.id, title: i.number + " · " + euro(i.amount), meta: (s.families.find((f) => f.id === i.family)?.name || "") + " · " + i.daysOverdue + " days overdue", kind: "Invoice", site: i.site, sensitive: true }));
    s.funding.forEach((f) => out.push({ type: "funding", id: f.id, title: f.scheme + " mismatch · " + euro(f.amount), meta: f.issue, kind: "Funding", site: f.site, sensitive: true }));
    s.policies.forEach((p) => out.push({ type: "policy", id: p.id, title: p.title + " v" + p.version, meta: p.category + " · " + p.audience + " · " + p.changeSummary, kind: "Policy", site: "both", sensitive: false }));
    s.tasks.forEach((t) => out.push({ type: "task", id: t.id, title: t.title, meta: (t.recurring ? "Routine: " + t.recurring : "Task") + " · " + personName(t.owner), kind: t.recurring ? "Routine" : "Task", site: t.site, sensitive: false }));
    s.enquiries.forEach((e) => out.push({ type: "enquiry", id: e.id, title: e.parent + " · " + e.child, meta: e.programme + " · " + siteName(e.site), kind: "Enquiry", site: e.site, sensitive: true }));
    s.children.filter((c) => !(c.consents.photos && c.consents.outings && c.consents.sunscreen)).forEach((c) => out.push({ type: "child", id: c.id, title: "Consent form: " + c.first + " " + c.last, meta: [!c.consents.photos && "photos", !c.consents.outings && "outings", !c.consents.sunscreen && "sunscreen"].filter(Boolean).join(", ") + " missing", kind: "Form", site: c.site, sensitive: true }));
    return out;
  }, [s]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = words.length ? all.filter((h) => words.every((w) => (h.title + " " + h.meta + " " + h.kind).toLowerCase().includes(w))) : [];
  const canSee = (h: Hit) => inSite(site, h.site) && !(role.id === "hr" && h.sensitive);
  const visible = matched.filter(canSee);
  const hidden = matched.length - visible.length;
  const groups = Array.from(new Set(visible.map((h) => h.kind)));

  return (
    <Page>
      <PageHead title="Search" sub="Child, parent, site, staff, invoice, form, policy and routine. Results respect your role and site." right={<DemoTag />} />
      <div className="sh-row" style={{ gap: 12, padding: "12px 16px", borderRadius: 18, border: "1px solid var(--border)", background: "var(--surface)" }}>
        <Icon d={IC.search} size={17} style={{ color: "var(--faint)" }} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything you can see" aria-label="Search records"
          style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "none", color: "var(--ink)", fontSize: 16, font: "inherit" }} />
        {q && <button type="button" className="sh-btn ghost sm" onClick={() => setQ("")}>Clear</button>}
        <Chip tone="outline">{role.label}</Chip>
      </div>
      {!q && (
        <div className="sh-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {SUGGEST.map((x) => <button key={x} type="button" className="sh-btn sm" onClick={() => setQ(x)}>{x}</button>)}
        </div>
      )}
      {q && (
        <div style={{ marginTop: 16 }} className="sh-stack">
          {hidden > 0 && <Note icon={IC.lock}>{hidden} result{hidden === 1 ? "" : "s"} hidden: {role.id === "hr" ? "child and family records are outside the HR role" : "they belong to " + (site === "elm" ? "Ballyneety" : "Elmgrove") + ", which this role cannot open"}. The search was logged in the access audit.</Note>}
          {visible.length === 0 && <Card><Empty title={"Nothing you can see matches \"" + q + "\""} hint="Try a surname, a room, an invoice number or a policy name." /></Card>}
          {groups.map((g) => (
            <Card key={g} title={g} sub={visible.filter((h) => h.kind === g).length + " result" + (visible.filter((h) => h.kind === g).length === 1 ? "" : "s")} pad={false}>
              <div className="sh-list" style={{ padding: "6px 18px 10px" }}>
                {visible.filter((h) => h.kind === g).slice(0, 12).map((h) => (
                  <button key={h.kind + h.id} type="button" onClick={() => openDrawer(h.type, h.id)} className="sh-item click" style={{ width: "100%", border: 0, background: "none", color: "inherit", font: "inherit", textAlign: "left", margin: 0 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="sh-trunc" style={{ display: "block", fontSize: 13.5 }}>{h.title}</span>
                      <span className="sh-trunc" style={{ display: "block", fontSize: 12, color: "var(--dim)" }}>{h.meta}</span>
                    </span>
                    <Chip tone="outline">{h.site === "both" ? "Both" : siteName(h.site)}</Chip>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
