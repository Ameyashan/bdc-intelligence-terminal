import { useState, useEffect, useMemo } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BG       = "#0a0e1a";
const BG_ALT   = "#0d1220";
const BORDER   = "#1e2d4a";
const GREEN    = "#00ff88";
const AMBER    = "#ffd700";
const RED      = "#ff3333";
const ORANGE   = "#ff8c00";
const BLUE     = "#00bfff";
const BLUE2    = "#0080ff";
const PURPLE   = "#cc44ff";
const DIM      = "#3a4a6a";
const TEXT     = "#c8d8f0";
const TEXT_DIM = "#5a7090";

const FUND_COLORS = {
  GSCR: BLUE,
  GSBD: BLUE2,
  ARCC: GREEN,
  BXSL: AMBER,
  OBDC: ORANGE,
  ADS:  PURPLE,
  FSK:  RED,
};

const ALL_FUNDS = ["GSCR", "GSBD", "ARCC", "BXSL", "OBDC", "ADS", "FSK"];
const GS_FUNDS  = new Set(["GSCR", "GSBD"]);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmtM(n) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${n < 0 ? "-" : ""}$${(abs / 1000).toFixed(2)}B`;
  return `${n < 0 ? "-" : ""}$${abs.toFixed(1)}M`;
}

function fvParPct(fv, par) {
  if (!par || par === 0) return 0;
  return (fv / par) * 100;
}

function statusFromRatio(ratio, nonAccrual) {
  if (nonAccrual) return { label: "NON-ACCR", color: RED };
  if (ratio >= 97)  return { label: "PAR",      color: GREEN };
  if (ratio >= 90)  return { label: "WATCH",    color: AMBER };
  if (ratio >= 80)  return { label: "STRESS",   color: ORANGE };
  return             { label: "DISTRESS", color: RED };
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

// ─── STYLE INJECTION ──────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.15; }
  }
  @keyframes blink-cursor {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
  @keyframes skeleton-flash {
    0%, 100% { background-color: #0d1a2e; }
    50%       { background-color: #152240; }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #0a0e1a; }
  ::-webkit-scrollbar-thumb { background: #1e2d4a; }
  ::-webkit-scrollbar-thumb:hover { background: #2a4070; }

  .bdc-pulse { animation: pulse-dot 1.4s ease-in-out infinite; }
  .bdc-blink { animation: blink-cursor 1s step-end infinite; }
  .bdc-skeleton { animation: skeleton-flash 1.4s ease-in-out infinite; }

  .bdc-fund-btn {
    cursor: pointer;
    user-select: none;
    transition: opacity 0.15s, border-color 0.15s;
  }
  .bdc-fund-btn:hover { opacity: 1 !important; }

  .bdc-tab {
    cursor: pointer;
    user-select: none;
    transition: color 0.15s, border-color 0.15s;
  }

  .bdc-th {
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }
  .bdc-th:hover { color: #00ff88; }

  .bdc-row-na  { background-color: #1a0000 !important; }
  .bdc-row-gs  { background-color: #001a2e !important; }
  .bdc-tr:hover td { filter: brightness(1.15); }
`;

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function InlineBar({ pct, color, height = 4, width = 60 }) {
  const filled = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ display: "inline-block", width, height, background: "#1e2d4a", verticalAlign: "middle", position: "relative" }}>
      <div style={{ width: `${filled}%`, height: "100%", background: color, transition: "width 0.3s" }} />
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 5px",
      border: `1px solid ${color}`,
      color,
      fontSize: 9,
      fontFamily: "JetBrains Mono, monospace",
      letterSpacing: 0.5,
      lineHeight: "14px",
    }}>
      {label}
    </span>
  );
}

function SortIndicator({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <span style={{ color: DIM, marginLeft: 3 }}>⇅</span>;
  return <span style={{ color: GREEN, marginLeft: 3 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
}

// ─── LOADING SKELETON ─────────────────────────────────────────────────────────
function LoadingSkeleton() {
  const block = (w, h = 14, mb = 8) => (
    <div className="bdc-skeleton" style={{ width: w, height: h, marginBottom: mb, background: "#0d1a2e" }} />
  );
  return (
    <div style={{ padding: 24, fontFamily: "JetBrains Mono, monospace" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <span className="bdc-blink" style={{ color: GREEN, fontSize: 20, fontWeight: 700 }}>▋</span>
        <span style={{ color: GREEN, fontSize: 13, letterSpacing: 2 }}>LOADING DATA...</span>
      </div>
      {[1,2,3].map(i => (
        <div key={i} style={{ marginBottom: 20 }}>
          {block("60%", 12)}
          {block("80%", 10)}
          {block("45%", 10)}
          {block("90%", 10)}
        </div>
      ))}
      <div style={{ display: "flex", gap: 12 }}>
        {[1,2,3,4,5,6,7].map(i => (
          <div key={i} className="bdc-skeleton" style={{ width: 80, height: 100, background: "#0d1a2e" }} />
        ))}
      </div>
    </div>
  );
}

// ─── TOP BAR ──────────────────────────────────────────────────────────────────
function TopBar({ fundCount }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  const ss = String(time.getSeconds()).padStart(2, "0");
  const clockStr = `${hh}:${mm}:${ss} EDT`;

  const scanStyle = {
    backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.015) 2px, rgba(0,255,136,0.015) 4px)",
    backgroundSize: "100% 4px",
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 16px",
      borderBottom: `2px solid ${GREEN}`,
      background: "#060a14",
      ...scanStyle,
      position: "sticky", top: 0, zIndex: 100,
    }}>
      {/* Left */}
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 14, color: GREEN, letterSpacing: 1 }}>
        ◈ BDC INTELLIGENCE TERMINAL
      </div>

      {/* Center */}
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: AMBER, letterSpacing: 2, fontWeight: 600 }}>
        COMMON DATE: DEC 31 2025
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
        <span style={{ color: TEXT_DIM }}>{fundCount} FUNDS</span>
        <span style={{ color: TEXT_DIM, letterSpacing: 1 }}>{clockStr}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="bdc-pulse" style={{ color: GREEN, fontSize: 10 }}>●</span>
          <span style={{ color: GREEN, fontWeight: 600, letterSpacing: 1 }}>LIVE</span>
        </span>
      </div>
    </div>
  );
}

