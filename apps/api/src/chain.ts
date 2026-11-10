import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { UNISWAP_V4 } from "@ontoppad/shared";
import { config, network } from "./config.ts";

export const client = createPublicClient({ chain: network.chain, transport: http(config.rpcUrl, { batch: true }) });

export const wallet = config.privateKey
  ? createWalletClient({ chain: network.chain, transport: http(config.rpcUrl), account: privateKeyToAccount(config.privateKey) })
  : undefined;

const d = network.deployment;
export const contracts = {
  launchpad: d.launchpad as Address,
  hook: d.hook as Address,
  router: d.router as Address,
  distributor: d.distributor as Address,
  poolManager: d.poolManager as Address,
  quoter: UNISWAP_V4.quoter as Address,
};

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
/** Contract-held balances that are not holders: pool liquidity, bonus treasury, fee plumbing, burns. */
export const SYSTEM = new Set<string>([ZERO, DEAD, ...Object.values(contracts).map((a) => a.toLowerCase())]);

export function quoteDecimals(quote: string): number {
  return network.quotes.find((q) => q.address.toLowerCase() === quote.toLowerCase())?.decimals ?? 18;
}

export function quoteSymbol(quote: string): string {
  return network.quotes.find((q) => q.address.toLowerCase() === quote.toLowerCase())?.symbol ?? "ETH";
}
