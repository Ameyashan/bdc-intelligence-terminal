/**
 * signals.js — Predictive credit signal detectors operating on the time-series
 * `series` field added in the multi-period reconciliation pipeline.
 *
 * Each detector takes the raw `investments` array (each carrying `series`) and
 * returns a ranked list of hits. Hits are objects ready to render as table rows.
 *
 * Three detectors:
 *   - markDriftDown: FV/Par fell >5pt across the 3 periods
 *   - pikCreep: PIK% in the rate string increased period-over-period
 *   - divergenceWidening: cross-fund std-dev of FV/Par on a borrower grew
 *
 * All thresholds are exported so the UI can offer slider controls later.
 */

export const THRESHOLDS = {
  markDriftMinDrop: 0.05,         // 5pt FV/Par drop
  pikCreepMinDeltaPct: 0.5,       // 0.5pp PIK% increase
  divergenceMinFundsHolding: 3,   // borrower must be in ≥3 funds
  divergenceMinStdDevGrowth: 0.02,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fvParRatio(s) {
  if (!s || s.par <= 0) return null;
  const r = s.fv / s.par;
  // Reject implausible ratios:
  //   r > 1.5  → equity stub or marking error (e.g. small par, large FV from upside)
  //   r < 0.02 → unfunded revolver / paid-off stub with tiny residual FV; not a credit signal
  if (!isFinite(r) || r > 1.5 || r < 0.02) return null;
  return r;
}

function parsePikPct(rate) {
  if (!rate) return 0;
  const m = String(rate).match(/PIK\s+([\d.]+)\s*%/i);
  return m ? parseFloat(m[1]) : 0;
}

function normName(name) {
  return (name || "").toLowerCase()
    .replace(/\(dba\s+[^)]+\)/gi, "")
    .replace(/\([^)]+\)/g, "")
    .replace(/\b(llc|inc|corp|ltd|lp|plc|holdings?|group|co\.?)\b\.?/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

// ─── Detector 1: Mark Drift Down ──────────────────────────────────────────────

export function markDriftDown(investments, threshold = THRESHOLDS.markDriftMinDrop) {
  const hits = [];
  for (const inv of investments) {
    const series = inv.series ?? [];
    if (series.length < 2) continue;          // need at least 2 points
    if (inv.par < 1) continue;                // <$1M residual: not credit-meaningful
    if (inv.seriesMatchConfidence === "low") continue; // pairing was ambiguous

    // series is ordered LATEST → OLDEST. Compute drop from oldest to latest.
    const latest = series[0];
    const oldest = series[series.length - 1];
    const rLatest = fvParRatio(latest);
    const rOldest = fvParRatio(oldest);
    if (rLatest === null || rOldest === null) continue;

    const drop = rOldest - rLatest;           // positive = mark went down
    if (drop < threshold) continue;

    hits.push({
      kind: "markDrift",
      fund: inv.fund,
      company: inv.company,
      industry: inv.industry,
      investmentType: inv.investmentType,
      par: inv.par,
      fv: inv.fv,
      ratioLatest: rLatest,
      ratioOldest: rOldest,
      drop,
      stillPerforming: !inv.nonAccrual,        // bigger signal if still performing
      series,
      seriesMatchConfidence: inv.seriesMatchConfidence,
      // Severity: drop magnitude * (1.5x bonus if still performing — those are the
      // ones the lender hasn't fully caught up to yet).
      severity: drop * (inv.nonAccrual ? 1 : 1.5),
      explanation: `FV/Par fell ${(drop * 100).toFixed(1)}pt over ${series.length - 1} quarter${series.length - 1 === 1 ? "" : "s"}` +
        (inv.nonAccrual ? " (already non-accrual)" : " (still performing)"),
    });
  }
  return hits.sort((a, b) => b.severity - a.severity);
}

// ─── Detector 2: PIK Creep ────────────────────────────────────────────────────

export function pikCreep(investments, threshold = THRESHOLDS.pikCreepMinDeltaPct) {
  const hits = [];
  for (const inv of investments) {
    const series = inv.series ?? [];
    if (series.length < 2) continue;

    const piks = series.map(s => parsePikPct(s.rate));
    const latest = piks[0];
    const oldest = piks[piks.length - 1];
    const delta = latest - oldest;
    if (delta < threshold) continue;
    if (latest === 0) continue;  // PIK has to be present in latest

    const rLatest = fvParRatio(series[0]);
    const rOldest = fvParRatio(series[series.length - 1]);
    const fvParChange = (rLatest !== null && rOldest !== null) ? rLatest - rOldest : null;

    hits.push({
      kind: "pikCreep",
      fund: inv.fund,
      company: inv.company,
      industry: inv.industry,
      investmentType: inv.investmentType,
      par: inv.par,
      fv: inv.fv,
      pikLatest: latest,
      pikOldest: oldest,
      pikDelta: delta,
      ratioLatest: rLatest,
      fvParChange,
      series,
      seriesMatchConfidence: inv.seriesMatchConfidence,
      // Severity: PIK delta scaled by exposure (par) so $200M positions outrank
      // $5M ones for the same delta. Combined with mark decline if any.
      severity: delta * Math.log10(Math.max(inv.par, 1) + 1) +
        (fvParChange !== null && fvParChange < 0 ? Math.abs(fvParChange) * 50 : 0),
      explanation: `PIK rose ${oldest.toFixed(1)}% → ${latest.toFixed(1)}% (+${delta.toFixed(1)}pp)` +
        (fvParChange !== null && fvParChange < -0.02
          ? ` while mark fell ${(Math.abs(fvParChange) * 100).toFixed(1)}pt`
          : ""),
    });
  }
  return hits.sort((a, b) => b.severity - a.severity);
}

// ─── Detector 3: Divergence Widening ──────────────────────────────────────────

export function divergenceWidening(investments, opts = {}) {
  const minFunds = opts.minFunds ?? THRESHOLDS.divergenceMinFundsHolding;
  const minGrowth = opts.minGrowth ?? THRESHOLDS.divergenceMinStdDevGrowth;

  // Group by normalized borrower name across all funds.
  const byBorrower = new Map();
  for (const inv of investments) {
    if (inv.par <= 0) continue;
    if (!inv.series || inv.series.length < 2) continue;
    const key = normName(inv.company);
    if (!key || key.length < 4) continue;
    if (!byBorrower.has(key)) byBorrower.set(key, []);
    byBorrower.get(key).push(inv);
  }

  const hits = [];
  for (const [key, invs] of byBorrower) {
    // Collect the full set of periods present across all this borrower's series.
    const periodSet = new Set();
    for (const inv of invs) for (const s of inv.series ?? []) periodSet.add(s.period);
    const periods = Array.from(periodSet).sort().reverse(); // latest → oldest
    if (periods.length < 2) continue;

    // For each period, compute one FV/Par per fund (par-weighted across that fund's
    // multiple positions in the borrower, if any). Then take std-dev across funds.
    const stdByPeriod = periods.map(period => {
      const byFund = new Map();
      for (const inv of invs) {
        const snap = (inv.series ?? []).find(s => s.period === period);
        if (!snap) continue;
        if (!byFund.has(inv.fund)) byFund.set(inv.fund, { par: 0, fv: 0 });
        const agg = byFund.get(inv.fund);
        agg.par += snap.par;
        agg.fv  += snap.fv;
      }
      const ratios = [];
      for (const { par, fv } of byFund.values()) {
        if (par > 0) {
          const r = fv / par;
          if (isFinite(r) && r <= 1.5) ratios.push(r);
        }
      }
      return { period, fundCount: byFund.size, std: stdDev(ratios), ratios };
    });

    const latestStd = stdByPeriod[0];
    const oldestStd = stdByPeriod[stdByPeriod.length - 1];
    if (latestStd.fundCount < minFunds) continue;

    const growth = latestStd.std - oldestStd.std;
    if (growth < minGrowth) continue;

    // Pick a representative company name (longest of the cluster).
    const company = invs.reduce((best, i) =>
      i.company.length > best.length ? i.company : best, invs[0].company);

    const totalPar = invs.reduce((s, i) => s + i.par, 0);

    hits.push({
      kind: "divergence",
      borrower: company,
      borrowerKey: key,
      industry: invs[0].industry,
      fundCount: latestStd.fundCount,
      funds: invs.map(i => i.fund).filter((v, i, a) => a.indexOf(v) === i),
      totalPar,
      stdLatest: latestStd.std,
      stdOldest: oldestStd.std,
      growth,
      stdByPeriod,
      severity: growth * Math.log10(totalPar + 1),
      explanation: `Cross-fund FV/Par std-dev grew from ${(oldestStd.std * 100).toFixed(1)}pt → ${(latestStd.std * 100).toFixed(1)}pt across ${latestStd.fundCount} funds`,
    });
  }
  return hits.sort((a, b) => b.severity - a.severity);
}

// ─── Bundle ───────────────────────────────────────────────────────────────────

export function computeAllSignals(investments) {
  return {
    markDrift: markDriftDown(investments),
    pikCreep: pikCreep(investments),
    divergence: divergenceWidening(investments),
  };
}
