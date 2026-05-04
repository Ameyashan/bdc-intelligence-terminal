import { useMemo } from "react";
import {
  riskColor, ratioToRiskT, statusFromRatio, fvParPct, GS_FUNDS,
  fmtM, fmtMShort, fmtPct, fmtSigned, shortCompany, fmtDate,
} from "./designTokens.js";
import { parseRate, allInBps, SOFR_BPS } from "./analytics.js";
import { Panel, SectionHeader } from "./Overview.jsx";

const STATUS_RANK = { "non-accrual": 5, "deep distress": 4, "distress": 3, "stress": 2, "watch": 1, "par": 0 };

function PikBadge({ theme }) {
  const c = riskColor(0.7);
  return (
    <span style={{
      fontFamily: "'Inter Tight', sans-serif", fontSize: 8, fontWeight: 600, letterSpacing: 0.8,
      color: c, padding: "1px 5px", borderRadius: 3,
      border: `1px solid color-mix(in oklch, ${c} 50%, transparent)`,
      background: `color-mix(in oklch, ${c} 12%, transparent)`,
    }}>PIK</span>
  );
}

function StatusPill({ status, theme }) {
  const color = riskColor(status.t);
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 99, fontSize: 9, letterSpacing: 0.8,
      textTransform: "uppercase", fontWeight: 500, color,
      background: `color-mix(in oklch, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in oklch, ${color} 40%, transparent)`,
      whiteSpace: "nowrap",
    }}>{status.label}</span>
  );
}

// All quarters in chronological order (oldest → latest), unioned across rows.
function buildPeriods(rows) {
  const set = new Set();
  rows.forEach(r => (r.series || []).forEach(s => set.add(s.period)));
  // Also include the latest (top-level) period from each row, though typically series[0] === latest.
  return Array.from(set).sort(); // ISO dates sort chronologically.
}

// Per-period, per-fund roll-ups. Returns { periods, perFund: { fundId: [{ period, fv, par, ratio, anyPik, anyNonAccrual, count }] } }
function buildTimeSeries(rows, periods) {
  const perFund = {};
  rows.forEach(r => {
    if (!perFund[r.fund]) perFund[r.fund] = periods.map(p => ({ period: p, fv: 0, par: 0, anyPik: false, anyNonAccrual: false, count: 0 }));
    (r.series || []).forEach(s => {
      const idx = periods.indexOf(s.period);
      if (idx < 0) return;
      const slot = perFund[r.fund][idx];
      slot.fv += Math.max(0, s.fv || 0);
      slot.par += Math.max(0, s.par || 0);
      slot.count += 1;
      if (s.nonAccrual) slot.anyNonAccrual = true;
      if (parseRate(s.rate).pik) slot.anyPik = true;
    });
  });
  // ratio
  Object.values(perFund).forEach(arr => arr.forEach(s => { s.ratio = s.par > 0 ? s.fv / s.par : null; }));
  return perFund;
}

