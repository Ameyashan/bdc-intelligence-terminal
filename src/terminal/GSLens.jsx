import { useState, useMemo } from "react";
import {
  riskColor, ratioToRiskT, statusFromRatio, fvParPct, GS_FUNDS,
  fmtM, shortCompany,
} from "./designTokens.js";
import { Panel, SectionHeader } from "./Overview.jsx";

const GS_SET = new Set(["GSCR", "GSBD"]);
const PEER_SET = new Set(["ARCC", "BXSL", "OBDC", "ADS", "FSK"]);

function normName(name) {
  return (name || "").toLowerCase()
    .replace(/\(dba\s+[^)]+\)/gi, "")
    .replace(/\([^)]+\)/g, "")
    .replace(/\b(llc|inc|corp|ltd|lp|plc|holdings?|group|co\.?)\b\.?/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

export function GSLensTab({ investments, theme, motion, gsHighlight }) {
  const [filterMode, setFilterMode] = useState("diverge");
  const [sortKey, setSortKey] = useState("divergence");
  const [sortDir, setSortDir] = useState("desc");

  const crossFund = useMemo(() => {
    const byNorm = {}, canonicalMap = {};
    for (const inv of investments) {
      const norm = normName(inv.company);
      if (!norm || norm.length < 4) continue;
      if (!byNorm[norm]) byNorm[norm] = {};
      if (!byNorm[norm][inv.fund]) byNorm[norm][inv.fund] = [];
      byNorm[norm][inv.fund].push(inv);
      if (!canonicalMap[norm] || inv.company.length > canonicalMap[norm].length) {
        canonicalMap[norm] = inv.company;
      }
    }
    const rows = [];
    for (const [norm, fundMap] of Object.entries(byNorm)) {
      const gsFunds = Object.keys(fundMap).filter(f => GS_SET.has(f));
      const peerFunds = Object.keys(fundMap).filter(f => PEER_SET.has(f));
      if (!gsFunds.length || !peerFunds.length) continue;

      const summary = {};
      for (const [fid, invs] of Object.entries(fundMap)) {
        const debt = invs.filter(i => i.par > 0);
        const tPar = debt.reduce((s, i) => s + i.par, 0);
        const tFv = debt.reduce((s, i) => s + i.fv, 0);
        const isNA = invs.some(i => i.nonAccrual);
        const ratio = tPar > 0 ? tFv / tPar : null;
        summary[fid] = { par: tPar, fv: tFv, ratio: ratio && ratio <= 1.5 ? ratio : null, isNA };
      }
      const gsNa = gsFunds.some(f => summary[f].isNA);
      const gsRatios = gsFunds.map(f => summary[f].ratio).filter(r => r !== null);
      const peerRatios = peerFunds.map(f => summary[f].ratio).filter(r => r !== null);
      const gsRatio = gsRatios.length ? Math.min(...gsRatios) : null;
      const peerRatio = peerRatios.length ? Math.min(...peerRatios) : null;
      const gap = (peerRatio !== null && gsRatio !== null) ? peerRatio - gsRatio : null;
      const diverge = (gsNa && peerRatio !== null && peerRatio >= 0.90) || (gap !== null && gap > 0.10);

      rows.push({
        company: canonicalMap[norm],
        gsFunds, peerFunds, summary,
        gsNa, gsRatio, peerRatio, gap, diverge,
        gsParTotal: gsFunds.reduce((s, f) => s + (summary[f].par || 0), 0),
        peerParTotal: peerFunds.reduce((s, f) => s + (summary[f].par || 0), 0),
      });
    }
    return rows;
  }, [investments]);

  const totalDiverge = crossFund.filter(x => x.diverge).length;
  const totalNa = crossFund.filter(x => x.gsNa).length;

  const filtered = useMemo(() => {
    if (filterMode === "diverge") return crossFund.filter(x => x.diverge);
    if (filterMode === "na") return crossFund.filter(x => x.gsNa);
    return crossFund;
  }, [crossFund, filterMode]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "company")   return dir * a.company.localeCompare(b.company);
      if (sortKey === "gsRatio")   return dir * ((a.gsRatio ?? 999) - (b.gsRatio ?? 999));
      if (sortKey === "peerRatio") return dir * ((a.peerRatio ?? 999) - (b.peerRatio ?? 999));
      if (sortKey === "gap")       return dir * ((a.gap ?? -999) - (b.gap ?? -999));
      if (sortKey === "gsPar")     return dir * (a.gsParTotal - b.gsParTotal);
      const aScore = (a.gsNa ? -1 : a.gsRatio ?? 1) - (a.peerRatio ?? 1);
      const bScore = (b.gsNa ? -1 : b.gsRatio ?? 1) - (b.peerRatio ?? 1);
      return dir * (aScore - bScore);
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }
  const arrow = (k) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const accent = theme.accent;
  const amber = riskColor(0.55);
  const danger = riskColor(0.95);

  function FilterBtn({ id, label, count, color }) {
    const active = filterMode === id;
    return (
      <button onClick={() => setFilterMode(id)} style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 500,
        padding: "6px 12px",
        background: active ? `color-mix(in oklch, ${color} 14%, transparent)` : "transparent",
        border: `1px solid ${active ? color : theme.borderSoft}`,
        color: active ? color : theme.textDim,
        borderRadius: 6, cursor: "pointer", letterSpacing: 0.5,
        transition: "all 180ms ease",
      }}>
        {label} <span style={{ opacity: 0.7 }}>({count})</span>
      </button>
    );
  }

  const thBase = {
    padding: "11px 14px", fontSize: 10, fontWeight: 500,
    letterSpacing: 1, textTransform: "uppercase",
    color: theme.textDim, borderBottom: `1px solid ${theme.border}`,
    textAlign: "left", userSelect: "none",
  };

  return (
    <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeader theme={theme}
        title={<span>GS Lens <span style={{ color: accent, marginLeft: 6 }}>⚡</span></span>}
        subtitle="Cross-fund borrower divergence — where GS marks differ from peers" />

      <Panel theme={theme} padding={16}>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 12, color: theme.textMuted, lineHeight: 1.6, flex: "1 1 420px" }}>
            Borrowers held in <span style={{ color: accent, fontWeight: 600 }}>GSCR or GSBD</span> that also appear in a peer fund.
            <span style={{ color: amber, fontWeight: 600 }}>{" "}Divergence</span> = peer marks the same borrower &gt;10pp higher,
            or peer is at par while GS is on <span style={{ color: danger, fontWeight: 600 }}>non-accrual</span>.
          </div>
          <div style={{ display: "flex", gap: 18, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
            <Stat theme={theme} label="Shared" value={crossFund.length} color={accent} />
            <Stat theme={theme} label="Diverge" value={totalDiverge} color={amber} />
            <Stat theme={theme} label="GS NA" value={totalNa} color={danger} />
          </div>
        </div>
      </Panel>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <FilterBtn id="diverge" label="⚡ Divergence" count={totalDiverge} color={amber} />
        <FilterBtn id="na" label="✕ GS Non-accrual" count={totalNa} color={danger} />
        <FilterBtn id="all" label="All shared" count={crossFund.length} color={theme.textMuted} />
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.bgPanel, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Inter Tight', sans-serif", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, background: theme.bgPanel2, zIndex: 2 }}>
            <tr>
              {[
                { key: "company",   label: "Borrower" },
                { key: null,        label: "GS Funds" },
                { key: "gsPar",     label: "GS Par" },
                { key: "gsRatio",   label: "GS FV/PAR" },
                { key: null,        label: "GS Status" },
                { key: null,        label: "Peers" },
                { key: "peerRatio", label: "Peer FV/PAR" },
                { key: "gap",       label: "Gap" },
                { key: null,        label: "Signal" },
              ].map(h => (
                <th key={h.label} style={{ ...thBase, cursor: h.key ? "pointer" : "default" }}
                    onClick={h.key ? () => toggleSort(h.key) : undefined}>
                  {h.label}{h.key ? arrow(h.key) : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const gsStatus = row.gsNa
                ? { label: "non-accrual", t: 1 }
                : row.gsRatio !== null
                  ? statusFromRatio(row.gsRatio * 100, false)
                  : { label: "—", t: 0 };
              const gsColor = riskColor(gsStatus.t);
              const peerStatus = row.peerRatio !== null
                ? statusFromRatio(row.peerRatio * 100, false)
                : null;
              const peerColor = peerStatus ? riskColor(peerStatus.t) : theme.textDim;
              const gap = row.gap;
              const gapT = gap === null ? null
                : gap > 0.20 ? 0.95 : gap > 0.10 ? 0.65 : gap > 0 ? 0.4 : 0.05;
              const gapColor = gapT === null ? theme.textDim : riskColor(gapT);
              const rowBg = row.gsNa
                ? `color-mix(in oklch, ${danger} 8%, transparent)`
                : row.diverge
                  ? `color-mix(in oklch, ${amber} 6%, transparent)`
                  : i % 2 === 0 ? "transparent" : theme.bgInset;
              return (
                <tr key={i} style={{ background: rowBg, transition: motion ? "background 100ms" : "none" }}>
                  <td style={{ padding: "9px 14px", color: theme.text, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                    {shortCompany(row.company, 36)}
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    {row.gsFunds.map(f => (
                      <span key={f} style={{ color: accent, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, marginRight: 6 }}>
                        {f}
                      </span>
                    ))}
                  </td>
                  <td style={{ padding: "9px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.text }}>{fmtM(row.gsParTotal)}</td>
                  <td style={{ padding: "9px 14px" }}>
                    {row.gsRatio !== null ? (
                      <RatioBar theme={theme} pct={row.gsRatio * 100} color={gsColor} motion={motion} />
                    ) : <span style={{ color: theme.textDim }}>—</span>}
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <StatusBadge label={gsStatus.label} color={gsColor} />
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    {row.peerFunds.map(f => {
                      const ps = row.summary[f];
                      const pSt = ps.ratio !== null
                        ? statusFromRatio(ps.ratio * 100, ps.isNA)
                        : null;
                      const pColor = pSt ? riskColor(pSt.t) : theme.textDim;
                      return (
                        <span key={f}
                          title={`${f}: ${ps.ratio !== null ? (ps.ratio * 100).toFixed(1) + "%" : "—"}`}
                          style={{ marginRight: 6, color: pColor, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600 }}>
                          {f}
                        </span>
                      );
                    })}
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    {row.peerRatio !== null ? (
                      <RatioBar theme={theme} pct={row.peerRatio * 100} color={peerColor} motion={motion} />
                    ) : <span style={{ color: theme.textDim }}>—</span>}
                  </td>
                  <td style={{ padding: "9px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: gapColor }}>
                    {gap !== null ? `${gap > 0 ? "+" : ""}${(gap * 100).toFixed(1)}pp` : "—"}
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    {row.gsNa && row.peerRatio !== null && row.peerRatio >= 0.90
                      ? <StatusBadge label="NA ≠ par" color={danger} />
                      : row.diverge
                        ? <StatusBadge label="diverge" color={amber} />
                        : <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim, letterSpacing: 0.8, textTransform: "uppercase" }}>aligned</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", fontFamily: "'Inter Tight', sans-serif", color: theme.textDim, fontSize: 12 }}>
            No results for current filter.
          </div>
        )}
      </div>

      <div style={{
        fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim,
        lineHeight: 1.6, paddingTop: 4,
      }}>
        <strong style={{ color: theme.textMuted }}>Gap</strong> = peer lowest FV/PAR minus GS lowest FV/PAR (positive = peer marks higher than GS, a divergence signal).
        Hover peer fund tickers to see each peer's individual FV/PAR.
        Borrower matching uses fuzzy name normalization (legal suffixes and parentheticals stripped).
      </div>
    </div>
  );
}

function Stat({ theme, label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
      <span style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 9, color: theme.textDim, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600, color, marginTop: 2 }}>{value}</span>
    </div>
  );
}

function RatioBar({ theme, pct, color, motion }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 56, height: 4, background: theme.bgInset, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, transition: motion ? "width 400ms" : "none" }} />
      </div>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color, minWidth: 40 }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function StatusBadge({ label, color }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 99, fontSize: 9, letterSpacing: 0.8,
      textTransform: "uppercase", fontWeight: 500, color,
      fontFamily: "'Inter Tight', sans-serif",
      background: `color-mix(in oklch, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in oklch, ${color} 40%, transparent)`,
    }}>
      {label}
    </span>
  );
}
