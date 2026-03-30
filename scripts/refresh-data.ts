/**
 * scripts/refresh-data.ts
 *
 * Run this locally whenever you want to pull fresh EDGAR data:
 *   npx tsx scripts/refresh-data.ts
 *
 * What it does:
 *   1. Fetches XBRL filings from EDGAR for all 7 BDCs (Dec 31 2025)
 *   2. Normalizes + deduplicates the investment data
 *   3. Writes public/data/bdc-data.json (committed to git, served by Vercel)
 *
 * The raw XBRL files are cached locally in ./cache/ (gitignored).
 * Only the final 1.5MB JSON needs to be committed.
 */

import { extractAllFunds } from "../server/edgar.js";
import { normalizeData } from "../server/normalize.js";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

async function main() {
  console.log("╔══════════════════════════════════╗");
  console.log("║  BDC Intelligence — Data Refresh  ║");
  console.log("╚══════════════════════════════════╝\n");
  console.log("Fetching live XBRL data from EDGAR (period: 2025-12-31)...");
  console.log("Raw XML files cached in ./cache/ — first run is slow (~60s),");
  console.log("subsequent runs use cache and complete in ~5s.\n");

  const t0 = Date.now();
  const { allInvestments, statuses } = await extractAllFunds();

  console.log("\n--- Per-fund results ---");
  for (const s of statuses) {
    const icon = s.status === "ok" ? "✓" : s.status === "cached" ? "⚡" : "✗";
    const time = `${s.durationMs}ms`;
    const count = `${s.investmentCount} positions`;
    console.log(`  ${icon} ${s.fund.padEnd(5)} ${count.padEnd(15)} [${s.status.padEnd(6)}] ${time}`);
    if (s.error) console.log(`         ERROR: ${s.error}`);
  }

  console.log("\nNormalizing data (industry enrichment, dedup, fund stats)...");
  const normalized = normalizeData(allInvestments);

  const output = {
    ...normalized,
    _meta: {
      source: "edgar",
      period: "2025-12-31",
      extractedAt: new Date().toISOString(),
      durationSec: ((Date.now() - t0) / 1000).toFixed(1),
      statuses,
    },
  };

  const outPath = path.resolve(process.cwd(), "public/data/bdc-data.json");
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  const sizeMB = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(2);
  console.log(`\n✓ Written: public/data/bdc-data.json (${sizeMB}MB)`);
  console.log(`  Funds: ${normalized.funds.length} | Investments: ${normalized.investments.length}`);
  console.log(`  Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("\n── To deploy ──────────────────────────────────────────────────");
  console.log("  git add public/data/bdc-data.json");
  console.log("  git commit -m 'data: refresh EDGAR 2025-12-31'");
  console.log("  git push");
  console.log("  → Vercel auto-deploys from your main branch");
  console.log("──────────────────────────────────────────────────────────────\n");
}

main().catch(err => {
  console.error("\n✗ Refresh failed:", err.message ?? err);
  process.exit(1);
});
