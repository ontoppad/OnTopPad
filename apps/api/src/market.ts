import { getMeta, setMeta } from "./db.ts";

/** A token trading anywhere on Robinhood Chain mainnet, as GeckoTerminal sees it. */
export interface MarketToken {
  address: string;
  name: string;
  symbol: string;
  image: string | null;
  pool: string;
  dex: string;
  priceUsd: number;
  change24h: number;
  volume24hUsd: number;
  liquidityUsd: number;
  fdvUsd: number;
  txns24h: number;
  createdAt: number;
}

const SRC = "https://api.geckoterminal.com/api/v2/networks/robinhood";
// quote assets, not tokens anyone is hunting
const SKIP = new Set(["WETH", "ETH", "USDG", "USDC", "USDT"]);

let items: MarketToken[] = JSON.parse(getMeta("market") ?? "[]");
let updatedAt = Number(getMeta("marketAt") ?? 0);

export const getMarket = () => ({ items, updatedAt });

interface Pool {
  attributes: Record<string, any>;
  relationships: { base_token: { data: { id: string } }; dex: { data: { id: string } } };
}
interface Page {
  data?: Pool[];
  included?: { id: string; attributes: { address: string; name: string; symbol: string; image_url: string | null } }[];
}

/** Top pools plus the newest, one row per base token (its busiest pool), live numbers only. */
export function toTokens(pages: Page[]): MarketToken[] {
  const meta = new Map(pages.flatMap((p) => p.included ?? []).map((t) => [t.id, t.attributes]));
  const best = new Map<string, MarketToken>();
  for (const p of pages.flatMap((x) => x.data ?? [])) {
    const a = p.attributes;
    const t = meta.get(p.relationships.base_token.data.id);
    if (!t || SKIP.has(t.symbol.toUpperCase())) continue;
    const row: MarketToken = {
      address: t.address.toLowerCase(),
      name: t.name,
      symbol: t.symbol,
      image: t.image_url?.startsWith("https://") ? t.image_url : null,
      pool: a.address,
      dex: p.relationships.dex.data.id.replace(/-robinhood$/, ""),
      priceUsd: Number(a.base_token_price_usd),
      change24h: Number(a.price_change_percentage?.h24) || 0,
      volume24hUsd: Number(a.volume_usd?.h24),
      liquidityUsd: Number(a.reserve_in_usd),
      fdvUsd: Number(a.market_cap_usd) || Number(a.fdv_usd),
      txns24h: (a.transactions?.h24?.buys ?? 0) + (a.transactions?.h24?.sells ?? 0),
      createdAt: Math.floor(Date.parse(a.pool_created_at) / 1000) || 0,
    };
    // the site never shows a zero: a row needs a price, volume, liquidity and a cap
    if (!(row.priceUsd > 0 && row.volume24hUsd >= 1 && row.liquidityUsd > 0 && row.fdvUsd > 0 && row.txns24h > 0)) continue;
    const prev = best.get(row.address);
    if (!prev || row.volume24hUsd > prev.volume24hUsd) best.set(row.address, row);
  }
  return [...best.values()].sort((a, b) => b.volume24hUsd - a.volume24hUsd).slice(0, 30);
}

async function refresh() {
  try {
    const pages = await Promise.all(
      ["pools", "new_pools"].map(async (path) => {
        const res = await fetch(`${SRC}/${path}?page=1&include=base_token`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`geckoterminal ${res.status}`);
        return (await res.json()) as Page;
      }),
    );
    const next = toTokens(pages);
    if (!next.length) return;
    items = next;
    updatedAt = Math.floor(Date.now() / 1000);
    setMeta("market", JSON.stringify(items));
    setMeta("marketAt", updatedAt);
  } catch {
    // keep the last good board (free tier is 30 calls/min; we make 2 every 2 minutes)
  }
}

export function runMarketFeed() {
  void refresh();
  setInterval(refresh, 120_000).unref();
}
