/* Shournagh OS UI kit. Small, token-driven components shared by every page.
   Styling lives in shournagh.css (classes prefixed sh-), colours come from the
   theme tokens, so light and dark both work. */
import { type CSSProperties, type ReactNode, useEffect } from "react";
import type { LinkType, SiteId } from "./types";
import { openDrawer, useDemo, roleDef } from "./store";

/* ── Icons (stroke paths, 24px grid) ───────────────────────────────────────── */
export const IC: Record<string, string> = {
  home: "M3.6 10.2 12 3.6l8.4 6.6v9.1a1.1 1.1 0 0 1-1.1 1.1H4.7a1.1 1.1 0 0 1-1.1-1.1v-9.1Z M9.5 20.4v-6h5v6",
  overview: "M4 5.6h7.2v5.1H4V5.6Z M13.6 5.6H20v8.6h-6.4V5.6Z M4 13.1h7.2v5.3H4v-5.3Z M13.6 16.6H20v1.8h-6.4v-1.8Z",
  centres: "M3.5 20.5h17 M5 20.5V9.4L12 4l7 5.4v11.1 M9.5 20.5v-5.5h5v5.5 M9 11h.01 M15 11h.01",
  families: "M8.2 11a2.9 2.9 0 1 0 0-5.8 2.9 2.9 0 0 0 0 5.8Z M16.6 12.4a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z M2.8 19.6c.7-3 2.8-4.7 5.4-4.7s4.7 1.7 5.4 4.7 M13.9 16c.8-.6 1.7-.9 2.7-.9 2.1 0 3.7 1.4 4.3 4.5",
  people: "M12 12.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z M5 20.2c.9-3.1 3.6-4.9 7-4.9s6.1 1.8 7 4.9",
  policies: "M6.4 3.6h7.4l4.2 4.2v12.6H6.4V3.6Z M13.4 3.8v4.2h4.2 M9 12.4h6 M9 16h4",
  finance: "M4 6.5h16v11H4v-11Z M4 10h16 M7.5 14.5h3",
  work: "M9.4 4.4h5.2a1.4 1.4 0 0 1 1.4 1.4v1.1h2.4A1.6 1.6 0 0 1 20 8.5v9.1a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 17.6V8.5a1.6 1.6 0 0 1 1.6-1.6H8V5.8a1.4 1.4 0 0 1 1.4-1.4Z M8 6.9h8 M9.6 13.3l1.8 1.8 3.4-3.6",
  check: "M5 12.5l4.2 4.2L19 7",
  x: "M6 6l12 12 M18 6 6 18",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  back: "M19 12H5 M11 6l-6 6 6 6",
  chevron: "m9 6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  bell: "M6 8.5a6 6 0 0 1 12 0c0 6.5 2.6 8.5 2.6 8.5H3.4S6 15 6 8.5Z M10.3 20.5a1.94 1.94 0 0 0 3.4 0",
  shield: "M12 3.6 19.5 6v6.1c0 4-3.1 6.9-7.5 8.3-4.4-1.4-7.5-4.3-7.5-8.3V6L12 3.6Z M9.2 12.2l2 2 3.6-3.7",
  lock: "M7 10.5V8a5 5 0 0 1 10 0v2.5 M5.5 10.5h13v10h-13v-10Z M12 14.5v2.5",
  clock: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z M12 7.5V12l3 2",
  spark: "M2 12h4l2.5-6 3.5 12 3-8 2 2h5",
  meal: "M5 3.5v7a2 2 0 0 0 4 0v-7 M7 3.5v17 M15.5 3.5c-1.8 0-3 2.4-3 5.5 0 2.2 1.2 3.5 3 3.5v8.5",
  sleep: "M20.4 14.8A8.6 8.6 0 0 1 9.2 3.6 8.7 8.7 0 1 0 20.4 14.8Z",
  nappy: "M4 7h16l-1.5 6.5A6.6 6.6 0 0 1 12 18.5a6.6 6.6 0 0 1-6.5-5L4 7Z M9 7v3 M15 7v3",
  drink: "M7 3.5h10l-1.4 16a1.6 1.6 0 0 1-1.6 1.5h-4a1.6 1.6 0 0 1-1.6-1.5L7 3.5Z M7.6 9.5h8.8",
  activity: "M12 3.5l2.6 5.3 5.9.9-4.3 4.2 1 5.8L12 17l-5.2 2.7 1-5.8-4.3-4.2 5.9-.9L12 3.5Z",
  eye: "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z",
  alert: "M12 4 21 19.5H3L12 4Z M12 10v4.5 M12 17.2h.01",
  pill: "M10.5 4.5a4.2 4.2 0 0 1 6 6l-6 6a4.2 4.2 0 0 1-6-6l6-6Z M7.5 7.5l6 6",
  note: "M5 4.5h14v15H5v-15Z M8.5 9h7 M8.5 12.5h7 M8.5 16h4",
  door: "M6 20.5V4.5h9.5v16 M4 20.5h16 M12.5 12.5h.01 M15.5 4.5l3 1.5v14.5",
  message: "M20.5 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4-.8L3.5 21l1.9-4.9a8.3 8.3 0 0 1-.9-4.6 8.4 8.4 0 0 1 8-8.5 8.4 8.4 0 0 1 8 8.5Z",
  euro: "M17.5 6.2A7 7 0 1 0 17.5 17.8 M4 10h9 M4 14h9",
  chart: "M4.5 19.5V13 M9.7 19.5V7.5 M14.9 19.5v-8 M20 19.5V5",
  search: "m21 21-4.3-4.3 M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0",
  plus: "M12 5v14 M5 12h14",
  user: "M12 12.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z M5 20.2c.9-3.1 3.6-4.9 7-4.9s6.1 1.8 7 4.9",
  calendar: "M8 4v3 M16 4v3 M4.5 9.5h15 M6.4 6h11.2A1.9 1.9 0 0 1 19.5 8v10a1.9 1.9 0 0 1-1.9 1.9H6.4A1.9 1.9 0 0 1 4.5 18V8A1.9 1.9 0 0 1 6.4 6Z",
  file: "M6.4 3.6h7.4l4.2 4.2v12.6H6.4V3.6Z M13.4 3.8v4.2h4.2",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  sun: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z M12 2.8v1.8 M12 19.4v1.8 M2.8 12h1.8 M19.4 12h1.8",
  phone: "M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5Z M11 17.5h2",
  tablet: "M5.5 3.5h13a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19V5a1.5 1.5 0 0 1 1.5-1.5Z M11 17.5h2",
  flag: "M5 20.5V4 M5 4.5h11l-2 4 2 4H5",
  play: "M7 4.5v15l12-7.5L7 4.5Z",
  refresh: "M20 11.5A8 8 0 0 0 5.6 7 M4 12.5A8 8 0 0 0 18.4 17 M5 3.5v3.8h3.8 M19 20.5v-3.8h-3.8",
};
export function Icon({ d, size = 16, sw = 1.7, style }: { d: string; size?: number; sw?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", ...style }} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* ── Layout ────────────────────────────────────────────────────────────────── */
export function Page({ children }: { children: ReactNode }) {
  return <div className="sh-page">{children}</div>;
}
export function PageHead({ title, sub, eyebrow, right }: { title: ReactNode; sub?: ReactNode; eyebrow?: ReactNode; right?: ReactNode }) {
  return (
    <div className="sh-head">
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        {eyebrow && <div className="sh-eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right && <div className="sh-row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>{right}</div>}
    </div>
  );
}
export function Grid({ cols, children, gap = 12, style }: { cols: 2 | 3 | 4 | "main" | string; children: ReactNode; gap?: number; style?: CSSProperties }) {
  const cls = cols === 2 ? "sh-cols-2" : cols === 3 ? "sh-cols-3" : cols === 4 ? "sh-cols-4" : cols === "main" ? "sh-cols-main" : "";
  return <div className={"sh-grid " + cls} style={{ gap, ...(cls ? {} : { gridTemplateColumns: cols as string }), ...style }}>{children}</div>;
}
export function Card({ title, sub, right, children, pad = true, style, bodyStyle, id }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children?: ReactNode; pad?: boolean; style?: CSSProperties; bodyStyle?: CSSProperties; id?: string }) {
  return (
    <section className="sh-card" style={style} id={id}>
      {(title || right) && (
        <div className="sh-card-h">
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <div className="t">{title}</div>}
            {sub && <div className="s">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div className={pad ? "sh-card-b" : ""} style={bodyStyle}>{children}</div>
    </section>
  );
}
export function Stat({ label, value, sub, tone, onClick, style }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; onClick?: () => void; style?: CSSProperties }) {
  const color = tone ? toneColor(tone) : undefined;
  const inner = (
    <>
      <span className="l">{label}</span>
      <span className="v" style={color ? { color } : undefined}>{value}</span>
      {sub && <span className="x">{sub}</span>}
    </>
  );
  return onClick
    ? <button type="button" className="sh-stat" onClick={onClick} style={style}>{inner}</button>
    : <div className="sh-stat" style={style}>{inner}</div>;
}

/* ── Status ────────────────────────────────────────────────────────────────── */
export type Tone = "ok" | "warn" | "bad" | "gold" | "accent" | "neutral" | "outline";
export const toneColor = (t: Tone) => (t === "ok" ? "var(--ok)" : t === "warn" ? "var(--warn)" : t === "bad" ? "var(--bad)" : t === "gold" ? "var(--gold)" : t === "accent" ? "var(--accent)" : "var(--body)");
export function Chip({ tone = "neutral", dot, children, title }: { tone?: Tone; dot?: boolean; children: ReactNode; title?: string }) {
  return <span className={"sh-chip " + tone} title={title}>{dot && <span className="sh-dot" />}{children}</span>;
}
export function DemoTag({ children = "DEMO DATA" }: { children?: ReactNode }) {
  return <span className="sh-demo" title="Synthetic sample data for demonstration. Not production records.">{children}</span>;
}
export function SiteChip({ site }: { site: SiteId | "both" }) {
  return <Chip tone="outline">{site === "both" ? "Both sites" : site === "elm" ? "Elmgrove" : "Ballyneety"}</Chip>;
}
export function Bar({ value, max, tone = "accent", style }: { value: number; max: number; tone?: Tone; style?: CSSProperties }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className="sh-bar" style={style} role="progressbar" aria-valuenow={value} aria-valuemax={max}><span style={{ width: pct + "%", background: toneColor(tone) }} /></div>;
}
export function Avatar({ name, initials, tone, size = 30 }: { name?: string; initials?: string; tone?: Tone; size?: number }) {
  const ini = initials || (name || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const style: CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (tone) { style.background = "var(--" + (tone === "accent" ? "accent" : tone) + "-soft)"; style.color = toneColor(tone); }
  return <span className="sh-avatar" style={style} title={name}>{ini}</span>;
}

/* ── Controls ──────────────────────────────────────────────────────────────── */
export function Btn({ kind = "secondary", size, onClick, disabled, title, children, icon, style, type = "button" }: {
  kind?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "lg"; onClick?: () => void; disabled?: boolean; title?: string;
  children?: ReactNode; icon?: string; style?: CSSProperties; type?: "button" | "submit";
}) {
  return (
    <button type={type} className={"sh-btn " + (kind === "secondary" ? "" : kind) + (size ? " " + size : "")} onClick={onClick} disabled={disabled} title={title} style={style}>
      {icon && <Icon d={icon} size={size === "sm" ? 13 : 15} />}
      {children}
    </button>
  );
}
export function Segmented<T extends string>({ options, value, onChange, style }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; style?: CSSProperties }) {
  return (
    <div className="sh-seg" role="tablist" style={style}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={o.id === value} className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ position: "relative", width: 38, height: 22, flex: "none", border: 0, borderRadius: 999, cursor: "pointer", background: on ? "var(--accent)" : "var(--track)", transition: "background .2s var(--ease)" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: on ? "var(--on-accent)" : "var(--dim)", transition: "left .2s var(--ease)" }} />
    </button>
  );
}

