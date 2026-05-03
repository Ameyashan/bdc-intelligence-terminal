import { useState, useMemo, Fragment } from "react";
import {
  riskColor, ratioToRiskT, fvParPct, GS_FUNDS,
  fmtM, fmtMShort, fmtSigned, shortCompany,
  useAnimatedNumber,
} from "./designTokens.js";
import { fundYieldStats, computeDeltas, fundFvDeltas, SOFR_BPS } from "./analytics.js";

function FundRing({ ratio, size = 78, stroke = 6, theme, motion }) {
  const t = ratioToRiskT(ratio, false);
  const color = riskColor(t);
  const animRatio = useAnimatedNumber(ratio || 0, { duration: 900, motion });
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, animRatio / 100));
  return (
    <svg width={size} height={size} style={{ overflow: "visible" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={theme.border} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        style={{
          transform: "rotate(-90deg)",
          transformOrigin: "center",
          filter: `drop-shadow(0 0 6px color-mix(in oklch, ${color} 45%, transparent))`,
        }} />
      <text x={size/2} y={size/2 - 2} textAnchor="middle"
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, fill: theme.text }}>
        {animRatio.toFixed(1)}
      </text>
      <text x={size/2} y={size/2 + 12} textAnchor="middle"
        style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 8, fill: theme.textDim, letterSpacing: 1 }}>
        FV / PAR
      </text>
    </svg>
  );
}

export function AnimatedValue({ value, format, motion, style }) {
  const v = useAnimatedNumber(value || 0, { duration: 700, motion });
  return <span style={style}>{format(v)}</span>;
}

function RiskDistribution({ investments, theme, motion, height = 6 }) {
  const buckets = useMemo(() => {
    const b = [0,0,0,0,0,0];
    let totalFV = 0;
    investments.forEach(inv => { totalFV += Math.max(0, inv.fv || 0); });
    investments.forEach(inv => {
      const ratio = fvParPct(inv.fv, inv.par);
      const w = Math.max(0, inv.fv || 0) / (totalFV || 1);
      if (inv.nonAccrual) b[5] += w;
      else if (ratio == null || ratio >= 99) b[0] += w;
      else if (ratio >= 95) b[1] += w;
      else if (ratio >= 90) b[2] += w;
      else if (ratio >= 80) b[3] += w;
      else b[4] += w;
    });
    return b;
  }, [investments]);
  const colors = [riskColor(0.05), riskColor(0.25), riskColor(0.45), riskColor(0.62), riskColor(0.82), riskColor(1)];
  return (
    <div style={{ display: "flex", height, width: "100%", borderRadius: 99, overflow: "hidden", background: theme.border }}>
      {buckets.map((b, i) => (
        <div key={i} style={{
          width: `${b * 100}%`,
          background: colors[i],
          transition: motion ? "width 600ms ease" : "none",
        }} />
      ))}
    </div>
  );
}

