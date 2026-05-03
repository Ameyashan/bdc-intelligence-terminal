import { useState, useMemo, useRef, useEffect } from "react";
import {
  riskColor, ratioToRiskT, statusFromRatio, fvParPct, GS_FUNDS,
  fmtM, fmtMShort, fmtSigned, shortCompany,
} from "./designTokens.js";
import { parseRate } from "./analytics.js";
import { Panel, SectionHeader, AnimatedValue } from "./Overview.jsx";

export function HeatmapTab({ funds, investments, selectedFunds, theme, motion, gsHighlight, drillToSOI }) {
  const [hover, setHover] = useState(null);

  const data = useMemo(() => {
    const sel = investments.filter(i => selectedFunds.has(i.fund));
    const industryFV = {};
    sel.forEach(i => {
      industryFV[i.industry] = (industryFV[i.industry] || 0) + Math.max(0, i.fv || 0);
    });
    const topInd = Object.entries(industryFV).sort((a,b)=>b[1]-a[1]).slice(0, 14).map(([k]) => k);
    const fundIds = funds.filter(f => selectedFunds.has(f.id)).map(f => f.id);
    const cells = {};
    fundIds.forEach(fid => {
      topInd.forEach(ind => {
        cells[`${fid}|${ind}`] = { fund: fid, industry: ind, fv: 0, par: 0, count: 0, na: 0, stressFV: 0 };
      });
    });
    sel.forEach(i => {
      const k = `${i.fund}|${i.industry}`;
      if (!cells[k]) return;
      const c = cells[k];
      c.fv += Math.max(0, i.fv || 0);
      c.par += Math.max(0, i.par || 0);
      c.count++;
      if (i.nonAccrual) c.na++;
      const r = fvParPct(i.fv, i.par);
      if (i.nonAccrual || (r != null && r < 90)) c.stressFV += Math.max(0, i.fv || 0);
    });
    return { fundIds, topInd, cells };
  }, [investments, selectedFunds, funds]);

  return (
    <div style={{ padding: "24px 32px" }}>
      <SectionHeader theme={theme} title="Risk heatmap" subtitle="Funds × industries · cell color = stress · cell size = exposure · click any cell to drill into SOI" />
      <Panel theme={theme} padding={20}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 3, fontFamily: "'Inter Tight', sans-serif" }}>
            <thead>
              <tr>
                <th style={{ width: 200 }} />
                {data.fundIds.map(fid => {
                  const isGS = GS_FUNDS.has(fid);
                  return (
                    <th key={fid} style={{
                      padding: "8px 6px", textAlign: "center",
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                      color: gsHighlight && isGS ? theme.accent : theme.text,
                      letterSpacing: 0.5,
                      minWidth: 70,
                    }}>
                      {gsHighlight && isGS ? `★ ${fid}` : fid}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.topInd.map(ind => {
                const maxFV = Math.max(...data.fundIds.map(fid => data.cells[`${fid}|${ind}`].fv), 1);
                return (
                  <tr key={ind}>
                    <td style={{
                      fontFamily: "'Inter Tight', sans-serif", fontSize: 11.5, color: theme.text,
                      textAlign: "right", paddingRight: 12, whiteSpace: "nowrap",
                      maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {ind}
                    </td>
                    {data.fundIds.map(fid => {
                      const c = data.cells[`${fid}|${ind}`];
                      const stressShare = c.fv > 0 ? c.stressFV / c.fv : 0;
                      const t = c.na > 0 ? Math.min(1, 0.7 + stressShare * 0.3)
                        : Math.min(0.95, 0.05 + stressShare * 1.4);
                      const intensity = Math.max(0.08, Math.min(1, c.fv / maxFV));
                      const color = riskColor(t);
                      const key = `${fid}|${ind}`;
                      const isHover = hover === key;
                      return (
                        <td key={fid} style={{ padding: 0, position: "relative" }}>
                          <div
                            onMouseEnter={() => setHover(key)}
                            onMouseLeave={() => setHover(null)}
                            onClick={() => c.fv > 0 && drillToSOI && drillToSOI({ fund: fid, industry: ind })}
                            style={{
                              height: 44, width: "100%", minWidth: 64,
                              background: c.fv > 0
                                ? `color-mix(in oklch, ${color} ${intensity * 80 + 8}%, ${theme.bgInset})`
                                : theme.bgInset,
                              borderRadius: 5,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              cursor: c.fv > 0 ? "pointer" : "default",
                              transition: motion ? "transform 200ms, box-shadow 200ms" : "none",
                              transform: isHover && motion ? "scale(1.08)" : "scale(1)",
                              boxShadow: isHover ? `0 0 0 2px ${color}, 0 8px 16px -4px rgba(0,0,0,0.4)` : "none",
                              position: "relative",
                              zIndex: isHover ? 5 : 1,
                            }}
                          >
                            {c.fv > 0 && (
                              <div style={{ textAlign: "center" }}>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: theme.text, lineHeight: 1.1 }}>
                                  {fmtMShort(c.fv)}
                                </div>
                                {c.na > 0 && (
                                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: riskColor(0.95), lineHeight: 1.1, marginTop: 1 }}>
                                    {c.na}×n/a
                                  </div>
                                )}
                              </div>
                            )}
                            {isHover && c.fv > 0 && (
                              <div style={{
                                position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
                                marginTop: 4, padding: "8px 12px",
                                background: theme.bgPanel2, border: `1px solid ${theme.border}`, borderRadius: 6,
                                whiteSpace: "nowrap", zIndex: 20, pointerEvents: "none",
                                boxShadow: "0 8px 24px -4px rgba(0,0,0,0.4)",
                              }}>
                                <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim, marginBottom: 2 }}>
                                  {fid} · {ind}
                                </div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.text }}>
                                  {fmtM(c.fv)} · {c.count} pos · {(stressShare * 100).toFixed(0)}% stressed
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

const BORROWER_CAP = 60;

export function BorrowerGraphTab({ funds, investments, selectedFunds, theme, motion, gsHighlight }) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(null); // { id, dx, dy }

  const graph = useMemo(() => {
    const sel = investments.filter(i => selectedFunds.has(i.fund));
    const byCompany = {};
    sel.forEach(i => {
      const key = (i.company || "").toLowerCase().replace(/[\s.,()]/g, "").slice(0, 30);
      if (!byCompany[key]) byCompany[key] = { name: i.company, funds: {}, totalFV: 0, worstRisk: 0 };
      byCompany[key].funds[i.fund] = (byCompany[key].funds[i.fund] || 0) + Math.max(0, i.fv || 0);
      byCompany[key].totalFV += Math.max(0, i.fv || 0);
      const r = i.nonAccrual ? 1 : ratioToRiskT(fvParPct(i.fv, i.par) ?? 100, false);
      byCompany[key].worstRisk = Math.max(byCompany[key].worstRisk, r);
    });
    const allShared = Object.entries(byCompany)
      .filter(([, v]) => Object.keys(v.funds).length >= 2)
      .map(([k, v]) => ({ id: k, ...v }))
      .sort((a, b) => b.totalFV - a.totalFV);
    const shared = allShared.slice(0, BORROWER_CAP);

    const fundIds = funds.filter(f => selectedFunds.has(f.id)).map(f => f.id);
    const fundNodes = fundIds.map((fid) => ({ id: fid, kind: "fund", x: 0, y: 0, vx: 0, vy: 0 }));
    const borrowerNodes = shared.map((b) => ({ id: b.id, kind: "borrower", borrower: b, x: 0, y: 0, vx: 0, vy: 0 }));
    const edges = [];
    shared.forEach(b => {
      Object.entries(b.funds).forEach(([fid, fv]) => {
        if (fundIds.includes(fid)) edges.push({ source: fid, target: b.id, fv });
      });
    });
    return { fundNodes, borrowerNodes, edges, fundIds, shared, totalShared: allShared.length };
  }, [investments, selectedFunds, funds]);

  const W = 880, H = 540;

  const initialLayout = useMemo(() => {
    const nodes = [
      ...graph.fundNodes.map(n => ({ ...n })),
      ...graph.borrowerNodes.map(n => ({ ...n })),
    ];
    const fundCount = graph.fundNodes.length;
    graph.fundNodes.forEach((n, i) => {
      const ang = (i / fundCount) * Math.PI * 2 - Math.PI / 2;
      const node = nodes.find(x => x.id === n.id);
      node.x = W/2 + Math.cos(ang) * 110;
      node.y = H/2 + Math.sin(ang) * 110;
    });
    const bCount = graph.borrowerNodes.length;
    graph.borrowerNodes.forEach((n, i) => {
      const ang = (i / bCount) * Math.PI * 2;
      const node = nodes.find(x => x.id === n.id);
      node.x = W/2 + Math.cos(ang) * 230;
      node.y = H/2 + Math.sin(ang) * 200;
    });

    const idMap = {};
    nodes.forEach(n => idMap[n.id] = n);
    for (let iter = 0; iter < 80; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx*dx + dy*dy + 0.01;
          const d = Math.sqrt(d2);
          const force = 1800 / d2;
          const fx = (dx/d) * force, fy = (dy/d) * force;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }
      graph.edges.forEach(e => {
        const a = idMap[e.source], b = idMap[e.target];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx*dx + dy*dy) + 0.01;
        const force = (d - 130) * 0.018;
        const fx = (dx/d) * force, fy = (dy/d) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      });
      nodes.forEach(n => {
        const dx = W/2 - n.x, dy = H/2 - n.y;
        n.vx += dx * 0.005;
        n.vy += dy * 0.005;
      });
      nodes.forEach(n => {
        n.vx *= 0.7; n.vy *= 0.7;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(40, Math.min(W - 40, n.x));
        n.y = Math.max(40, Math.min(H - 40, n.y));
      });
    }
    const map = {};
    nodes.forEach(n => { map[n.id] = { x: n.x, y: n.y }; });
    return map;
  }, [graph]);

  // Mutable position state (so users can drag nodes around).
  const [nodePos, setNodePos] = useState(initialLayout);
  useEffect(() => { setNodePos(initialLayout); }, [initialLayout]);

  function svgCoords(evt) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function onNodePointerDown(id, evt) {
    evt.stopPropagation();
    const c = svgCoords(evt);
    const cur = nodePos[id];
    if (!c || !cur) return;
    setDrag({ id, dx: cur.x - c.x, dy: cur.y - c.y });
    evt.currentTarget.setPointerCapture?.(evt.pointerId);
  }
  function onPointerMove(evt) {
    if (!drag) return;
    const c = svgCoords(evt);
    if (!c) return;
    setNodePos(prev => ({
      ...prev,
      [drag.id]: {
        x: Math.max(20, Math.min(W - 20, c.x + drag.dx)),
        y: Math.max(20, Math.min(H - 20, c.y + drag.dy)),
      },
    }));
  }
  function onPointerUp() { setDrag(null); }

  const subtitleSuffix = graph.totalShared > BORROWER_CAP
    ? ` (top ${BORROWER_CAP} of ${graph.totalShared} by FV)`
    : "";

  return (
    <div style={{ padding: "24px 32px" }}>
      <SectionHeader theme={theme} title="Cross-fund borrower graph"
        subtitle={`${graph.shared.length} borrowers shared across 2+ selected funds${subtitleSuffix} · drag any node to rearrange`} />
      <Panel theme={theme} padding={0}>
        <div style={{ position: "relative" }}>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
            onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
            style={{ width: "100%", display: "block", borderRadius: 10, touchAction: "none", userSelect: "none" }}>
            <defs>
              <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={theme.bgPanel2} />
                <stop offset="100%" stopColor={theme.bg} stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width={W} height={H} fill="url(#bgGlow)" />

            {graph.edges.map((e, i) => {
              const a = nodePos[e.source];
              const b = nodePos[e.target];
              if (!a || !b) return null;
              const isHover = hover === e.target || hover === e.source;
              const targetBorrower = graph.borrowerNodes.find(n => n.id === e.target)?.borrower;
              const risk = targetBorrower?.worstRisk ?? 0;
              const color = riskColor(risk);
              return (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={color}
                  strokeWidth={isHover ? 1.6 : 0.8}
                  strokeOpacity={isHover ? 0.9 : 0.30}
                  style={{ transition: motion ? "all 200ms" : "none" }} />
              );
            })}

            {graph.fundNodes.map(n => {
              const node = nodePos[n.id];
              if (!node) return null;
              const isGS = GS_FUNDS.has(n.id);
              const fund = funds.find(f => f.id === n.id);
              const r = fund ? Math.max(14, Math.min(28, Math.sqrt(fund.totalFV / 30))) : 18;
              const isDragging = drag?.id === n.id;
              return (
                <g key={n.id}
                  onPointerDown={(e) => onNodePointerDown(n.id, e)}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: isDragging ? "grabbing" : "grab" }}>
                  <circle cx={node.x} cy={node.y} r={r + 4}
                    fill={(gsHighlight && isGS) ? theme.accent : theme.text} opacity="0.08" />
                  <circle cx={node.x} cy={node.y} r={r}
                    fill={theme.bgPanel}
                    stroke={(gsHighlight && isGS) ? theme.accent : theme.textMuted}
                    strokeWidth="1.5" />
                  <text x={node.x} y={node.y + 4} textAnchor="middle"
                    pointerEvents="none"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, fill: (gsHighlight && isGS) ? theme.accent : theme.text }}>
                    {n.id}
                  </text>
                </g>
              );
            })}

            {graph.borrowerNodes.map(n => {
              const node = nodePos[n.id];
              if (!node) return null;
              const b = n.borrower;
              const r = Math.max(4, Math.min(13, Math.sqrt(b.totalFV / 6)));
              const c = riskColor(b.worstRisk);
              const isHover = hover === n.id;
              const isDragging = drag?.id === n.id;
              return (
                <g key={n.id}
                  onPointerDown={(e) => onNodePointerDown(n.id, e)}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: isDragging ? "grabbing" : "grab" }}>
                  <circle cx={node.x} cy={node.y} r={Math.max(r, 8)}
                    fill="transparent" />
                  <circle cx={node.x} cy={node.y} r={r}
                    fill={c}
                    stroke={isHover || isDragging ? theme.text : "transparent"}
                    strokeWidth="2"
                    pointerEvents="none"
                    style={{
                      transition: motion && !isDragging ? "r 200ms" : "none",
                      filter: `drop-shadow(0 0 ${isHover || isDragging ? 8 : 3}px color-mix(in oklch, ${c} 60%, transparent))`,
                    }} />
                  {isHover && (
                    <g>
                      <rect x={node.x + r + 8} y={node.y - 22} width={220} height={42}
                        rx={5} fill={theme.bgPanel2} stroke={theme.border} />
                      <text x={node.x + r + 16} y={node.y - 6}
                        style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 11, fill: theme.text, fontWeight: 500 }}>
                        {shortCompany(b.name, 28)}
                      </text>
                      <text x={node.x + r + 16} y={node.y + 10}
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fill: theme.textMuted }}>
                        {fmtM(b.totalFV)} · {Object.keys(b.funds).length} funds
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </Panel>
    </div>
  );
}

