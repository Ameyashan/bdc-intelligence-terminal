import { useState, useEffect } from "react";
import { THEMES, ALL_FUNDS } from "./terminal/designTokens.js";
import { TopBar, FundStrip, TabBar } from "./terminal/Shell.jsx";
import { OverviewTab } from "./terminal/Overview.jsx";
import { HeatmapTab, BorrowerGraphTab, SOITab, StressTab } from "./terminal/OtherTabs.jsx";
import { GSLensTab } from "./terminal/GSLens.jsx";
import { SignalsTab } from "./terminal/SignalsTab.jsx";
import { BorrowerProfileTab } from "./terminal/BorrowerProfile.jsx";
import { GLOBAL_CSS } from "./terminal/globalStyles.js";

const THEME = THEMES.glass;
const MOTION = true;
const GS_HIGHLIGHT = true;
const DENSITY = "default";

export default function BDCTerminal({ data, prevData }) {
  const [selectedFunds, setSelectedFunds] = useState(new Set(ALL_FUNDS));
  const [activeTab, setActiveTab] = useState("overview");
  const [soiInitialFilters, setSoiInitialFilters] = useState(null);
  const [selectedBorrower, setSelectedBorrower] = useState(null);

  function drillToSOI(filters) {
    setSoiInitialFilters({ ...filters, _t: Date.now() });
    setActiveTab("soi");
  }

  function drillToBorrower(name) {
    if (!name) return;
    setSelectedBorrower(name);
    setActiveTab("borrower");
  }

  useEffect(() => {
    if (document.getElementById("bdc-terminal-styles")) return;
    const style = document.createElement("style");
    style.id = "bdc-terminal-styles";
    style.textContent = GLOBAL_CSS;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById("bdc-terminal-styles");
      if (el) el.remove();
    };
  }, []);

  function toggleFund(id) {
    if (id === "__all__") { setSelectedFunds(new Set(ALL_FUNDS)); return; }
    if (id === "__only_gs__") { setSelectedFunds(new Set(["GSCR","GSBD"])); return; }
    setSelectedFunds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return next;
        next.delete(id);
      } else next.add(id);
      return next;
    });
  }

  if (!data) {
    return (
      <div style={{
        height: "100vh", background: THEME.bg, color: THEME.textMuted,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1,
      }}>
        LOADING EDGAR DATA…
      </div>
    );
  }

  const { funds = [], investments = [] } = data;
  const fundCount = funds.filter(f => selectedFunds.has(f.id)).length;
  const tabProps = { funds, investments, selectedFunds, theme: THEME, motion: MOTION, gsHighlight: GS_HIGHLIGHT, density: DENSITY, prevData, drillToSOI, drillToBorrower, soiInitialFilters, selectedBorrower, setActiveTab };

  return (
    <div style={{
      height: "100vh", background: THEME.bg, color: THEME.text,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <TopBar theme={THEME} fundCount={fundCount} asOfDate="Dec 31 2025" motion={MOTION} />
      <FundStrip theme={THEME} funds={funds} selected={selectedFunds} onToggle={toggleFund} gsHighlight={GS_HIGHLIGHT} />
      <TabBar theme={THEME} active={activeTab} onChange={setActiveTab} />

      <div key={activeTab} style={{
        flex: 1, overflow: "auto",
        animation: MOTION ? "bdc-fadein 320ms cubic-bezier(.2,.8,.2,1)" : "none",
      }}>
        {activeTab === "overview" && <OverviewTab {...tabProps} />}
        {activeTab === "heatmap" && <HeatmapTab {...tabProps} />}
        {activeTab === "graph" && <BorrowerGraphTab {...tabProps} />}
        {activeTab === "soi" && <SOITab {...tabProps} />}
        {activeTab === "stress" && <StressTab {...tabProps} />}
        {activeTab === "gslens" && <GSLensTab {...tabProps} />}
        {activeTab === "signals" && <SignalsTab {...tabProps} />}
        {activeTab === "borrower" && <BorrowerProfileTab {...tabProps} />}
      </div>
    </div>
  );
}