function FundCard({ fund, investments, theme, motion, gsHighlight, onDragStart, onDragOver, onDrop, isDropTarget, isDragging, density }) {
  const [expanded, setExpanded] = useState(false);
  const isGS = GS_FUNDS.has(fund.id);
  const ratio = (fund.totalFV / fund.totalPar) * 100;
  const gl = fund.totalFV - fund.totalCost;
  const t = ratioToRiskT(ratio, false);
  const accent = (gsHighlight && isGS) ? theme.accent : riskColor(t);

  const fundInv = investments.filter(i => i.fund === fund.id);
  const topStressed = useMemo(() =>
    fundInv
      .filter(i => i.par > 0)
      .map(i => ({ ...i, ratio: fvParPct(i.fv, i.par), risk: i.nonAccrual ? 1 : ratioToRiskT(fvParPct(i.fv, i.par), false) }))
      .sort((a,b) => b.risk - a.risk)
      .slice(0, 4),
    [fundInv]
  );

  const pad = density === "compact" ? 14 : density === "loose" ? 22 : 18;
  return (
    <div
      draggable
      onDragStart={() => onDragStart(fund.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(fund.id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(fund.id); }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        position: "relative",
        background: theme.bgPanel,
        border: `1px solid ${isDropTarget ? accent : theme.border}`,
        borderRadius: 10,
        padding: pad,
        cursor: "grab",
        transition: motion ? "all 280ms cubic-bezier(.2,.8,.2,1)" : "none",
        opacity: isDragging ? 0.4 : 1,
        boxShadow: isDropTarget ? `0 0 0 3px color-mix(in oklch, ${accent} 30%, transparent)` : "none",
        transform: expanded && motion ? "translateY(-2px)" : "translateY(0)",
        overflow: "hidden",
      }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${accent}, transparent)`,
        opacity: 0.6,
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600, color: (gsHighlight && isGS) ? theme.accent : theme.text, letterSpacing: 0.5 }}>
              {fund.id}
            </span>
            {isGS && gsHighlight && (
              <span style={{
                fontFamily: "'Inter Tight', sans-serif", fontSize: 8, fontWeight: 500, letterSpacing: 1.5,
                color: theme.accent,
                padding: "2px 6px", borderRadius: 3,
                border: `1px solid color-mix(in oklch, ${theme.accent} 50%, transparent)`,
              }}>OWN</span>
            )}
          </div>
          <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: theme.textMuted, marginTop: 3, lineHeight: 1.3, maxWidth: 180 }}>
            {fund.name}
          </div>
        </div>
        <FundRing ratio={ratio} size={64} stroke={5} theme={theme} motion={motion} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <Metric theme={theme} label="Fair Value">
          <AnimatedValue value={fund.totalFV} format={fmtM} motion={motion} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 500, color: theme.text }} />
        </Metric>
        <Metric theme={theme} label="Unreal G/L">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 500, color: gl >= 0 ? riskColor(0.05) : riskColor(0.85) }}>
            {gl >= 0 ? "+" : "−"}${Math.abs(gl).toFixed(0)}M
          </span>
        </Metric>
        <Metric theme={theme} label="Non-accrual">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 500, color: fund.nonAccrualCount > 0 ? riskColor(0.9) : theme.textMuted }}>
            {fund.nonAccrualCount}
          </span>
        </Metric>
        <Metric theme={theme} label="Stressed">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 500, color: fund.stressedCount > 5 ? riskColor(0.6) : theme.textMuted }}>
            {fund.stressedCount}
          </span>
        </Metric>
      </div>

      <div style={{ marginBottom: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 9, color: theme.textDim, letterSpacing: 1.2, textTransform: "uppercase" }}>
            Portfolio risk distribution
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: theme.textDim }}>
            {fundInv.length} pos
          </span>
        </div>
        <RiskDistribution investments={fundInv} theme={theme} motion={motion} />
      </div>

      <div style={{
        maxHeight: expanded ? 200 : 0,
        opacity: expanded ? 1 : 0,
        overflow: "hidden",
        transition: motion ? "all 320ms cubic-bezier(.2,.8,.2,1)" : "none",
        marginTop: expanded ? 12 : 0,
      }}>
        <div style={{ borderTop: `1px solid ${theme.borderSoft}`, paddingTop: 10 }}>
          <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 9, color: theme.textDim, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
            Top concerns
          </div>
          {topStressed.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
              <span style={{ width: 4, height: 4, borderRadius: 99, background: riskColor(p.risk), flexShrink: 0 }} />
              <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shortCompany(p.company, 28)}
              </span>
              {p.nonAccrual && (
                <span title="Non-accrual: borrower has stopped paying interest" style={{
                  fontFamily: "'Inter Tight', sans-serif", fontSize: 8, fontWeight: 600, letterSpacing: 0.6,
                  color: riskColor(0.95), padding: "1px 4px", borderRadius: 3,
                  border: `1px solid color-mix(in oklch, ${riskColor(0.95)} 50%, transparent)`,
                }}>NON-ACCR</span>
              )}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: riskColor(p.risk), minWidth: 36, textAlign: "right" }}>
                {p.ratio != null ? `${p.ratio.toFixed(0)}%` : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ theme, label, children }) {
  return (
    <div>
      <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 9, color: theme.textDim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ComparePanel({ a, b, investments, theme, motion, onClose }) {
  const fa = a, fb = b;
  const ratioA = (fa.totalFV / fa.totalPar) * 100;
  const ratioB = (fb.totalFV / fb.totalPar) * 100;
  const glA = fa.totalFV - fa.totalCost;
  const glB = fb.totalFV - fb.totalCost;

  const aSet = new Set(investments.filter(i => i.fund === fa.id).map(i => normalize(i.company)));
  const sharedBorrowers = useMemo(() => {
    const map = {};
    investments.filter(i => i.fund === fb.id).forEach(i => {
      const n = normalize(i.company);
      if (aSet.has(n)) {
        if (!map[n]) map[n] = { name: i.company, a: null, b: null };
        map[n].b = i;
      }
    });
    investments.filter(i => i.fund === fa.id).forEach(i => {
      const n = normalize(i.company);
      if (map[n]) map[n].a = i;
    });
    return Object.values(map).slice(0, 8);
  }, [investments, fa.id, fb.id]);

  const rows = [
    { label: "Fair Value",     a: fmtM(fa.totalFV),  b: fmtM(fb.totalFV) },
    { label: "Par",            a: fmtM(fa.totalPar), b: fmtM(fb.totalPar) },
    { label: "FV/PAR",         a: ratioA.toFixed(2)+"%", b: ratioB.toFixed(2)+"%" },
    { label: "Unreal G/L",     a: fmtSigned(glA),    b: fmtSigned(glB) },
    { label: "Non-accrual",    a: String(fa.nonAccrualCount), b: String(fb.nonAccrualCount) },
    { label: "Stressed",       a: String(fa.stressedCount),   b: String(fb.stressedCount) },
    { label: "Software exp.",  a: (fa.softwarePct ?? 0).toFixed(1)+"%", b: (fb.softwarePct ?? 0).toFixed(1)+"%" },
  ];
  const aColor = GS_FUNDS.has(fa.id) ? theme.accent : theme.text;
  const bColor = GS_FUNDS.has(fb.id) ? theme.accent : theme.text;

  return (
    <Fragment>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(8px) saturate(120%)",
        WebkitBackdropFilter: "blur(8px) saturate(120%)",
        zIndex: 49,
        animation: motion ? "bdc-fadein 220ms ease-out" : "none",
      }} />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0,
        background: theme.bgPanel,
        backdropFilter: "blur(24px) saturate(140%)",
        WebkitBackdropFilter: "blur(24px) saturate(140%)",
        borderTop: `1px solid ${theme.border}`,
        padding: "20px 24px",
        zIndex: 50,
        maxHeight: "60vh",
        overflowY: "auto",
        animation: motion ? "bdc-slide-up 280ms cubic-bezier(.2,.8,.2,1)" : "none",
        boxShadow: "0 -20px 60px -10px rgba(0,0,0,0.55)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim, letterSpacing: 1.5, textTransform: "uppercase" }}>
              Compare
            </div>
            <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 18, fontWeight: 500, color: theme.text, marginTop: 2 }}>
              <span style={{ color: aColor }}>{fa.id}</span>
              <span style={{ color: theme.textDim, margin: "0 10px" }}>↔</span>
              <span style={{ color: bColor }}>{fb.id}</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: `1px solid ${theme.border}`, color: theme.textMuted,
            padding: "6px 12px", borderRadius: 6, cursor: "pointer",
            fontFamily: "'Inter Tight', sans-serif", fontSize: 11,
          }}>Close</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
          <div style={{ border: `1px solid ${theme.borderSoft}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr",
              padding: "8px 14px",
              borderBottom: `1px solid ${theme.border}`,
              background: theme.bgInset,
            }}>
              <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 9, color: theme.textDim, letterSpacing: 1.2, textTransform: "uppercase" }}>Metric</span>
              <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, fontWeight: 600, color: aColor, textAlign: "right", letterSpacing: 0.5 }}>{fa.id}</span>
              <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, fontWeight: 600, color: bColor, textAlign: "right", letterSpacing: 0.5 }}>{fb.id}</span>
            </div>
            {rows.map((r, i) => (
              <div key={r.label} style={{
                display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr",
                padding: "8px 14px",
                borderBottom: i < rows.length - 1 ? `1px solid ${theme.borderSoft}` : "none",
                background: i % 2 === 0 ? "transparent" : theme.bgInset,
              }}>
                <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: theme.textMuted }}>{r.label}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: theme.text, textAlign: "right" }}>{r.a}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: theme.text, textAlign: "right" }}>{r.b}</span>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>
              Shared borrowers ({sharedBorrowers.length})
            </div>
            <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim, marginBottom: 10, lineHeight: 1.4 }}>
              Borrowers held in <span style={{ color: aColor }}>{fa.id}</span> <em>and</em> <span style={{ color: bColor }}>{fb.id}</span>. Each value is that fund's fair-value exposure to the borrower; cell colour follows the FV/PAR risk gradient (cool = at par, warm = stressed, red = non-accrual).
            </div>
            {sharedBorrowers.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 56px", padding: "0 10px 6px", gap: 10 }}>
                <span />
                <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 9, fontWeight: 600, color: aColor, textAlign: "right", letterSpacing: 0.5, textTransform: "uppercase" }}>{fa.id}</span>
                <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 9, fontWeight: 600, color: bColor, textAlign: "right", letterSpacing: 0.5, textTransform: "uppercase" }}>{fb.id}</span>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {sharedBorrowers.length === 0 && (
                <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: theme.textDim, padding: "8px 0" }}>
                  No overlapping borrowers in sample.
                </div>
              )}
              {sharedBorrowers.map((s, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 56px 56px",
                  alignItems: "center", gap: 10,
                  padding: "6px 10px", borderRadius: 4,
                  background: theme.bgInset,
                  fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: theme.text,
                }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {shortCompany(s.name, 32)}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textAlign: "right", color: s.a ? riskColor(s.a.nonAccrual ? 1 : ratioToRiskT(fvParPct(s.a.fv, s.a.par) ?? 100, false)) : theme.textDim }}>
                    {s.a ? fmtM(s.a.fv) : "—"}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textAlign: "right", color: s.b ? riskColor(s.b.nonAccrual ? 1 : ratioToRiskT(fvParPct(s.b.fv, s.b.par) ?? 100, false)) : theme.textDim }}>
                    {s.b ? fmtM(s.b.fv) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}

