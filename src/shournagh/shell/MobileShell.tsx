/* Phone layout for the admin roles (owner, managers, HR): a calm top bar,
   the same pages underneath, and a bottom tab bar. Edel can run the business
   from her phone when she is away. */
import { useState, type ReactNode } from "react";
import { useDemo, roleDef, navigate, briefingLine, metrics } from "../store";
import { Icon, IC } from "../ui";
import { SiteSwitch, RoleMenu } from "./DemoControls";
import HomeRail from "../HomeRail";
import HomeThread from "../../views/pages/HomeThread";

const PAGE_ICON: Record<string, string> = {
  Home: IC.home, Agents: IC.spark, Overview: IC.overview, Centres: IC.centres, Families: IC.families, People: IC.people,
  Policies: IC.policies, Finance: IC.finance, Work: IC.work, Records: IC.file, Activity: IC.chart, Settings: IC.shield,
};

export default function MobileShell({ v, children }: { v: any; children: ReactNode }) {
  const s = useDemo();
  const role = roleDef(s.role);
  const [more, setMore] = useState(false);
  const page: string = v.shPage;
  const primary = ["Home", "Overview", "Work", role.pages.includes("Centres") ? "Centres" : "People"].filter((p) => role.pages.includes(p));
  const m = metrics(s);

  return (
    <div data-theme={v.theme} style={{ fontFamily: "var(--ui)", height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--ink)" }}>
      <header style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
        <span style={{ width: 34, height: 34, borderRadius: 999, background: "var(--accent-fill,var(--accent))", color: "var(--on-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13 }}>S</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Shournagh OS</div>
          <div style={{ fontSize: 10.5, color: "var(--faint)" }} className="sh-trunc">{page === "Home" ? role.label + " · " + (s.site === "all" ? "Both centres" : s.site === "elm" ? "Elmgrove" : "Ballyneety") : page + (v.contextNav?.length ? " · " + (v.contextNav.find((t: any) => t.active)?.label || "") : "")}</div>
        </div>
        <SiteSwitch compact />
        <RoleMenu showText={false} />
      </header>

      {Array.isArray(v.contextNav) && v.contextNav.length > 1 && page !== "Home" && (
        <div style={{ flex: "none", display: "flex", gap: 6, overflowX: "auto", padding: "10px 14px", borderBottom: "1px solid var(--border)", scrollbarWidth: "none" }}>
          {v.contextNav.map((t: any, i: number) => (
            <button key={i} type="button" onClick={t.go} className={"sh-btn sm" + (t.active ? " primary" : "")} style={{ flex: "none" }}>{t.label}</button>
          ))}
        </div>
      )}

      <div data-scroll-main="1" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        {page === "Home" ? (
          <div style={{ padding: "18px 14px 28px" }}>
            <div className="sh-eyebrow" style={{ color: "var(--accent)" }}>{m.exceptionsOpen} open · {m.exceptionsOwner} need{m.exceptionsOwner === 1 ? "s" : ""} you</div>
            <h1 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 600, letterSpacing: "-.6px" }}>Good morning, <span style={{ color: "var(--accent)" }}>{role.person.split(" ")[0]}</span></h1>
            <p style={{ margin: "8px 0 16px", fontSize: 14, lineHeight: 1.5, color: "var(--dim)" }}>{role.id === "owner" ? briefingLine(s) : v.homeSubline}</p>
            <div className="sh-row" style={{ gap: 8, padding: "6px 6px 6px 14px", borderRadius: 18, border: "1px solid var(--border)", background: "var(--surface)" }}>
              <input value={v.draft ?? ""} onChange={v.setDraft} onKeyDown={v.onDraftKey} placeholder="Ask Helios" aria-label="Ask Helios"
                style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "none", color: "var(--ink)", fontSize: 15, font: "inherit", height: 38 }} />
              <button type="button" className="sh-btn primary" onClick={v.send} aria-label="Send" style={{ width: 38, height: 38, padding: 0 }}><Icon d={IC.arrow} size={15} /></button>
            </div>
            {!v.threadOpen && (
              <div className="sh-row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {(v.composerTools || []).map((t: any) => <button key={t.label} type="button" className="sh-btn sm" onClick={t.go}>{t.label}</button>)}
              </div>
            )}
            {v.threadOpen && <div style={{ marginTop: 10 }}><HomeThread v={v} /></div>}
            <div style={{ marginTop: 18 }}><HomeRail /></div>
          </div>
        ) : children}
      </div>

      <nav style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(" + (primary.length + 1) + ",1fr)", borderTop: "1px solid var(--border)", background: "var(--panel)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {primary.map((p) => (
          <button key={p} type="button" onClick={() => { setMore(false); navigate(p); }} style={{ height: 58, border: 0, background: "none", color: page === p ? "var(--accent)" : "var(--dim)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, font: "inherit", fontSize: 10.5, cursor: "pointer" }}>
            <Icon d={PAGE_ICON[p]} size={19} />{p}
          </button>
        ))}
        <button type="button" onClick={() => setMore(!more)} style={{ height: 58, border: 0, background: "none", color: more ? "var(--accent)" : "var(--dim)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, font: "inherit", fontSize: 10.5, cursor: "pointer" }}>
          <Icon d={IC.overview} size={19} />More
        </button>
      </nav>

      {more && (
        <div onClick={() => setMore(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--scrim)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", padding: "16px 14px 24px", background: "var(--overlay)", borderRadius: "22px 22px 0 0", borderTop: "1px solid var(--border-strong)", animation: "shPop .25s var(--ease) both" }}>
            <div style={{ width: 40, height: 4, borderRadius: 4, background: "var(--track)", margin: "0 auto 14px" }} />
            <SiteSwitch />
            <div className="sh-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {role.pages.concat(role.pages.includes("Settings") ? [] : ["Settings"]).map((p) => (
                <button key={p} type="button" onClick={() => { setMore(false); navigate(p); }} className="sh-stat" style={{ alignItems: "center", gap: 6, padding: "12px 6px", cursor: "pointer", color: page === p ? "var(--accent)" : "var(--ink)" }}>
                  <Icon d={PAGE_ICON[p] || IC.file} size={18} />
                  <span style={{ fontSize: 12 }}>{p}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
