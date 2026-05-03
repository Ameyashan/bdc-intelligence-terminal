/**
 * scripts/refresh-data.ts
 *
 * Run this locally whenever you want to pull fresh EDGAR data:
 *   npx tsx scripts/refresh-data.ts
 *
 * What it does:
 *   1. Fetches XBRL filings from EDGAR for all 7 BDCs across 3 periods
 *      (latest 10-K + 2 prior 10-Qs — see PERIODS in server/edgar.ts)
 *   2. Normalizes each period independently (industry enrichment, dedup)
 *   3. Reconciles investments across periods so each carries a `series`
 *      of prior-period snapshots (par, cost, fv, rate, nonAccrual)
 *   4. Writes public/data/bdc-data.json (committed to git, served by Vercel)
 *
 * The raw XBRL files are cached locally in ./cache/ (gitignored).
 * Only the final JSON needs to be committed.
 */

import { extractAllFundsAllPeriods, PERIODS, LATEST_PERIOD } from "../server/edgar.js";
import { normalizeData } from "../server/normalize.js";
import { reconcilePeriods } from "../server/reconcile.js";
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import path from "path";

async function main() {
  console.log("╔══════════════════════════════════╗");
  console.log("║  BDC Intelligence — Data Refresh  ║");
  console.log("╚══════════════════════════════════╝\n");
  console.log(`Periods: ${PERIODS.map(p => `${p.period} (${p.formTypes.join("/")})`).join(", ")}`);
  console.log("Raw XML files cached in ./cache/ — first run is slow (~3min cold),");
  console.log("subsequent runs use cache and complete in ~10s.\n");

  const t0 = Date.now();
  const { byPeriod, allStatuses } = await extractAllFundsAllPeriods();

  console.log("\n--- Per-(fund, period) results ---");
  for (const s of allStatuses) {
    const icon = s.status === "ok" ? "✓" :
                 s.status === "cached" ? "⚡" :
                 s.status === "unavailable" ? "—" : "✗";
    const time = `${s.durationMs}ms`;
    const count = `${s.investmentCount} positions`;
    console.log(`  ${icon} ${s.fund.padEnd(5)} ${(s.period ?? "?").padEnd(11)} ${count.padEnd(15)} [${s.status.padEnd(11)}] ${time}`);
    if (s.error) console.log(`         → ${s.error}`);
  }

  // Normalize each period independently. The per-period normalization handles
  // dedup, industry enrichment, and per-fund aggregates. Cross-period matching
  // is a separate concern handled by reconcilePeriods (which uses the stripped
  // company-name form rather than the per-period canonical name).
  console.log("\nNormalizing each period (industry enrichment, dedup, fund stats)...");
  const normalizedByPeriod: Record<string, ReturnType<typeof normalizeData>> = {};
  for (const period of Object.keys(byPeriod)) {
    const investments = byPeriod[period].allInvestments;
    if (investments.length === 0) {
      console.log(`  — ${period}: no investments — skipping normalize`);
      continue;
    }
    normalizedByPeriod[period] = normalizeData(investments);
    console.log(`  ✓ ${period}: ${normalizedByPeriod[period].investments.length} investments`);
  }

  const latest = normalizedByPeriod[LATEST_PERIOD];
  if (!latest) {
    throw new Error(`No data extracted for latest period ${LATEST_PERIOD} — cannot proceed`);
  }

  // Reconcile across periods. Input must be ordered LATEST first; PERIODS is
  // already in that order. Skip periods that yielded zero investments.
  console.log("\nReconciling investments across periods...");
  const orderedPeriods = PERIODS
    .map(p => p.period)
    .filter(p => normalizedByPeriod[p])
    .map(p => ({ period: p, investments: normalizedByPeriod[p].investments }));

  const investmentsWithSeries = reconcilePeriods(orderedPeriods);

  // Quick reconciliation stats so the operator can sanity-check.
  const seriesLengths = investmentsWithSeries.map(i => i.series?.length ?? 1);
  const fullCount    = seriesLengths.filter(n => n === orderedPeriods.length).length;
  const partialCount = investmentsWithSeries.length - fullCount;
  const lowConfCount = investmentsWithSeries.filter(i => i.seriesMatchConfidence === "low").length;
  console.log(`  ${fullCount} investments matched across all ${orderedPeriods.length} periods`);
  console.log(`  ${partialCount} investments matched only partially (new originations or name drift)`);
  if (lowConfCount > 0) console.log(`  ${lowConfCount} investments flagged low-confidence (ambiguous match)`);

  const output = {
    funds: latest.funds,
    investments: investmentsWithSeries,
    extractedAt: new Date().toISOString(),
    period: LATEST_PERIOD,
    _meta: {
      source: "edgar",
      periods: orderedPeriods.map(p => p.period),
      latestPeriod: LATEST_PERIOD,
      extractedAt: new Date().toISOString(),
      durationSec: ((Date.now() - t0) / 1000).toFixed(1),
      reconciliation: { fullCount, partialCount, lowConfCount, totalPeriods: orderedPeriods.length },
      statuses: allStatuses,
    },
  };

  const outPath  = path.resolve(process.cwd(), "public/data/bdc-data.json");
  const prevPath = path.resolve(process.cwd(), "public/data/bdc-data.prev.json");
  mkdirSync(path.dirname(outPath), { recursive: true });

  // Snapshot the existing dataset to *.prev.json so the UI can diff vs. last refresh.
  if (existsSync(outPath)) {
    copyFileSync(outPath, prevPath);
    console.log(`  Previous snapshot → public/data/bdc-data.prev.json`);
  }

  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  const sizeMB = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(2);
  console.log(`\n✓ Written: public/data/bdc-data.json (${sizeMB}MB)`);
  console.log(`  Funds: ${latest.funds.length} | Investments: ${investmentsWithSeries.length}`);
  console.log(`  Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("\n── To deploy ──────────────────────────────────────────────────");
  console.log("  git add public/data/bdc-data.json");
  console.log("  git commit -m 'data: refresh EDGAR multi-period (3 quarters)'");
  console.log("  git push");
  console.log("  → Vercel auto-deploys from your main branch");
  console.log("──────────────────────────────────────────────────────────────\n");
}

main().catch(err => {
  console.error("\n✗ Refresh failed:", err.message ?? err);
  process.exit(1);
});
