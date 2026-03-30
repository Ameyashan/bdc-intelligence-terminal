/**
 * edgar.ts — EDGAR data extraction pipeline
 *
 * Strategy per fund:
 *  1. Fetch submissions JSON → find 10-K accessionNumber for period 2025-12-31
 *  2. Fetch extracted XBRL instance XML from that filing
 *  3. Parse InvestmentIdentifierAxis contexts (typed dimensions)
 *     – domain text encodes: type, company, industry, rate, maturity
 *     – facts encode: par, cost, fv, interest rate, spread, maturity
 *  4. If XML extraction yields < 5 investments, fall back to HTM cheerio parse
 *
 * All raw XML responses are cached by CIK+period.
 */

import { cacheGet, cacheSet } from "./cache.js";
import type { RawInvestment, ExtractionStatus } from "./types.js";

const USER_AGENT = "BDCResearchTool/1.0 ameya.shanbhag@gmail.com";
const PERIOD = "2025-12-31";

// ─── Fund registry ────────────────────────────────────────────────────────────

interface FundMeta {
  id: string;
  cik: string; // 10-digit padded
  name: string;
  manager: string;
  gs: boolean;
}

export const FUNDS: FundMeta[] = [
  { id: "GSCR", cik: "0001920145", name: "GS Capital Rose",             manager: "Goldman Sachs Asset Management", gs: true  },
  { id: "GSBD", cik: "0001572694", name: "Goldman Sachs BDC, Inc.",      manager: "Goldman Sachs Asset Management", gs: true  },
  { id: "ARCC", cik: "0001287750", name: "Ares Capital Corporation",      manager: "Ares Management",               gs: false },
  { id: "BXSL", cik: "0001736035", name: "Blackstone Secured Lending",    manager: "Blackstone Credit",             gs: false },
  { id: "OBDC", cik: "0001655888", name: "Blue Owl Capital Corp",         manager: "Blue Owl Capital",              gs: false },
  { id: "ADS",  cik: "0001837532", name: "Ares Dynamic Credit Allocation",manager: "Ares Management",               gs: false },
  { id: "FSK",  cik: "0001422183", name: "FS KKR Capital Corp",           manager: "FS Investments / KKR Credit",   gs: false },
];

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, retries = 3): Promise<string> {
  let lastErr: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept": "*/*" },
        next: { revalidate: 0 }, // bypass Next cache — we handle caching ourselves
      } as RequestInit & { next: { revalidate: number } });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          await new Promise(r => setTimeout(r, 1500 * (i + 1)));
          continue;
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.text();
    } catch (e) {
      lastErr = e as Error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr ?? new Error(`Failed to fetch ${url}`);
}

// ─── Step 1: Find 10-K accession number ──────────────────────────────────────

interface FilingInfo {
  accessionNumber: string;     // with dashes e.g. "0001193125-26-077458"
  primaryDocument: string;     // e.g. "gsbd-20251231.htm"
  isInlineXBRL: boolean;
}

async function findFiling(cik: string): Promise<FilingInfo | null> {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const cacheKey = `submissions_${cik}`;

  let text = cacheGet<string>(cacheKey);
  if (!text) {
    text = await fetchWithRetry(url);
    cacheSet(cacheKey, text);
  } else if (typeof text !== "string") {
    // old cache stored parsed JSON — re-serialize
    text = JSON.stringify(text);
  }

  const data = typeof text === "string" ? JSON.parse(text) : text;
  const recent = data?.filings?.recent ?? {};
  const forms: string[]   = recent.form ?? [];
  const periods: string[] = recent.reportDate ?? [];
  const accessions: string[] = recent.accessionNumber ?? [];
  const docs: string[]    = recent.primaryDocument ?? [];
  const xbrl: number[]    = recent.isInlineXBRL ?? [];

  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === "10-K" && periods[i] === PERIOD) {
      return {
        accessionNumber: accessions[i],
        primaryDocument: docs[i],
        isInlineXBRL: xbrl[i] === 1,
      };
    }
  }
  return null;
}

// ─── Step 2: Fetch XBRL instance XML ─────────────────────────────────────────

async function fetchXbrlXml(cik: string, filing: FilingInfo): Promise<string> {
  const numericCik = cik.replace(/^0+/, "");
  const accNodash = filing.accessionNumber.replace(/-/g, "");
  const primaryBase = filing.primaryDocument.replace(/\.(htm|html)$/i, "");

  // The extracted XBRL instance is typically: {primaryDocBase}_htm.xml
  // E.g. gsbd-20251231.htm → gsbd-20251231_htm.xml
  const xmlName = `${primaryBase}_htm.xml`;
  const url = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accNodash}/${xmlName}`;

  const cacheKey = `xbrl_${cik}_${PERIOD.replace(/-/g, "")}`;
  let cached = cacheGet<string>(cacheKey);
  if (cached) return typeof cached === "string" ? cached : JSON.stringify(cached);

  const xml = await fetchWithRetry(url);
  cacheSet(cacheKey, xml);
  return xml;
}

// ─── Step 3: Parse XBRL instance XML ─────────────────────────────────────────

/**
 * Three XBRL domain text formats across BDC filers:
 *
 * FORMAT A (GSCR, GSBD — Goldman Sachs):
 *   "Investment Debt Investments - 226.3% United States - 214.3% 1st Lien/Senior Secured Debt - 200.8%
 *    COMPANY Industry SECTOR Interest Rate 8.47% Reference Rate and Spread S+4.75% Maturity 04/30/31"
 *
 * FORMAT B (ARCC, BXSL, OBDC, FSK — brief):
 *   "COMPANY, First lien senior secured loan"
 *   "COMPANY, Second lien senior secured loan 1"
 *
 * FORMAT C (ADS — reversed: SECTOR COMPANY_SHORT LEGAL_NAME Investment Type ...):
 *   "Software Zafin Zafin Labs Americas Incorporated Investment Type First Lien Secured Debt..."
 *   "Machinery Husky Technologies Titan Acquisition Ltd..."
 */

// Investment type keyword patterns
const TYPE_PATTERNS: Array<[RegExp, string]> = [
  [/1st\s*lien\s*\/?\s*senior\s+secured\s+debt/i,    "First Lien"],
  [/first\s+lien\s+senior\s+secured/i,               "First Lien"],
  [/1st\s*lien\s*\/?\s*last[- ]out/i,                "First Lien (Last-Out)"],
  [/1st\s*lien/i,                                     "First Lien"],
  [/first\s+lien/i,                                   "First Lien"],
  [/2nd\s*lien\s*\/?\s*senior\s+secured/i,            "Second Lien"],
  [/second\s+lien/i,                                  "Second Lien"],
  [/2nd\s*lien/i,                                     "Second Lien"],
  [/subordinated\s+debt/i,                            "Subordinated"],
  [/mezzanine/i,                                       "Mezzanine"],
  [/unitranche/i,                                      "Unitranche"],
  [/preferred\s+(stock|equity)/i,                     "Preferred Equity"],
  [/common\s+(stock|equity)/i,                        "Common Equity"],
  [/equity\s*\/? ?warrants?/i,                        "Equity/Warrants"],
  [/warrants?/i,                                       "Warrant"],
  [/equity/i,                                          "Equity"],
  [/revolver|revolving/i,                              "Revolver"],
  [/delayed\s+draw/i,                                 "Delayed Draw TL"],
  [/term\s+loan/i,                                    "Term Loan"],
];

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x2013;/g, "\u2013")
    .replace(/&#x2014;/g, "\u2014")
    .replace(/&#x2019;/g, "\u2019")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractInvestmentType(domain: string): string {
  for (const [re, label] of TYPE_PATTERNS) {
    if (re.test(domain)) return label;
  }
  return "Debt";
}

function detectFormat(domain: string): "A" | "B" | "C" {
  if (/^(?:Investment|Equity and Other)\s+.+?\d+\.\d+%/i.test(domain)) return "A";
  if (/Investment\s+Type/i.test(domain)) return "C";
  return "B";
}

/**
 * Parse company name, industry, and investment type from a domain string.
 */
function parseDomain(rawDomain: string): { company: string; industry: string; investmentType: string } {
  const domain = decodeHtmlEntities(rawDomain).replace(/\s+/g, " ").trim();
  const fmt = detectFormat(domain);

  if (fmt === "A") {
    // Company name is between the LAST "-/– X.X%" type-header block and "Industry"
    // e.g. "... 1st Lien/Senior Secured Debt – 200.8% COMPANY Industry SECTOR ..."
    const indIdx = domain.search(/\s+Industry\s/i);
    const initialIdx = domain.search(/\s+Initial\s+Acquisition/i);
    const cutoffIdx = indIdx > 0 ? indIdx : initialIdx > 0 ? initialIdx : domain.length;

    const prefixBeforeIndustry = domain.substring(0, cutoffIdx);

    // Find last "- X.X%" or "– X.X%" in the prefix
    let lastPctEnd = 0;
    const pctPattern = /[-\u2013]\s*[\d.]+%/g;
    let pctM: RegExpExecArray | null;
    while ((pctM = pctPattern.exec(prefixBeforeIndustry)) !== null) {
      lastPctEnd = pctM.index + pctM[0].length;
    }

    let company = prefixBeforeIndustry.substring(lastPctEnd).trim();
    company = company.replace(/\s*\(\d+\)\s*$/, "").replace(/\s+(?:One|Two|Three|Four|Five)\s*$/i, "").trim();

    // Industry from text after "Industry " keyword
    const indM = domain.match(/\bIndustry\s+(.+?)(?:\s+Interest\s+Rate|\s+Reference\s+Rate|\s+Maturity|\s+PIK|\s+Initial|$)/i);
    const industry = indM
      ? indM[1].trim().replace(/&amp;/g, "&").replace(/\s*\(\d+\)\s*$/, "").trim()
      : "Other";

    return { company: company || domain.substring(0, 80), industry, investmentType: extractInvestmentType(domain) };
  }

  if (fmt === "B") {
    // "COMPANY, investment type..."
    const commaIdx = domain.indexOf(",");
    const company = commaIdx > 0 ? domain.substring(0, commaIdx).trim() : domain.substring(0, 80).trim();
    const rest = commaIdx > 0 ? domain.substring(commaIdx + 1) : domain;
    return { company, industry: "Other", investmentType: extractInvestmentType(rest) };
  }

  // Format C: "INDUSTRY [INDUSTRY2] COMPANY_SHORT ... Investment Type ..."
  const invTypeIdx = domain.search(/Investment\s+Type/i);
  const prefix = invTypeIdx > 0 ? domain.substring(0, invTypeIdx).trim() : domain;
  const words = prefix.split(/\s+/);

  // Industry: first 1-2 words if they match known sectors
  const TWO_WORD_INDUSTRIES = /^(Specialty Retail|Real Estate|Financial Technology|Health Care|Business Services|Professional Services|Consumer Products|Education Technology|Diversified Financials|Diversified Consumer|Asset Management|Capital Markets|Commercial Services)/i;
  const ONE_WORD_INDUSTRIES = /^(Software|Technology|Healthcare|Financial|Insurance|Media|Telecom|Education|Industrial|Consumer|Retail|Energy|Transportation|Manufacturing|Chemicals|Business|Professional|Government|Legal|Machinery|Food|Defense|Staffing|Construction|Commercial|Automotive|Aerospace|Mining|Utilities)/i;

  let industryWords = 0;
  let industry = "Other";
  const twoWords = words.slice(0, 2).join(" ");
  const oneWord = words[0] ?? "";

  if (TWO_WORD_INDUSTRIES.test(twoWords)) { industry = twoWords; industryWords = 2; }
  else if (ONE_WORD_INDUSTRIES.test(oneWord)) { industry = oneWord; industryWords = 1; }

  // Company: next 2-4 words after industry
  const companyWords = words.slice(industryWords, industryWords + 4);
  const company = companyWords.join(" ").trim() || prefix.substring(0, 60);

  return { company, industry, investmentType: extractInvestmentType(domain) };
}

// ─── Rate and maturity builders ───────────────────────────────────────────────

function safeNum(v: string | null | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function buildRate(facts: Record<string, string>, domain: string): string {
  const spread  = facts["InvestmentBasisSpreadVariableRate"];
  const fixed   = facts["InvestmentInterestRate"];
  const pik     = facts["InvestmentInterestRatePaidInKind"];
  const rateType = facts["InvestmentVariableInterestRateTypeExtensibleEnumeration"] ?? "";

  if (spread) {
    const bps = Math.round(safeNum(spread) * 10000);
    const basis = rateType.toLowerCase().includes("sofr") ? "SOFR" :
                  rateType.toLowerCase().includes("sonia") ? "SONIA" :
                  rateType.toLowerCase().includes("libor") ? "LIBOR" : "S";
    return `${basis}+${bps}`;
  }
  if (pik && safeNum(pik) > 0) return `PIK ${(safeNum(pik) * 100).toFixed(2)}%`;
  if (fixed) return `${(safeNum(fixed) * 100).toFixed(2)}%`;

  // Domain text fallback for Format C (ADS style: "S+375")
  const mSpread = domain.match(/(?:Interest\s+Rate\s+)?(?:S|SOFR|SONIA)\+(\d+)/i);
  if (mSpread) return `SOFR+${mSpread[1]}`;
  const mPik = domain.match(/(\d+\.?\d*)%\s*PIK/i);
  if (mPik) return `PIK ${mPik[1]}%`;
  return "—";
}

function extractMaturity(facts: Record<string, string>, domain: string): string {
  if (facts["InvestmentMaturityDate"]) return facts["InvestmentMaturityDate"];

  // Try domain text: "Maturity Date M/D/YYYY" or "Maturity MM/DD/YY"
  const m = domain.match(/Maturity\s+(?:Date\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (m) {
    const parts = m[1].split("/");
    const yr = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${yr}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }
  return "—";
}

function inferNonAccrual(par: number, fv: number, domain: string): boolean {
  if (/non-accrual|non\s+accrual/i.test(domain)) return true;
  if (par > 0 && fv >= 0 && fv / par < 0.50) return true;
  return false;
}

/** Parse the XBRL instance XML string into investment records. */
function parseXbrlInvestments(xml: string, fundId: string): RawInvestment[] {
  const investments: RawInvestment[] = [];

  // ── 1. Build context id → domain text map for 2025-12-31 ──────────────────
  // Strategy: split on </context> (non-nesting) to get each context block.
  // CRITICAL: namespace prefix may be 'us-gaap' (has hyphen) — use [a-zA-Z0-9_-]+
  const contextMap: Record<string, string> = {};

  const contextBlocks = xml.split("</context>");
  for (const block of contextBlocks) {
    if (!block.includes("InvestmentIdentifierAxis")) continue;
    if (!block.includes("2025-12-31")) continue;

    const idMatch = block.match(/id="([^"]+)"/);
    if (!idMatch) continue;
    const ctxId = idMatch[1];

    const periodMatch = block.match(/<instant>([^<]+)<\/instant>/);
    if (!periodMatch || periodMatch[1].trim() !== "2025-12-31") continue;

    // Domain is child text of <ns:InvestmentIdentifierAxis.domain>
    // ns can be 'us-gaap' (with hyphen) so use [a-zA-Z0-9_-]+
    const domainMatch = block.match(
      /<[a-zA-Z0-9_-]+:InvestmentIdentifierAxis\.domain>([^<]+)<\/[a-zA-Z0-9_-]+:InvestmentIdentifierAxis\.domain>/
    );
    if (!domainMatch) continue;

    contextMap[ctxId] = domainMatch[1].trim().replace(/\s+/g, " ");
  }

  if (Object.keys(contextMap).length === 0) return [];

  // ── 2. Collect facts keyed by contextRef ───────────────────────────────────
  // CRITICAL FIX: namespace prefix can be 'us-gaap' (hyphen) — \w+ fails!
  // Use [a-zA-Z0-9_-]+ for namespace prefix matching.
  // Pattern: <ns:TagName ...attrs... >value</ns:TagName>
  // Attrs may span multiple lines — [^>]* handles this since > only closes tag.

  const TARGET_TAGS = [
    "InvestmentOwnedBalancePrincipalAmount",
    "InvestmentOwnedAtCost",
    "InvestmentOwnedAtFairValue",
    "InvestmentOwnedFairValueBalance",
    "InvestmentInterestRate",
    "InvestmentBasisSpreadVariableRate",
    "InvestmentInterestRatePaidInKind",
    "InvestmentMaturityDate",
    "InvestmentVariableInterestRateTypeExtensibleEnumeration",
  ];

  const factsByCtx: Record<string, Record<string, string>> = {};

  for (const tag of TARGET_TAGS) {
    // [a-zA-Z0-9_-]+ matches namespaces including 'us-gaap'
    // ([^>]*) captures all attrs (newlines included since [^>] != [^\n])
    const pattern = new RegExp(
      `<[a-zA-Z0-9_-]*:${tag}([^>]*)>([^<]*)`,
      "g"
    );
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(xml)) !== null) {
      const attrs  = m[1];
      const value  = m[2].trim();
      const ctxM   = attrs.match(/contextRef="([^"]+)"/);
      if (!ctxM) continue;
      const ctxRef = ctxM[1];
      if (!(ctxRef in contextMap)) continue;
      if (!factsByCtx[ctxRef]) factsByCtx[ctxRef] = {};
      factsByCtx[ctxRef][tag] = value;
    }
  }

  // ── 4. Build investment records ────────────────────────────────────────────
  for (const [ctxId, domain] of Object.entries(contextMap)) {
    const f = factsByCtx[ctxId] ?? {};

    const par  = safeNum(f["InvestmentOwnedBalancePrincipalAmount"]) / 1e6;
    const cost = safeNum(f["InvestmentOwnedAtCost"]) / 1e6;
    const fv   = safeNum(f["InvestmentOwnedAtFairValue"] ?? f["InvestmentOwnedFairValueBalance"]) / 1e6;

    // Skip equity/warrant positions with 0 par (shares-based) that have negligible FV
    // But keep equity positions that have meaningful FV
    if (par === 0 && cost === 0 && fv === 0) continue;
    if (par === 0 && fv === 0 && cost === 0) continue;

    // Skip money market / cash entries
    if (/money\s+market|cash\s+equivalent/i.test(domain)) continue;

    const { company, industry, investmentType: invType } = parseDomain(domain);
    const rate     = buildRate(f, domain);
    const maturity = extractMaturity(f, domain);
    const nonAccrual = inferNonAccrual(par, fv, domain);

    investments.push({
      fund: fundId,
      company,
      industry,
      investmentType: invType,
      rate,
      maturity,
      par,
      cost,
      fv,
      nonAccrual,
    });
  }

  return investments;
}

