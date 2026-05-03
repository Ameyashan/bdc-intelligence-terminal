// Yield, spread, PIK, and delta analytics derived from the EDGAR JSON.
// All math is fair-value-weighted unless noted.

import { fvParPct, ratioToRiskT, GS_FUNDS } from "./designTokens.js";

// SOFR overnight rate. Update as base rates move; only used for "all-in yield" estimates.
export const SOFR_BPS = 433; // ~4.33% — May 2026 placeholder

// Parse a BDC rate string into structured form.
//   "SOFR+450"     → { kind: "float", spreadBps: 450, pik: false }
//   "S+500"        → { kind: "float", spreadBps: 500, pik: false }
//   "PIK 11.50%"   → { kind: "pik",   fixedBps: 1150, pik: true }
//   "8.00%"        → { kind: "fixed", fixedBps: 800, pik: false }
//   "—" / ""       → { kind: "none" }
export function parseRate(raw) {
  if (!raw || raw === "—") return { kind: "none", pik: false };
  const s = String(raw).toUpperCase();
  const pik = /\bPIK\b/.test(s);

  // Floating: SOFR+XXX or S+XXX (bps)
  const flt = s.match(/(?:SOFR|S)\s*\+\s*(\d{2,4})/);
  if (flt) {
    const bps = +flt[1];
    if (bps >= 50 && bps <= 2500) return { kind: "float", spreadBps: bps, pik };
  }

  // Pure PIK with explicit rate: "PIK 11.50%"
  const pikRate = s.match(/PIK\s*(\d+(?:\.\d+)?)\s*%/);
  if (pikRate) {
    const bps = Math.round(parseFloat(pikRate[1]) * 100);
    return { kind: "pik", fixedBps: bps, pik: true };
  }

  // Fixed: "X.XX%"
  const fix = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (fix) {
    const bps = Math.round(parseFloat(fix[1]) * 100);
    if (bps >= 50 && bps <= 2500) return { kind: pik ? "pik" : "fixed", fixedBps: bps, pik };
  }

  return { kind: "none", pik };
}

// All-in coupon in bps, given current SOFR.
export function allInBps(parsed, sofrBps = SOFR_BPS) {
  if (!parsed) return null;
  if (parsed.kind === "float") return sofrBps + parsed.spreadBps;
  if (parsed.kind === "pik" || parsed.kind === "fixed") return parsed.fixedBps;
  return null;
}

// Fund-level yield/spread/PIK rollup. Weights by FV (only positive FV counts).
export function fundYieldStats(investments, sofrBps = SOFR_BPS) {
  const out = {
    fvFloating: 0, fvFixed: 0, fvPik: 0, fvOther: 0, fvTotal: 0,
    weightedSpreadBps: 0,    // FV-weighted across floating positions
    weightedAllInBps: 0,     // FV-weighted across coupon-bearing positions
    pikCount: 0, floatCount: 0, fixedCount: 0,
  };
  let spreadNum = 0, spreadDen = 0;
  let allInNum = 0, allInDen = 0;
  for (const inv of investments) {
    const fv = Math.max(0, inv.fv || 0);
    out.fvTotal += fv;
    const p = parseRate(inv.rate);
    if (p.pik) { out.fvPik += fv; out.pikCount++; }
    if (p.kind === "float") {
      out.fvFloating += fv; out.floatCount++;
      spreadNum += p.spreadBps * fv; spreadDen += fv;
    } else if (p.kind === "fixed" || p.kind === "pik") {
      out.fvFixed += fv; out.fixedCount++;
    } else {
      out.fvOther += fv;
    }
    const ai = allInBps(p, sofrBps);
    if (ai != null) { allInNum += ai * fv; allInDen += fv; }
  }
  out.weightedSpreadBps = spreadDen > 0 ? spreadNum / spreadDen : 0;
  out.weightedAllInBps = allInDen > 0 ? allInNum / allInDen : 0;
  out.pctFloating = out.fvTotal > 0 ? out.fvFloating / out.fvTotal : 0;
  out.pctFixed = out.fvTotal > 0 ? out.fvFixed / out.fvTotal : 0;
  out.pctPik = out.fvTotal > 0 ? out.fvPik / out.fvTotal : 0;
  return out;
}

