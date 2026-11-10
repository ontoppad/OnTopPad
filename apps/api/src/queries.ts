import { TIERS, tierFor, nextTier, HOLDERS_BPS } from "@ontoppad/shared";
import { db } from "./db.ts";
import { quoteSymbol } from "./chain.ts";
import { getEthUsd } from "./price.ts";

type Row = Record<string, any>;
const all = (sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[];
const one = (sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined;
const now = () => Math.floor(Date.now() / 1000);

/** USD per unit of a quote asset. */
export function quoteUsd(quote: string): number {
  return quoteSymbol(quote) === "ETH" ? getEthUsd() : 1;
}

const meta = (r: Row) => (r.meta_json ? JSON.parse(r.meta_json) : null) as {
  image?: string;
  description?: string;
  links?: Record<string, string>;
} | null;

const SUMMARY_SQL = `
SELECT t.*,
  (SELECT COUNT(*) FROM balances b WHERE b.token = t.address) AS holders,
  (SELECT COUNT(*) FROM trades x WHERE x.token = t.address) AS trades,
  (SELECT COUNT(DISTINCT trader) FROM trades x WHERE x.token = t.address) AS traders,
  (SELECT COALESCE(SUM(quote_amount), 0) FROM trades x WHERE x.token = t.address AND x.ts > :day) AS vol24,
  (SELECT COALESCE(SUM(quote_amount), 0) FROM trades x WHERE x.token = t.address) AS vol_all,
  (SELECT price FROM trades x WHERE x.token = t.address AND x.ts <= :day ORDER BY ts DESC, log_index DESC LIMIT 1) AS price24,
  (SELECT COALESCE(SUM(bonus), 0) FROM trades x WHERE x.token = t.address) AS bonus_paid,
  (SELECT COUNT(*) FROM trades x WHERE x.token = t.address AND bonus > 0) AS bonus_buys,
  (SELECT COALESCE(SUM(to_holders), 0) FROM collects c WHERE c.token = t.address) AS to_holders,
  (SELECT COALESCE(SUM(to_creator), 0) FROM collects c WHERE c.token = t.address) AS to_creator,
  (SELECT COALESCE(SUM(burned), 0) FROM collects c WHERE c.token = t.address) AS burned_fees,
  (SELECT COALESCE(SUM(total + delivery_fee), 0) FROM rounds r WHERE r.token = t.address) AS distributed,
  (SELECT COALESCE(SUM(total), 0) FROM rounds r WHERE r.token = t.address) AS paid,
  (SELECT COUNT(DISTINCT round) FROM rounds r WHERE r.token = t.address) AS rounds,
  (SELECT MAX(ts) FROM rounds r WHERE r.token = t.address) AS last_round_at,
  (SELECT MAX(ts) FROM collects c WHERE c.token = t.address) AS last_collect_at,
  (SELECT MAX(ts) FROM trades x WHERE x.token = t.address) AS last_trade_at
FROM tokens t`;

function spark(token: string, startPrice: number): number[] {
  const rows = all("SELECT price FROM trades WHERE token = ? ORDER BY ts DESC, log_index DESC LIMIT 240", token).reverse();
  const prices = [startPrice, ...rows.map((r) => r.price as number)];
  if (prices.length <= 24) return prices;
  const step = (prices.length - 1) / 23;
  return Array.from({ length: 24 }, (_, i) => prices[Math.round(i * step)]!);
}

export function summarize(r: Row) {
  const usd = quoteUsd(r.quote);
  const m = meta(r);
  const supply = r.supply as number;
  const fdv = r.price * supply;
  const prev = (r.price24 as number | null) ?? r.start_price;
  // fees already routed to the pot but not yet paid, plus the holder share of buy fees still sitting in the pool
  const uncollected = one(
    "SELECT COALESCE(SUM(quote_amount), 0) AS v FROM trades WHERE token = ? AND is_buy = 1 AND ts >= ?",
    r.address,
    r.last_collect_at ?? 0,
  )!.v as number;
  const pot = Math.max(0, r.to_holders - r.distributed) + (uncollected * r.fee_ppm * HOLDERS_BPS) / 1e6 / 1e4;
  return {
    address: r.address,
    name: r.name,
    symbol: r.symbol,
    image: m?.image ?? null,
    description: m?.description ?? null,
    links: m?.links ?? {},
    creator: r.creator,
    quote: quoteSymbol(r.quote),
    quoteAddress: r.quote,
    poolId: r.pool_id,
    bonusBps: r.bonus_bps,
    feePpm: r.fee_ppm,
    startTick: r.start_tick,
    tokenIs0: r.token_is0 === 1,
    launchedAt: r.launched_at,
    launchTx: r.tx,
    price: r.price,
    priceUsd: r.price * usd,
    startPrice: r.start_price,
    fdv,
    fdvUsd: fdv * usd,
    change24h: prev > 0 ? ((r.price - prev) / prev) * 100 : 0,
    volume24h: r.vol24,
    volume24hUsd: r.vol24 * usd,
    volume: r.vol_all,
    volumeUsd: r.vol_all * usd,
    trades: r.trades,
    traders: r.traders,
    holders: r.holders,
    supply,
    burned: 1_000_000_000 - supply,
    treasury: r.treasury,
    reserve: r.reserve,
    reservePct: (r.reserve / r.treasury) * 100,
    bonusPaid: r.bonus_paid,
    bonusPaidUsd: r.bonus_paid * r.price * usd,
    bonusBuys: r.bonus_buys,
    pot,
    potUsd: pot * usd,
    paid: r.paid,
    paidUsd: r.paid * usd,
    creatorEarned: r.to_creator,
    rounds: r.rounds,
    lastRoundAt: r.last_round_at,
    lastTradeAt: r.last_trade_at,
    spark: spark(r.address, r.start_price),
  };
}

export type TokenSummary = ReturnType<typeof summarize>;

const SORTS: Record<string, (a: TokenSummary, b: TokenSummary) => number> = {
  hot: (a, b) => b.volume24hUsd - a.volume24hUsd || (b.lastTradeAt ?? 0) - (a.lastTradeAt ?? 0),
  new: (a, b) => b.launchedAt - a.launchedAt,
  mcap: (a, b) => b.fdvUsd - a.fdvUsd,
  bonus: (a, b) => b.bonusBps - a.bonusBps || b.reservePct - a.reservePct,
  pot: (a, b) => b.potUsd + b.paidUsd - (a.potUsd + a.paidUsd),
};

export function listTokens(sort = "hot", q = "", limit = 60): TokenSummary[] {
  const day = now() - 86_400;
  const rows = all(SUMMARY_SQL, { day }).map(summarize);
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((t) => t.name.toLowerCase().includes(needle) || t.symbol.toLowerCase().includes(needle) || t.address === needle)
    : rows;
  return filtered.sort(SORTS[sort] ?? SORTS.hot).slice(0, limit);
}

export function getToken(address: string): TokenSummary | undefined {
  const r = one(`${SUMMARY_SQL} WHERE t.address = :address`, { day: now() - 86_400, address });
  return r && summarize(r);
}

export function candles(token: string, tf: number) {
  const t = one("SELECT start_price, launched_at FROM tokens WHERE address = ?", token);
  if (!t) return [];
  const rows = all("SELECT price, quote_amount, ts FROM trades WHERE token = ? ORDER BY ts, log_index", token);
  const out: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
  let last = t.start_price as number;
  const bucket = (ts: number) => Math.floor(ts / tf) * tf;
  out.push({ t: bucket(t.launched_at), o: last, h: last, l: last, c: last, v: 0 });
  for (const r of rows) {
    const b = bucket(r.ts);
    let c = out[out.length - 1]!;
    // carry the close across quiet buckets so the chart reads as a continuous line
    while (c.t < b) {
      c = { t: c.t + tf, o: last, h: last, l: last, c: last, v: 0 };
      out.push(c);
      if (out.length > 5_000) out.shift();
    }
    c.h = Math.max(c.h, r.price);
    c.l = Math.min(c.l, r.price);
    c.c = r.price;
    c.v += r.quote_amount;
    last = r.price;
  }
  const end = bucket(now());
  let c = out[out.length - 1]!;
  // fill up to now even when the gap loop already hit the cap, or an old quiet token's chart stops days ago
  while (c.t < end) {
    c = { t: c.t + tf, o: last, h: last, l: last, c: last, v: 0 };
    out.push(c);
    if (out.length > 5_000) out.shift();
  }
  return out.slice(-1_000);
}

export function tokenTrades(token: string, limit = 50) {
  return all("SELECT * FROM trades WHERE token = ? ORDER BY ts DESC, log_index DESC LIMIT ?", token, limit).map(tradeOut);
}

function tradeOut(r: Row) {
  return {
    tx: r.tx,
    token: r.token,
    trader: r.trader,
    side: r.is_buy ? "buy" : "sell",
    quoteAmount: r.quote_amount,
    tokenAmount: r.token_amount,
    bonus: r.bonus,
    price: r.price,
    ts: r.ts,
    block: r.block,
  };
}

/** Exact time-weighted weights (wei × 2 so 1.5x stays integral). */
export function holderWeights(token: string, at = now()) {
  const lots = all("SELECT account, amount, since FROM lots WHERE token = ?", token);
  const by = new Map<string, { weight: bigint; balance: bigint; oldest: number }>();
  for (const l of lots) {
    const mult2 = BigInt(tierFor(at - l.since).mult * 2);
    const h = by.get(l.account) ?? { weight: 0n, balance: 0n, oldest: l.since };
    h.weight += BigInt(l.amount) * mult2;
    h.balance += BigInt(l.amount);
    h.oldest = Math.min(h.oldest, l.since);
    by.set(l.account, h);
  }
  return by;
}

export function holders(token: string, limit = 100) {
  const t = one("SELECT supply, price, quote FROM tokens WHERE address = ?", token);
  if (!t) return { items: [], totalWeight: 0 };
  const at = now();
  const weights = holderWeights(token, at);
  let total = 0n;
  for (const h of weights.values()) total += h.weight;
  const items = [...weights.entries()]
    .map(([account, h]) => {
      const balance = Number(h.balance) / 1e18;
      const age = at - h.oldest;
      return {
        account,
        balance,
        pct: (balance / t.supply) * 100,
        valueUsd: balance * t.price * quoteUsd(t.quote),
        share: total > 0n ? Number((h.weight * 1_000_000n) / total) / 10_000 : 0,
        tier: tierFor(age).key,
        heldSince: h.oldest,
        next: nextTier(age),
      };
    })
    .sort((a, b) => b.share - a.share)
    .slice(0, limit);
  return { items, totalWeight: Number(total) / 2e18 };
}

export function tokenRounds(token: string) {
  return all(
    "SELECT round, MAX(ts) AS ts, SUM(recipients) AS recipients, SUM(total) AS total, SUM(delivery_fee) AS fee, MAX(snapshot_block) AS snapshot, MAX(inputs_hash) AS inputs_hash, MAX(tx) AS tx FROM rounds WHERE token = ? GROUP BY round ORDER BY round DESC LIMIT 50",
    token,
  );
}

export function activity(type = "all", limit = 60) {
  const parts: string[] = [];
  if (type === "all" || type === "buy" || type === "sell") {
    const side = type === "buy" ? "AND x.is_buy = 1" : type === "sell" ? "AND x.is_buy = 0" : "";
    parts.push(`SELECT CASE x.is_buy WHEN 1 THEN 'buy' ELSE 'sell' END AS kind, x.ts, x.tx, x.token, x.trader AS account,
      x.quote_amount AS quote_amount, x.token_amount AS token_amount, x.bonus AS bonus, NULL AS recipients, x.log_index AS li
      FROM trades x WHERE 1=1 ${side}`);
  }
  if (type === "all" || type === "payout") {
    parts.push(`SELECT 'payout', ts, tx, token, NULL, total, NULL, NULL, recipients, log_index FROM rounds`);
  }
  if (type === "all" || type === "launch") {
    parts.push(`SELECT 'launch', launched_at, tx, address, creator, NULL, NULL, bonus_bps, NULL, 0 FROM tokens`);
  }
  const rows = all(`SELECT * FROM (${parts.join(" UNION ALL ")}) ORDER BY ts DESC, li DESC LIMIT ?`, limit);
  const tokens = new Map(all("SELECT address, name, symbol, meta_json, quote, price FROM tokens").map((t) => [t.address, t]));
  return rows.map((r) => {
    const t = tokens.get(r.token);
    const usd = t ? quoteUsd(t.quote) : 0;
    return {
      kind: r.kind,
      ts: r.ts,
      tx: r.tx,
      token: r.token,
      name: t?.name,
      symbol: t?.symbol,
      image: t ? meta(t)?.image ?? null : null,
      account: r.account,
      quoteAmount: r.quote_amount,
      quoteUsd: r.quote_amount != null ? r.quote_amount * usd : null,
      tokenAmount: r.token_amount,
      bonus: r.kind === "launch" ? null : r.bonus,
      bonusBps: r.kind === "launch" ? r.bonus : null,
      recipients: r.recipients,
    };
  });
}

export function wallet(address: string) {
  const at = now();
  const holdings = all(
    `SELECT b.token, b.amount, t.name, t.symbol, t.meta_json, t.price, t.quote, t.bonus_bps, t.supply FROM balances b
     JOIN tokens t ON t.address = b.token WHERE b.account = ?`,
    address,
  ).map((r) => {
    const w = holderWeights(r.token, at);
    let total = 0n;
    for (const h of w.values()) total += h.weight;
    const mine = w.get(address);
    const balance = Number(BigInt(r.amount)) / 1e18;
    const age = mine ? at - mine.oldest : 0;
    const pot = getToken(r.token)?.pot ?? 0;
    const share = mine && total > 0n ? Number((mine.weight * 1_000_000n) / total) / 1_000_000 : 0;
    return {
      token: r.token,
      name: r.name,
      symbol: r.symbol,
      image: meta(r)?.image ?? null,
      balance,
      valueUsd: balance * r.price * quoteUsd(r.quote),
      bonusBps: r.bonus_bps,
      tier: tierFor(age).key,
      heldSince: mine?.oldest ?? at,
      next: nextTier(age),
      share: share * 100,
      nextPayout: pot * share,
      nextPayoutUsd: pot * share * quoteUsd(r.quote),
    };
  });
  const bonus = all(
    `SELECT x.token, SUM(x.bonus) AS bonus, t.price, t.quote FROM trades x JOIN tokens t ON t.address = x.token
     WHERE x.trader = ? GROUP BY x.token`,
    address,
  );
  const payouts = all(
    `SELECT p.token, p.round, p.amount, p.ts, p.tx, t.symbol, t.quote FROM payouts p JOIN tokens t ON t.address = p.token
     WHERE p.account = ? ORDER BY p.ts DESC LIMIT 100`,
    address,
  );
  const paidTotal = one("SELECT COALESCE(SUM(amount), 0) AS v, COUNT(*) AS n FROM payouts WHERE account = ?", address)!;
  const trades = all("SELECT * FROM trades WHERE trader = ? ORDER BY ts DESC, log_index DESC LIMIT 50", address).map(tradeOut);
  const launched = all("SELECT address, name, symbol, launched_at FROM tokens WHERE creator = ?", address);
  return {
    address,
    holdings: holdings.sort((a, b) => b.valueUsd - a.valueUsd),
    bonusTokens: bonus.reduce((s, b) => s + b.bonus, 0),
    bonusUsd: bonus.reduce((s, b) => s + b.bonus * b.price * quoteUsd(b.quote), 0),
    payouts: payouts.map((p) => ({ ...p, amountUsd: p.amount * quoteUsd(p.quote), quote: quoteSymbol(p.quote) })),
    payoutsTotal: paidTotal.v,
    payoutsUsd: paidTotal.v * getEthUsd(),
    payoutsCount: paidTotal.n,
    trades,
    launched,
  };
}

export function leaderboard() {
  const earners = all(
    "SELECT account, SUM(amount) AS amount, COUNT(*) AS payouts, COUNT(DISTINCT token) AS tokens FROM payouts GROUP BY account ORDER BY amount DESC LIMIT 20",
  ).map((r) => ({ ...r, amountUsd: r.amount * getEthUsd() }));
  const bonus = all(
    `SELECT x.trader AS account, SUM(x.bonus * t.price) AS value, COUNT(*) AS buys FROM trades x
     JOIN tokens t ON t.address = x.token WHERE x.bonus > 0 GROUP BY x.trader ORDER BY value DESC LIMIT 20`,
  ).map((r) => ({ ...r, valueUsd: r.value * getEthUsd() }));
  return { earners, bonus };
}

export function stats() {
  const ethUsd = getEthUsd();
  const t = one(`SELECT COUNT(*) AS n, COALESCE(SUM(1000000000 - supply), 0) AS burned FROM tokens`)!;
  const x = one(`SELECT COUNT(*) AS n, COUNT(DISTINCT trader) AS traders, COALESCE(SUM(quote_amount), 0) AS vol,
    COALESCE(SUM(CASE WHEN is_buy = 1 THEN 1 ELSE 0 END), 0) AS buys, COALESCE(SUM(bonus), 0) AS bonus,
    COALESCE(SUM(bonus * price), 0) AS bonus_value, MAX(ts) AS last FROM trades`)!;
  const p = one(`SELECT COALESCE(SUM(amount), 0) AS paid, COUNT(*) AS payments, COUNT(DISTINCT account) AS wallets FROM payouts`)!;
  const r = one(`SELECT COUNT(*) AS n FROM (SELECT DISTINCT token, round FROM rounds)`)!;
  const pot = listTokens("pot", "", 1_000).reduce((s, k) => s + k.pot, 0);

  // bucket so the series has shape: 15-minute steps for a young pad, daily once it has history
  const first = (one("SELECT MIN(ts) AS t FROM trades")?.t as number | null) ?? now();
  const bucket = now() - first < 3 * 86_400 ? 900 : 86_400;
  const series = all(
    `SELECT (ts / ${bucket}) * ${bucket} AS d, SUM(quote_amount) AS vol, SUM(bonus * price) AS bonus, COUNT(*) AS trades
     FROM trades GROUP BY d ORDER BY d`,
  );
  const paidSeries = all(`SELECT (ts / ${bucket}) * ${bucket} AS d, SUM(amount) AS paid FROM payouts GROUP BY d ORDER BY d`);
  return {
    tokens: t.n,
    burned: t.burned,
    trades: x.n,
    buys: x.buys,
    traders: x.traders,
    volume: x.vol,
    volumeUsd: x.vol * ethUsd,
    bonusTokens: x.bonus,
    bonusUsd: x.bonus_value * ethUsd,
    paid: p.paid,
    paidUsd: p.paid * ethUsd,
    payments: p.payments,
    paidWallets: p.wallets,
    rounds: r.n,
    pot,
    potUsd: pot * ethUsd,
    lastTradeAt: x.last,
    ethUsd,
    tiers: TIERS,
    series: { daily: series, payouts: paidSeries },
  };
}
