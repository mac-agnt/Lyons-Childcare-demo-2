/* "Questions Edel asked": a plain trust checklist in a right-side drawer.
   Honest answers only: what the contract defines, what still needs
   implementation and audit, and what we will not promise. */
import { useEffect } from "react";
import { useDemo, setState, navigate } from "../store";
import { Icon, IC, DemoTag, Btn, Note } from "../ui";

const QA: { q: string; a: string; points: string[] }[] = [
  { q: "Who owns the source code and data?", a: "The contract defines it, in writing, before any build starts.",
    points: ["Your data stays yours, with a full export available at any time", "Code and configuration ownership or licence set out in the contract", "Documented handover of the system, accounts and credentials"] },
  { q: "What if the vendor disappears?", a: "You keep running. The exit plan is part of the contract, not an afterthought.",
    points: ["Hosting held in an account you control, or transferable to you", "Encrypted backups you can restore, with restore tests on record", "Code and documentation held so another developer can take over"] },
  { q: "Is child data protected?", a: "It is designed to be, and that design has to be implemented and audited before go-live.",
    points: ["Role-based access: a room tablet sees one room, HR sees no child records", "Each centre isolated for its own managers", "Retention rules, audit logs and encryption options agreed in writing"] },
  { q: "Is Acorn replaced immediately?", a: "No. The change is gradual and Acorn stays the system of record until the data is verified.",
    points: ["Read or export from Acorn first, no forced switch", "One-site pilot, then a decision on cutover or running side by side", "Nothing is switched off until you sign it off"] },
  { q: "Do government systems sync automatically?", a: "That is not promised. NCS, ECCE and Early Years Hive stay manual or portal-based until proven otherwise.",
    points: ["Assess what APIs and lawful export routes actually exist", "Mismatches are flagged for a person to fix in the portal", "No submissions are made on your behalf"] },
  { q: "Will parents have to learn another new system?", a: "Only after a pilot, quality checks and training, and only if it is clearly easier for them.",
    points: ["Parents keep what they use now during the pilot", "Parent acceptance tests before anyone is moved", "Clear guidance and a help route for families"] },
  { q: "What happens when it breaks?", a: "Something will eventually. What matters is how quickly it is noticed, fixed and explained.",
    points: ["Monitoring, response procedures and named contacts", "Restore testing on a schedule, not just backups", "Realistic service levels agreed in the contract. No one can promise 100% uptime"] },
];

export default function ReassuranceDrawer() {
  const s = useDemo();
  const open = s.reassureOpen;
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setState({ reassureOpen: false }); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  if (!open) return null;
  // The drawer can mount outside the themed shell, so carry the current theme with it.
  const theme = typeof document !== "undefined" ? document.querySelector("[data-theme]")?.getAttribute("data-theme") || undefined : undefined;
  const close = () => setState({ reassureOpen: false });
  return (
    <div data-theme={theme} className="sh-drawer-scrim" onClick={close} style={{ fontFamily: "var(--ui)", color: "var(--ink)" }}>
      <aside className="sh-drawer" onClick={(e) => e.stopPropagation()} aria-label="Questions Edel asked" role="dialog" aria-modal="true">
        <div style={{ flex: "none", padding: "20px 22px 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="sh-row" style={{ justifyContent: "space-between" }}>
            <span className="sh-eyebrow">Trust checklist</span>
            <div className="sh-row" style={{ gap: 6 }}><DemoTag /><button type="button" className="sh-btn ghost sm" onClick={close} aria-label="Close"><Icon d={IC.x} size={12} sw={2.2} /></button></div>
          </div>
          <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-.4px", marginTop: 8 }}>Questions Edel asked</div>
          <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 5, lineHeight: 1.5 }}>Straight answers about ownership, safety and change. Where something depends on the contract or on implementation, it says so.</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 22px 24px" }}>
          {QA.map((x, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "16px 0", borderTop: i ? "1px solid var(--border)" : 0 }}>
              <span className="sh-avatar" style={{ width: 26, height: 26, background: "var(--accent-soft)", color: "var(--accent)" }}><Icon d={IC.check} size={13} sw={2.2} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-.2px" }}>{x.q}</div>
                <div style={{ fontSize: 13.5, color: "var(--body)", marginTop: 4, lineHeight: 1.55 }}>{x.a}</div>
                <ul style={{ margin: "8px 0 0", padding: "0 0 0 16px", fontSize: 12.5, color: "var(--dim)", lineHeight: 1.6 }}>
                  {x.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            </div>
          ))}
          <Note>These are commitments to put in writing, not features that remove the need for a contract, a data protection agreement and testing.</Note>
        </div>
        <div style={{ flex: "none", padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Btn kind="ghost" onClick={close}>Close</Btn>
          <Btn kind="primary" icon={IC.arrow} onClick={() => { close(); navigate("Settings", "support"); }}>See how we'd implement this</Btn>
        </div>
      </aside>
    </div>
  );
}