// ─── Step 4: HTML fallback parser ────────────────────────────────────────────

async function parseHtmlFallback(
  cik: string,
  filing: FilingInfo,
  fundId: string
): Promise<RawInvestment[]> {
  const numericCik = cik.replace(/^0+/, "");
  const accNodash  = filing.accessionNumber.replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accNodash}/${filing.primaryDocument}`;

  console.log(`[edgar] HTML fallback for ${fundId}: ${url}`);

  const cacheKey = `htm_${cik}_${PERIOD.replace(/-/g, "")}`;
  let html = cacheGet<string>(cacheKey);
  if (!html) {
    html = await fetchWithRetry(url);
    cacheSet(cacheKey, html);
  }

  // Dynamic import of cheerio (server-side only)
  const { load } = await import("cheerio");
  const $ = load(html as string);
  const investments: RawInvestment[] = [];

  // BDC 10-K HTM files contain a "Schedule of Investments" section
  // with a table. We look for the section heading then parse the table.
  let soiSection = false;
  let currentType = "Debt";
  let currentIndustry = "Other";

  $("table tr").each((_i, row) => {
    const cells = $(row).find("td, th").map((_j, td) => $(td).text().trim()).get();
    if (cells.length === 0) return;

    const firstCell = cells[0].toLowerCase();

    // Detect industry/type headers (section breaks in the table)
    if (cells.length <= 3 && firstCell) {
      if (/schedule of investments/i.test(cells.join(" "))) {
        soiSection = true;
        return;
      }
      if (!soiSection) return;
      if (/1st lien|first lien/i.test(firstCell)) { currentType = "First Lien"; return; }
      if (/2nd lien|second lien/i.test(firstCell)) { currentType = "Second Lien"; return; }
      if (/subordinat/i.test(firstCell)) { currentType = "Subordinated"; return; }
      if (/equity/i.test(firstCell)) { currentType = "Equity"; return; }
    }

    if (!soiSection) return;
    if (cells.length < 5) return;

    // Try to identify columns: Company, Industry, Rate, Maturity, Par, Cost, FV
    // Column positions vary by fund — use heuristics
    const company = cells[0];
    if (!company || company.length < 2) return;
    if (/total|aggregate|subtotal/i.test(company)) return;

    // Look for maturity pattern mm/yy or mm/dd/yy
    let maturityIdx = -1;
    let maturity = "—";
    for (let i = 1; i < cells.length; i++) {
      if (/\d{1,2}\/\d{2,4}/.test(cells[i])) {
        maturityIdx = i;
        maturity = cells[i];
        break;
      }
    }

    // Numeric cells after maturity = Par, Cost, FV
    const numericCells: number[] = [];
    for (let i = maturityIdx + 1; i < cells.length; i++) {
      const n = parseFloat(cells[i].replace(/[$,()]/g, ""));
      if (!isNaN(n)) numericCells.push(n);
    }

    if (numericCells.length < 2) return;

    const par  = numericCells[0] / 1000;  // HTM usually in thousands
    const cost = numericCells[1] / 1000;
    const fv   = (numericCells[2] ?? numericCells[1]) / 1000;

    investments.push({
      fund: fundId,
      company: company.substring(0, 100),
      industry: currentIndustry,
      investmentType: currentType,
      rate: "—",
      maturity,
      par,
      cost,
      fv,
      nonAccrual: inferNonAccrual(par, fv, company),
    });
  });

  return investments;
}

// ─── Main extraction entry point ─────────────────────────────────────────────

export async function extractFund(
  fund: FundMeta
): Promise<{ investments: RawInvestment[]; status: ExtractionStatus }> {
  const t0 = Date.now();
  const statusBase = { fund: fund.id, cik: fund.cik, investmentCount: 0, durationMs: 0 };

  try {
    // Check for already-cached normalized investments
    const invCacheKey = `investments_${fund.cik}_${PERIOD.replace(/-/g, "")}`;
    const cached = cacheGet<RawInvestment[]>(invCacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return {
        investments: cached,
        status: { ...statusBase, status: "cached", investmentCount: cached.length, durationMs: Date.now() - t0 },
      };
    }

    // Step 1: Find the filing
    console.log(`[edgar] Finding 10-K for ${fund.id} (${fund.cik})...`);
    const filing = await findFiling(fund.cik);
    if (!filing) {
      throw new Error(`No 10-K found for period ${PERIOD}`);
    }
    console.log(`[edgar] Found filing: ${filing.accessionNumber} | ${filing.primaryDocument}`);

    // Step 2+3: Fetch and parse XBRL instance
    let investments: RawInvestment[] = [];
    try {
      console.log(`[edgar] Fetching XBRL instance for ${fund.id}...`);
      const xml = await fetchXbrlXml(fund.cik, filing);
      investments = parseXbrlInvestments(xml, fund.id);
      console.log(`[edgar] XBRL parsed: ${investments.length} investments for ${fund.id}`);
    } catch (xmlErr) {
      console.warn(`[edgar] XBRL parse failed for ${fund.id}:`, xmlErr);
    }

    // Step 4: HTML fallback if needed
    if (investments.length < 5) {
      console.log(`[edgar] Using HTML fallback for ${fund.id} (XBRL yielded ${investments.length})`);
      investments = await parseHtmlFallback(fund.cik, filing, fund.id);
      console.log(`[edgar] HTML fallback: ${investments.length} investments for ${fund.id}`);
    }

    // Cache the parsed investments
    cacheSet(invCacheKey, investments);

    return {
      investments,
      status: {
        ...statusBase,
        status: "ok",
        investmentCount: investments.length,
        durationMs: Date.now() - t0,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[edgar] ERROR for ${fund.id}:`, msg);
    return {
      investments: [],
      status: { ...statusBase, status: "error", durationMs: Date.now() - t0, error: msg },
    };
  }
}

