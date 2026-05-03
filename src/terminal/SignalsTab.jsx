import { useState, useMemo, useEffect } from "react";
import { riskColor, ratioToRiskT, fmtM, shortCompany } from "./designTokens.js";
import { Panel, SectionHeader } from "./Overview.jsx";
import { computeAllSignals } from "./signals.js";

/** Click-to-sort header cell. */
function Th({ label, sortKey, currentKey, currentDir, onSort, theme, align = "left" }) {
  const isActive = currentKey === sortKey;
  const arrow = isActive ? (currentDir === "desc" ? "▼" : "▲") : "";
  return (
    <div
      onClick={() => onSort(sortKey)}
      style={{
        cursor: "pointer", userSelect: "none",
        textAlign: align,
        color: isActive ? theme.text : theme.textDim,
        transition: "color 120ms",
      }}
      title={`Sort by ${label}`}
    >
      {label}
      {arrow && <span style={{ marginLeft: 4, color: theme.accent }}>{arrow}</span>}
    </div>
  );
}

/** Default sort key + direction per detector. */
const DEFAULT_SORT = {
  markDrift:  { key: "drop",      dir: "desc" },
  pikCreep:   { key: "pikDelta",  dir: "desc" },
  divergence: { key: "growth",    dir: "desc" },
};

/**
 * Sparkline of FV/Par across the period series. Series is ordered LATEST first,
 * so we reverse for left-to-right time order.
 */
function FvParSparkline({ series, theme, width = 90, height = 24 }) {
  if (!series || series.length < 2) {
    return <span style={{ color: theme.textDim, fontSize: 10 }}>—</span>;
  }
  const points = series.slice().reverse().map(s => {
    const r = s.par > 0 ? Math.max(0, Math.min(1.5, s.fv / s.par)) : 1;
    return r;
  });
  const minR = Math.min(...points, 0.85);
  const maxR = Math.max(...points, 1.0);
  const range = Math.max(0.05, maxR - minR);
  const xs = points.map((_, i) => (i / (points.length - 1)) * (width - 4) + 2);
  const ys = points.map(r => height - 2 - ((r - minR) / range) * (height - 4));
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const lastT = ratioToRiskT(points[points.length - 1] * 100, false);
  const stroke = riskColor(lastT);
  return (
    <svg width={width} height={height} style={{ overflow: "visible", verticalAlign: "middle" }}>
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={1.6} fill={i === xs.length - 1 ? stroke : theme.textDim} />
      ))}
    </svg>
  );
}

function SignalRow({ children, theme }) {
  return (
    <div style={{
      display: "grid", alignItems: "center",
      padding: "10px 12px",
      borderTop: `1px solid ${theme.borderSoft}`,
      fontFamily: "'Inter Tight', sans-serif", fontSize: 12,
      color: theme.text,
    }}>
      {children}
    </div>
  );
}

