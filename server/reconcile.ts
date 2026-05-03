/**
 * reconcile.ts — match investments across periods so each (latest-period)
 * investment carries a `series` of prior-period snapshots.
 *
 * Match key per fund: (normalizeCompanyName(company), investmentType, maturity).
 * The latest period is the anchor. Prior-period investments that don't match
 * any latest-period record are dropped (they're paydowns/sales — their absence
 * from the latest filing is itself the signal). Latest-period investments with
 * no prior-period match are kept with a partial series.
 */

import type { RawInvestment, PeriodSnapshot, SeriesMatchConfidence } from "./types.js";
import { normalizeCompanyName } from "./normalize.js";

interface PeriodInvestments {
  period: string;
  investments: RawInvestment[];
}

function matchKey(inv: RawInvestment): string {
  return [
    inv.fund,
    normalizeCompanyName(inv.company),
    inv.investmentType.toLowerCase().trim(),
    (inv.maturity ?? "").trim(),
  ].join("|");
}

/**
 * Build a per-investment time series. Input must be ordered LATEST first.
 * Returns the latest-period investments, each with `series` and `seriesMatchConfidence`.
 */
export function reconcilePeriods(periodsLatestFirst: PeriodInvestments[]): RawInvestment[] {
  if (periodsLatestFirst.length === 0) return [];
  const [latest, ...priors] = periodsLatestFirst;

  // For each prior period, group investments by match key, sorted by par desc.
  // When multiple investments share the same key (e.g. a revolver and a term loan
  // both labeled "First Lien" with the same maturity), we pair them positionally
  // with the latest-period group: largest par with largest, etc. This is more
  // robust than picking arbitrarily and keeps the trend meaningful for the common
  // case where each fund's exposure to a borrower has a stable ordering of tranche
  // sizes across quarters.
  const priorIndices = priors.map(p => {
    const map = new Map<string, RawInvestment[]>();
    for (const inv of p.investments) {
      const key = matchKey(inv);
      const list = map.get(key);
      if (list) list.push(inv);
      else map.set(key, [inv]);
    }
    for (const list of map.values()) list.sort((a, b) => b.par - a.par);
    return { period: p.period, byKey: map };
  });

  // Group latest investments by key too, so we can rank them positionally.
  const latestByKey = new Map<string, RawInvestment[]>();
  for (const inv of latest.investments) {
    const key = matchKey(inv);
    const list = latestByKey.get(key);
    if (list) list.push(inv);
    else latestByKey.set(key, [inv]);
  }
  for (const list of latestByKey.values()) list.sort((a, b) => b.par - a.par);

  return latest.investments.map(inv => {
    const key = matchKey(inv);
    const latestGroup = latestByKey.get(key) ?? [inv];
    const positionInGroup = latestGroup.indexOf(inv);  // 0 = largest tranche

    // Latest snapshot first.
    const series: PeriodSnapshot[] = [{
      period: latest.period,
      par: inv.par, cost: inv.cost, fv: inv.fv,
      rate: inv.rate, nonAccrual: inv.nonAccrual,
    }];

    // High confidence when this is the only same-keyed position in latest, OR
    // when prior periods have the same multiplicity (so positional pairing is
    // unambiguous). Low confidence when group sizes differ across periods.
    let confidence: SeriesMatchConfidence = latestGroup.length === 1 ? "high" : "high";

    for (const { period, byKey } of priorIndices) {
      const candidates = byKey.get(key);
      if (!candidates || candidates.length === 0) continue;

      // Positional pairing: latest's i-th largest pairs with prior's i-th largest.
      const m = candidates[positionInGroup] ?? candidates[candidates.length - 1];
      if (candidates.length !== latestGroup.length) confidence = "low";

      series.push({
        period,
        par: m.par, cost: m.cost, fv: m.fv,
        rate: m.rate, nonAccrual: m.nonAccrual,
      });
    }

    return { ...inv, series, seriesMatchConfidence: confidence };
  });
}