// ─── Δ since previous snapshot ─────────────────────────────────────────────
// Match positions by (fund, company-normalized, investmentType, maturity).
// Returns: { newNonAccruals, recovered, newStressed, newPositions, exitedPositions, biggestMarkdowns }

function posKey(p) {
  const co = (p.company || "").toLowerCase().replace(/[\s.,()\-]/g, "").slice(0, 40);
  return `${p.fund}|${co}|${p.investmentType || ""}|${p.maturity || ""}`;
}

export function computeDeltas(current, prev) {
  if (!prev || !prev.investments) return null;
  const cur = current.investments;
  const prv = prev.investments;
  const curMap = new Map(cur.map(p => [posKey(p), p]));
  const prvMap = new Map(prv.map(p => [posKey(p), p]));

  const newNonAccruals = [];
  const recovered = [];
  const newStressed = [];
  const newPositions = [];
  const exitedPositions = [];
  const markdowns = [];

  for (const [k, c] of curMap) {
    const p = prvMap.get(k);
    if (!p) {
      newPositions.push(c);
      continue;
    }
    if (c.nonAccrual && !p.nonAccrual) newNonAccruals.push({ ...c, prevFv: p.fv });
    if (!c.nonAccrual && p.nonAccrual) recovered.push({ ...c, prevFv: p.fv });
    const cr = fvParPct(c.fv, c.par);
    const pr = fvParPct(p.fv, p.par);
    if (!c.nonAccrual && cr != null && pr != null && cr < 90 && pr >= 90) {
      newStressed.push({ ...c, prevRatio: pr, ratio: cr });
    }
    const dFv = (c.fv || 0) - (p.fv || 0);
    if (Math.abs(dFv) > 0.5 && (c.par || 0) > 0) {
      markdowns.push({ ...c, deltaFv: dFv, prevFv: p.fv });
    }
  }
  for (const [k, p] of prvMap) {
    if (!curMap.has(k) && (p.fv || 0) > 0.5) exitedPositions.push(p);
  }

  markdowns.sort((a, b) => a.deltaFv - b.deltaFv); // most negative first
  newNonAccruals.sort((a, b) => (b.fv || 0) - (a.fv || 0));
  newStressed.sort((a, b) => (b.fv || 0) - (a.fv || 0));
  newPositions.sort((a, b) => (b.fv || 0) - (a.fv || 0));
  exitedPositions.sort((a, b) => (b.fv || 0) - (a.fv || 0));

  return {
    newNonAccruals,
    recovered,
    newStressed,
    newPositions,
    exitedPositions,
    biggestMarkdowns: markdowns.slice(0, 10),
    biggestMarkups: [...markdowns].reverse().slice(0, 5),
    prevPeriod: prev?._meta?.period,
    curPeriod: current?._meta?.period,
  };
}

// Fund-level FV totals delta.
export function fundFvDeltas(current, prev) {
  if (!prev || !prev.funds) return null;
  const map = {};
  for (const f of prev.funds) map[f.id] = f;
  return current.funds.map(c => {
    const p = map[c.id];
    if (!p) return { id: c.id, isNew: true };
    return {
      id: c.id,
      isGS: GS_FUNDS.has(c.id),
      dFv: c.totalFV - p.totalFV,
      dRatio: ((c.totalFV / c.totalPar) - (p.totalFV / p.totalPar)) * 100,
      dNonAccr: c.nonAccrualCount - p.nonAccrualCount,
      dStressed: c.stressedCount - p.stressedCount,
      curFv: c.totalFV,
      prevFv: p.totalFV,
    };
  });
}

// Used by Yield panel to colour by spread quartile.
export function spreadColorT(spreadBps) {
  // 0 → 1 mapping where 300bps=cool, 600bps=mid, 900bps+=warm
  const t = Math.max(0, Math.min(1, (spreadBps - 250) / 750));
  return t;
}

// Utility: normalize ratio for risk gradient given a position
export function positionRiskT(inv) {
  if (inv.nonAccrual) return 1;
  return ratioToRiskT(fvParPct(inv.fv, inv.par) ?? 100, false);
}
