import { useState, useEffect } from "react";
import { riskColor, ratioToRiskT, ALL_FUNDS, GS_FUNDS } from "./designTokens.js";

export function TopBar({ theme, fundCount, asOfDate, motion }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(time.getHours()).padStart(2, "0");
  const mm = String(time.getMinutes()).padStart(2, "0");
  const ss = String(time.getSeconds()).padStart(2, "0");

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 24px",
      borderBottom: `1px solid ${theme.border}`,
      background: theme.bg,
      position: "sticky", top: 0, zIndex: 100,
      backdropFilter: "blur(20px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 22, height: 22, position: "relative" }}>
          <div style={{
            position: "absolute", inset: 0,
            background: `conic-gradient(from 200deg, ${riskColor(0)}, ${riskColor(0.4)}, ${riskColor(0.7)}, ${riskColor(1)}, ${riskColor(0)})`,
            borderRadius: "50%",
            filter: "blur(0.4px)",
          }} />
          <div style={{ position: "absolute", inset: 4, background: theme.bg, borderRadius: "50%" }} />
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            width: 6, height: 6, marginLeft: -3, marginTop: -3,
            background: theme.text, borderRadius: "50%",
          }} />
        </div>
        <div>
          <div style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", fontWeight: 600, fontSize: 14, color: theme.text, letterSpacing: -0.2 }}>
            BDC Intelligence Terminal
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: theme.textDim, letterSpacing: 1, marginTop: 1, textTransform: "uppercase" }}>
            Goldman Sachs Asset Management · Risk Desk
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <KV theme={theme} k="As of" v={asOfDate} />
        <KV theme={theme} k="Funds" v={`${fundCount}/7`} />
        <KV theme={theme} k="Local" v={`${hh}:${mm}:${ss}`} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", border: `1px solid ${theme.border}`, borderRadius: 999 }}>
          <span style={{
            width: 6, height: 6, borderRadius: 999,
            background: riskColor(0),
            animation: motion ? "bdc-pulse 2.4s ease-in-out infinite" : "none",
            boxShadow: `0 0 8px ${riskColor(0.05)}`,
          }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme.textMuted, letterSpacing: 1 }}>EDGAR LIVE</span>
        </div>
      </div>
    </div>
  );
}

function KV({ theme, k, v }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
      <span style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", fontSize: 9, color: theme.textDim, letterSpacing: 1, textTransform: "uppercase" }}>{k}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: theme.text, marginTop: 2 }}>{v}</span>
    </div>
  );
}

export function FundStrip({ theme, funds, selected, onToggle, gsHighlight }) {
  return (
    <div style={{
      display: "flex", gap: 8, padding: "10px 24px",
      borderBottom: `1px solid ${theme.borderSoft}`,
      background: theme.bg,
      flexWrap: "wrap",
      alignItems: "center",
    }}>
      <span style={{ fontFamily: "'Inter Tight', system-ui, sans-serif", fontSize: 10, color: theme.textDim, letterSpacing: 1.5, textTransform: "uppercase", marginRight: 8 }}>Funds</span>
      {ALL_FUNDS.map(id => {
        const isGS = GS_FUNDS.has(id);
        const active = selected.has(id);
        const fund = funds.find(f => f.id === id);
        const ratio = fund ? (fund.totalFV / fund.totalPar) * 100 : 100;
        const fc = riskColor(ratioToRiskT(ratio, false));
        return (
          <button
            key={id}
            onClick={() => onToggle(id)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 500,
              padding: "5px 11px",
              background: active
                ? (gsHighlight && isGS ? "color-mix(in oklch, " + theme.accent + " 14%, transparent)" : theme.bgPanel)
                : "transparent",
              border: `1px solid ${active ? (gsHighlight && isGS ? theme.accent : theme.border) : theme.borderSoft}`,
              color: active ? (gsHighlight && isGS ? theme.accent : theme.text) : theme.textDim,
              opacity: active ? 1 : 0.55,
              borderRadius: 6,
              cursor: "pointer",
              letterSpacing: 0.5,
              transition: "all 180ms ease",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: fc }} />
            {gsHighlight && isGS ? `★ ${id}` : id}
          </button>
        );
      })}
      <button
        onClick={() => {
          if (selected.size === ALL_FUNDS.length) onToggle("__only_gs__");
          else onToggle("__all__");
        }}
        style={{
          marginLeft: "auto",
          fontFamily: "'Inter Tight', system-ui, sans-serif",
          fontSize: 10,
          padding: "5px 11px",
          background: "transparent",
          border: `1px solid ${theme.borderSoft}`,
          color: theme.textMuted,
          borderRadius: 6,
          cursor: "pointer",
          letterSpacing: 0.5,
        }}
      >
        {selected.size === ALL_FUNDS.length ? "GS only" : "All"}
      </button>
    </div>
  );
}

export const TABS = [
  { id: "overview",  label: "Overview" },
  { id: "heatmap",   label: "Risk Heatmap" },
  { id: "graph",     label: "Borrower Graph" },
  { id: "soi",       label: "Schedule of Investments" },
  { id: "stress",    label: "Stress Register" },
  { id: "gslens",    label: "GS Lens", accent: true },
  { id: "signals",   label: "Signals", accent: true },
];

export function TabBar({ theme, active, onChange }) {
  return (
    <div style={{
      display: "flex",
      borderBottom: `1px solid ${theme.borderSoft}`,
      background: theme.bg,
      padding: "0 16px",
    }}>
      {TABS.map((tab, i) => {
        const isActive = active === tab.id;
        const labelColor = tab.accent
          ? (isActive ? theme.accent : `color-mix(in oklch, ${theme.accent} 70%, ${theme.textDim})`)
          : (isActive ? theme.text : theme.textDim);
        const underline = tab.accent ? theme.accent : theme.text;
        return (
          <div
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              fontFamily: "'Inter Tight', system-ui, sans-serif",
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              padding: "12px 16px",
              color: labelColor,
              borderBottom: isActive ? `1.5px solid ${underline}` : "1.5px solid transparent",
              cursor: "pointer",
              letterSpacing: -0.1,
              transition: "color 150ms",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme.textDim }}>
              0{i + 1}
            </span>
            {tab.label}
            {tab.accent && <span style={{ color: theme.accent, marginLeft: 2 }}>⚡</span>}
          </div>
        );
      })}
    </div>
  );
}
