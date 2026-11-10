const SUB = "₀₁₂₃₄₅₆₇₈₉";
const subscript = (n: number) => [...String(n)].map((d) => SUB[Number(d)]).join("");

/** Tiny values the crypto way: 0.0000000171 → 0.0₇171 */
function tiny(v: number, sig = 3): string {
  // round first: 0.00009996 must become 0.0001, not lose a zero and read 10x smaller
  v = Number(v.toPrecision(sig));
  const zeros = -Math.floor(Math.log10(v)) - 1;
  if (zeros < 4) return v.toFixed(zeros + sig).replace(/0+$/, "");
  const digits = String(Math.round(v * 10 ** (zeros + sig))).replace(/0+$/, "");
  return `0.0${subscript(zeros)}${digits}`;
}

function compact(v: number): string {
  // thresholds sit just under the next unit, so 999,999 reads 1.00M rather than 1000.0K
  if (v >= 999_950_000) return `${(v / 1e9).toFixed(v >= 1e10 ? 1 : 2)}B`;
  if (v >= 999_950) return `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 });
}

export function usd(v: number): string {
  if (!(v > 0)) return "$0";
  if (v >= 1e4) return `$${compact(v)}`;
  if (v >= 1) return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v >= 0.01) return `$${v.toFixed(2)}`;
  return `$${tiny(v, 2)}`;
}

export function price(v: number): string {
  if (!(v > 0)) return "$0";
  return v >= 1 ? usd(v) : `$${tiny(v)}`;
}

export function eth(v: number, symbol = "ETH"): string {
  if (!(v > 0)) return `0 ${symbol}`;
  const s = v >= 100 ? compact(v) : v >= 1 ? v.toFixed(3) : v >= 0.001 ? v.toFixed(5).replace(/0+$/, "") : tiny(v, 3);
  return `${s} ${symbol}`;
}

export function amount(v: number): string {
  if (!(v > 0)) return "0";
  return v >= 1 ? compact(v) : tiny(v, 3);
}

export function pct(v: number, digits = 2): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

/** The operator wallet arrives from the API as "house" and is never shown as an address. */
export const isHouse = (a?: string | null) => a === "house";

export function short(a?: string | null): string {
  if (isHouse(a)) return "ONTOPPAD house";
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function ago(ts: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function span(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

/** Shares and percentages never print as 0.00%. */
export const share = (v: number) => (v >= 0.01 ? `${v.toFixed(2)}%` : "<0.01%");

/** The no-zero rule: a figure, or words that say what will fill it. */
export const or = (v: number, fmt: (v: number) => string, fallback: string) => (v > 0 ? fmt(v) : fallback);

export const bps = (b: number) => `${(b / 100).toFixed(b % 100 ? 1 : 0)}%`;
