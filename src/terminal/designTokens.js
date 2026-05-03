// Design system: editorial dark + cool→warm risk gradient (OKLCH).
// Mono for numbers, sans for UI/headlines.
import { useState, useEffect, useRef } from "react";

export const THEMES = {
  dark: {
    name: "EDITORIAL DARK",
    bg:        "oklch(0.16 0.02 250)",
    bgPanel:   "oklch(0.20 0.025 250)",
    bgPanel2:  "oklch(0.23 0.025 250)",
    bgInset:   "oklch(0.13 0.02 250)",
    border:    "oklch(0.28 0.025 250)",
    borderSoft:"oklch(0.24 0.02 250)",
    text:      "oklch(0.94 0.01 80)",
    textMuted: "oklch(0.70 0.015 240)",
    textDim:   "oklch(0.50 0.02 240)",
    accent:    "oklch(0.78 0.13 230)",
  },
  paper: {
    name: "PAPER",
    bg:        "oklch(0.98 0.005 90)",
    bgPanel:   "oklch(0.96 0.008 90)",
    bgPanel2:  "oklch(0.94 0.01 90)",
    bgInset:   "oklch(0.92 0.012 85)",
    border:    "oklch(0.85 0.015 80)",
    borderSoft:"oklch(0.90 0.012 80)",
    text:      "oklch(0.22 0.02 250)",
    textMuted: "oklch(0.42 0.02 250)",
    textDim:   "oklch(0.62 0.02 240)",
    accent:    "oklch(0.50 0.14 240)",
  },
  glass: {
    name: "GLASS",
    bg:        "oklch(0.13 0.025 260)",
    bgPanel:   "oklch(0.22 0.03 260 / 0.55)",
    bgPanel2:  "oklch(0.26 0.03 260 / 0.55)",
    bgInset:   "oklch(0.18 0.025 260 / 0.5)",
    border:    "oklch(0.45 0.04 260 / 0.4)",
    borderSoft:"oklch(0.38 0.03 260 / 0.3)",
    text:      "oklch(0.95 0.01 240)",
    textMuted: "oklch(0.72 0.02 240)",
    textDim:   "oklch(0.55 0.025 240)",
    accent:    "oklch(0.80 0.14 220)",
  },
};

export const RISK_STOPS = [
  { t: 0.00, color: "oklch(0.62 0.13 235)" },
  { t: 0.35, color: "oklch(0.70 0.13 200)" },
  { t: 0.65, color: "oklch(0.78 0.14 80)"  },
  { t: 1.00, color: "oklch(0.66 0.18 30)"  },
];

export function riskColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < RISK_STOPS.length - 1; i++) {
    const a = RISK_STOPS[i];
    const b = RISK_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return interpolateOklch(a.color, b.color, f);
    }
  }
  return RISK_STOPS[RISK_STOPS.length - 1].color;
}

function interpolateOklch(a, b, f) {
  const pa = parseOklch(a);
  const pb = parseOklch(b);
  const L = pa.L + (pb.L - pa.L) * f;
  const C = pa.C + (pb.C - pa.C) * f;
  let dh = pb.H - pa.H;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const H = pa.H + dh * f;
  const aLpha = pa.a + (pb.a - pa.a) * f;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)}${aLpha < 1 ? ` / ${aLpha}` : ''})`;
}

function parseOklch(s) {
  const m = s.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.-]+)(?:\s*\/\s*([\d.]+))?\s*\)/);
  if (!m) return { L: 0.5, C: 0, H: 0, a: 1 };
  return { L: +m[1], C: +m[2], H: +m[3], a: m[4] ? +m[4] : 1 };
}

export function ratioToRiskT(ratio, nonAccrual) {
  if (nonAccrual) return 1.0;
  if (ratio == null || isNaN(ratio)) return 0;
  if (ratio >= 100) return 0;
  if (ratio >= 97)  return 0.10 + (100 - ratio) / 30 * 0.10;
  if (ratio >= 90)  return 0.20 + (97 - ratio) / 7  * 0.20;
  if (ratio >= 80)  return 0.40 + (90 - ratio) / 10 * 0.25;
  if (ratio >= 50)  return 0.65 + (80 - ratio) / 30 * 0.30;
  return 0.95;
}

export function statusFromRatio(ratio, nonAccrual) {
  if (nonAccrual) return { label: "non-accrual",  t: 1.0 };
  if (ratio >= 97) return { label: "par",          t: 0.10 };
  if (ratio >= 90) return { label: "watch",        t: 0.30 };
  if (ratio >= 80) return { label: "stress",       t: 0.55 };
  if (ratio >= 50) return { label: "distress",     t: 0.80 };
  return            { label: "deep distress",      t: 0.95 };
}

export const FUND_META = {
  GSCR: { gs: true,  manager: "Goldman Sachs",   short: "GSAM" },
  GSBD: { gs: true,  manager: "Goldman Sachs",   short: "GSAM" },
  ARCC: { gs: false, manager: "Ares Capital",    short: "ARES" },
  BXSL: { gs: false, manager: "Blackstone",      short: "BX"   },
  OBDC: { gs: false, manager: "Blue Owl",        short: "OWL"  },
  ADS:  { gs: false, manager: "Ares Dynamic",    short: "ARES" },
  FSK:  { gs: false, manager: "FS / KKR",        short: "KKR"  },
};
export const ALL_FUNDS = ["GSCR","GSBD","ARCC","BXSL","OBDC","ADS","FSK"];
export const GS_FUNDS = new Set(["GSCR","GSBD"]);

export function fmtM(n) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${n < 0 ? "−" : ""}$${(abs / 1000).toFixed(2)}B`;
  if (abs >= 1)    return `${n < 0 ? "−" : ""}$${abs.toFixed(1)}M`;
  return `${n < 0 ? "−" : ""}$${(abs * 1000).toFixed(0)}K`;
}
export function fmtMShort(n) {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${n < 0 ? "−" : ""}${(abs / 1000).toFixed(1)}B`;
  return `${n < 0 ? "−" : ""}${abs.toFixed(0)}M`;
}
export function fmtPct(p, dec = 1) {
  if (p == null || isNaN(p)) return "—";
  return `${p.toFixed(dec)}%`;
}
export function fmtSigned(n) {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(1)}M`;
}
export function fvParPct(fv, par) {
  if (!par || par === 0) return null;
  return (fv / par) * 100;
}
export function shortCompany(name, max = 38) {
  if (!name) return "—";
  let s = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s;
}
export function fmtDate(iso) {
  if (!iso || iso === "—") return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { year: "2-digit", month: "short", day: "2-digit" });
}

export function useAnimatedNumber(target, { duration = 600, motion = true } = {}) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);
  useEffect(() => {
    if (!motion) { setValue(target); return; }
    const from = fromRef.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      setValue(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, motion]);
  return value;
}