/* ── Data display ──────────────────────────────────────────────────────────── */
export interface Col<R> { key: string; label: ReactNode; render: (r: R) => ReactNode; align?: "r"; width?: string | number }
export function Table<R>({ cols, rows, onRow, empty, rowKey, maxHeight }: { cols: Col<R>[]; rows: R[]; onRow?: (r: R) => void; empty?: ReactNode; rowKey: (r: R) => string; maxHeight?: number }) {
  if (!rows.length) return <Empty title={empty || "Nothing to show"} />;
  return (
    <div className="sh-scroll-x" style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
      <table className="sh-table">
        <thead><tr>{cols.map((c) => <th key={c.key} className={c.align} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={onRow ? "click" : ""} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map((c) => <td key={c.key} className={c.align}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Empty({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div style={{ padding: "28px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{title}</div>
      {hint && <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}
export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return <dl className="sh-kv">{rows.map(([k, v], i) => <FragmentKV key={i} k={k} v={v} />)}</dl>;
}
function FragmentKV({ k, v }: { k: ReactNode; v: ReactNode }) { return <><dt>{k}</dt><dd>{v}</dd></>; }
export function Note({ children, tone, icon }: { children: ReactNode; tone?: "warn" | "accent"; icon?: string }) {
  return <div className={"sh-note " + (tone || "")}><Icon d={icon || IC.shield} size={15} style={{ marginTop: 1, color: tone === "warn" ? "var(--warn)" : "var(--accent)" }} /><div style={{ minWidth: 0 }}>{children}</div></div>;
}
/** Clickable reference to any record: opens the linked-record drawer. */
export function RecordLink({ type, id, children }: { type: LinkType; id: string; children: ReactNode }) {
  return <button type="button" className="sh-link" onClick={(e) => { e.stopPropagation(); openDrawer(type, id); }}>{children}</button>;
}
/** Simple horizontal bars: label, value, optional max. */
export function HBars({ rows, max, unit = "", tone = "accent" }: { rows: { label: ReactNode; value: number; note?: ReactNode; tone?: Tone }[]; max?: number; unit?: string; tone?: Tone }) {
  const m = max || Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="sh-stack" style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <div key={i}>
          <div className="sh-row" style={{ fontSize: 12.5, marginBottom: 5 }}>
            <span className="sh-trunc" style={{ flex: 1, color: "var(--body)" }}>{r.label}</span>
            <span className="sh-num" style={{ color: "var(--ink)" }}>{r.value}{unit}</span>
            {r.note && <span style={{ color: "var(--faint)", fontSize: 11.5 }}>{r.note}</span>}
          </div>
          <Bar value={r.value} max={m} tone={r.tone || tone} />
        </div>
      ))}
    </div>
  );
}
export function Steps({ steps }: { steps: { label: ReactNode; note?: ReactNode; state: "done" | "current" | "todo" | "blocked" }[] }) {
  return (
    <div className="sh-stack" style={{ gap: 0 }}>
      {steps.map((st, i) => (
        <div key={i} className={"sh-step " + st.state} style={{ paddingBottom: i < steps.length - 1 ? 14 : 0, position: "relative" }}>
          {i < steps.length - 1 && <span style={{ position: "absolute", left: 11.5, top: 26, bottom: 2, width: 1, background: "var(--border)" }} />}
          <span className="n">{st.state === "done" ? <Icon d={IC.check} size={12} sw={2.4} /> : st.state === "blocked" ? "!" : i + 1}</span>
          <div style={{ minWidth: 0, paddingTop: 2 }}>
            <div style={{ fontSize: 13, fontWeight: st.state === "current" || st.state === "blocked" ? 600 : 500, color: st.state === "todo" ? "var(--dim)" : "var(--ink)" }}>{st.label}</div>
            {st.note && <div style={{ fontSize: 12, color: st.state === "blocked" ? "var(--bad)" : "var(--dim)", marginTop: 2, lineHeight: 1.45 }}>{st.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Overlays ──────────────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, sub, children, footer, width }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sh-modal-scrim" onClick={onClose}>
      <div className="sh-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={width ? { width: "min(" + width + "px,100%)" } : undefined}>
        <div className="sh-row" style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-.3px" }}>{title}</div>
            {sub && <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 4 }}>{sub}</div>}
          </div>
          <button type="button" className="sh-btn ghost sm" onClick={onClose} aria-label="Close"><Icon d={IC.x} size={13} sw={2.2} /></button>
        </div>
        <div style={{ padding: "16px 20px 20px", overflowY: "auto" }}>{children}</div>
        {footer && <div className="sh-row" style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", justifyContent: "flex-end", flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}

/** Shown when the current preview role may not see a section. */
export function Restricted({ what }: { what: string }) {
  const s = useDemo();
  const r = roleDef(s.role);
  return (
    <Card>
      <div className="sh-row" style={{ gap: 14, padding: "10px 0" }}>
        <span className="sh-avatar" style={{ background: "var(--track)", color: "var(--dim)" }}><Icon d={IC.lock} size={14} /></span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{what} is not available to {r.label}</div>
          <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 3 }}>Least-privilege access: this role sees only what its job needs. Switch the preview to Owner to see it.</div>
        </div>
      </div>
    </Card>
  );
}