export function SOITab({ funds, investments, selectedFunds, theme, motion, gsHighlight, soiInitialFilters }) {
  const [filterFund, setFilterFund] = useState("ALL");
  const [filterIndustry, setFilterIndustry] = useState("ALL");
  const [filterPik, setFilterPik] = useState("ALL");
  const [search, setSearch] = useState("");
  const [stress, setStress] = useState("ALL");
  const [sortKey, setSortKey] = useState("fv");
  const [sortDir, setSortDir] = useState("desc");
  const [hovered, setHovered] = useState(null);

  // When the heatmap (or any other tab) hands us a deep-link, seed the filters.
  useEffect(() => {
    if (!soiInitialFilters) return;
    if (soiInitialFilters.fund) setFilterFund(soiInitialFilters.fund);
    if (soiInitialFilters.industry) setFilterIndustry(soiInitialFilters.industry);
    if (soiInitialFilters.stress) setStress(soiInitialFilters.stress);
    if (soiInitialFilters.search != null) setSearch(soiInitialFilters.search);
    if (soiInitialFilters.pik) setFilterPik(soiInitialFilters.pik);
  }, [soiInitialFilters]);

  const fundOpts = ["ALL", ...funds.map(f => f.id)];
  const industryOpts = useMemo(() => {
    const set = new Set();
    investments.forEach(i => { if (selectedFunds.has(i.fund) && i.industry) set.add(i.industry); });
    return ["ALL", ...Array.from(set).sort()];
  }, [investments, selectedFunds]);
  const pikOpts = ["ALL", "PIK only", "Cash only"];

  const rows = useMemo(() => {
    let r = investments.filter(i => selectedFunds.has(i.fund));
    if (filterFund !== "ALL") r = r.filter(i => i.fund === filterFund);
    if (filterIndustry !== "ALL") r = r.filter(i => i.industry === filterIndustry);
    if (filterPik === "PIK only") r = r.filter(i => parseRate(i.rate).pik);
    else if (filterPik === "Cash only") r = r.filter(i => !parseRate(i.rate).pik);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(i => i.company.toLowerCase().includes(q) || (i.industry||"").toLowerCase().includes(q));
    }
    if (stress !== "ALL") {
      r = r.filter(i => {
        const ratio = fvParPct(i.fv, i.par);
        if (stress === "Non-accrual") return i.nonAccrual;
        if (stress === "Distress") return !i.nonAccrual && ratio != null && ratio < 80;
        if (stress === "Stress") return !i.nonAccrual && ratio != null && ratio < 90 && ratio >= 80;
        if (stress === "Watch") return !i.nonAccrual && ratio != null && ratio < 97 && ratio >= 90;
        if (stress === "Par") return !i.nonAccrual && ratio != null && ratio >= 97;
        return true;
      });
    }
    return [...r].sort((a, b) => {
      let av, bv;
      if (sortKey === "company")   { av = a.company; bv = b.company; }
      else if (sortKey === "industry") { av = a.industry; bv = b.industry; }
      else if (sortKey === "par")  { av = a.par; bv = b.par; }
      else if (sortKey === "fv")   { av = a.fv; bv = b.fv; }
      else if (sortKey === "ratio"){ av = fvParPct(a.fv, a.par) ?? 0; bv = fvParPct(b.fv, b.par) ?? 0; }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (typeof av === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [investments, selectedFunds, filterFund, filterIndustry, filterPik, search, stress, sortKey, sortDir]);

  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  const inputStyle = {
    fontFamily: "'Inter Tight', sans-serif", fontSize: 12,
    background: theme.bgInset, border: `1px solid ${theme.borderSoft}`,
    color: theme.text, padding: "7px 12px", outline: "none", borderRadius: 6,
  };

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <FilterSelect label="Fund" value={filterFund} onChange={setFilterFund} options={fundOpts} theme={theme} />
        <FilterSelect label="Industry" value={filterIndustry} onChange={setFilterIndustry} options={industryOpts} theme={theme} maxWidth={220} />
        <FilterSelect label="PIK" value={filterPik} onChange={setFilterPik} options={pikOpts} theme={theme} title="Currently paying PIK (rate string contains 'PIK'). Cannot distinguish optional vs mandatory PIK from EDGAR data." />
        <FilterSelect label="Stress" value={stress} onChange={setStress} options={["ALL","Non-accrual","Distress","Stress","Watch","Par"]} theme={theme} />
        <input type="text" placeholder="Search borrower or industry…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: 240 }} />
        {(filterFund !== "ALL" || filterIndustry !== "ALL" || filterPik !== "ALL" || stress !== "ALL" || search) && (
          <button onClick={() => { setFilterFund("ALL"); setFilterIndustry("ALL"); setFilterPik("ALL"); setStress("ALL"); setSearch(""); }}
            style={{ ...inputStyle, cursor: "pointer", color: theme.textMuted, padding: "7px 12px" }}>
            Clear
          </button>
        )}
        <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.textDim }}>
          {rows.length} positions
        </span>
      </div>

      <div style={{ flex: 1, overflow: "auto", border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.bgPanel }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Inter Tight', sans-serif", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, background: theme.bgPanel2, zIndex: 2 }}>
            <tr>
              {[
                { k: "fund", label: "Fund" },
                { k: "company", label: "Borrower" },
                { k: "industry", label: "Industry" },
                { k: "investmentType", label: "Type" },
                { k: "rate", label: "Rate" },
                { k: "par", label: "Par" },
                { k: "fv", label: "Fair Value" },
                { k: "ratio", label: "FV/PAR" },
                { k: "status", label: "Status" },
              ].map(h => (
                <th key={h.k}
                  onClick={() => h.k !== "status" && toggleSort(h.k)}
                  style={{
                    textAlign: h.k === "par" || h.k === "fv" ? "right" : "left",
                    padding: "11px 14px",
                    fontSize: 10, fontWeight: 500, letterSpacing: 1, textTransform: "uppercase",
                    color: theme.textDim,
                    borderBottom: `1px solid ${theme.border}`,
                    cursor: h.k !== "status" ? "pointer" : "default",
                    userSelect: "none",
                  }}>
                  {h.label}
                  {sortKey === h.k && (
                    <span style={{ color: theme.text, marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((inv, i) => {
              const ratio = fvParPct(inv.fv, inv.par);
              const status = statusFromRatio(ratio ?? 100, inv.nonAccrual);
              const color = riskColor(status.t);
              const isGS = GS_FUNDS.has(inv.fund);
              return (
                <tr key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    background: hovered === i ? theme.bgInset : "transparent",
                    transition: "background 100ms",
                  }}>
                  <td style={{ padding: "9px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: gsHighlight && isGS ? theme.accent : theme.text, fontWeight: 600 }}>
                    {inv.fund}
                  </td>
                  <td style={{ padding: "9px 14px", color: theme.text, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {shortCompany(inv.company, 36)}
                  </td>
                  <td style={{ padding: "9px 14px", color: theme.textMuted, fontSize: 11 }}>{inv.industry}</td>
                  <td style={{ padding: "9px 14px", color: theme.textMuted, fontSize: 11 }}>{inv.investmentType}</td>
                  <td style={{ padding: "9px 14px", color: theme.textMuted, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {inv.rate}
                      {parseRate(inv.rate).pik && (
                        <span style={{
                          fontFamily: "'Inter Tight', sans-serif", fontSize: 8, fontWeight: 600, letterSpacing: 0.8,
                          color: riskColor(0.7),
                          padding: "1px 5px", borderRadius: 3,
                          border: `1px solid color-mix(in oklch, ${riskColor(0.7)} 50%, transparent)`,
                          background: `color-mix(in oklch, ${riskColor(0.7)} 12%, transparent)`,
                        }}>PIK</span>
                      )}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px", color: theme.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: "right" }}>{fmtM(inv.par)}</td>
                  <td style={{ padding: "9px 14px", color, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: "right" }}>{fmtM(inv.fv)}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 56, height: 4, background: theme.bgInset, borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, ratio || 0)}%`, height: "100%", background: color, transition: motion ? "width 400ms" : "none" }} />
                      </div>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color, minWidth: 38 }}>
                        {ratio != null ? ratio.toFixed(1)+"%" : "—"}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 99, fontSize: 9, letterSpacing: 0.8,
                      textTransform: "uppercase", fontWeight: 500,
                      color,
                      background: `color-mix(in oklch, ${color} 14%, transparent)`,
                      border: `1px solid color-mix(in oklch, ${color} 40%, transparent)`,
                    }}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 200 && (
          <div style={{ padding: 12, textAlign: "center", color: theme.textDim, fontSize: 11, fontFamily: "'Inter Tight', sans-serif" }}>
            Showing top 200 of {rows.length} — refine filters to see more.
          </div>
        )}
      </div>
    </div>
  );
}

export function StressTab({ investments, selectedFunds, theme, motion, gsHighlight }) {
  const stressed = useMemo(() => {
    return investments
      .filter(i => selectedFunds.has(i.fund))
      .filter(i => i.nonAccrual || (fvParPct(i.fv, i.par) ?? 100) < 95)
      .map(i => ({ ...i, ratio: fvParPct(i.fv, i.par), risk: i.nonAccrual ? 1 : ratioToRiskT(fvParPct(i.fv, i.par) ?? 100, false) }))
      .sort((a, b) => b.risk - a.risk || (b.fv - a.fv));
  }, [investments, selectedFunds]);

  const buckets = {
    nonAccr: stressed.filter(s => s.nonAccrual).length,
    distress: stressed.filter(s => !s.nonAccrual && (s.ratio ?? 100) < 80).length,
    stress: stressed.filter(s => !s.nonAccrual && (s.ratio ?? 100) >= 80 && (s.ratio ?? 100) < 90).length,
    watch: stressed.filter(s => !s.nonAccrual && (s.ratio ?? 100) >= 90 && (s.ratio ?? 100) < 95).length,
  };
  const totalLoss = stressed.reduce((s, x) => s + (x.fv - x.cost), 0);

  return (
    <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {[
          { label: "Non-accrual", val: buckets.nonAccr, t: 1.0 },
          { label: "Distress", val: buckets.distress, t: 0.8 },
          { label: "Stress", val: buckets.stress, t: 0.55 },
          { label: "Watch", val: buckets.watch, t: 0.3 },
          { label: "Unrealized loss", val: fmtSigned(totalLoss), t: 0.7, isString: true },
        ].map(m => (
          <div key={m.label} style={{
            padding: "14px 16px", borderRadius: 10,
            background: `color-mix(in oklch, ${riskColor(m.t)} 8%, ${theme.bgPanel})`,
            border: `1px solid color-mix(in oklch, ${riskColor(m.t)} 30%, ${theme.border})`,
          }}>
            <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 10, color: theme.textDim, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
              {m.label}
            </div>
            {m.isString ? (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 500, color: riskColor(m.t) }}>{m.val}</div>
            ) : (
              <AnimatedValue value={m.val} format={(v) => Math.round(v).toString()} motion={motion}
                style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 24, fontWeight: 500, color: riskColor(m.t) }} />
            )}
          </div>
        ))}
      </div>

      <Panel theme={theme} title="Stress register" subtitle={`${stressed.length} positions ranked by risk`} padding={0}>
        <div style={{ maxHeight: 600, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Inter Tight', sans-serif", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: theme.bgPanel2, zIndex: 2 }}>
              <tr>
                {["Fund","Borrower","Industry","Type","Par","Fair Value","FV/PAR","G/L","Status"].map(h => (
                  <th key={h} style={{ padding: "11px 14px", fontSize: 10, fontWeight: 500, letterSpacing: 1, textTransform: "uppercase", color: theme.textDim, borderBottom: `1px solid ${theme.border}`, textAlign: "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stressed.slice(0, 150).map((inv, i) => {
                const status = statusFromRatio(inv.ratio ?? 100, inv.nonAccrual);
                const color = riskColor(status.t);
                const gl = inv.fv - inv.cost;
                const isGS = GS_FUNDS.has(inv.fund);
                return (
                  <tr key={i} style={{
                    borderBottom: `1px solid ${theme.borderSoft}`,
                    background: i % 2 === 0 ? "transparent" : theme.bgInset,
                  }}>
                    <td style={{ padding: "8px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: gsHighlight && isGS ? theme.accent : theme.text, fontWeight: 600 }}>{inv.fund}</td>
                    <td style={{ padding: "8px 14px", color: theme.text, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortCompany(inv.company, 36)}</td>
                    <td style={{ padding: "8px 14px", color: theme.textMuted, fontSize: 11 }}>{inv.industry}</td>
                    <td style={{ padding: "8px 14px", color: theme.textMuted, fontSize: 11 }}>{inv.investmentType}</td>
                    <td style={{ padding: "8px 14px", color: theme.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{fmtM(inv.par)}</td>
                    <td style={{ padding: "8px 14px", color, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{fmtM(inv.fv)}</td>
                    <td style={{ padding: "8px 14px", color, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{inv.ratio != null ? inv.ratio.toFixed(1)+"%" : "—"}</td>
                    <td style={{ padding: "8px 14px", color: gl >= 0 ? riskColor(0.05) : riskColor(0.85), fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{fmtSigned(gl)}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 99, fontSize: 9, letterSpacing: 0.8,
                        textTransform: "uppercase", fontWeight: 500, color,
                        background: `color-mix(in oklch, ${color} 14%, transparent)`,
                        border: `1px solid color-mix(in oklch, ${color} 40%, transparent)`,
                      }}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, theme, maxWidth, title }) {
  const isActive = value !== "ALL" && value !== options[0];
  return (
    <label title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "'Inter Tight', sans-serif", fontSize: 10,
      color: isActive ? theme.text : theme.textDim,
      letterSpacing: 1, textTransform: "uppercase",
    }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontFamily: "'Inter Tight', sans-serif", fontSize: 12,
          background: theme.bgInset,
          border: `1px solid ${isActive ? theme.accent : theme.borderSoft}`,
          color: theme.text, padding: "7px 12px", outline: "none", borderRadius: 6,
          maxWidth: maxWidth || 160, textTransform: "none", letterSpacing: "normal",
        }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