function MarkTrendChart({ periods, perFund, theme, motion }) {
  const W = 640, H = 200, padL = 44, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const fundIds = Object.keys(perFund);
  if (periods.length < 2 || fundIds.length === 0) {
    return <EmptyChartNote theme={theme} text="Need ≥2 quarterly snapshots to draw a trend." />;
  }
  // Y range: pad around observed FV/PAR ratios
  let lo = 1, hi = 1;
  fundIds.forEach(fid => perFund[fid].forEach(s => {
    if (s.ratio == null) return;
    lo = Math.min(lo, s.ratio); hi = Math.max(hi, s.ratio);
  }));
  lo = Math.min(lo, 0.95); hi = Math.max(hi, 1.02);
  const yPad = (hi - lo) * 0.08 || 0.02;
  lo -= yPad; hi += yPad;
  const x = (i) => padL + (periods.length === 1 ? innerW / 2 : (i / (periods.length - 1)) * innerW);
  const y = (r) => padT + innerH - ((r - lo) / (hi - lo)) * innerH;

  // Color per fund: GS funds get accent, else stable hue from id hash.
  const fundColor = (fid) => GS_FUNDS.has(fid) ? theme.accent : riskColor(0.15 + (fid.charCodeAt(0) % 7) * 0.1);

  // Y gridlines at 100, 90, 80
  const gridYs = [1.0, 0.95, 0.90, 0.80].filter(g => g >= lo && g <= hi);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      {gridYs.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke={theme.borderSoft} strokeDasharray="2 3" />
          <text x={padL - 6} y={y(g) + 3} textAnchor="end"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: theme.textDim }}>
            {(g * 100).toFixed(0)}
          </text>
        </g>
      ))}
      {periods.map((p, i) => (
        <text key={p} x={x(i)} y={H - 8} textAnchor="middle"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: theme.textDim }}>
          {p.slice(2, 7)}
        </text>
      ))}
      {fundIds.map(fid => {
        const pts = perFund[fid].map((s, i) => s.ratio != null ? { i, r: s.ratio } : null).filter(Boolean);
        if (pts.length === 0) return null;
        const path = pts.map((pt, i) => `${i === 0 ? "M" : "L"}${x(pt.i).toFixed(1)},${y(pt.r).toFixed(1)}`).join(" ");
        const c = fundColor(fid);
        return (
          <g key={fid}>
            <path d={path} fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round"
              style={{ transition: motion ? "all 400ms" : "none" }} />
            {pts.map((pt, i) => (
              <circle key={i} cx={x(pt.i)} cy={y(pt.r)} r={2.6} fill={c} />
            ))}
            <text x={x(pts[pts.length - 1].i) + 6} y={y(pts[pts.length - 1].r) + 3}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 600, fill: c }}>
              {fid}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ParStackedChart({ periods, perFund, theme, motion }) {
  const W = 640, H = 180, padL = 44, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const fundIds = Object.keys(perFund);
  if (periods.length === 0 || fundIds.length === 0) {
    return <EmptyChartNote theme={theme} text="No par history available." />;
  }
  const totals = periods.map((_, i) => fundIds.reduce((s, fid) => s + (perFund[fid][i].par || 0), 0));
  const maxTot = Math.max(...totals, 1);
  const barW = Math.min(48, (innerW / periods.length) * 0.6);
  const x = (i) => padL + (periods.length === 1 ? innerW / 2 : (i / (periods.length - 1)) * innerW) - barW / 2;
  const yScale = (v) => padT + innerH - (v / maxTot) * innerH;
  const fundColor = (fid) => GS_FUNDS.has(fid) ? theme.accent : riskColor(0.15 + (fid.charCodeAt(0) % 7) * 0.1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      <text x={padL - 6} y={padT + 8} textAnchor="end"
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: theme.textDim }}>
        {fmtMShort(maxTot)}
      </text>
      {periods.map((p, i) => {
        let acc = 0;
        return (
          <g key={p}>
            {fundIds.map(fid => {
              const v = perFund[fid][i].par || 0;
              if (v <= 0) return null;
              const yTop = yScale(acc + v);
              const yBot = yScale(acc);
              acc += v;
              return (
                <rect key={fid} x={x(i)} y={yTop} width={barW} height={Math.max(0, yBot - yTop)}
                  fill={fundColor(fid)} opacity={0.9}
                  style={{ transition: motion ? "all 400ms" : "none" }} />
              );
            })}
            <text x={x(i) + barW / 2} y={H - 8} textAnchor="middle"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: theme.textDim }}>
              {p.slice(2, 7)}
            </text>
            <text x={x(i) + barW / 2} y={yScale(totals[i]) - 4} textAnchor="middle"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fill: theme.text }}>
              {fmtMShort(totals[i])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function EmptyChartNote({ theme, text }) {
  return (
    <div style={{
      padding: "20px 12px", textAlign: "center",
      fontFamily: "'Inter Tight', sans-serif", fontSize: 11, color: theme.textDim,
    }}>{text}</div>
  );
}

export function BorrowerProfileTab({ investments, selectedBorrower, theme, motion, gsHighlight, drillToBorrower, setActiveTab }) {
  const rows = useMemo(
    () => investments.filter(i => i.company === selectedBorrower),
    [investments, selectedBorrower]
  );

  const summary = useMemo(() => {
    const totalFV = rows.reduce((s, r) => s + Math.max(0, r.fv || 0), 0);
    const totalPar = rows.reduce((s, r) => s + Math.max(0, r.par || 0), 0);
    const totalCost = rows.reduce((s, r) => s + Math.max(0, r.cost || 0), 0);
    const lenders = Array.from(new Set(rows.map(r => r.fund)));
    const ratio = totalPar > 0 ? (totalFV / totalPar) * 100 : null;
    const anyNonAccrual = rows.some(r => r.nonAccrual);
    const worst = rows.reduce((acc, r) => {
      const st = statusFromRatio(fvParPct(r.fv, r.par) ?? 100, r.nonAccrual);
      return STATUS_RANK[st.label] > STATUS_RANK[acc.label] ? st : acc;
    }, { label: "par", t: 0.05 });
    const pikCount = rows.filter(r => parseRate(r.rate).pik).length;
    const industries = Array.from(new Set(rows.map(r => r.industry).filter(Boolean)));
    // FV-weighted all-in yield
    let yldNum = 0, yldDen = 0;
    rows.forEach(r => {
      const a = allInBps(parseRate(r.rate), SOFR_BPS);
      if (a != null && r.fv > 0) { yldNum += a * r.fv; yldDen += r.fv; }
    });
    const wAvgAllIn = yldDen > 0 ? yldNum / yldDen : null;
    return { totalFV, totalPar, totalCost, lenders, ratio, anyNonAccrual, worst, pikCount, industries, wAvgAllIn };
  }, [rows]);

  const periods = useMemo(() => buildPeriods(rows), [rows]);
  const perFund = useMemo(() => buildTimeSeries(rows, periods), [rows, periods]);

  // Lender disagreement: latest-period max-min FV/PAR among lenders that hold this borrower at the latest period.
  const disagreement = useMemo(() => {
    if (periods.length === 0) return null;
    const lastIdx = periods.length - 1;
    const ratios = Object.entries(perFund)
      .map(([fid, arr]) => ({ fid, r: arr[lastIdx]?.ratio }))
      .filter(x => x.r != null);
    if (ratios.length < 2) return null;
    const sorted = ratios.slice().sort((a, b) => a.r - b.r);
    return { lo: sorted[0], hi: sorted[sorted.length - 1], spread: sorted[sorted.length - 1].r - sorted[0].r };
  }, [periods, perFund]);

  // Largest mark drop QoQ across all (fund, position) series.
  const largestDrop = useMemo(() => {
    let worst = null;
    rows.forEach(r => {
      const s = r.series || [];
      // series is latest first, so drop from s[i+1] (older) -> s[i] (newer)
      for (let i = 0; i < s.length - 1; i++) {
        const newer = s[i], older = s[i + 1];
        const rN = older.par > 0 ? newer.fv / newer.par : null;
        const rO = older.par > 0 ? older.fv / older.par : null;
        if (rN == null || rO == null) continue;
        const d = rN - rO;
        if (!worst || d < worst.delta) worst = { delta: d, fund: r.fund, from: older.period, to: newer.period };
      }
    });
    return worst;
  }, [rows]);

  // Non-accrual onset (earliest period where any row went non-accrual).
  const nonAccrOnset = useMemo(() => {
    let onset = null;
    rows.forEach(r => {
      const s = (r.series || []).slice().reverse(); // chronological
      for (let i = 0; i < s.length; i++) {
        if (s[i].nonAccrual && (i === 0 || !s[i - 1].nonAccrual)) {
          if (!onset || s[i].period < onset.period) onset = { period: s[i].period, fund: r.fund };
          break;
        }
      }
    });
    return onset;
  }, [rows]);

  if (!selectedBorrower) {
    return (
      <div style={{ padding: "40px 32px", color: theme.textDim, fontFamily: "'Inter Tight', sans-serif", fontSize: 13 }}>
        No borrower selected. Click any borrower name in SOI, Stress, Overview, the Borrower Graph, or Signals to open their profile.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: "40px 32px", color: theme.textDim, fontFamily: "'Inter Tight', sans-serif", fontSize: 13 }}>
        No investments found for <strong style={{ color: theme.text }}>{selectedBorrower}</strong> in the selected funds. Try widening the fund selection.
      </div>
    );
  }

  const worstColor = riskColor(summary.worst.t);

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <button onClick={() => setActiveTab("soi")}
            style={{
              background: "transparent", border: `1px solid ${theme.borderSoft}`,
              color: theme.textMuted, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              fontFamily: "'Inter Tight', sans-serif", fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
              marginBottom: 10,
            }}>← Back to SOI</button>
          <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 9, color: theme.textDim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
            Borrower Profile
          </div>
          <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 22, fontWeight: 500, color: theme.text, letterSpacing: -0.3, lineHeight: 1.2, wordBreak: "break-word" }}>
            {selectedBorrower}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <StatusPill status={summary.worst} theme={theme} />
            {summary.industries.map(ind => (
              <span key={ind} style={{
                fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textMuted,
                padding: "2px 8px", borderRadius: 4, background: theme.bgInset,
                border: `1px solid ${theme.borderSoft}`,
              }}>{ind}</span>
            ))}
            {summary.pikCount > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: theme.textMuted, fontFamily: "'Inter Tight', sans-serif" }}>
                <PikBadge theme={theme} /> {summary.pikCount} of {rows.length} tranche{rows.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 0, border: `1px solid ${theme.border}`, borderRadius: 10,
        background: theme.bgPanel, overflow: "hidden",
      }}>
        <Kpi theme={theme} label="Lenders" value={String(summary.lenders.length)} sub={summary.lenders.join(" · ")} />
        <Kpi theme={theme} label="Total Par" value={fmtM(summary.totalPar)} border />
        <Kpi theme={theme} label="Total Fair Value" value={fmtM(summary.totalFV)} border />
        <Kpi theme={theme} label="Weighted FV / PAR"
          value={summary.ratio != null ? summary.ratio.toFixed(2) + "%" : "—"}
          color={summary.ratio != null ? riskColor(ratioToRiskT(summary.ratio, summary.anyNonAccrual)) : theme.text}
          border />
        <Kpi theme={theme} label="Unrealized G/L"
          value={fmtSigned(summary.totalFV - summary.totalCost)}
          color={summary.totalFV - summary.totalCost >= 0 ? riskColor(0.05) : riskColor(0.85)}
          border />
        <Kpi theme={theme} label="Avg All-in Yield"
          value={summary.wAvgAllIn != null ? (summary.wAvgAllIn / 100).toFixed(2) + "%" : "—"}
          sub={summary.wAvgAllIn != null ? "FV-weighted" : null}
          border />
      </div>

      {/* Per-lender holdings table */}
      <Panel theme={theme} title="Per-lender holdings" subtitle={`${rows.length} tranche${rows.length === 1 ? "" : "s"} · how each BDC is pricing this credit`} padding={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Inter Tight', sans-serif", fontSize: 12 }}>
            <thead>
              <tr>
                {["Fund","Type","Rate","Maturity","Par","Cost","Fair Value","FV/PAR","G/L","Status"].map((h, i) => (
                  <th key={h} style={{
                    textAlign: i >= 4 && i <= 8 ? "right" : "left",
                    padding: "10px 14px", fontSize: 10, fontWeight: 500, letterSpacing: 1, textTransform: "uppercase",
                    color: theme.textDim, borderBottom: `1px solid ${theme.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice().sort((a, b) => (b.fv || 0) - (a.fv || 0)).map((inv, i) => {
                const ratio = fvParPct(inv.fv, inv.par);
                const status = statusFromRatio(ratio ?? 100, inv.nonAccrual);
                const color = riskColor(status.t);
                const isGS = GS_FUNDS.has(inv.fund);
                const gl = (inv.fv || 0) - (inv.cost || 0);
                const pik = parseRate(inv.rate).pik;
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${theme.borderSoft}` }}>
                    <td style={{ padding: "9px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: gsHighlight && isGS ? theme.accent : theme.text, fontWeight: 600 }}>{inv.fund}</td>
                    <td style={{ padding: "9px 14px", color: theme.textMuted, fontSize: 11 }}>{inv.investmentType}</td>
                    <td style={{ padding: "9px 14px", color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {inv.rate}{pik && <PikBadge theme={theme} />}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{fmtDate(inv.maturity)}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right", color: theme.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{fmtM(inv.par)}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right", color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{fmtM(inv.cost)}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right", color, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{fmtM(inv.fv)}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 56, height: 4, background: theme.bgInset, borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, ratio || 0)}%`, height: "100%", background: color, transition: motion ? "width 400ms" : "none" }} />
                        </div>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color, minWidth: 40, textAlign: "right" }}>
                          {ratio != null ? ratio.toFixed(1) + "%" : "—"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "9px 14px", textAlign: "right", color: gl >= 0 ? riskColor(0.05) : riskColor(0.85), fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{fmtSigned(gl)}</td>
                    <td style={{ padding: "9px 14px" }}><StatusPill status={status} theme={theme} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Trends */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Panel theme={theme} title="FV / PAR trend by lender" subtitle="Mark divergence across BDCs">
          <MarkTrendChart periods={periods} perFund={perFund} theme={theme} motion={motion} />
        </Panel>
        <Panel theme={theme} title="Par exposure by lender" subtitle="Stacked par; height = total commitment">
          <ParStackedChart periods={periods} perFund={perFund} theme={theme} motion={motion} />
        </Panel>
      </div>

      {/* Signals */}
      <Panel theme={theme} title="Signals" subtitle="Distress fingerprints for this borrower">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <SignalTile theme={theme} label="Non-accrual onset"
            value={nonAccrOnset ? nonAccrOnset.period : "—"}
            sub={nonAccrOnset ? `first at ${nonAccrOnset.fund}` : "no non-accrual on record"}
            tone={nonAccrOnset ? 0.95 : 0.05} />
          <SignalTile theme={theme} label="Largest mark drop QoQ"
            value={largestDrop ? `${(largestDrop.delta * 100).toFixed(1)}pt` : "—"}
            sub={largestDrop ? `${largestDrop.fund} · ${largestDrop.from} → ${largestDrop.to}` : "no series data"}
            tone={largestDrop && largestDrop.delta < -0.05 ? 0.7 : 0.2} />
          <SignalTile theme={theme} label="Lender disagreement (latest)"
            value={disagreement ? `${(disagreement.spread * 100).toFixed(1)}pt` : "—"}
            sub={disagreement ? `${disagreement.lo.fid} ${(disagreement.lo.r * 100).toFixed(0)}% vs ${disagreement.hi.fid} ${(disagreement.hi.r * 100).toFixed(0)}%` : "single-lender position"}
            tone={disagreement && disagreement.spread > 0.05 ? 0.6 : 0.15} />
        </div>
      </Panel>
    </div>
  );
}

function Kpi({ theme, label, value, sub, color, border }) {
  return (
    <div style={{
      padding: "14px 18px",
      borderLeft: border ? `1px solid ${theme.borderSoft}` : "none",
      display: "flex", flexDirection: "column", gap: 4, minHeight: 80,
    }}>
      <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 9, color: theme.textDim, letterSpacing: 1.5, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 500, color: color || theme.text, letterSpacing: -0.3 }}>
        {value}
      </span>
      {sub && <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
    </div>
  );
}

function SignalTile({ theme, label, value, sub, tone }) {
  const c = riskColor(tone ?? 0.2);
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 8,
      background: `color-mix(in oklch, ${c} 6%, ${theme.bgInset})`,
      border: `1px solid color-mix(in oklch, ${c} 25%, ${theme.borderSoft})`,
    }}>
      <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 9, color: theme.textDim, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 500, color: c }}>{value}</div>
      {sub && <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/**
 * Reusable clickable borrower-name cell. Falls back to plain text if no handler is provided.
 * Caller controls truncation via the `display` prop.
 */
export function BorrowerLink({ name, display, onClick, theme, style }) {
  const text = display ?? shortCompany(name, 36);
  if (!onClick) return <span style={style}>{text}</span>;
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onClick(name); }}
      title={`Open profile for ${name}`}
      style={{
        cursor: "pointer", color: theme.text,
        borderBottom: `1px dotted color-mix(in oklch, ${theme.accent} 60%, transparent)`,
        paddingBottom: 1,
        ...style,
      }}
    >{text}</span>
  );
}
