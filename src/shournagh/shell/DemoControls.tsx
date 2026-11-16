/* Demo furniture in the shell: site switch, "Preview as" role menu, toast,
   and the guided tour card. */
import { useEffect, useRef, useState } from "react";
import { useDemo, setSite, setRole, ROLES, roleDef, effectiveSite, TOUR, tourStep, endTour, startTour, setState, resetDemo } from "../store";
import { Icon, IC, DemoTag } from "../ui";
import type { SiteFilter } from "../types";

export function SiteSwitch({ compact }: { compact?: boolean }) {
  const s = useDemo();
  const r = roleDef(s.role);
  const eff = effectiveSite(s);
  const locked = r.id === "manager-elm" || r.id === "manager-bal";
  const opts: { id: SiteFilter; label: string; short: string }[] = [
    { id: "all", label: "Both", short: "All" }, { id: "elm", label: "Elmgrove", short: "Elm" }, { id: "bal", label: "Ballyneety", short: "Bal" },
  ];
  if (compact) {
    return (
      <button type="button" title={"Site: " + (eff === "all" ? "Both centres" : opts.find((o) => o.id === eff)!.label)}
        onClick={() => { if (!locked) setSite(eff === "all" ? "elm" : eff === "elm" ? "bal" : "all"); }}
        style={{ width: 40, height: 30, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--accent)", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)" }}>
        {opts.find((o) => o.id === eff)!.short.toUpperCase()}
      </button>
    );
  }
  return (
    <div style={{ margin: "0 4px 14px" }}>
      <div className="sh-row" style={{ justifyContent: "space-between", padding: "0 4px 7px" }}>
        <span className="sh-eyebrow" style={{ fontSize: 9 }}>Site</span>
        {locked && <span className="sh-row" style={{ gap: 4, fontSize: 10.5, color: "var(--faint)" }}><Icon d={IC.lock} size={11} />Your centre only</span>}
      </div>
      <div className="sh-seg" style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
        {opts.map((o) => (
          <button key={o.id} type="button" className={eff === o.id ? "on" : ""} disabled={locked && o.id !== eff}
            style={{ padding: 0, opacity: locked && o.id !== eff ? 0.4 : 1, cursor: locked ? "not-allowed" : "pointer" }}
            onClick={() => setSite(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function RoleMenu({ showText = true }: { showText?: boolean }) {
  const s = useDemo();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const r = roleDef(s.role);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative", flex: "0 0 auto" }}>
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}
        className="ix8" style={{ display: "flex", alignItems: "center", gap: 9, height: 42, padding: "0 12px 0 6px", border: "1px solid var(--border)", borderRadius: 999, background: "var(--surface)", color: "var(--ink)", cursor: "pointer", font: "inherit" }}>
        <span className="sh-avatar" style={{ width: 30, height: 30 }}>{r.initials}</span>
        {showText && (
          <span style={{ textAlign: "left", minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 9, letterSpacing: ".12em", color: "var(--faint)", fontFamily: "var(--mono)" }}>PREVIEW AS</span>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{r.label}</span>
          </span>
        )}
        <Icon d={IC.down} size={13} style={{ color: "var(--dim)" }} />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", right: 0, top: 50, zIndex: 80, width: 300, padding: 8, background: "var(--overlay)", border: "1px solid var(--border-strong)", borderRadius: 18, boxShadow: "0 30px 80px rgba(0,0,0,.45)", animation: "shPop .22s var(--ease) both" }}>
          <div className="sh-eyebrow" style={{ padding: "6px 10px 8px" }}>Preview as (same data, scoped view)</div>
          {ROLES.map((x) => (
            <button key={x.id} type="button" role="menuitem" onClick={() => { setRole(x.id); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "9px 10px", border: 0, borderRadius: 12, background: x.id === s.role ? "var(--surface-2)" : "none", color: "var(--ink)", cursor: "pointer", textAlign: "left", font: "inherit" }}>
              <span className="sh-avatar" style={{ width: 30, height: 30 }}>{x.initials}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{x.label}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--dim)" }} className="sh-trunc">{x.person} · {x.surface === "tablet" ? "Room tablet" : x.surface === "parent" ? "Parent phone app" : x.title}</span>
              </span>
              {x.id === s.role && <Icon d={IC.check} size={14} style={{ color: "var(--accent)" }} />}
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", margin: "6px 4px 0", padding: "8px 6px 2px", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="sh-btn sm" onClick={() => { setOpen(false); startTour(); }}><Icon d={IC.play} size={12} />Tour for Edel</button>
            <button type="button" className="sh-btn sm ghost" onClick={() => { setOpen(false); resetDemo(); }}><Icon d={IC.refresh} size={12} />Reset demo</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Floating "return to the owner view" control used by the tablet and parent surfaces. */
export function ReturnBar({ label }: { label: string }) {
  const s = useDemo();
  return (
    <div style={{ position: "fixed", left: 16, top: 16, zIndex: 85, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="sh-btn sm" onClick={() => setRole("owner")} style={{ background: "var(--overlay)", backdropFilter: "blur(10px)" }}>
        <Icon d={IC.back} size={13} />Back to owner view
      </button>
      <span className="sh-demo" style={{ background: "var(--overlay)" }}>{label} · DEMO DATA</span>
      {s.tour === null && <RoleMenu showText={false} />}
    </div>
  );
}

export function Toast() {
  const s = useDemo();
  if (!s.toast) return null;
  return (
    <div className="sh-toast" role="status" key={s.toast.id}>
      <Icon d={IC.check} size={14} style={{ color: "var(--accent)" }} />
      <span>{s.toast.text}</span>
    </div>
  );
}

export function TourCard() {
  const s = useDemo();
  if (s.tour === null) return null;
  const i = s.tour;
  const stop = TOUR[i];
  return (
    <div role="dialog" aria-label="Guided tour" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 92, width: "min(360px, calc(100vw - 32px))", padding: "16px 18px", background: "var(--overlay)", border: "1px solid var(--accent-line)", borderRadius: 20, boxShadow: "0 30px 80px rgba(0,0,0,.45)", backdropFilter: "blur(20px)", animation: "shPop .3s var(--ease) both" }}>
      <div className="sh-row" style={{ justifyContent: "space-between" }}>
        <span className="sh-eyebrow" style={{ color: "var(--accent)" }}>Tour for Edel · {i + 1} of {TOUR.length}</span>
        <button type="button" className="sh-btn ghost sm" onClick={endTour} aria-label="End tour"><Icon d={IC.x} size={12} sw={2.2} /></button>
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 8, letterSpacing: "-.3px" }}>{stop.title}</div>
      <div style={{ fontSize: 13, color: "var(--body)", marginTop: 6, lineHeight: 1.55 }}>{stop.line}</div>
      <div className="sh-row" style={{ gap: 4, marginTop: 14 }}>
        {TOUR.map((_, k) => <span key={k} style={{ height: 3, flex: 1, borderRadius: 3, background: k <= i ? "var(--accent)" : "var(--track)" }} />)}
      </div>
      <div className="sh-row" style={{ marginTop: 14, justifyContent: "space-between" }}>
        <button type="button" className="sh-btn sm ghost" onClick={() => tourStep(i - 1)} disabled={i === 0}>Back</button>
        <button type="button" className="sh-btn sm primary" onClick={() => tourStep(i + 1)}>{i === TOUR.length - 1 ? "Finish on Home" : "Next stop"}<Icon d={IC.arrow} size={12} /></button>
      </div>
    </div>
  );
}

export function SidebarDemoCard() {
  const s = useDemo();
  const r = roleDef(s.role);
  return (
    <div style={{ margin: "8px 4px 8px", padding: "12px 12px", border: "1px dashed var(--border-strong)", borderRadius: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="sh-row" style={{ justifyContent: "space-between" }}>
        <DemoTag>SAMPLE DATA</DemoTag>
        <span style={{ fontSize: 10.5, color: "var(--faint)" }}>{r.label}</span>
      </div>
      <div className="sh-row" style={{ gap: 6 }}>
        <button type="button" className="sh-btn sm" style={{ flex: 1 }} onClick={startTour}><Icon d={IC.play} size={12} />Tour</button>
        <button type="button" className="sh-btn sm ghost" style={{ flex: 1 }} onClick={() => setState({ reassureOpen: true })}><Icon d={IC.shield} size={12} />Trust</button>
      </div>
    </div>
  );
}
