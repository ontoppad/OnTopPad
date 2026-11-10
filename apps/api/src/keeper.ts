import { encodeAbiParameters, keccak256, type Address } from "viem";
import { onTopDistributorAbi, onTopLaunchpadAbi } from "@ontoppad/shared";
import { client, contracts, wallet } from "./chain.ts";
import { config } from "./config.ts";
import { db, getMeta } from "./db.ts";
import { holderWeights, quoteUsd } from "./queries.ts";

const BATCH = 150;
/** Smallest payment worth a transfer; smaller shares roll into the next round. */
const MIN_PAYMENT = 10n ** 9n;
const MIN_COLLECT_WEI = 10n ** 10n;
const MIN_POT_WEI = 10n ** 12n;

type Row = Record<string, any>;

/** Uncollected LP fees owed to the launchpad's position since the last Collected event (pair-asset side). */
function pendingQuoteFees(t: Row): bigint {
  const r = db
    .prepare(
      "SELECT COALESCE(SUM(quote_amount), 0) AS buys FROM trades WHERE token = :t AND is_buy = 1 AND ts >= :since",
    )
    .get({ t: t.address, since: t.last_collect ?? 0 }) as Row;
  return BigInt(Math.floor(r.buys * 1e18 * (t.fee_ppm / 1e6)));
}

async function send(fn: () => Promise<`0x${string}`>) {
  const hash = await fn();
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx reverted ${hash}`);
  return receipt;
}

async function collectAll() {
  const tokens = db
    .prepare("SELECT t.*, (SELECT MAX(ts) FROM collects c WHERE c.token = t.address) AS last_collect FROM tokens t")
    .all() as Row[];
  for (const t of tokens) {
    if (pendingQuoteFees(t) < MIN_COLLECT_WEI) continue;
    await send(() =>
      wallet!.writeContract({ address: contracts.launchpad, abi: onTopLaunchpadAbi, functionName: "collect", args: [t.address] }),
    );
    console.log(`[keeper] collected ${t.symbol}`);
  }
}

async function payAll() {
  const indexed = BigInt(getMeta("lastBlock") ?? 0);
  const tokens = db.prepare("SELECT address, symbol, price, quote FROM tokens").all() as Row[];
  for (const t of tokens) {
    const token = t.address as Address;
    const [pot, last] = await Promise.all([
      client.readContract({ address: contracts.distributor, abi: onTopDistributorAbi, functionName: "pot", args: [token] }),
      client.readContract({ address: contracts.distributor, abi: onTopDistributorAbi, functionName: "lastRound", args: [token] }),
    ]);
    if (pot < MIN_POT_WEI) continue;

    // wallets holding under MIN_HOLD_USD are left out of the round
    const minTokens = (config.minHoldUsd / Math.max(t.price * quoteUsd(t.quote), 1e-18)) * 1e18;
    const weights = [...holderWeights(token).entries()]
      .filter(([, h]) => Number(h.balance) >= minTokens && h.weight > 0n)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    if (weights.length === 0) continue;

    const total = weights.reduce((s, [, h]) => s + h.weight, 0n);
    const payable = pot; // testnet keeper takes no delivery fee
    const payments = weights
      .map(([account, h]) => ({ account: account as Address, weight: h.weight, amount: (payable * h.weight) / total }))
      .filter((p) => p.amount >= MIN_PAYMENT);
    if (payments.length === 0) continue;

    const inputsHash = keccak256(
      encodeAbiParameters(
        [{ type: "address[]" }, { type: "uint256[]" }],
        [payments.map((p) => p.account), payments.map((p) => p.weight)],
      ),
    );
    const round = last + 1n;
    for (let i = 0; i < payments.length; i += BATCH) {
      const batch = payments.slice(i, i + BATCH);
      await send(() =>
        wallet!.writeContract({
          address: contracts.distributor,
          abi: onTopDistributorAbi,
          functionName: "distribute",
          args: [token, round, indexed, inputsHash, batch.map((p) => p.account), batch.map((p) => p.amount), 0n],
        }),
      );
    }
    console.log(`[keeper] round ${round} for ${t.symbol}: ${payments.length} holders`);
  }
}

export function runKeeper() {
  if (!wallet) {
    console.log("[keeper] no PRIVATE_KEY, keeper disabled");
    return;
  }
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await collectAll();
      // let the indexer see the Collected events before building the round
      await new Promise((r) => setTimeout(r, config.pollMs * 3));
      await payAll();
    } catch (e) {
      console.error("[keeper]", (e as Error).message);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, config.keeperIntervalSec * 1000);
}
