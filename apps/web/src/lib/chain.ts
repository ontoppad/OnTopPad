import { createPublicClient, encodeAbiParameters, http, parseEventLogs, type Address, type WalletClient } from "viem";
import { getNetwork, onTopHookAbi, onTopLaunchpadAbi, onTopRouterAbi, onTopTokenAbi, UNISWAP_V4, v4QuoterAbi } from "@ontoppad/shared";
import type { TokenSummary } from "./api.ts";

export const network = getNetwork(import.meta.env.VITE_NETWORK ?? "testnet");
export const chain = network.chain;
export const explorer = chain.blockExplorers.default.url;
export const publicClient = createPublicClient({ chain, transport: http(undefined, { batch: true }) });

export const contracts = {
  launchpad: network.deployment.launchpad as Address,
  hook: network.deployment.hook as Address,
  router: network.deployment.router as Address,
  distributor: network.deployment.distributor as Address,
  poolManager: UNISWAP_V4.poolManager as Address,
  quoter: UNISWAP_V4.quoter as Address,
};

export const txUrl = (h: string) => `${explorer}/tx/${h}`;
export const addressUrl = (a: string) => `${explorer}/address/${a}`;

function poolKey(t: TokenSummary) {
  const [currency0, currency1] = t.tokenIs0 ? [t.address, t.quoteAddress] : [t.quoteAddress, t.address];
  return { currency0, currency1, fee: t.feePpm, tickSpacing: 60, hooks: contracts.hook };
}

const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);

/**
 * Exact quote through Uniswap's V4Quoter, which runs OnTopHook too. hookData must name a real
 * recipient: without one the simulated bonus would go to tx.origin, which is the zero address in eth_call.
 */
export async function quote(t: TokenSummary, side: "buy" | "sell", amountIn: bigint, who?: Address) {
  const recipient = who ?? contracts.router;
  const zeroForOne = side === "buy" ? !t.tokenIs0 : t.tokenIs0;
  const { result } = await publicClient.simulateContract({
    address: contracts.quoter,
    abi: v4QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: poolKey(t), zeroForOne, exactAmount: amountIn, hookData: encodeAbiParameters([{ type: "address" }], [recipient]) }],
  });
  const out = result[0];
  const bonus =
    side === "buy"
      ? await publicClient.readContract({ address: contracts.hook, abi: onTopHookAbi, functionName: "bonusFor", args: [t.address, out] })
      : 0n;
  return { out, bonus };
}

export async function buy(w: WalletClient, t: TokenSummary, amountIn: bigint, minOut: bigint) {
  const account = w.account!;
  const hash = await w.writeContract({
    account,
    chain,
    address: contracts.router,
    abi: onTopRouterAbi,
    functionName: "buy",
    value: amountIn,
    args: [t.address, amountIn, minOut, account.address, deadline()],
  });
  return settle(hash);
}

export async function sell(w: WalletClient, t: TokenSummary, amountIn: bigint, minOut: bigint) {
  const account = w.account!;
  const allowance = await publicClient.readContract({
    address: t.address,
    abi: onTopTokenAbi,
    functionName: "allowance",
    args: [account.address, contracts.router],
  });
  if (allowance < amountIn) {
    await publicClient.waitForTransactionReceipt({
      hash: await w.writeContract({ account, chain, address: t.address, abi: onTopTokenAbi, functionName: "approve", args: [contracts.router, amountIn] }),
    });
  }
  const hash = await w.writeContract({
    account,
    chain,
    address: contracts.router,
    abi: onTopRouterAbi,
    functionName: "sell",
    args: [t.address, amountIn, minOut, account.address, deadline()],
  });
  return settle(hash);
}

export interface LaunchInput {
  name: string;
  symbol: string;
  metadataURI: string;
  bonusBps: number;
  startTick: number;
  firstBuy: bigint;
}

export async function launch(w: WalletClient, p: LaunchInput) {
  const account = w.account!;
  const salt = `0x${[...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")}` as const;
  const hash = await w.writeContract({
    account,
    chain,
    address: contracts.launchpad,
    abi: onTopLaunchpadAbi,
    functionName: "launch",
    value: p.firstBuy,
    args: [
      {
        name: p.name,
        symbol: p.symbol,
        metadataURI: p.metadataURI,
        quote: "0x0000000000000000000000000000000000000000",
        bonusBps: p.bonusBps,
        startTick: p.startTick,
        firstBuyMinOut: 0n,
        salt,
      },
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Launch reverted");
  const [launched] = parseEventLogs({ abi: onTopLaunchpadAbi, eventName: "Launched", logs: receipt.logs });
  return { hash, token: launched!.args.token };
}

/** Waits for the receipt and pulls the hook's Trade event, so the UI can show the exact bonus received. */
async function settle(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted");
  const [trade] = parseEventLogs({ abi: onTopHookAbi, eventName: "Trade", logs: receipt.logs });
  return { hash, trade: trade?.args };
}

export async function tokenBalance(token: Address, who: Address) {
  return publicClient.readContract({ address: token, abi: onTopTokenAbi, functionName: "balanceOf", args: [who] });
}

/** Short, human error text from wallet/viem errors. */
export function errorText(e: unknown): string {
  const msg = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "Something went wrong";
  if (/user rejected|denied/i.test(msg)) return "Signature cancelled in wallet";
  if (/insufficient funds/i.test(msg)) return "Not enough ETH for this trade plus gas";
  if (/Slippage/i.test(msg)) return "Price moved past your slippage, try again";
  return msg.split("\n")[0]!.slice(0, 140);
}