function normalize(s) {
  return (s || "").toLowerCase().replace(/[\s.,]/g, "").slice(0, 24);
}

function IndustryBars({ investments, theme, motion, gsHighlight }) {
  const data = useMemo(() => {
    const map = {};
    let total = 0;
    investments.forEach(inv => {
      const fv = Math.max(0, inv.fv || 0);
      total += fv;
      const k = inv.industry || "Other";
      if (!map[k]) map[k] = { name: k, fv: 0, stressedFV: 0, gsFV: 0, byFund: {} };
      map[k].fv += fv;
      const ratio = fvParPct(inv.fv, inv.par);
      if (inv.nonAccrual || (ratio != null && ratio < 90)) map[k].stressedFV += fv;
      if (GS_FUNDS.has(inv.fund)) map[k].gsFV += fv;
      map[k].byFund[inv.fund] = (map[k].byFund[inv.fund] || 0) + fv;
    });
    const rows = Object.values(map)
      .sort((a, b) => b.fv - a.fv)
      .slice(0, 12)
      .map(r => ({ ...r, pct: total > 0 ? r.fv / total * 100 : 0, stressPct: r.fv > 0 ? r.stressedFV / r.fv : 0 }));
    return { rows, total };
  }, [investments]);
  const max = Math.max(...data.rows.map(r => r.pct), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.rows.map((row) => {
        const color = riskColor(Math.min(0.95, row.stressPct * 1.4 + 0.05));
        const isGSHeavy = gsHighlight && row.gsFV / row.fv > 0.15;
        return (
          <div key={row.name} style={{ display: "grid", gridTemplateColumns: "180px 1fr 80px 60px", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: isGSHeavy ? theme.accent : theme.text, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.name}
            </span>
            <div style={{ height: 14, background: theme.bgInset, borderRadius: 99, position: "relative", overflow: "hidden" }}>
              <div style={{
                width: `${(row.pct / max) * 100}%`, height: "100%",
                background: `linear-gradient(90deg, ${riskColor(0.05)}, ${color})`,
                transition: motion ? "width 700ms cubic-bezier(.2,.8,.2,1)" : "none",
                borderRadius: 99,
              }} />
              {row.stressPct > 0.05 && (
                <div style={{
                  position: "absolute", right: `${100 - (row.pct / max) * 100}%`,
                  top: 0, bottom: 0, width: `${row.stressPct * (row.pct / max) * 100}%`,
                  background: `repeating-linear-gradient(45deg, transparent, transparent 3px, color-mix(in oklch, ${riskColor(0.95)} 50%, transparent) 3px, color-mix(in oklch, ${riskColor(0.95)} 50%, transparent) 6px)`,
                  transition: motion ? "all 700ms" : "none",
                }} />
              )}
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.text, textAlign: "right" }}>
              {fmtMShort(row.fv)}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.textMuted, textAlign: "right" }}>
              {row.pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function OverviewTab({ funds, investments, selectedFunds, theme, motion, gsHighlight, density, prevData }) {
  const [draggingId, setDraggingId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [comparePair, setComparePair] = useState(null);

  const selFunds = funds.filter(f => selectedFunds.has(f.id));
  const selInvestments = useMemo(() => investments.filter(i => selectedFunds.has(i.fund)), [investments, selectedFunds]);

  const kpi = useMemo(() => {
    const totalFV = selFunds.reduce((s, f) => s + f.totalFV, 0);
    const totalPar = selFunds.reduce((s, f) => s + f.totalPar, 0);
    const totalCost = selFunds.reduce((s, f) => s + f.totalCost, 0);
    const nonAccr = selFunds.reduce((s, f) => s + f.nonAccrualCount, 0);
    const stressed = selFunds.reduce((s, f) => s + f.stressedCount, 0);
    return {
      totalFV, totalPar, totalCost,
      ratio: totalPar > 0 ? (totalFV / totalPar) * 100 : 0,
      gl: totalFV - totalCost,
      nonAccr, stressed,
    };
  }, [selFunds]);

  function handleDragStart(id) { setDraggingId(id); }
  function handleDragOver(id) { if (id !== draggingId) setDropTargetId(id); }
  function handleDrop(id) {
    if (draggingId && id !== draggingId) {
      const a = funds.find(f => f.id === draggingId);
      const b = funds.find(f => f.id === id);
      setComparePair({ a, b });
    }
    setDraggingId(null);
    setDropTargetId(null);
  }

  return (
    <div style={{ padding: density === "compact" ? "16px 24px" : "24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr",
        gap: 0,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        background: theme.bgPanel,
        overflow: "hidden",
      }}>
        <KpiCell theme={theme} label="Aggregate Fair Value" big>
          <AnimatedValue value={kpi.totalFV} format={(v) => `$${(v/1000).toFixed(2)}B`} motion={motion}
            style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 32, fontWeight: 500, letterSpacing: -1, color: theme.text }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: kpi.gl >= 0 ? riskColor(0.05) : riskColor(0.85) }}>
              {kpi.gl >= 0 ? "▲" : "▼"} {fmtSigned(kpi.gl)}
            </span>
            <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: theme.textDim }}>vs cost</span>
          </div>
        </KpiCell>
        <KpiCell theme={theme} label="Portfolio FV / PAR" border>
          <AnimatedValue value={kpi.ratio} format={(v) => v.toFixed(2) + "%"} motion={motion}
            style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 24, fontWeight: 500, letterSpacing: -0.5, color: riskColor(ratioToRiskT(kpi.ratio, false)) }} />
          <div style={{ height: 4, background: theme.bgInset, borderRadius: 99, marginTop: 10, overflow: "hidden" }}>
            <div style={{
              width: `${Math.min(100, kpi.ratio)}%`, height: "100%",
              background: riskColor(ratioToRiskT(kpi.ratio, false)),
              transition: motion ? "width 800ms" : "none",
            }} />
          </div>
        </KpiCell>
        <KpiCell theme={theme} label="Non-accrual positions" border>
          <AnimatedValue value={kpi.nonAccr} format={(v) => Math.round(v).toString()} motion={motion}
            style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 24, fontWeight: 500, letterSpacing: -0.5, color: kpi.nonAccr > 50 ? riskColor(0.92) : theme.text }} />
          <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: theme.textDim, marginTop: 6 }}>
            across {selFunds.length} fund{selFunds.length !== 1 ? "s" : ""}
          </div>
        </KpiCell>
        <KpiCell theme={theme} label="Stressed positions" border>
          <AnimatedValue value={kpi.stressed} format={(v) => Math.round(v).toString()} motion={motion}
            style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 24, fontWeight: 500, letterSpacing: -0.5, color: riskColor(0.55) }} />
          <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: theme.textDim, marginTop: 6 }}>
            FV/PAR &lt; 90%
          </div>
        </KpiCell>
      </div>

      <div>
        <SectionHeader theme={theme} title="Fund Portfolio" subtitle="Drag any card onto another to compare side-by-side." />
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
        }}>
          {selFunds.map(f => (
            <FundCard
              key={f.id}
              fund={f}
              investments={selInvestments}
              theme={theme}
              motion={motion}
              gsHighlight={gsHighlight}
              density={density}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              isDropTarget={dropTargetId === f.id && draggingId !== f.id}
              isDragging={draggingId === f.id}
            />
          ))}
        </div>
      </div>

      {prevData && (
        <WhatChangedPanel
          theme={theme} motion={motion}
          current={{ funds, investments }} prev={prevData}
          selectedFunds={selectedFunds} gsHighlight={gsHighlight} />
      )}

      <YieldPanel
        theme={theme} motion={motion} gsHighlight={gsHighlight}
        funds={selFunds} investments={selInvestments} />

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
        <Panel theme={theme} title="Industry exposure" subtitle="Top 12 by fair value · stripes indicate stressed FV share">
          <IndustryBars investments={selInvestments} theme={theme} motion={motion} gsHighlight={gsHighlight} />
        </Panel>
        <Panel theme={theme} title="Risk gradient legend" subtitle="OKLCH cool→warm">
          <RiskLegend theme={theme} />
        </Panel>
      </div>

      {comparePair && (
        <ComparePanel
          a={comparePair.a} b={comparePair.b}
          investments={investments} theme={theme} motion={motion}
          onClose={() => setComparePair(null)} />
      )}
    </div>
  );
}

