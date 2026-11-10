import { getMeta, setMeta } from "./db.ts";

/** ETH/USD spot, refreshed every minute; the last good value survives restarts and outages. */
let ethUsd = Number(getMeta("ethUsd") ?? 3500);

export const getEthUsd = () => ethUsd;

async function refresh() {
  try {
    const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { signal: AbortSignal.timeout(5_000) });
    const v = Number(((await res.json()) as { data?: { amount?: string } }).data?.amount);
    if (v > 0) {
      ethUsd = v;
      setMeta("ethUsd", v);
    }
  } catch {
    // keep the last good price
  }
}

export function runPriceFeed() {
  void refresh();
  setInterval(refresh, 60_000).unref();
}