/** Extract all 7 funds in parallel with per-fund error isolation. */
export async function extractAllFunds(): Promise<{
  allInvestments: RawInvestment[];
  statuses: ExtractionStatus[];
}> {
  console.log(`[edgar] Starting extraction for ${FUNDS.length} funds...`);

  // Rate-limit: extract in batches of 3 (EDGAR rate limit ~10 req/s)
  const results: Array<{ investments: RawInvestment[]; status: ExtractionStatus }> = [];

  for (let i = 0; i < FUNDS.length; i += 3) {
    const batch = FUNDS.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(extractFund));
    results.push(...batchResults);
    if (i + 3 < FUNDS.length) {
      await new Promise(r => setTimeout(r, 500)); // brief pause between batches
    }
  }

  const allInvestments = results.flatMap(r => r.investments);
  const statuses = results.map(r => r.status);

  console.log(`[edgar] Extraction complete. Total investments: ${allInvestments.length}`);
  statuses.forEach(s => {
    const icon = s.status === "ok" ? "✓" : s.status === "cached" ? "⚡" : "✗";
    console.log(`  ${icon} ${s.fund}: ${s.investmentCount} investments (${s.durationMs}ms)${s.error ? " ERR: " + s.error : ""}`);
  });

  return { allInvestments, statuses };
}