function KpiCell({ theme, label, children, big, border }) {
  return (
    <div style={{
      padding: big ? "20px 24px" : "20px 22px",
      borderLeft: border ? `1px solid ${theme.borderSoft}` : "none",
      display: "flex", flexDirection: "column", justifyContent: "center",
      minHeight: 100,
    }}>
      <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export function SectionHeader({ theme, title, subtitle }) {
  return (
    <div style={{ marginBottom: 14, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <h3 style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 14, fontWeight: 500, color: theme.text, letterSpacing: -0.2, margin: 0 }}>
        {title}
      </h3>
      {subtitle && (
        <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: theme.textDim }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

export function Panel({ theme, title, subtitle, children, padding = 18 }) {
  return (
    <div style={{ background: theme.bgPanel, border: `1px solid ${theme.border}`, borderRadius: 10, padding }}>
      {(title || subtitle) && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 12, fontWeight: 500, color: theme.text }}>{title}</span>
          {subtitle && <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim }}>{subtitle}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function RiskLegend({ theme }) {
  const stops = [
    { label: "Par",          range: "≥ 99%",   t: 0.05 },
    { label: "Watch",        range: "95–99%",  t: 0.25 },
    { label: "Stress",       range: "85–95%",  t: 0.50 },
    { label: "Distress",     range: "60–85%",  t: 0.75 },
    { label: "Non-accrual",  range: "< 60%",   t: 1.00 },
  ];
  return (
    <div>
      <div style={{
        height: 10, borderRadius: 99, marginBottom: 14,
        background: `linear-gradient(90deg, ${riskColor(0)}, ${riskColor(0.35)}, ${riskColor(0.65)}, ${riskColor(1)})`,
      }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {stops.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: riskColor(s.t) }} />
            <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: theme.text, flex: 1 }}>{s.label}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme.textDim }}>{s.range}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── YIELD & SPREAD PANEL ──────────────────────────────────────────────────
function YieldPanel({ funds, investments, theme, motion, gsHighlight }) {
  const rows = useMemo(() => funds.map(f => {
    const fInv = investments.filter(i => i.fund === f.id);
    const s = fundYieldStats(fInv, SOFR_BPS);
    return { fund: f, stats: s };
  }), [funds, investments]);

  // Aggregate
  const agg = useMemo(() => fundYieldStats(investments, SOFR_BPS), [investments]);

  const sofrPct = (SOFR_BPS / 100).toFixed(2);
  return (
    <Panel theme={theme} title="Yield, spread & PIK" subtitle={`Weighted by fair value · base rate SOFR ${sofrPct}%`}>
      <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr 1fr", gap: 0, fontFamily: "'Inter Tight', sans-serif" }}>
        {/* header */}
        {["Fund","All-in yield","Avg spread","% Floating","% PIK","FV"].map((h, i) => (
          <div key={h} style={{
            fontSize: 9, color: theme.textDim, letterSpacing: 1.2, textTransform: "uppercase",
            padding: "0 10px 8px", textAlign: i === 0 ? "left" : "right",
            borderBottom: `1px solid ${theme.borderSoft}`,
          }}>{h}</div>
        ))}
        {rows.map(({ fund, stats }) => {
          const isGS = GS_FUNDS.has(fund.id);
          const allInPct = stats.weightedAllInBps / 100;
          const spreadPct = stats.weightedSpreadBps / 100;
          const allInColor = stats.weightedAllInBps > 1000 ? riskColor(0.3) : theme.text;
          const pikColor = stats.pctPik > 0.05 ? riskColor(0.7) : stats.pctPik > 0.01 ? riskColor(0.45) : theme.textMuted;
          return (
            <Fragment key={fund.id}>
              <div style={{ padding: "10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: gsHighlight && isGS ? theme.accent : theme.text, fontWeight: 600 }}>
                {gsHighlight && isGS ? `★ ${fund.id}` : fund.id}
              </div>
              <div style={{ padding: "10px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: allInColor }}>
                {allInPct.toFixed(2)}%
              </div>
              <div style={{ padding: "10px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: theme.text }}>
                +{Math.round(stats.weightedSpreadBps)} bps
                <span style={{ color: theme.textDim, fontSize: 10, marginLeft: 4 }}>({spreadPct.toFixed(2)}%)</span>
              </div>
              <div style={{ padding: "10px", textAlign: "right" }}>
                <BarPct theme={theme} pct={stats.pctFloating} color={riskColor(0.15)} motion={motion} />
              </div>
              <div style={{ padding: "10px", textAlign: "right" }}>
                <BarPct theme={theme} pct={stats.pctPik} color={pikColor} motion={motion} />
              </div>
              <div style={{ padding: "10px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.textMuted }}>
                {fmtMShort(stats.fvTotal)}
              </div>
            </Fragment>
          );
        })}
        {/* Aggregate footer */}
        <div style={{
          gridColumn: "1 / -1",
          borderTop: `1px solid ${theme.border}`,
          marginTop: 4,
          padding: "10px 10px 0",
          display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr 1fr",
        }}>
          <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim, letterSpacing: 1, textTransform: "uppercase" }}>Total</span>
          <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: theme.text }}>
            {(agg.weightedAllInBps / 100).toFixed(2)}%
          </span>
          <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: theme.text }}>
            +{Math.round(agg.weightedSpreadBps)} bps
          </span>
          <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.textMuted }}>
            {(agg.pctFloating * 100).toFixed(0)}%
          </span>
          <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: agg.pctPik > 0.05 ? riskColor(0.7) : theme.textMuted }}>
            {(agg.pctPik * 100).toFixed(1)}%
          </span>
          <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.textMuted }}>
            {fmtMShort(agg.fvTotal)}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function BarPct({ theme, pct, color, motion }) {
  const p = Math.max(0, Math.min(1, pct || 0));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      <div style={{ width: 70, height: 4, background: theme.bgInset, borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          width: `${p * 100}%`, height: "100%", background: color,
          transition: motion ? "width 600ms" : "none",
        }} />
      </div>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color, minWidth: 36, textAlign: "right" }}>
        {(p * 100).toFixed(p < 0.1 ? 1 : 0)}%
      </span>
    </div>
  );
}

