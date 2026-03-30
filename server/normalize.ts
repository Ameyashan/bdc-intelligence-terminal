/**
 * normalize.ts — Post-processing pipeline
 *
 * 1. HTM-based industry lookup for funds whose XBRL domain text lacks industry
 * 2. Deduplicate company names via fuzzy matching
 * 3. Compute derived fields: fvParRatio, unrealizedGL, stressLabel
 * 4. Build fund-level summary stats (debt-only FV/PAR to avoid equity distortion)
 * 5. Output the exact `TerminalData` shape BDCTerminal expects
 */

import fs from "fs";
import path from "path";
import { FUNDS } from "./edgar.js";
import type { RawInvestment, FundSummary, TerminalData } from "./types.js";

// ─── HTM-based industry extraction (for ARCC/BXSL/OBDC/FSK Format B filers) ──

const CACHE_DIR = path.join(process.cwd(), "cache");

/**
 * Parse the SOI HTML table to build a company → industry map.
 * Handles three common SOI layouts:
 *  - ARCC style: single-cell industry header rows, multi-cell company rows
 *  - FSK style:  "Portfolio Company | Footnotes | Industry | Rate" columns
 *  - OBDC style: similar to FSK
 */
function extractIndustryMapFromHtm(html: string): Map<string, string> {
  const map = new Map<string, string>();

  // Find the actual SOI section.
  // Strategy: find "Schedule of Investments" that is followed (within 100KB) by
  // a table containing SOFR/LIBOR (actual loan data), not just any table.
  // This avoids accidentally latching onto financial statement tables later in the doc.
  const SOI_RE = /schedule\s+of\s+investments/gi;
  let soiPos = -1;
  let m: RegExpExecArray | null;
  while ((m = SOI_RE.exec(html)) !== null) {
    const window = html.substring(m.index, m.index + 100_000);
    const hasTable  = /<tr[\s>]/i.test(window);
    const hasSofr   = /SOFR|LIBOR/i.test(window);
    const hasColHdr = /Business\s+Description|Portfolio\s+Company|<td[^>]*>\s*Industry\s*<\/td>/i.test(window);
    if (hasTable && (hasSofr || hasColHdr)) {
      soiPos = m.index;
      break; // use FIRST qualifying match
    }
  }
  if (soiPos < 0) return map;

  const soiSection = html.substring(soiPos, soiPos + 10_000_000);

  // Parse all <tr> rows
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows: string[][] = [];

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(soiSection)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? [];
    const texts = cells.map(cell => {
      let t = cell.replace(/<[^>]+>/g, " ");
      t = t.replace(/&#\d+;/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
           .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      return t.replace(/\s+/g, " ").trim();
    }).filter(Boolean);
    if (texts.length > 0) rows.push(texts);
  }

  if (rows.length === 0) return map;

  // Detect layout:
  // FSK/OBDC: header row contains "Industry" as a column → column-based extraction
  // ARCC: header row is "Company | Business Description | Investment | Coupon..."
  //       with separate single-cell industry header rows between companies

  const headerRow = rows[0]?.join(" ").toLowerCase() ?? "";
  const industryColIdx = rows[0]?.findIndex(c => /^industry$/i.test(c.trim())) ?? -1;

  if (industryColIdx >= 0) {
    // Column-based: each data row has industry in a fixed column
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length <= industryColIdx) continue;
      const company = row[0]?.replace(/\s*\([\w,\s]+\)\s*$/, "").trim();
      const industry = row[industryColIdx]?.trim();
      if (company && industry && company.length > 2 &&
          !/^(senior|first|second|total|interest|sofr|libor)/i.test(company)) {
        map.set(company, industry);
      }
    }
    return map;
  }

  // Row-based (ARCC style): single-cell rows are industry headers
  let currentIndustry = "Other";
  const LOAN_KEYWORDS = /^(first lien|second lien|1st lien|2nd lien|revolv|term loan|subordin|notes?|preferred|common stock|warrant|equity|partnership|llp|llc|inc\.|ltd|corp\.|total|subtotal|usd|sofr|libor|s\+|%|$\d)/i;

  for (const row of rows) {
    if (row.length === 0) continue;
    const first = row[0];

    // Single-cell rows that aren't loan details → industry header
    if (row.length === 1 && !LOAN_KEYWORDS.test(first) && first.length > 3 && first.length < 80) {
      // Check it looks like an industry (mixed case, no numbers with decimals)
      if (!/\d+\.\d+/.test(first) && !/\$/.test(first)) {
        currentIndustry = first;
        continue;
      }
    }

    // Multi-cell rows with company name in first col and no loan-type first cell
    if (row.length >= 2 && !LOAN_KEYWORDS.test(first) && first.length > 2 && first.length < 120) {
      const company = first.replace(/\s*\([\d,\s]+\)\s*$/, "").trim();
      if (!map.has(company)) {
        map.set(company, currentIndustry);
      }
    }
  }

  return map;
}

