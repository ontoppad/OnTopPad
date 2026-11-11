import { encodeAbiParameters, keccak256, type Address } from "viem";
import { COLLECT_GAS, deliveryFee, onTopDistributorAbi, onTopLaunchpadAbi, PLATFORM_BPS, roundGas } from "@ontoppad/shared";
import { client, contracts, wallet } from "./chain.ts";
import { config } from "./config.ts";
import { db, getMeta } from "./db.ts";
import { holderWeights, quoteUsd } from "./queries.ts";

const BATCH = 150;
/** Smallest payment worth a transfer; smaller shares roll into the next round. */
const MIN_PAYMENT = 10n ** 9n;
const MIN_COLLECT_WEI = 10n ** 10n;
const MIN_POT_WEI = 10n ** 12n;
const NATIVE = "0x0000000000000000000000000000000000000000" as const;
/** A self-funded keeper pulls the platform's ETH fees into its own wallet once gas money runs this low. */
const REFILL_BELOW = 10n ** 15n;

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

/** Gas price to charge against; 0 keeps the testnet keeper paying its own way with no thresholds. */
const gasPrice = async () => (config.selfFundedKeeper ? client.getGasPrice() : 0n);

async function collectAll() {
  const gp = await gasPrice();
  const tokens = db
    .prepare("SELECT t.*, (SELECT MAX(ts) FROM collects c WHERE c.token = t.address) AS last_collect FROM tokens t")
    .all() as Row[];
  for (const t of tokens) {
    const fees = pendingQuoteFees(t);
    if (fees < MIN_COLLECT_WEI) continue;
    // the platform's cut of what comes in has to cover the collect, or it waits for more trading
    if ((fees * BigInt(PLATFORM_BPS)) / 10_000n < COLLECT_GAS * gp) continue;
    await send(() =>
      wallet!.writeContract({ address: contracts.launchpad, abi: onTopLaunchpadAbi, functionName: "collect", args: [t.address] }),
    );
    console.log(`[keeper] collected ${t.symbol}`);
  }
}

async function payAll() {
  const gp = await gasPrice();
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
    // set the round's gas aside first (sized for every holder, so it covers whoever survives MIN_PAYMENT)
    const reserve = gp * (roundGas(weights.length) + roundGas(0) * BigInt(Math.ceil(weights.length / BATCH) - 1));
    if (pot <= reserve) continue;
    const payable = pot - reserve;
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
    const batches: { batch: typeof payments; fee: bigint }[] = [];
    for (let i = 0; i < payments.length; i += BATCH) {
      const batch = payments.slice(i, i + BATCH);
      const fee = deliveryFee(gp, batch.length, batch.reduce((s, p) => s + p.amount, 0n));
      if (fee === null) break;
      batches.push({ batch, fee });
    }
    // a round too small to carry its gas under the 2% cap waits; the pot keeps growing until it can
    if (batches.length < Math.ceil(payments.length / BATCH)) continue;
    for (const { batch, fee } of batches) {
      await send(() =>
        wallet!.writeContract({
          address: contracts.distributor,
          abi: onTopDistributorAbi,
          functionName: "distribute",
          args: [token, round, indexed, inputsHash, batch.map((p) => p.account), batch.map((p) => p.amount), fee],
        }),
      );
    }
    console.log(`[keeper] round ${round} for ${t.symbol}: ${payments.length} holders`);
  }
}

/** Tops the keeper's gas back up from the platform's ETH fees; the owner and the keeper are the same wallet. */
async function refill() {
  if (!config.selfFundedKeeper) return;
  const me = wallet!.account.address;
  if ((await client.getBalance({ address: me })) >= REFILL_BELOW) return;
  const fees = await client.readContract({ address: contracts.launchpad, abi: onTopLaunchpadAbi, functionName: "platformBalance", args: [NATIVE] });
  // a withdrawal of dust would cost more gas than it brings back
  if (fees < REFILL_BELOW / 10n) return;
  await send(() => wallet!.writeContract({ address: contracts.launchpad, abi: onTopLaunchpadAbi, functionName: "withdrawPlatform", args: [NATIVE, me, fees] }));
  console.log(`[keeper] refilled gas from platform fees: ${fees} wei`);
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
      await refill();
    } catch (e) {
      console.error("[keeper]", (e as Error).message);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, config.keeperIntervalSec * 1000);
}