// ─── FUND SELECTOR STRIP ──────────────────────────────────────────────────────
function FundStrip({ selected, onToggle }) {
  return (
    <div style={{
      display: "flex", gap: 8, padding: "10px 16px",
      borderBottom: `1px solid ${BORDER}`,
      background: "#080c18",
      flexWrap: "wrap",
    }}>
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_DIM, alignSelf: "center", marginRight: 8, letterSpacing: 1 }}>FUNDS ▸</span>
      {ALL_FUNDS.map(id => {
        const isGS   = GS_FUNDS.has(id);
        const active = selected.has(id);
        const borderColor = isGS ? BLUE : (active ? DIM : "#111827");
        return (
          <button
            key={id}
            className="bdc-fund-btn"
            onClick={() => onToggle(id)}
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 12px",
              background: active ? (isGS ? "rgba(0,191,255,0.08)" : "rgba(255,255,255,0.04)") : "transparent",
              border: `1px solid ${active ? borderColor : "#1a2540"}`,
              color: active ? (isGS ? BLUE : TEXT) : TEXT_DIM,
              opacity: active ? 1 : 0.45,
              borderRadius: 0,
              cursor: "pointer",
              letterSpacing: 0.5,
            }}
          >
            {isGS ? `★ ${id}` : id}
          </button>
        );
      })}
    </div>
  );
}

// ─── TAB BAR ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",  label: "OVERVIEW" },
  { id: "soi",       label: "SCH. OF INVESTMENTS" },
  { id: "industry",  label: "INDUSTRY CONC." },
  { id: "search",    label: "BORROWER SEARCH" },
  { id: "stress",    label: "STRESS REGISTER" },
  { id: "gslens",    label: "GS LENS ⚡", accent: true },
];

function TabBar({ active, onChange }) {
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, background: "#080c18" }}>
      {TABS.map((tab, i) => {
        const isActive = active === tab.id;
        return (
          <div
            key={tab.id}
            className="bdc-tab"
            onClick={() => onChange(tab.id)}
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              fontWeight: isActive ? 700 : 400,
              padding: "8px 18px",
              color: isActive ? (tab.accent ? AMBER : GREEN) : (tab.accent ? ORANGE : TEXT_DIM),
              borderBottom: isActive ? `2px solid ${tab.accent ? AMBER : GREEN}` : "2px solid transparent",
              borderRight: `1px solid ${BORDER}`,
              letterSpacing: 0.8,
              whiteSpace: "nowrap",
            }}
          >
            {String(i + 1).padStart(2, "0")} {tab.label}
          </div>
        );
      })}
    </div>
  );
}

// ─── SHARED TABLE STYLES ──────────────────────────────────────────────────────
const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 11,
};

const thStyle = {
  padding: "6px 10px",
  background: "#060a14",
  color: TEXT_DIM,
  textAlign: "left",
  borderBottom: `1px solid ${BORDER}`,
  borderRight: `1px solid ${BORDER}`,
  fontSize: 10,
  letterSpacing: 0.5,
  fontWeight: 600,
  position: "sticky",
  top: 0,
  zIndex: 5,
};

const tdStyle = {
  padding: "5px 10px",
  color: TEXT,
  borderBottom: `1px solid #111827`,
  borderRight: `1px solid #0d1525`,
  whiteSpace: "nowrap",
};

