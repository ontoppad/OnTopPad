import { useQuery } from "@tanstack/react-query";

export interface TokenSummary {
  address: `0x${string}`;
  name: string;
  symbol: string;
  image: string | null;
  description: string | null;
  links: { x?: string; telegram?: string; website?: string };
  creator: string;
  quote: string;
  quoteAddress: `0x${string}`;
  poolId: string;
  bonusBps: number;
  feePpm: number;
  startTick: number;
  tokenIs0: boolean;
  launchedAt: number;
  launchTx: string;
  price: number;
  priceUsd: number;
  startPrice: number;
  fdv: number;
  fdvUsd: number;
  change24h: number;
  volume24h: number;
  volume24hUsd: number;
  volume: number;
  volumeUsd: number;
  trades: number;
  traders: number;
  holders: number;
  supply: number;
  burned: number;
  treasury: number;
  reserve: number;
  reservePct: number;
  bonusPaid: number;
  bonusPaidUsd: number;
  bonusBuys: number;
  pot: number;
  potUsd: number;
  paid: number;
  paidUsd: number;
  creatorEarned: number;
  rounds: number;
  lastRoundAt: number | null;
  lastTradeAt: number | null;
  spark: number[];
}

export interface Trade {
  tx: string;
  token: string;
  trader: string;
  side: "buy" | "sell";
  quoteAmount: number;
  tokenAmount: number;
  bonus: number;
  price: number;
  ts: number;
  block: number;
}

export interface ActivityItem {
  kind: "buy" | "sell" | "payout" | "launch";
  ts: number;
  tx: string;
  token: string;
  name?: string;
  symbol?: string;
  image: string | null;
  account: string | null;
  quoteAmount: number | null;
  quoteUsd: number | null;
  tokenAmount: number | null;
  bonus: number | null;
  bonusBps: number | null;
  recipients: number | null;
}

export interface NextTier {
  tier: { key: string; label: string; from: number; mult: number };
  in: number;
}

export interface Holder {
  account: string;
  balance: number;
  pct: number;
  valueUsd: number;
  share: number;
  tier: "rookie" | "pro" | "legend";
  heldSince: number;
  next: NextTier | null;
}

export interface Stats {
  tokens: number;
  burned: number;
  trades: number;
  buys: number;
  traders: number;
  volume: number;
  volumeUsd: number;
  bonusTokens: number;
  bonusUsd: number;
  paid: number;
  paidUsd: number;
  payments: number;
  paidWallets: number;
  rounds: number;
  pot: number;
  potUsd: number;
  lastTradeAt: number | null;
  ethUsd: number;
  indexed: number;
  head: number;
  series: {
    daily: { d: number; vol: number; bonus: number; trades: number }[];
    payouts: { d: number; paid: number }[];
  };
}

export interface Config {
  network: string;
  label: string;
  chainId: number;
  rpc: string;
  explorer: string;
  contracts: Record<"launchpad" | "hook" | "router" | "distributor" | "poolManager" | "quoter", `0x${string}`>;
  keeperIntervalSec: number;
  minHoldUsd: number;
  ethUsd: number;
  indexed: number;
  head: number;
}

export interface Round {
  round: number;
  ts: number;
  recipients: number;
  total: number;
  fee: number;
  snapshot: number;
  inputs_hash: string;
  tx: string;
}

export interface WalletView {
  address: string;
  holdings: {
    token: string;
    name: string;
    symbol: string;
    image: string | null;
    balance: number;
    valueUsd: number;
    bonusBps: number;
    tier: Holder["tier"];
    heldSince: number;
    next: NextTier | null;
    share: number;
    nextPayout: number;
    nextPayoutUsd: number;
  }[];
  bonusTokens: number;
  bonusUsd: number;
  payouts: { token: string; round: number; amount: number; amountUsd: number; ts: number; tx: string; symbol: string; quote: string }[];
  payoutsTotal: number;
  payoutsUsd: number;
  payoutsCount: number;
  trades: Trade[];
  launched: { address: string; name: string; symbol: string; launched_at: number }[];
}

export interface Leaderboard {
  earners: { account: string; amount: number; amountUsd: number; payouts: number; tokens: number }[];
  bonus: { account: string; value: number; valueUsd: number; buys: number }[];
}

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

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  // a proxy error page is HTML, not JSON: fall back to the status
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
  return body as T;
}

const live = (ms: number) => ({ refetchInterval: ms, staleTime: ms / 2 });

export const useConfig = () => useQuery({ queryKey: ["config"], queryFn: () => api<Config>("/config"), ...live(10_000) });
export const useStats = () => useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/stats"), ...live(8_000) });
export const useMarket = () => useQuery({ queryKey: ["market"], queryFn: () => api<{ items: MarketToken[]; updatedAt: number; house: MarketToken | null }>("/market"), ...live(60_000) });
export const useTokens = (sort = "hot") =>
  useQuery({
    queryKey: ["tokens", sort],
    queryFn: () => api<{ items: TokenSummary[] }>(`/tokens?sort=${sort}`).then((r) => r.items),
    ...live(8_000),
  });
export const useToken = (a?: string) =>
  useQuery({ queryKey: ["token", a], queryFn: () => api<TokenSummary>(`/tokens/${a}`), enabled: !!a, ...live(5_000) });
export const useCandles = (a: string, tf: number) =>
  useQuery({
    queryKey: ["candles", a, tf],
    queryFn: () => api<{ candles: { t: number; o: number; h: number; l: number; c: number; v: number }[] }>(`/tokens/${a}/candles?tf=${tf}`).then((r) => r.candles),
    ...live(6_000),
  });
export const useTrades = (a: string) =>
  useQuery({ queryKey: ["trades", a], queryFn: () => api<{ items: Trade[] }>(`/tokens/${a}/trades`).then((r) => r.items), ...live(5_000) });
export const useHolders = (a: string) =>
  useQuery({ queryKey: ["holders", a], queryFn: () => api<{ items: Holder[]; totalWeight: number }>(`/tokens/${a}/holders`), ...live(10_000) });
export const useRounds = (a: string) =>
  useQuery({ queryKey: ["rounds", a], queryFn: () => api<{ items: Round[] }>(`/tokens/${a}/rounds`).then((r) => r.items), ...live(15_000) });
export const useActivity = (type = "all", limit = 60) =>
  useQuery({
    queryKey: ["activity", type, limit],
    queryFn: () => api<{ items: ActivityItem[] }>(`/activity?type=${type}&limit=${limit}`).then((r) => r.items),
    ...live(4_000),
  });
export const useWalletView = (a?: string) =>
  useQuery({ queryKey: ["wallet", a], queryFn: () => api<WalletView>(`/wallet/${a}`), enabled: !!a, ...live(8_000) });
export const useLeaderboard = () => useQuery({ queryKey: ["leaderboard"], queryFn: () => api<Leaderboard>("/leaderboard"), ...live(20_000) });