function SignalCard({ title, hits, theme, children, accent }) {
  return (
    <Panel theme={theme} padding={0}>
      <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, letterSpacing: -0.2 }}>{title}</div>
          <div style={{ fontSize: 10, color: theme.textDim, marginTop: 2, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>
            {hits} HIT{hits === 1 ? "" : "S"}
          </div>
        </div>
        {accent && <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", color: accent, letterSpacing: 1 }}>● LIVE</span>}
      </div>
      {children}
    </Panel>
  );
}

const FUND_BADGE_BG = "color-mix(in oklch, currentColor 14%, transparent)";

function FundBadge({ id, theme }) {
  return (
    <span style={{
      display: "inline-block",
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
      padding: "1px 6px", borderRadius: 3,
      background: FUND_BADGE_BG,
      color: theme.text,
      letterSpacing: 0.5,
    }}>{id}</span>
  );
}

export function SignalsTab({ investments, theme, motion, drillToSOI }) {
  const [activeDetector, setActiveDetector] = useState("markDrift");
  const [topN, setTopN] = useState(20);
  const [sortKey, setSortKey] = useState(DEFAULT_SORT.markDrift.key);
  const [sortDir, setSortDir] = useState(DEFAULT_SORT.markDrift.dir);

  // Reset sort + paging when switching detectors so each tab opens with its
  // most informative default ordering.
  useEffect(() => {
    setSortKey(DEFAULT_SORT[activeDetector].key);
    setSortDir(DEFAULT_SORT[activeDetector].dir);
    setTopN(20);
  }, [activeDetector]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const signals = useMemo(() => computeAllSignals(investments), [investments]);

  const detectorMeta = {
    markDrift: {
      title: "Mark Drift Down",
      desc: "FV/Par fell ≥5pt across 3 quarters. Highest signal when position is still performing — the lender hasn't fully caught up to the downside yet.",
      hits: signals.markDrift,
    },
    pikCreep: {
      title: "PIK Creep",
      desc: "PIK% in the rate structure increased period-over-period. Pure cash-conservation tell. Combined with mark decline = clean pre-distress fingerprint.",
      hits: signals.pikCreep,
    },
    divergence: {
      title: "Cross-Fund Divergence Widening",
      desc: "Borrower held by ≥3 funds where the std-dev of FV/Par grew across periods. Means at least one lender is updating their view while others aren't — wisdom-of-the-crowd outlier.",
      hits: signals.divergence,
    },
  };

  const active = detectorMeta[activeDetector];

  const sortedHits = useMemo(() => {
    const hits = [...active.hits];
    hits.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      let cmp;
      if (typeof va === "string" && typeof vb === "string") {
        cmp = va.localeCompare(vb);
      } else if (typeof va === "boolean" || typeof vb === "boolean") {
        cmp = (va ? 1 : 0) - (vb ? 1 : 0);
      } else {
        cmp = (va ?? 0) - (vb ?? 0);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return hits;
  }, [active.hits, sortKey, sortDir]);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionHeader theme={theme} title="Predictive Signals"
        subtitle={`Computed across ${signals.markDrift.length + signals.pikCreep.length + signals.divergence.length} observations from 3 quarterly snapshots`} />

      {/* Detector cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {Object.entries(detectorMeta).map(([key, meta]) => {
          const isActive = activeDetector === key;
          return (
            <div key={key}
              onClick={() => setActiveDetector(key)}
              style={{
                cursor: "pointer",
                background: theme.bgPanel,
                border: `1px solid ${isActive ? theme.accent : theme.border}`,
                borderRadius: 10,
                padding: 16,
                transition: "border-color 200ms",
                boxShadow: isActive ? `0 0 0 1px ${theme.accent}55` : "none",
              }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.text, letterSpacing: -0.1 }}>{meta.title}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, color: isActive ? theme.accent : theme.text, fontWeight: 600 }}>
                  {meta.hits.length}
                </div>
              </div>
              <div style={{ fontSize: 10, color: theme.textDim, lineHeight: 1.5 }}>{meta.desc}</div>
            </div>
          );
        })}
      </div>

      {/* Active detector ranked list */}
      <SignalCard title={`${active.title} — top ${Math.min(topN, sortedHits.length)} of ${sortedHits.length}`} hits={sortedHits.length} theme={theme} accent={theme.accent}>
        {sortedHits.length === 0 && (
          <div style={{ padding: "24px 16px", color: theme.textDim, fontSize: 12 }}>
            No hits at current thresholds. Try lowering them in the controls (coming soon).
          </div>
        )}

        {/* Header row (sortable) */}
        {sortedHits.length > 0 && activeDetector === "markDrift" && (
          <SignalRow theme={theme}>
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 130px 120px 90px 80px 60px", alignItems: "center", gap: 10, fontSize: 10, letterSpacing: 0.5, fontFamily: "'JetBrains Mono', monospace" }}>
              <Th label="FUND"        sortKey="fund"            currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="BORROWER"    sortKey="company"         currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="INDUSTRY"    sortKey="industry"        currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="FV/PAR DROP" sortKey="drop"            currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="PAR"         sortKey="par"             currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} align="right" />
              <Th label="STATUS"      sortKey="stillPerforming" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <div style={{ color: theme.textDim }}>FV/PAR</div>
            </div>
          </SignalRow>
        )}
        {sortedHits.length > 0 && activeDetector === "pikCreep" && (
          <SignalRow theme={theme}>
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 130px 140px 90px 60px", alignItems: "center", gap: 10, fontSize: 10, letterSpacing: 0.5, fontFamily: "'JetBrains Mono', monospace" }}>
              <Th label="FUND"             sortKey="fund"      currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="BORROWER"         sortKey="company"   currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="INDUSTRY"         sortKey="industry"  currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="PIK% TRAJECTORY"  sortKey="pikDelta"  currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="PAR"              sortKey="par"       currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} align="right" />
              <div style={{ color: theme.textDim }}>FV/PAR</div>
            </div>
          </SignalRow>
        )}
        {sortedHits.length > 0 && activeDetector === "divergence" && (
          <SignalRow theme={theme}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 60px 130px 90px", alignItems: "center", gap: 10, fontSize: 10, letterSpacing: 0.5, fontFamily: "'JetBrains Mono', monospace" }}>
              <Th label="BORROWER"        sortKey="borrower"  currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="INDUSTRY"        sortKey="industry"  currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="FUNDS"           sortKey="fundCount" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="STD-DEV GROWTH"  sortKey="growth"    currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} />
              <Th label="TOTAL PAR"       sortKey="totalPar"  currentKey={sortKey} currentDir={sortDir} onSort={handleSort} theme={theme} align="right" />
            </div>
          </SignalRow>
        )}

        {sortedHits.slice(0, topN).map((h, i) => {
          if (activeDetector === "markDrift") {
            return (
              <SignalRow key={i} theme={theme}>
                <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 130px 120px 90px 80px 60px", alignItems: "center", gap: 10 }}>
                  <FundBadge id={h.fund} theme={theme} />
                  <div onClick={() => drillToSOI && drillToSOI({ search: shortCompany(h.company, 30) })}
                    style={{ cursor: "pointer", color: theme.text }}
                    title="Open in SOI">
                    {shortCompany(h.company, 60)}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textDim }}>{h.industry}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                    <span style={{ color: theme.textDim }}>{(h.ratioOldest * 100).toFixed(0)}</span>
                    <span style={{ color: theme.textDim, margin: "0 4px" }}>→</span>
                    <span style={{ color: riskColor(ratioToRiskT(h.ratioLatest * 100, false)) }}>{(h.ratioLatest * 100).toFixed(0)}</span>
                    <span style={{ color: riskColor(0.7), marginLeft: 6 }}>−{(h.drop * 100).toFixed(1)}pt</span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: "right" }}>{fmtM(h.par)}</div>
                  <div style={{ fontSize: 10, color: h.stillPerforming ? theme.accent : riskColor(1), fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}
                       title={h.stillPerforming ? "Still performing — lender hasn't moved to non-accrual" : "Non-accrual — lender has stopped recognizing interest income"}>
                    {h.stillPerforming ? "PERF" : "NON-ACCR"}
                  </div>
                  <FvParSparkline series={h.series} theme={theme} width={56} height={20} />
                </div>
              </SignalRow>
            );
          }
          if (activeDetector === "pikCreep") {
            return (
              <SignalRow key={i} theme={theme}>
                <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 130px 140px 90px 60px", alignItems: "center", gap: 10 }}>
                  <FundBadge id={h.fund} theme={theme} />
                  <div onClick={() => drillToSOI && drillToSOI({ search: shortCompany(h.company, 30) })}
                    style={{ cursor: "pointer", color: theme.text }}
                    title="Open in SOI">
                    {shortCompany(h.company, 60)}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textDim }}>{h.industry}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                    <span style={{ color: theme.textDim }}>{h.pikOldest.toFixed(1)}%</span>
                    <span style={{ color: theme.textDim, margin: "0 4px" }}>→</span>
                    <span style={{ color: riskColor(0.7) }}>{h.pikLatest.toFixed(1)}%</span>
                    <span style={{ color: riskColor(0.5), marginLeft: 6 }}>+{h.pikDelta.toFixed(1)}pp</span>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: "right" }}>{fmtM(h.par)}</div>
                  <span title="FV/Par mark trajectory across the 3 periods. PIK can rise while mark falls — that combination is the strongest pre-distress signal.">
                    <FvParSparkline series={h.series} theme={theme} width={56} height={20} />
                  </span>
                </div>
              </SignalRow>
            );
          }
          // divergence
          return (
            <SignalRow key={i} theme={theme}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 60px 130px 90px", alignItems: "center", gap: 10 }}>
                <div onClick={() => drillToSOI && drillToSOI({ search: shortCompany(h.borrower, 30) })}
                  style={{ cursor: "pointer", color: theme.text }}
                  title="Open in SOI">
                  {shortCompany(h.borrower, 60)}
                  <span style={{ fontSize: 10, color: theme.textDim, marginLeft: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                    {h.funds.join(" ")}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: theme.textDim }}>{h.industry}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{h.fundCount}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                  <span style={{ color: theme.textDim }}>{(h.stdOldest * 100).toFixed(1)}pt</span>
                  <span style={{ color: theme.textDim, margin: "0 4px" }}>→</span>
                  <span style={{ color: riskColor(0.6) }}>{(h.stdLatest * 100).toFixed(1)}pt</span>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: "right" }}>{fmtM(h.totalPar)}</div>
              </div>
            </SignalRow>
          );
        })}

        {sortedHits.length > topN && (
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${theme.borderSoft}`, textAlign: "center" }}>
            <button onClick={() => setTopN(n => n + 20)}
              style={{
                background: "transparent", border: `1px solid ${theme.border}`,
                color: theme.textDim, padding: "6px 16px", borderRadius: 4,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1,
                cursor: "pointer",
              }}>
              SHOW 20 MORE
            </button>
          </div>
        )}
      </SignalCard>

      <div style={{ fontSize: 10, color: theme.textDim, marginTop: 8, lineHeight: 1.6, fontFamily: "'Inter Tight', sans-serif" }}>
        <strong style={{ color: theme.text }}>Methodology:</strong> Detectors run on the time-series ingest of EDGAR 10-K (latest FY) + 10-Q (prior 2 quarters). Each investment is matched across periods on (fund, normalized borrower name, investment type, maturity), with positional pairing for tranche groups. Low-confidence reconciliations are excluded from Mark Drift to avoid false positives. The Spirit Airlines retroactive test is the validation: had any of these detectors surfaced Spirit before the filing, the framework is predictive — if not, treat the signals as descriptive of distress in already-impaired credits.
      </div>
    </div>
  );
}
