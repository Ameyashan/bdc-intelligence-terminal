// ─── Shared type definitions ──────────────────────────────────────────────────

export interface PeriodSnapshot {
  period: string;        // e.g. "2025-12-31"
  par: number;
  cost: number;
  fv: number;
  rate: string;
  nonAccrual: boolean;
}

export type SeriesMatchConfidence = "high" | "low";

export interface RawInvestment {
  fund: string;
  company: string;
  industry: string;
  investmentType: string;
  rate: string;
  maturity: string;
  par: number;    // USD millions (latest period)
  cost: number;   // USD millions (latest period)
  fv: number;     // USD millions (latest period)
  nonAccrual: boolean;          // latest period
  series?: PeriodSnapshot[];    // ordered latest → oldest; absent on pre-time-series data
  seriesMatchConfidence?: SeriesMatchConfidence;
}

export interface FundSummary {
  id: string;
  name: string;
  manager: string;
  type: string;
  gs: boolean;
  totalFV: number;
  totalPar: number;
  totalCost: number;
  nonAccrualCount: number;
  stressedCount: number;
  softwarePct: number;
}

export interface BDCData {
  funds: FundSummary[];
  investments: RawInvestment[];
  extractedAt: string;
  period: string;
}

export interface ExtractionStatus {
  fund: string;
  cik: string;
  period?: string;            // present in multi-period extractions
  status: "ok" | "error" | "cached" | "unavailable";
  investmentCount: number;
  durationMs: number;
  error?: string;
}

// The `data` shape BDCTerminal expects
export interface TerminalData {
  funds: FundSummary[];
  investments: RawInvestment[];
}