// ─── TAB 1: OVERVIEW ─────────────────────────────────────────────────────────
function OverviewTab({ funds, investments, selectedFunds }) {
  const selFunds = funds.filter(f => selectedFunds.has(f.id));

  const nonAccruals = useMemo(() =>
    investments.filter(inv => inv.nonAccrual && selectedFunds.has(inv.fund)),
    [investments, selectedFunds]
  );

  const softwareByFund = useMemo(() =>
    selFunds.map(f => ({
      id: f.id,
      pct: f.softwarePct || 0,
      color: f.softwarePct > 30 ? ORANGE : f.softwarePct > 20 ? AMBER : GREEN,
    })),
    [selFunds]
  );

  const maxSoftware = Math.max(...softwareByFund.map(x => x.pct), 1);

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Fund Cards */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {selFunds.map(f => {
          const ratio    = fvParPct(f.totalFV, f.totalPar);
          const isGS     = GS_FUNDS.has(f.id);
          const barColor = ratio >= 97 ? GREEN : ratio >= 90 ? AMBER : ratio >= 80 ? ORANGE : RED;
          const gl       = f.totalFV - f.totalCost;
          const glColor  = gl >= 0 ? GREEN : RED;
          return (
            <div key={f.id} style={{
              flex: "1 1 150px", minWidth: 150, maxWidth: 200,
              border: `1px solid ${BORDER}`,
              borderLeft: `3px solid ${isGS ? BLUE : FUND_COLORS[f.id] || DIM}`,
              background: BG_ALT,
              padding: "10px 12px",
            }}>
              {/* Header: ticker + manager abbrev */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 13, color: isGS ? BLUE : TEXT }}>
                  {isGS ? `★ ${f.id}` : f.id}
                </span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: TEXT_DIM, letterSpacing: 0.5 }}>
                  {f.manager?.split(" ")[0]?.toUpperCase()}
                </span>
              </div>

              {/* Fair Value */}
              <div style={{ marginBottom: 6 }}
                title="Fair Value — The current marked value of the fund's total investment portfolio as of Dec 31 2025.">
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: TEXT_DIM, letterSpacing: 1, marginBottom: 2 }}>FAIR VALUE</div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: TEXT }}>{fmtM(f.totalFV)}</div>
              </div>

              {/* FV/PAR bar */}
              <div style={{ marginBottom: 6 }}
                title={`FV/PAR — Fair Value as a % of Par (face value). ${ratio.toFixed(1)}% means the portfolio is trading at ${ratio.toFixed(1)} cents on the dollar. >97% = at par; <80% = stressed; <50% = distressed.`}>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: TEXT_DIM, letterSpacing: 1, marginBottom: 4 }}>FV / PAR</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <InlineBar pct={Math.min(ratio, 150)} color={barColor} width={70} height={4} />
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: barColor, fontWeight: 600 }}>{ratio.toFixed(1)}%</span>
                </div>
              </div>

              {/* Unreal G/L */}
              <div style={{ marginBottom: 6 }}
                title={`Unrealized G/L — Fair Value minus Cost (amortized cost basis). ${gl >= 0 ? "+" : ""}${fmtM(gl)} represents paper ${gl >= 0 ? "gains" : "losses"} not yet realized.`}>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: TEXT_DIM, letterSpacing: 1, marginBottom: 2 }}>UNREAL G/L</div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: glColor }}>{gl >= 0 ? "+" : ""}{fmtM(gl)}</div>
              </div>

              {/* Risk counts */}
              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                {f.nonAccrualCount > 0 && (
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: RED }}
                    title="Non-Accrual — Positions where the borrower has stopped making interest payments. Income is no longer being accrued.">
                    ✕ {f.nonAccrualCount} non-accrual{f.nonAccrualCount !== 1 ? "s" : ""}
                  </div>
                )}
                {f.stressedCount > 0 && (
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: ORANGE }}
                    title="Stressed — Positions marked below 90% of par. Borrower may be experiencing financial difficulty but still current on payments.">
                    ⚠ {f.stressedCount} stressed
                  </div>
                )}
                {f.nonAccrualCount === 0 && f.stressedCount === 0 && (
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: GREEN }}>✓ clean</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2-col: Comparison Table + Software Bar Chart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Comparison Table */}
        <div style={{ border: `1px solid ${BORDER}`, overflow: "auto" }}>
          <div style={{ padding: "6px 10px", background: "#060a14", borderBottom: `1px solid ${BORDER}`, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_DIM, letterSpacing: 1 }}>FUND COMPARISON</div>
          <table style={tableStyle}>
            <thead>
              <tr>
                {["Fund","FV","FV/PAR","Unreal G/L","Non-Accruals","Stressed"].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selFunds.map((f, i) => {
                const ratio = fvParPct(f.totalFV, f.totalPar);
                const gl    = f.totalFV - f.totalCost;
                const glColor = gl >= 0 ? GREEN : RED;
                const rowBg = i % 2 === 0 ? BG : BG_ALT;
                const isGS  = GS_FUNDS.has(f.id);
                return (
                  <tr key={f.id} style={{ background: rowBg }}>
                    <td style={{ ...tdStyle, color: isGS ? BLUE : TEXT, fontWeight: isGS ? 700 : 400 }}>{isGS ? `★ ${f.id}` : f.id}</td>
                    <td style={tdStyle}>{fmtM(f.totalFV)}</td>
                    <td style={{ ...tdStyle, color: ratio >= 97 ? GREEN : ratio >= 90 ? AMBER : ratio >= 80 ? ORANGE : RED }}>
                      {ratio.toFixed(2)}%
                    </td>
                    <td style={{ ...tdStyle, color: glColor }}>{gl >= 0 ? "+" : ""}{fmtM(gl)}</td>
                    <td style={{ ...tdStyle, color: f.nonAccrualCount > 0 ? RED : TEXT_DIM }}>{f.nonAccrualCount}</td>
                    <td style={{ ...tdStyle, color: f.stressedCount > 0 ? ORANGE : TEXT_DIM }}>{f.stressedCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Software Exposure Bar Chart */}
        <div style={{ border: `1px solid ${BORDER}` }}>
          <div style={{ padding: "6px 10px", background: "#060a14", borderBottom: `1px solid ${BORDER}`, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_DIM, letterSpacing: 1 }}>
            SOFTWARE EXPOSURE %
          </div>
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {softwareByFund.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: GS_FUNDS.has(item.id) ? BLUE : TEXT, width: 46, textAlign: "right" }}>
                  {GS_FUNDS.has(item.id) ? `★ ${item.id}` : item.id}
                </span>
                <div style={{ flex: 1, height: 14, background: "#1e2d4a", position: "relative" }}>
                  <div style={{
                    width: `${(item.pct / maxSoftware) * 100}%`,
                    height: "100%",
                    background: item.color,
                    transition: "width 0.4s",
                  }} />
                </div>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: item.color, width: 38, textAlign: "right" }}>
                  {item.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Non-Accrual Spotlight */}
      {nonAccruals.length > 0 && (
        <div style={{ border: `1px solid ${RED}` }}>
          <div style={{ padding: "6px 10px", background: "#150000", borderBottom: `1px solid ${RED}`, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: RED, letterSpacing: 1 }}>
            ✕ NON-ACCRUAL SPOTLIGHT — {nonAccruals.length} POSITION{nonAccruals.length !== 1 ? "S" : ""}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {["Fund","Company","Industry","Type","Par","Fair Value","FV/PAR"].map(h => (
                    <th key={h} style={{ ...thStyle, background: "#150000" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nonAccruals.map((inv, i) => {
                  const ratio    = fvParPct(inv.fv, inv.par);
                  // Color FV and ratio by severity — not just blanket red
                  const fvColor  = inv.par > 0
                    ? (ratio >= 80 ? AMBER : ratio >= 50 ? ORANGE : RED)
                    : TEXT_DIM;
                  const ratioColor = inv.par > 0
                    ? (ratio >= 80 ? AMBER : ratio >= 50 ? ORANGE : RED)
                    : TEXT_DIM;
                  return (
                    <tr key={i} style={{ background: "#1a0000" }}>
                      <td style={{ ...tdStyle, color: GS_FUNDS.has(inv.fund) ? BLUE : TEXT }}>{inv.fund}</td>
                      <td style={{ ...tdStyle, color: TEXT, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{inv.company}</td>
                      <td style={{ ...tdStyle, color: TEXT_DIM }}>{inv.industry}</td>
                      <td style={{ ...tdStyle, color: TEXT_DIM }}>{inv.investmentType}</td>
                      <td style={tdStyle}>{fmtM(inv.par)}</td>
                      <td style={{ ...tdStyle, color: fvColor }}>{fmtM(inv.fv)}</td>
                      <td style={{ ...tdStyle, color: ratioColor }}>
                        {inv.par > 0 ? `${ratio.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB 2: SCHEDULE OF INVESTMENTS ──────────────────────────────────────────
function SOITab({ funds, investments, selectedFunds }) {
  const [filterFund,   setFilterFund]   = useState("ALL");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStress, setFilterStress] = useState("ALL");
  const [sortKey,      setSortKey]      = useState("company");
  const [sortDir,      setSortDir]      = useState("asc");

  const fundOptions = ["ALL", ...funds.map(f => f.id)];

  const rows = useMemo(() => {
    let r = investments.filter(inv => selectedFunds.has(inv.fund));

    if (filterFund !== "ALL") r = r.filter(inv => inv.fund === filterFund);

    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase();
      r = r.filter(inv => inv.company.toLowerCase().includes(q) || inv.industry.toLowerCase().includes(q));
    }

    if (filterStress !== "ALL") {
      r = r.filter(inv => {
        const ratio = fvParPct(inv.fv, inv.par);
        if (filterStress === "Non-Accrual") return inv.nonAccrual;
        if (filterStress === "Distress")    return !inv.nonAccrual && ratio < 80;
        if (filterStress === "Stress")      return !inv.nonAccrual && ratio >= 80 && ratio < 90;
        if (filterStress === "Watch")       return !inv.nonAccrual && ratio >= 90 && ratio < 97;
        if (filterStress === "Par")         return !inv.nonAccrual && ratio >= 97;
        return true;
      });
    }

    r = [...r].sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case "company":  av = a.company;  bv = b.company;  break;
        case "industry": av = a.industry; bv = b.industry; break;
        case "type":     av = a.investmentType; bv = b.investmentType; break;
        case "rate":     av = a.rate;     bv = b.rate;     break;
        case "maturity": av = a.maturity; bv = b.maturity; break;
        case "par":      av = a.par;      bv = b.par;      break;
        case "cost":     av = a.cost;     bv = b.cost;     break;
        case "fv":       av = a.fv;       bv = b.fv;       break;
        case "fvpar": {
          av = fvParPct(a.fv, a.par);
          bv = fvParPct(b.fv, b.par);
          break;
        }
        default: av = a.company; bv = b.company;
      }
      if (typeof av === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

    return r;
  }, [investments, selectedFunds, filterFund, filterSearch, filterStress, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const inputStyle = {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11,
    background: "#060a14",
    border: `1px solid ${BORDER}`,
    color: TEXT,
    padding: "5px 10px",
    outline: "none",
    borderRadius: 0,
  };

  const colHeaders = [
    { key: "company",  label: "Company" },
    { key: "industry", label: "Industry" },
    { key: "type",     label: "Type" },
    { key: "rate",     label: "Rate" },
    { key: "maturity", label: "Maturity" },
    { key: "par",      label: "Par" },
    { key: "cost",     label: "Cost" },
    { key: "fv",       label: "Fair Value" },
    { key: "fvpar",    label: "FV/PAR" },
    { key: "status",   label: "Status" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Filter Bar */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${BORDER}`, background: "#080c18", flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterFund} onChange={e => setFilterFund(e.target.value)} style={{ ...inputStyle, minWidth: 90 }}>
          {fundOptions.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search company / industry..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
        <select value={filterStress} onChange={e => setFilterStress(e.target.value)} style={inputStyle}>
          {["ALL","Non-Accrual","Distress","Stress","Watch","Par"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_DIM, marginLeft: "auto" }}>
          {rows.length} POSITIONS
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", overflowY: "auto", flex: 1 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 40 }}>#</th>
              <th style={{ ...thStyle, width: 60 }}>Fund</th>
              {colHeaders.map(h => (
                <th key={h.key} className="bdc-th" style={thStyle} onClick={() => h.key !== "status" && toggleSort(h.key)}>
                  {h.label}
                  {h.key !== "status" && <SortIndicator col={h.key} sortKey={sortKey} sortDir={sortDir} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((inv, i) => {
              const ratio  = fvParPct(inv.fv, inv.par);
              const status = statusFromRatio(ratio, inv.nonAccrual);
              const isGS   = GS_FUNDS.has(inv.fund);
              const rowBg  = inv.nonAccrual ? "#1a0000" : isGS ? "#001a2e" : i % 2 === 0 ? BG : BG_ALT;
              return (
                <tr key={i} className="bdc-tr" style={{ background: rowBg }}>
                  <td style={{ ...tdStyle, color: TEXT_DIM }}>{i + 1}</td>
                  <td style={{ ...tdStyle, color: isGS ? BLUE : TEXT, fontWeight: isGS ? 700 : 400 }}>{inv.fund}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{inv.company}</td>
                  <td style={{ ...tdStyle, color: TEXT_DIM }}>{inv.industry}</td>
                  <td style={{ ...tdStyle, color: TEXT_DIM }}>{inv.investmentType}</td>
                  <td style={{ ...tdStyle, color: TEXT_DIM, fontSize: 10 }}>{inv.rate}</td>
                  <td style={{ ...tdStyle, color: TEXT_DIM, fontSize: 10 }}>{fmtDate(inv.maturity)}</td>
                  <td style={tdStyle}>{fmtM(inv.par)}</td>
                  <td style={tdStyle}>{fmtM(inv.cost)}</td>
                  <td style={{ ...tdStyle, color: status.color }}>{fmtM(inv.fv)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <InlineBar pct={Math.min(ratio, 100)} color={status.color} width={44} height={3} />
                      <span style={{ color: status.color, fontSize: 10 }}>{ratio.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td style={tdStyle}><Badge label={status.label} color={status.color} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", fontFamily: "JetBrains Mono, monospace", color: TEXT_DIM, fontSize: 12 }}>
            NO POSITIONS MATCH FILTER CRITERIA
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB 3: INDUSTRY CONCENTRATION ───────────────────────────────────────────
function IndustryTab({ investments, selectedFunds }) {
  const data = useMemo(() => {
    const sel = investments.filter(inv => selectedFunds.has(inv.fund));
    const totalFV = sel.reduce((s, x) => s + (x.fv || 0), 0);

    // industry → fund → fv
    const map = {};
    sel.forEach(inv => {
      if (!map[inv.industry]) map[inv.industry] = {};
      map[inv.industry][inv.fund] = (map[inv.industry][inv.fund] || 0) + (inv.fv || 0);
    });

    const rows = Object.entries(map).map(([industry, fundMap]) => {
      const total   = Object.values(fundMap).reduce((s, v) => s + v, 0);
      const pctTotal = totalFV > 0 ? (total / totalFV) * 100 : 0;
      const positions = sel.filter(inv => inv.industry === industry).length;
      const stressed  = sel.filter(inv => inv.industry === industry && (inv.nonAccrual || fvParPct(inv.fv, inv.par) < 90)).length;
      return { industry, fundMap, total, pctTotal, positions, stressed };
    }).sort((a, b) => b.pctTotal - a.pctTotal);

    return { rows, totalFV };
  }, [investments, selectedFunds]);

  const maxPct = Math.max(...data.rows.map(r => r.pctTotal), 1);

  const isTech = (industry) =>
    /software|tech|saas|semiconductor|internet|data|cloud|cyber/i.test(industry);

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stacked Bar Chart */}
      <div style={{ border: `1px solid ${BORDER}` }}>
        <div style={{ padding: "6px 10px", background: "#060a14", borderBottom: `1px solid ${BORDER}`, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_DIM, letterSpacing: 1 }}>
          INDUSTRY EXPOSURE — STACKED BY FUND
        </div>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {data.rows.map(row => (
            <div key={row.industry} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: isTech(row.industry) ? ORANGE : TEXT_DIM, width: 180, textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {isTech(row.industry) ? "⚠ " : ""}{row.industry}
              </span>
              <div style={{ flex: 1, height: 16, background: "#1e2d4a", display: "flex", overflow: "hidden", maxWidth: 600 }}>
                {ALL_FUNDS.filter(fid => selectedFunds.has(fid) && row.fundMap[fid]).map(fid => {
                  const w = data.totalFV > 0 ? (row.fundMap[fid] / data.totalFV) * 100 : 0;
                  return (
                    <div
                      key={fid}
                      title={`${fid}: ${fmtM(row.fundMap[fid])} (${((row.fundMap[fid] / data.totalFV) * 100).toFixed(1)}%)`}
                      style={{ width: `${(w / maxPct) * 100}%`, height: "100%", background: FUND_COLORS[fid] || DIM, opacity: 0.85 }}
                    />
                  );
                })}
              </div>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_DIM, width: 42, textAlign: "right" }}>
                {row.pctTotal.toFixed(1)}%
              </span>
            </div>
          ))}
          {/* Legend */}
          <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
            {ALL_FUNDS.filter(fid => selectedFunds.has(fid)).map(fid => (
              <span key={fid} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: FUND_COLORS[fid], display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 10, height: 10, background: FUND_COLORS[fid], display: "inline-block" }} />
                {fid}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Industry Table */}
      <div style={{ border: `1px solid ${BORDER}`, overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {["Industry","Total FV","% Total","# Positions","# Stressed","Risk Signal"].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => {
              const tech   = isTech(row.industry);
              const rowBg  = tech ? "rgba(255,140,0,0.08)" : i % 2 === 0 ? BG : BG_ALT;
              return (
                <tr key={row.industry} style={{ background: rowBg }}>
                  <td style={{ ...tdStyle, color: tech ? ORANGE : TEXT, fontWeight: tech ? 600 : 400 }}>{row.industry}</td>
                  <td style={tdStyle}>{fmtM(row.total)}</td>
                  <td style={{ ...tdStyle, color: TEXT }}>{row.pctTotal.toFixed(2)}%</td>
                  <td style={{ ...tdStyle, color: TEXT_DIM }}>{row.positions}</td>
                  <td style={{ ...tdStyle, color: row.stressed > 0 ? ORANGE : TEXT_DIM }}>{row.stressed}</td>
                  <td style={tdStyle}>
                    {tech ? <Badge label="⚠ HIGH CONC." color={ORANGE} /> : <span style={{ color: TEXT_DIM, fontSize: 10 }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TAB 4: CROSS-FUND BORROWER SEARCH ───────────────────────────────────────
function BorrowerSearchTab({ investments, selectedFunds }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return investments.filter(inv =>
      selectedFunds.has(inv.fund) && inv.company.toLowerCase().includes(q)
    );
  }, [investments, selectedFunds, query]);

  const totalExposure = useMemo(() =>
    results.reduce((s, inv) => s + (inv.fv || 0), 0),
    [results]
  );

  const uniqueFunds = useMemo(() => new Set(results.map(r => r.fund)), [results]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Search Input */}
      <div style={{ padding: "16px", borderBottom: `1px solid ${BORDER}`, background: "#080c18" }}>
        <input
          type="text"
          placeholder="Search borrower across all funds..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 13,
            background: BG,
            border: `1px solid ${query ? GREEN : BORDER}`,
            color: TEXT,
            padding: "10px 16px",
            width: "100%",
            outline: "none",
            borderRadius: 0,
            letterSpacing: 0.5,
            transition: "border-color 0.15s",
          }}
          autoFocus
        />
      </div>

      {/* Exposure Banner */}
      {query.trim() && (
        <div style={{
          padding: "8px 16px",
          background: results.length > 0 ? "rgba(0,255,136,0.06)" : "#0a0e1a",
          borderBottom: `1px solid ${results.length > 0 ? GREEN : BORDER}`,
          display: "flex", alignItems: "center", gap: 12,
          fontFamily: "JetBrains Mono, monospace",
        }}>
          {results.length > 0 ? (
            <>
              <span style={{ color: GREEN, fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
                TOTAL EXPOSURE: {fmtM(totalExposure)}
              </span>
              <span style={{ color: TEXT_DIM, fontSize: 11 }}>
                ACROSS {uniqueFunds.size} FUND{uniqueFunds.size !== 1 ? "S" : ""} · {results.length} POSITION{results.length !== 1 ? "S" : ""}
              </span>
            </>
          ) : (
            <span style={{ color: TEXT_DIM, fontSize: 11, letterSpacing: 1 }}>NO POSITIONS FOUND</span>
          )}
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div style={{ overflowX: "auto", flex: 1 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {["Fund","Company","Industry","Type","Rate","Par","Fair Value","FV/PAR","Status"].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((inv, i) => {
                const ratio  = fvParPct(inv.fv, inv.par);
                const status = statusFromRatio(ratio, inv.nonAccrual);
                const isGS   = GS_FUNDS.has(inv.fund);
                const rowBg  = inv.nonAccrual ? "#1a0000" : isGS ? "#001a2e" : i % 2 === 0 ? BG : BG_ALT;
                return (
                  <tr key={i} className="bdc-tr" style={{ background: rowBg }}>
                    <td style={{ ...tdStyle, color: isGS ? BLUE : TEXT, fontWeight: isGS ? 700 : 400 }}>{inv.fund}</td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{inv.company}</td>
                    <td style={{ ...tdStyle, color: TEXT_DIM }}>{inv.industry}</td>
                    <td style={{ ...tdStyle, color: TEXT_DIM }}>{inv.investmentType}</td>
                    <td style={{ ...tdStyle, color: TEXT_DIM, fontSize: 10 }}>{inv.rate}</td>
                    <td style={tdStyle}>{fmtM(inv.par)}</td>
                    <td style={{ ...tdStyle, color: status.color }}>{fmtM(inv.fv)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <InlineBar pct={Math.min(ratio, 100)} color={status.color} width={44} height={3} />
                        <span style={{ color: status.color, fontSize: 10 }}>{ratio.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={tdStyle}><Badge label={status.label} color={status.color} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!query.trim() && (
        <div style={{ padding: 60, textAlign: "center", fontFamily: "JetBrains Mono, monospace", color: TEXT_DIM, fontSize: 12, letterSpacing: 1 }}>
          <div style={{ marginBottom: 8, fontSize: 24, color: DIM }}>⌕</div>
          TYPE A BORROWER NAME TO SEARCH ACROSS ALL FUNDS
        </div>
      )}
    </div>
  );
}

// ─── TAB 5: STRESS REGISTER ───────────────────────────────────────────────────
function StressRegisterTab({ investments, selectedFunds }) {
  const [sortKey, setSortKey] = useState("fvpar");
  const [sortDir, setSortDir] = useState("asc");

  const stressed = useMemo(() => {
    return investments
      .filter(inv => selectedFunds.has(inv.fund))
      .filter(inv => inv.nonAccrual || fvParPct(inv.fv, inv.par) < 97)
      .map(inv => ({ ...inv, ratio: fvParPct(inv.fv, inv.par) }));
  }, [investments, selectedFunds]);

  const sorted = useMemo(() => {
    return [...stressed].sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case "fund":     av = a.fund;      bv = b.fund;      break;
        case "company":  av = a.company;   bv = b.company;   break;
        case "industry": av = a.industry;  bv = b.industry;  break;
        case "type":     av = a.investmentType; bv = b.investmentType; break;
        case "par":      av = a.par;       bv = b.par;       break;
        case "fv":       av = a.fv;        bv = b.fv;        break;
        case "fvpar":    av = a.ratio;     bv = b.ratio;     break;
        case "gl":       av = a.fv - a.cost; bv = b.fv - b.cost; break;
        default:         av = a.ratio;     bv = b.ratio;
      }
      if (typeof av === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [stressed, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // Summary metrics
  const nonAccrualCount = stressed.filter(x => x.nonAccrual).length;
  const stressedCount   = stressed.filter(x => !x.nonAccrual && x.ratio < 90).length;
  const watchCount      = stressed.filter(x => !x.nonAccrual && x.ratio >= 90 && x.ratio < 97).length;
  const totalUnrealLoss = stressed.reduce((s, x) => s + (x.fv - x.cost), 0);

  const MetricCard = ({ label, value, color }) => (
    <div style={{
      flex: "1 1 160px",
      border: `1px solid ${color}`,
      background: `${color}0f`,
      padding: "12px 16px",
    }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: color, letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 22, color: color }}>{value}</div>
    </div>
  );

  const colHeaders = [
    { key: "fund",     label: "Fund" },
    { key: "company",  label: "Company" },
    { key: "industry", label: "Industry" },
    { key: "type",     label: "Type" },
    { key: "par",      label: "Par" },
    { key: "fv",       label: "Fair Value" },
    { key: "fvpar",    label: "FV/PAR" },
    { key: "gl",       label: "Unreal G/L" },
    { key: "status",   label: "Status" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Metric Cards */}
      <div style={{ display: "flex", gap: 12, padding: "16px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        <MetricCard label="NON-ACCRUALS" value={nonAccrualCount} color={RED} />
        <MetricCard label="STRESSED" value={stressedCount} color={ORANGE} />
        <MetricCard label="WATCH" value={watchCount} color={AMBER} />
        <MetricCard label="TOTAL UNREAL LOSS" value={fmtM(totalUnrealLoss)} color={totalUnrealLoss < 0 ? RED : GREEN} />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", flex: 1 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 40 }}>#</th>
              {colHeaders.map(h => (
                <th key={h.key} className="bdc-th" style={thStyle} onClick={() => h.key !== "status" && toggleSort(h.key)}>
                  {h.label}
                  {h.key !== "status" && <SortIndicator col={h.key} sortKey={sortKey} sortDir={sortDir} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((inv, i) => {
              const status = statusFromRatio(inv.ratio, inv.nonAccrual);
              const gl     = inv.fv - inv.cost;
              const isGS   = GS_FUNDS.has(inv.fund);
              const rowBg  = inv.nonAccrual ? "#1a0000" : isGS ? "#001a2e" : i % 2 === 0 ? BG : BG_ALT;
              return (
                <tr key={i} className="bdc-tr" style={{ background: rowBg }}>
                  <td style={{ ...tdStyle, color: TEXT_DIM }}>{i + 1}</td>
                  <td style={{ ...tdStyle, color: isGS ? BLUE : TEXT, fontWeight: isGS ? 700 : 400 }}>{inv.fund}</td>
                  <td style={{ ...tdStyle, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{inv.company}</td>
                  <td style={{ ...tdStyle, color: TEXT_DIM }}>{inv.industry}</td>
                  <td style={{ ...tdStyle, color: TEXT_DIM }}>{inv.investmentType}</td>
                  <td style={tdStyle}>{fmtM(inv.par)}</td>
                  <td style={{ ...tdStyle, color: status.color }}>{fmtM(inv.fv)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <InlineBar pct={Math.min(inv.ratio, 100)} color={status.color} width={44} height={3} />
                      <span style={{ color: status.color, fontSize: 10 }}>{inv.ratio.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: gl >= 0 ? GREEN : RED }}>{gl >= 0 ? "+" : ""}{fmtM(gl)}</td>
                  <td style={tdStyle}><Badge label={status.label} color={status.color} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", fontFamily: "JetBrains Mono, monospace", color: GREEN, fontSize: 12, letterSpacing: 1 }}>
            ✓ NO STRESSED POSITIONS — ALL FUNDS AT PAR
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB 6: GS LENS ───────────────────────────────────────────────────────────────────
// Borrowers that appear in GSCR or GSBD AND in at least one peer fund.
// Highlights divergence: same borrower, GS marked stressed/NA, peer at par.
function GSLensTab({ investments }) {
  const [filterMode, setFilterMode] = useState("diverge");
  const [sortKey, setSortKey] = useState("divergence");
  const [sortDir, setSortDir] = useState("desc");

  const GS_SET   = new Set(["GSCR", "GSBD"]);
  const PEER_SET = new Set(["ARCC", "BXSL", "OBDC", "ADS", "FSK"]);

  const crossFund = useMemo(() => {
    function normName(name) {
      return name.toLowerCase()
        .replace(/\(dba\s+[^)]+\)/gi, "").replace(/\([^)]+\)/g, "")
        .replace(/\b(llc|inc|corp|ltd|lp|plc|holdings?|group|co\.?)\b\.?/gi, "")
        .replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
    }

    const byNorm = {}, canonicalMap = {};
    for (const inv of investments) {
      const norm = normName(inv.company);
      if (!norm || norm.length < 4) continue;
      if (!byNorm[norm]) byNorm[norm] = {};
      if (!byNorm[norm][inv.fund]) byNorm[norm][inv.fund] = [];
      byNorm[norm][inv.fund].push(inv);
      if (!canonicalMap[norm] || inv.company.length > canonicalMap[norm].length)
        canonicalMap[norm] = inv.company;
    }

    const rows = [];
    for (const [norm, fundMap] of Object.entries(byNorm)) {
      const gsFunds   = Object.keys(fundMap).filter(f => GS_SET.has(f));
      const peerFunds = Object.keys(fundMap).filter(f => PEER_SET.has(f));
      if (!gsFunds.length || !peerFunds.length) continue;

      const summary = {};
      for (const [fid, invs] of Object.entries(fundMap)) {
        const debt = invs.filter(i => i.par > 0);
        const tPar = debt.reduce((s, i) => s + i.par, 0);
        const tFv  = debt.reduce((s, i) => s + i.fv,  0);
        const isNA = invs.some(i => i.nonAccrual);
        const ratio = tPar > 0 ? tFv / tPar : null;
        const rates = invs.map(i => i.rate).filter(r => r && r !== "—");
        summary[fid] = { par: tPar, fv: tFv, ratio: ratio && ratio <= 1.5 ? ratio : null, isNA, rate: rates[0] || "—" };
      }

      const gsNa     = gsFunds.some(f => summary[f].isNA);
      const gsRatios  = gsFunds.map(f => summary[f].ratio).filter(r => r !== null);
      const peerRatios = peerFunds.map(f => summary[f].ratio).filter(r => r !== null);
      const gsRatio   = gsRatios.length   ? Math.min(...gsRatios)   : null;
      const peerRatio = peerRatios.length ? Math.min(...peerRatios) : null;
      const gap = (peerRatio !== null && gsRatio !== null) ? peerRatio - gsRatio : null;
      const diverge = (gsNa && peerRatio !== null && peerRatio >= 0.90) || (gap !== null && gap > 0.10);

      rows.push({
        company: canonicalMap[norm],
        gsFunds, peerFunds, summary,
        gsNa, gsRatio, peerRatio, gap, diverge,
        gsParTotal:   gsFunds.reduce((s, f) => s + (summary[f].par || 0), 0),
        peerParTotal: peerFunds.reduce((s, f) => s + (summary[f].par || 0), 0),
      });
    }
    return rows;
  }, [investments]);

  const filtered = useMemo(() => {
    if (filterMode === "diverge") return crossFund.filter(x => x.diverge);
    if (filterMode === "na")      return crossFund.filter(x => x.gsNa);
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

  const totalDiverge = crossFund.filter(x => x.diverge).length;
  const totalNa      = crossFund.filter(x => x.gsNa).length;

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }
  const arrow = (key) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const btnStyle = (active, color, bg) => ({
    fontFamily: "JetBrains Mono, monospace", fontSize: 10, background: active ? bg : BG_ALT,
    border: `1px solid ${active ? color : BORDER}`, color: active ? color : TEXT_DIM,
    padding: "4px 12px", cursor: "pointer", letterSpacing: 1,
  });

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, flex: 1, overflow: "hidden" }}>

      {/* Header */}
      <div style={{ border: `1px solid ${AMBER}`, background: "#1a1400", padding: "10px 16px", display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: AMBER, letterSpacing: 1.5 }}>⚡ GS LENS — CROSS-FUND BORROWER DIVERGENCE</div>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: TEXT_DIM, lineHeight: 1.7 }}>
          Borrowers in <span style={{ color: BLUE }}>GSCR or GSBD</span> that also appear in a peer fund.
          &nbsp;<span style={{ color: AMBER }}>Divergence</span> = peer marks same borrower &gt;10pp higher,
          or peer is at PAR while GS is on <span style={{ color: RED }}>non-accrual</span>.
        </div>
        <div style={{ display: "flex", gap: 20, marginLeft: "auto", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700 }}>
          <span style={{ color: AMBER }}>{crossFund.length} SHARED</span>
          <span style={{ color: ORANGE }}>{totalDiverge} DIVERGE</span>
          <span style={{ color: RED }}>{totalNa} GS NA</span>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btnStyle(filterMode==="diverge", ORANGE, "#1a0d00")} onClick={() => setFilterMode("diverge")}>⚡ DIVERGENCE ({totalDiverge})</button>
        <button style={btnStyle(filterMode==="na",      RED,    "#1a0000")} onClick={() => setFilterMode("na")}>✕ GS NON-ACCRUAL ({totalNa})</button>
        <button style={btnStyle(filterMode==="all",     TEXT_DIM, BG_ALT)} onClick={() => setFilterMode("all")}>ALL SHARED ({crossFund.length})</button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {[
                { key: "company",   label: "Borrower" },
                { key: null,        label: "GS Funds" },
                { key: "gsPar",     label: "GS Par" },
                { key: "gsRatio",   label: "GS FV/PAR" },
                { key: null,        label: "GS Status" },
                { key: null,        label: "Peers" },
                { key: "peerRatio", label: "Peer FV/PAR" },
                { key: "gap",       label: "Gap ↑" },
                { key: null,        label: "Signal" },
              ].map(({ key, label }) => (
                <th key={label} className={key ? "bdc-th" : undefined}
                  onClick={key ? () => handleSort(key) : undefined}
                  style={{ ...thStyle, cursor: key ? "pointer" : "default" }}>
                  {label}{key ? arrow(key) : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const gsStatus = row.gsNa
                ? { label: "NON-ACCR", color: RED }
                : statusFromRatio((row.gsRatio ?? 1) * 100, false);
              const peerStatus = row.peerRatio !== null
                ? statusFromRatio((row.peerRatio ?? 1) * 100, false) : null;
              const gap = row.gap;
              const gapColor = gap === null ? TEXT_DIM
                : gap > 0.20 ? RED : gap > 0.10 ? ORANGE : gap > 0 ? AMBER : GREEN;
              const rowBg = row.gsNa ? "#1a0000" : row.diverge ? "#0f0a00" : i % 2 === 0 ? BG : BG_ALT;

              return (
                <tr key={i} className="bdc-tr" style={{ background: rowBg }}>

                  {/* Borrower */}
                  <td style={{ ...tdStyle, maxWidth: 230, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {row.company}
                  </td>

                  {/* GS Funds */}
                  <td style={tdStyle}>
                    {row.gsFunds.map(f => (
                      <span key={f} style={{ color: BLUE, fontWeight: 700, marginRight: 5, fontSize: 11 }}>{f}</span>
                    ))}
                  </td>

                  {/* GS Par */}
                  <td style={tdStyle}>{fmtM(row.gsParTotal)}</td>

                  {/* GS FV/PAR */}
                  <td style={tdStyle}>
                    {row.gsRatio !== null ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <InlineBar pct={Math.min(row.gsRatio * 100, 100)} color={gsStatus.color} width={40} height={3} />
                        <span style={{ color: gsStatus.color, fontSize: 10 }}>{(row.gsRatio * 100).toFixed(1)}%</span>
                      </div>
                    ) : <span style={{ color: TEXT_DIM }}>—</span>}
                  </td>

                  {/* GS Status badge */}
                  <td style={tdStyle}><Badge label={gsStatus.label} color={gsStatus.color} /></td>

                  {/* Peer funds — colored by their individual status */}
                  <td style={tdStyle}>
                    {row.peerFunds.map(f => {
                      const ps = row.summary[f];
                      const pr = ps.ratio;
                      const pSt = pr !== null ? statusFromRatio(pr * 100, ps.isNA) : null;
                      return (
                        <span key={f} title={`${f}: ${pr !== null ? (pr*100).toFixed(1)+"%" : "—"}`}
                          style={{ marginRight: 6, color: pSt?.color ?? TEXT_DIM, fontSize: 10, fontWeight: 600 }}>
                          {f}
                        </span>
                      );
                    })}
                  </td>

                  {/* Peer FV/PAR */}
                  <td style={tdStyle}>
                    {row.peerRatio !== null && peerStatus ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <InlineBar pct={Math.min(row.peerRatio * 100, 100)} color={peerStatus.color} width={40} height={3} />
                        <span style={{ color: peerStatus.color, fontSize: 10 }}>{(row.peerRatio * 100).toFixed(1)}%</span>
                      </div>
                    ) : <span style={{ color: TEXT_DIM }}>—</span>}
                  </td>

                  {/* Gap */}
                  <td style={{ ...tdStyle, fontWeight: 700 }}>
                    {gap !== null
                      ? <span style={{ color: gapColor }}>{gap > 0 ? "+" : ""}{(gap * 100).toFixed(1)}pp</span>
                      : <span style={{ color: TEXT_DIM }}>—</span>}
                  </td>

                  {/* Signal */}
                  <td style={tdStyle}>
                    {row.gsNa && row.peerRatio !== null && row.peerRatio >= 0.90
                      ? <Badge label="NA ≠ PAR" color={RED} />
                      : row.diverge
                      ? <Badge label="DIVERGE" color={ORANGE} />
                      : <span style={{ color: TEXT_DIM, fontSize: 10 }}>ALIGNED</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div style={{ padding: 60, textAlign: "center", fontFamily: "JetBrains Mono, monospace", color: TEXT_DIM, fontSize: 12 }}>
            NO RESULTS FOR CURRENT FILTER
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: TEXT_DIM, letterSpacing: 0.8, borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
        GAP = peer lowest FV/PAR minus GS lowest FV/PAR (positive = peer marks higher than GS, a divergence signal).
        Hover peer fund names to see their individual FV/PAR.
        Borrower matching uses fuzzy name normalization (removes legal suffixes, parentheticals). Period: Dec 31 2025.
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function BDCTerminal({ data }) {
  const [selectedFunds, setSelectedFunds] = useState(new Set(ALL_FUNDS));
  const [activeTab,     setActiveTab]     = useState("overview");

  // Inject global CSS + fonts
  useEffect(() => {
    const style = document.createElement("style");
    style.id    = "bdc-terminal-styles";
    style.textContent = GLOBAL_CSS;
    if (!document.getElementById("bdc-terminal-styles")) {
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById("bdc-terminal-styles");
      if (el) el.remove();
    };
  }, []);

  function toggleFund(id) {
    setSelectedFunds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return next; // keep at least one
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const shell = {
    fontFamily: "JetBrains Mono, monospace",
    background: BG,
    color: TEXT,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  };

  const content = {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
  };

  // Loading state
  if (!data) {
    return (
      <div style={shell}>
        <TopBar fundCount={0} />
        <LoadingSkeleton />
      </div>
    );
  }

  const { funds = [], investments = [] } = data;

  return (
    <div style={shell}>
      {/* Injected font reference as backup */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');`}</style>

      <TopBar fundCount={funds.filter(f => selectedFunds.has(f.id)).length} />
      <FundStrip selected={selectedFunds} onToggle={toggleFund} />
      <TabBar active={activeTab} onChange={setActiveTab} />

      <div style={content}>
        {activeTab === "overview" && (
          <OverviewTab funds={funds} investments={investments} selectedFunds={selectedFunds} />
        )}
        {activeTab === "soi" && (
          <SOITab funds={funds} investments={investments} selectedFunds={selectedFunds} />
        )}
        {activeTab === "industry" && (
          <IndustryTab investments={investments} selectedFunds={selectedFunds} />
        )}
        {activeTab === "search" && (
          <BorrowerSearchTab investments={investments} selectedFunds={selectedFunds} />
        )}
        {activeTab === "stress" && (
          <StressRegisterTab investments={investments} selectedFunds={selectedFunds} />
        )}
        {activeTab === "gslens" && (
          <GSLensTab investments={investments} />
        )}
      </div>
    </div>
  );
}