/** Load HTM-based industry map for a fund (cached in memory). */
const htmIndustryCache = new Map<string, Map<string, string>>();

function getHtmIndustryMap(cik: string): Map<string, string> {
  if (htmIndustryCache.has(cik)) return htmIndustryCache.get(cik)!;

  const htmFile = path.join(CACHE_DIR, `htm_${cik}_20251231.json`);
  if (!fs.existsSync(htmFile)) return new Map();

  try {
    const html = JSON.parse(fs.readFileSync(htmFile, "utf-8")) as string;
    const map = extractIndustryMapFromHtm(html);
    console.log(`[normalize] HTM industry map for ${cik}: ${map.size} entries`);
    htmIndustryCache.set(cik, map);
    return map;
  } catch (e) {
    console.warn(`[normalize] Failed to load HTM for ${cik}:`, e);
    return new Map();
  }
}

// ─── Fund CIK lookup ──────────────────────────────────────────────────────────

const FUND_CIK = new Map<string, string>([
  ["GSCR", "0001920145"],
  ["GSBD", "0001572694"],
  ["ARCC", "0001287750"],
  ["BXSL", "0001736035"],
  ["OBDC", "0001655888"],
  ["ADS",  "0001837532"],
  ["FSK",  "0001422183"],
]);

// ─── Company name deduplication ──────────────────────────────────────────────

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(dba\s+[^)]+\)/gi, "")
    .replace(/\(fka\s+[^)]+\)/gi, "")
    .replace(/,?\s*(llc|inc|corp|ltd|lp|plc|holdings?|group|co\.?)\b\.?/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return a === b ? 1 : 0;
  const trigrams = (s: string): Set<string> => {
    const t = new Set<string>();
    for (let i = 0; i <= s.length - 3; i++) t.add(s.slice(i, i + 3));
    return t;
  };
  const ta = trigrams(a), tb = trigrams(b);
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  return (2 * intersection) / (ta.size + tb.size);
}

