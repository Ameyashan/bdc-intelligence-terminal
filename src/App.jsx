import { useState, useEffect } from "react";
import BDCTerminal from "./BDCTerminal.jsx";

export default function App() {
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load(refresh = false) {
      setError(null);
      try {
        const href = window.location.href;
        const isLocalProxy = href.includes('/port/');
        const url = isLocalProxy
          ? `${href.replace(/\/$/, '')}/api/bdc-data${refresh ? "?refresh=1" : ""}`
          : './data/bdc-data.json';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }

    async function loadPrev() {
      try {
        const res = await fetch('./data/bdc-data.prev.json');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json && !json.error) setPrevData(json);
      } catch {
        // No prev snapshot → deltas panel just won't render.
      }
    }

    load();
    loadPrev();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0a0e1a", display: "flex",
        alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <div style={{ border: "1px solid #ff3333", padding: "24px 32px", maxWidth: 560, background: "#1a0000" }}>
          <div style={{ color: "#ff3333", fontSize: 11, letterSpacing: 2, marginBottom: 12 }}>▲ PIPELINE ERROR</div>
          <div style={{ color: "#c8d8f0", fontSize: 11, lineHeight: 1.7, marginBottom: 20 }}>{error}</div>
          <button
            onClick={() => { setError(null); setData(null); window.location.reload(); }}
            style={{ background: "transparent", border: "1px solid #00ff88", color: "#00ff88",
              padding: "8px 20px", fontSize: 11, letterSpacing: 1.5, cursor: "pointer",
              fontFamily: "inherit" }}
          >↺ RETRY</button>
        </div>
        <div style={{ color: "#3a4a6a", fontSize: 10 }}>First load may take 30–90s on EDGAR cold start</div>
      </div>
    );
  }

  // BDCTerminal shows its own loading skeleton when data is null
  return <BDCTerminal data={data} prevData={prevData} />;
}
