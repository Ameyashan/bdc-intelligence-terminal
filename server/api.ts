/**
 * api.ts — Express API server
 * Serves:  GET /api/bdc-data     → full pipeline (cache-first)
 *          GET /api/bdc-data?refresh=1 → force re-extraction
 *          GET /api/bdc-status   → cache diagnostics
 *          Static SPA at all other routes
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { cacheGet, cacheSet, cacheStats } from "./cache.js";
import { extractAllFunds } from "./edgar.js";
import { normalizeData } from "./normalize.js";
import type { TerminalData } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT ?? "5000", 10);

const NORMALIZED_CACHE_KEY = "normalized_20251231";

// ─── API routes ───────────────────────────────────────────────────────────────

app.get("/api/bdc-status", (_req, res) => {
  res.json({ cacheStats: cacheStats() });
});

app.get("/api/bdc-data", async (req, res) => {
  const forceRefresh = req.query.refresh === "1";

  // Cache hit
  if (!forceRefresh) {
    const cached = cacheGet<TerminalData>(NORMALIZED_CACHE_KEY);
    if (cached?.funds && cached?.investments) {
      console.log("[api] Serving from cache");
      return res.json({ ...cached, _meta: { source: "cache", period: "2025-12-31" } });
    }
  }

  // Full pipeline
  console.log("[api] Starting full extraction pipeline...");
  const t0 = Date.now();
  try {
    const { allInvestments, statuses } = await extractAllFunds();

    if (allInvestments.length === 0) {
      return res.status(500).json({ error: "No investments extracted", statuses });
    }

    const normalized = normalizeData(allInvestments);
    cacheSet(NORMALIZED_CACHE_KEY, normalized);

    const durationSec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[api] Done in ${durationSec}s — ${normalized.investments.length} investments`);

    return res.json({
      ...normalized,
      _meta: {
        source: "live",
        period: "2025-12-31",
        extractedAt: new Date().toISOString(),
        durationSec,
        statuses,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api] Pipeline error:", msg);
    return res.status(500).json({ error: msg });
  }
});

// ─── Static SPA ───────────────────────────────────────────────────────────────

const distDir = path.resolve(__dirname, "..");  // dist/server/../ = dist/
app.use(express.static(distDir));
app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] BDC Terminal listening on port ${PORT}`);
});