// ─── WHAT CHANGED PANEL ────────────────────────────────────────────────────
function WhatChangedPanel({ current, prev, theme, motion, selectedFunds, gsHighlight }) {
  const filtered = useMemo(() => {
    const c = { ...current, investments: current.investments.filter(i => selectedFunds.has(i.fund)) };
    const p = prev ? { ...prev, investments: (prev.investments || []).filter(i => selectedFunds.has(i.fund)) } : null;
    return { c, p };
  }, [current, prev, selectedFunds]);

  const deltas = useMemo(() => computeDeltas(filtered.c, filtered.p), [filtered]);
  const fundDeltas = useMemo(() => fundFvDeltas(filtered.c, filtered.p) || [], [filtered]);
  const meaningfulFundDeltas = useMemo(() => fundDeltas.filter(d =>
    !d.isNew && selectedFunds.has(d.id) &&
    (Math.abs(d.dFv) >= 0.05 || Math.abs(d.dRatio) >= 0.01 || d.dNonAccr !== 0)
  ), [fundDeltas, selectedFunds]);

  if (!deltas) return null;

  const sections = [
    { key: "newNonAccruals", label: "New non-accruals", data: deltas.newNonAccruals, riskT: 1.0 },
    { key: "newStressed",    label: "Newly stressed (<90% FV/PAR)", data: deltas.newStressed, riskT: 0.7 },
    { key: "biggestMarkdowns", label: "Largest markdowns", data: deltas.biggestMarkdowns, riskT: 0.6 },
    { key: "recovered",      label: "Recovered to accrual", data: deltas.recovered, riskT: 0.05 },
    { key: "newPositions",   label: "New positions", data: deltas.newPositions, riskT: 0.15 },
    { key: "exitedPositions", label: "Exited positions", data: deltas.exitedPositions, riskT: 0.25 },
  ];
  const periodLabel = deltas.prevPeriod && deltas.curPeriod ? `${deltas.prevPeriod} → ${deltas.curPeriod}` : "since last refresh";

  return (
    <Panel theme={theme} title="What changed" subtitle={periodLabel}>
      {meaningfulFundDeltas.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 8, marginBottom: 16,
        }}>
          {meaningfulFundDeltas.map(d => {
            const c = d.dFv >= 0 ? riskColor(0.05) : riskColor(0.85);
            return (
              <div key={d.id} style={{
                padding: "10px 12px", borderRadius: 8,
                background: theme.bgInset,
                border: `1px solid ${theme.borderSoft}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: gsHighlight && d.isGS ? theme.accent : theme.text }}>
                    {d.id}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: c }}>
                    {d.dFv >= 0 ? "▲" : "▼"} {fmtSigned(d.dFv)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: theme.textDim }}>
                  <span>FV/PAR {d.dRatio >= 0 ? "+" : ""}{d.dRatio.toFixed(2)}pp</span>
                  <span style={{ color: d.dNonAccr > 0 ? riskColor(0.95) : d.dNonAccr < 0 ? riskColor(0.05) : theme.textDim }}>
                    n/a {d.dNonAccr >= 0 ? "+" : ""}{d.dNonAccr}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {sections.filter(s => s.data.length > 0).map(s => (
          <div key={s.key} style={{ border: `1px solid ${theme.borderSoft}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{
              padding: "8px 12px", background: theme.bgInset,
              borderBottom: `1px solid ${theme.borderSoft}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: riskColor(s.riskT), letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>
                {s.label}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme.textDim }}>
                {s.data.length}
              </span>
            </div>
            <div style={{ maxHeight: 180, overflow: "auto" }}>
              {s.data.slice(0, 8).map((p, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "32px 1fr auto",
                  alignItems: "center", gap: 8, padding: "6px 12px",
                  borderBottom: i < Math.min(7, s.data.length - 1) ? `1px solid ${theme.borderSoft}` : "none",
                  fontSize: 11,
                }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: GS_FUNDS.has(p.fund) && gsHighlight ? theme.accent : theme.textMuted, fontWeight: 600 }}>
                    {p.fund}
                  </span>
                  <span style={{ fontFamily: "'Inter Tight', sans-serif", color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {shortCompany(p.company, 28)}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: riskColor(s.riskT), textAlign: "right" }}>
                    {s.key === "biggestMarkdowns" || s.key === "biggestMarkups"
                      ? fmtSigned(p.deltaFv)
                      : s.key === "newStressed"
                        ? `${p.prevRatio?.toFixed(0)}→${p.ratio?.toFixed(0)}%`
                        : fmtM(p.fv)}
                  </span>
                </div>
              ))}
              {s.data.length > 8 && (
                <div style={{ padding: 6, textAlign: "center", fontSize: 9, color: theme.textDim, fontFamily: "'Inter Tight', sans-serif" }}>
                  +{s.data.length - 8} more
                </div>
              )}
            </div>
          </div>
        ))}
        {sections.every(s => s.data.length === 0) && (
          <div style={{ padding: "16px", color: theme.textDim, fontFamily: "'Inter Tight', sans-serif", fontSize: 12 }}>
            No position-level changes vs. previous snapshot.
          </div>
        )}
      </div>
    </Panel>
  );
}
