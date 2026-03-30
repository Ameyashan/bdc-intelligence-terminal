// ─── Shared type definitions ──────────────────────────────────────────────────

export interface RawInvestment {
  fund: string;
  company: string;
  industry: string;
  investmentType: string;
  rate: string;
  maturity: string;
  par: number;    // USD millions
  cost: number;   // USD millions
  fv: number;     // USD millions
  nonAccrual: boolean;
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
  status: "ok" | "error" | "cached";
  investmentCount: number;
  durationMs: number;
  error?: string;
}

// The `data` shape BDCTerminal expects
export interface TerminalData {
  funds: FundSummary[];
  investments: RawInvestment[];
}