function buildCanonicalNames(investments: RawInvestment[]): Map<string, string> {
  const raw = Array.from(new Set(investments.map(i => i.company)));
  const norm = raw.map(normalizeCompanyName);
  const parent: number[] = raw.map((_, i) => i);

  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(i: number, j: number) { parent[find(i)] = find(j); }

  for (let i = 0; i < raw.length; i++) {
    for (let j = i + 1; j < raw.length; j++) {
      if (norm[i] === norm[j]) { union(i, j); continue; }
      if (norm[i].substring(0, 3) !== norm[j].substring(0, 3)) continue;
      if (trigramSimilarity(norm[i], norm[j]) >= 0.72) union(i, j);
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < raw.length; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(i);
  }

  const canonicalMap = new Map<string, string>();
  for (const members of clusters.values()) {
    const canonical = members.reduce((best, idx) =>
      raw[idx].length > raw[best].length ? idx : best, members[0]);
    for (const idx of members) canonicalMap.set(raw[idx], raw[canonical]);
  }
  return canonicalMap;
}

// ─── Industry normalization ───────────────────────────────────────────────────

const INDUSTRY_MAP: Array<[RegExp, string]> = [
  [/software\s+and\s+services/i,                          "Software"],
  [/health\s*care\s*tech|health(?:care)?\s*it/i,          "Healthcare IT"],
  [/health\s*care\s+equipment/i,                          "Healthcare"],
  [/health\s*care|healthcare/i,                           "Healthcare"],
  [/pharmaceut/i,                                         "Pharmaceuticals"],
  [/biotechn/i,                                           "Life Sciences"],
  [/life\s*sci/i,                                         "Life Sciences"],
  [/software/i,                                           "Software"],
  [/internet\s+software/i,                                "Software"],
  [/tech(?:nology)?\s+serv/i,                             "Technology Services"],
  [/tech(?:nology)?/i,                                    "Technology"],
  [/fintech|financial\s+tech/i,                           "Financial Technology"],
  [/financial\s+serv/i,                                   "Financial Services"],
  [/capital\s+markets/i,                                  "Financial Services"],
  [/insurance/i,                                          "Insurance"],
  [/data\s+anal/i,                                        "Data Analytics"],
  [/cyber|security/i,                                     "Cybersecurity"],
  [/education\s+tech/i,                                   "Education Technology"],
  [/education|edtech/i,                                   "Education"],
  [/government/i,                                         "Government Services"],
  [/media\s+tech/i,                                       "Media Technology"],
  [/sports.*media|media.*entertainment|entertainment/i,   "Media & Entertainment"],
  [/media/i,                                              "Media"],
  [/telecom|communic(?:ations)?/i,                        "Telecom"],
  [/commercial\s+and\s+professional/i,                    "Commercial Services"],
  [/commercial\s+serv/i,                                  "Commercial Services"],
  [/professional\s+serv/i,                                "Professional Services"],
  [/business\s+serv/i,                                    "Business Services"],
  [/consumer\s+serv/i,                                    "Consumer Services"],
  [/consumer\s+prod/i,                                    "Consumer Products"],
  [/consumer\s+fin/i,                                     "Consumer Finance"],
  [/consumer\s+disc/i,                                    "Consumer Discretionary"],
  [/specialty\s+retail/i,                                 "Retail"],
  [/retail/i,                                             "Retail"],
  [/real\s+estate/i,                                      "Real Estate"],
  [/industrial\s+serv/i,                                  "Industrial Services"],
  [/capital\s+goods/i,                                    "Capital Goods"],
  [/manufact/i,                                           "Manufacturing"],
  [/food\s+(?:and\s+)?bev|food\s+prod|food\s+serv/i,     "Food & Beverage"],
  [/hospitality|hotel/i,                                  "Hospitality"],
  [/leisure|fitness|sport/i,                              "Leisure & Recreation"],
  [/energy\s+serv/i,                                      "Energy Services"],
  [/energy/i,                                             "Energy"],
  [/transport/i,                                          "Transportation"],
  [/automotive|auto/i,                                    "Automotive"],
  [/chemical/i,                                           "Chemicals"],
  [/staffing|temp\s+work/i,                               "Staffing"],
  [/defense|aero/i,                                       "Defense & Aerospace"],
  [/legal\s+tech/i,                                       "Legal Technology"],
  [/building|construct/i,                                 "Building & Construction"],
  [/restaurant/i,                                         "Restaurants"],
  [/household/i,                                          "Consumer Products"],
  [/materials|packaging|containers/i,                     "Materials"],
  [/machinery/i,                                          "Machinery"],
];

function normalizeIndustry(raw: string): string {
  for (const [re, label] of INDUSTRY_MAP) {
    if (re.test(raw)) return label;
  }
  return raw.length > 0 && raw !== "Other" ? raw : "Other";
}

const SOFTWARE_INDUSTRIES = new Set([
  "Software", "Technology", "Technology Services", "Healthcare IT",
  "Financial Technology", "Media Technology", "Education Technology",
  "Cybersecurity", "Data Analytics", "Government Services", "Legal Technology",
  "Software and Services",
]);

function isSoftwareSector(industry: string): boolean {
  return SOFTWARE_INDUSTRIES.has(industry) || /software/i.test(industry);
}

// ─── Main normalize function ──────────────────────────────────────────────────

export function normalizeData(rawInvestments: RawInvestment[]): TerminalData {

  // ── 1. Enrich industry from HTM for funds where XBRL lacks it ────────────
  // ARCC, BXSL, OBDC, FSK use Format B domains ("Company, loan type") — no industry in XBRL
  const HTM_FUNDS = new Set(["ARCC", "BXSL", "OBDC", "FSK"]);
  const htmMaps = new Map<string, Map<string, string>>();
  for (const fund of HTM_FUNDS) {
    const cik = FUND_CIK.get(fund);
    if (cik) htmMaps.set(fund, getHtmIndustryMap(cik));
  }

  // ── 2. Clean investments ──────────────────────────────────────────────────
  const cleaned = rawInvestments.filter(inv => {
    if (!inv.company || inv.company.length < 2) return false;
    if (/^(total|subtotal|aggregate|sum|cash|money\s+market)/i.test(inv.company)) return false;
    if (inv.fv === 0 && inv.par === 0 && inv.cost === 0) return false;
    if (inv.fv < 0.001 && inv.par < 0.001 && inv.cost < 0.001) return false;
    // Sanity cap — no single position > $5B
    if (inv.par > 5000 || inv.fv > 5000 || inv.cost > 5000) return false;
    return true;
  });

  // ── 3. Deduplicate company names ──────────────────────────────────────────
  const canonicalMap = buildCanonicalNames(cleaned);

  // ── 4. Apply industry enrichment from HTM + normalize industry labels ─────
  const deduped = cleaned.map(inv => {
    const company = canonicalMap.get(inv.company) ?? inv.company;
    let industry = inv.industry;

    // For HTM funds with "Other" industry, try HTM lookup
    if (HTM_FUNDS.has(inv.fund) && (industry === "Other" || !industry)) {
      const htmMap = htmMaps.get(inv.fund);
      if (htmMap) {
        // Try exact match first, then prefix match
        const htmIndustry = htmMap.get(company)
          ?? htmMap.get(inv.company)
          ?? (() => {
            // Fuzzy prefix: match on first word of company name (most distinctive)
            const firstWord = company.split(/[\s,]/)[0].toLowerCase();
            if (firstWord.length < 3) return undefined;
            for (const [key, val] of htmMap) {
              if (key.toLowerCase().startsWith(firstWord)) return val;
            }
            // Try first 8 chars
            const prefix8 = company.substring(0, 8).toLowerCase();
            for (const [key, val] of htmMap) {
              if (key.toLowerCase().startsWith(prefix8)) return val;
            }
            return undefined;
          })();
        if (htmIndustry) industry = htmIndustry;
      }
    }

    return {
      ...inv,
      company,
      industry: normalizeIndustry(industry),
    };
  });

  // ── 5. Aggregate per fund ─────────────────────────────────────────────────
  // FIX: Compute totalPar and FV/PAR ratio using ONLY debt positions (par > 0)
  // Equity/LP interests have fv but par=0, which inflates FV/PAR above 100%

  const fundAgg = new Map<string, {
    fvSum: number;        // all positions
    parSum: number;       // debt-only (par > 0)
    debtFvSum: number;    // debt-only FV (for ratio)
    costSum: number;
    nonAccrualCount: number;
    stressedCount: number;
    softwareFV: number;
    totalFV: number;
  }>();

  for (const inv of deduped) {
    if (!fundAgg.has(inv.fund)) {
      fundAgg.set(inv.fund, {
        fvSum: 0, parSum: 0, debtFvSum: 0, costSum: 0,
        nonAccrualCount: 0, stressedCount: 0,
        softwareFV: 0, totalFV: 0,
      });
    }
    const agg = fundAgg.get(inv.fund)!;
    const fvParRatio = inv.par > 0 ? inv.fv / inv.par : 1;

    agg.fvSum   += inv.fv;
    agg.costSum += inv.cost;
    agg.totalFV += inv.fv;

    // par: use actual par for debt positions, cost basis for equity (par=0)
    // This keeps FV/PAR meaningful across the full portfolio
    if (inv.par > 0) {
      agg.parSum    += inv.par;
      agg.debtFvSum += inv.fv;
    } else if (inv.cost > 0) {
      // Equity: use cost as the "par" denominator so FV/PAR reflects gain/loss
      agg.parSum    += inv.cost;
      agg.debtFvSum += inv.fv;
    }

    if (inv.nonAccrual) agg.nonAccrualCount++;
    else if (inv.par > 0 && fvParRatio < 0.90) agg.stressedCount++;

    if (isSoftwareSector(inv.industry)) agg.softwareFV += inv.fv;
  }

  // ── 6. Build FundSummary array ────────────────────────────────────────────
  const funds: FundSummary[] = FUNDS.map(f => {
    const agg = fundAgg.get(f.id);
    const totalFV     = agg?.fvSum ?? 0;
    const softwarePct = totalFV > 0 ? ((agg?.softwareFV ?? 0) / totalFV) * 100 : 0;

    return {
      id:   f.id,
      name: f.name,
      manager: f.manager,
      type: "Direct Lending",
      gs:   f.gs,
      totalFV:         agg?.fvSum ?? 0,
      totalPar:        agg?.parSum ?? 0,       // debt-only par
      totalCost:       agg?.costSum ?? 0,
      nonAccrualCount: agg?.nonAccrualCount ?? 0,
      stressedCount:   agg?.stressedCount ?? 0,
      softwarePct:     Math.round(softwarePct * 10) / 10,
    };
  });

  // ── 7. Re-classify nonAccrual ─────────────────────────────────────────────
  const finalInvestments: RawInvestment[] = deduped.map(inv => {
    const fvParRatio = inv.par > 0 ? inv.fv / inv.par : 1;
    return {
      ...inv,
      nonAccrual: inv.nonAccrual || (inv.par > 0 && fvParRatio < 0.50),
    };
  });

  return { funds, investments: finalInvestments };
}
