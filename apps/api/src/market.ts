import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { ONTOP, robinhoodMainnet } from "@ontoppad/shared";
import { getMeta, setMeta } from "./db.ts";
import { mediaDir, sniffImage } from "./metadata.ts";

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

// the market is mainnet whichever network this process runs
const mainnet = createPublicClient({ chain: robinhoodMainnet, transport: http(undefined, { batch: true }) });
const IPFS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];
// address → pinned /api/media path
const logos: Record<string, string> = JSON.parse(getMeta("marketLogoFiles") ?? "{}");
// Robinhood's tokenized stocks and ETFs, e.g. "NVIDIA • Robinhood Token"
const STOCK = /Robinhood Token$/;

let items: MarketToken[] = JSON.parse(getMeta("market") ?? "[]");
let updatedAt = Number(getMeta("marketAt") ?? 0);
// $ONTOP gets its own featured slot, never a numbered row
let house: MarketToken | null = JSON.parse(getMeta("marketHouse") ?? "null");

export const getMarket = () => ({ items, updatedAt, house });

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
      name: t.name.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
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

/** $ONTOP's busiest pool where it is the base token, live numbers only. */
export const pickHouse = (page: Page, address: string) => toTokens([page]).find((r) => r.address === address.toLowerCase()) ?? null;

async function get(path: string): Promise<Page> {
  const res = await fetch(`${SRC}/${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`geckoterminal ${res.status}`);
  return (await res.json()) as Page;
}

async function refreshHouse() {
  if (!ONTOP) return;
  try {
    const row = pickHouse(await get(`tokens/${ONTOP}/pools?page=1&include=base_token`), ONTOP);
    if (!row) return;
    house = row;
    setMeta("marketHouse", JSON.stringify(row));
  } catch {
    // keep the last good numbers
  }
}

async function refresh() {
  await refreshHouse();
  try {
    const pages = await Promise.all(["pools", "new_pools"].map((path) => get(`${path}?page=1&include=base_token`)));
    const rows = toTokens(pages).filter((r) => r.address !== ONTOP?.toLowerCase());
    await fillLogos(rows);
    // the board only shows a token with its real logo; one with none anywhere waits until it gets one
    const next = rows.filter((r) => r.image);
    if (!next.length) return;
    items = next;
    updatedAt = Math.floor(Date.now() / 1000);
    setMeta("market", JSON.stringify(items));
    setMeta("marketAt", updatedAt);
  } catch {
    // keep the last good board (free tier is 30 calls/min; we make 3 every 2 minutes)
  }
}

/** Download a logo once and serve it from our own media, so no third-party CDN or IPFS gateway can blank a row. */
async function pinLogo(uri: string): Promise<string | null> {
  const cid = uri.match(/^ipfs:\/\/(?:ipfs\/)?([\w/.-]+)$/)?.[1];
  const urls = cid ? IPFS.map((g) => g + cid) : uri.startsWith("https://") ? [uri] : [];
  for (const u of urls) {
    try {
      const res = await fetch(u, { headers: { accept: "image/webp,image/png,image/jpeg,image/gif" }, signal: AbortSignal.timeout(15_000) });
      const b = new Uint8Array(await res.arrayBuffer());
      const ext = res.ok && b.byteLength <= 2 * 1024 * 1024 ? sniffImage(b) : null;
      if (!ext) continue;
      const file = `${createHash("sha256").update(b).digest("hex").slice(0, 32)}.${ext}`;
      writeFileSync(`${mediaDir}/${file}`, b);
      return `/api/media/${file}`;
    } catch {
      // next source
    }
  }
  return null;
}

/**
 * Every row's real logo, pinned locally. Sources in order: the company logo for Robinhood stock tokens
 * (CoinGecko gives them all the same Robinhood feather), GeckoTerminal, DexScreener, the token's own logo().
 * Hits are kept for good; misses are retried each refresh.
 */
async function fillLogos(rows: MarketToken[]) {
  const todo = rows.filter((r) => !logos[r.address]);
  if (todo.length) {
    const dex: Record<string, string> = {};
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${todo.map((r) => r.address).join(",")}`, { signal: AbortSignal.timeout(10_000) });
      for (const p of (await res.json()) as { baseToken: { address: string }; info?: { imageUrl?: string } }[]) {
        if (p.info?.imageUrl) dex[p.baseToken.address.toLowerCase()] = p.info.imageUrl;
      }
    } catch {
      // other sources still apply
    }
    const chain = await mainnet
      .multicall({ contracts: todo.map((r) => ({ address: r.address as Address, abi: parseAbi(["function logo() view returns (string)"]), functionName: "logo" })) })
      .catch(() => []);
    await Promise.all(
      todo.map(async (r, i) => {
        const own = chain[i]?.status === "success" ? chain[i].result : undefined;
        const stock = STOCK.test(r.name) ? `https://financialmodelingprep.com/image-stock/${encodeURIComponent(r.symbol)}.png` : undefined;
        for (const src of [stock, stock ? undefined : r.image, dex[r.address], own]) {
          const local = src && (await pinLogo(src));
          if (local) {
            logos[r.address] = local;
            break;
          }
        }
      }),
    );
    setMeta("marketLogoFiles", JSON.stringify(logos));
  }
  for (const r of rows) r.image = logos[r.address] ?? null;
}

export function runMarketFeed() {
  void refresh();
  setInterval(refresh, 120_000).unref();
}
