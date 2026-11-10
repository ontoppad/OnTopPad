import { decodeEventLog, type Abi, type Hex } from "viem";
import { onTopDistributorAbi, onTopHookAbi, onTopLaunchpadAbi, priceFromSqrt, priceFromTick } from "@ontoppad/shared";
import { client, contracts, SYSTEM, quoteDecimals } from "./chain.ts";
import { config, network } from "./config.ts";
import { db, getMeta, setMeta, tx } from "./db.ts";
import { resolveMetadata } from "./metadata.ts";

const CORE_ABI = [...onTopLaunchpadAbi, ...onTopHookAbi, ...onTopDistributorAbi].filter(
  (x) => x.type === "event",
) as Abi;
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface RawLog {
  address: string;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  blockTimestamp: Hex;
  transactionHash: Hex;
  logIndex: Hex;
}

const units = (v: bigint, decimals = 18) => Number(v) / 10 ** decimals;
const lower = (a: string) => a.toLowerCase();

async function getLogs(address: string[], fromBlock: bigint, toBlock: bigint, topics?: Hex[]): Promise<RawLog[]> {
  if (address.length === 0) return [];
  return client.request({
    method: "eth_getLogs",
    params: [{ address: address as Hex[], fromBlock: `0x${fromBlock.toString(16)}`, toBlock: `0x${toBlock.toString(16)}`, topics }],
  }) as Promise<RawLog[]>;
}

function tokenRow(address: string) {
  return db.prepare("SELECT token_is0, quote FROM tokens WHERE address = ?").get(address) as
    | { token_is0: number; quote: string }
    | undefined;
}

// ───────────── balances & holding lots (exact wei) ─────────────

function credit(token: string, account: string, value: bigint, ts: number) {
  if (SYSTEM.has(account)) return;
  const row = db.prepare("SELECT amount FROM balances WHERE token = ? AND account = ?").get(token, account) as
    | { amount: string }
    | undefined;
  const next = (row ? BigInt(row.amount) : 0n) + value;
  db.prepare(
    "INSERT INTO balances (token, account, amount) VALUES (?, ?, ?) ON CONFLICT(token, account) DO UPDATE SET amount = excluded.amount",
  ).run(token, account, next.toString());
  db.prepare("INSERT INTO lots (token, account, amount, since) VALUES (?, ?, ?, ?)").run(token, account, value.toString(), ts);
}

/** Sends spend the newest lots first, so older tokens keep their hold-time tier. */
function debit(token: string, account: string, value: bigint) {
  if (SYSTEM.has(account)) return;
  const row = db.prepare("SELECT amount FROM balances WHERE token = ? AND account = ?").get(token, account) as
    | { amount: string }
    | undefined;
  const next = (row ? BigInt(row.amount) : 0n) - value;
  if (next > 0n) {
    db.prepare("UPDATE balances SET amount = ? WHERE token = ? AND account = ?").run(next.toString(), token, account);
  } else {
    db.prepare("DELETE FROM balances WHERE token = ? AND account = ?").run(token, account);
  }
  let left = value;
  const lots = db
    .prepare("SELECT id, amount FROM lots WHERE token = ? AND account = ? ORDER BY since DESC, id DESC")
    .all(token, account) as { id: number; amount: string }[];
  for (const lot of lots) {
    if (left === 0n) break;
    const amt = BigInt(lot.amount);
    if (amt <= left) {
      db.prepare("DELETE FROM lots WHERE id = ?").run(lot.id);
      left -= amt;
    } else {
      db.prepare("UPDATE lots SET amount = ? WHERE id = ?").run((amt - left).toString(), lot.id);
      left = 0n;
    }
  }
}

// ───────────── event handlers ─────────────

function apply(log: RawLog) {
  const block = Number(log.blockNumber);
  const ts = Number(log.blockTimestamp);
  const txHash = log.transactionHash;
  const li = Number(log.logIndex);
  const address = lower(log.address);

  if (log.topics[0] === TRANSFER && !Object.values(contracts).some((c) => lower(c) === address)) {
    const from = lower(`0x${log.topics[1]!.slice(26)}`);
    const to = lower(`0x${log.topics[2]!.slice(26)}`);
    const value = BigInt(log.data);
    debit(address, from, value);
    credit(address, to, value, ts);
    if (to === "0x0000000000000000000000000000000000000000") {
      db.prepare("UPDATE tokens SET supply = supply - ? WHERE address = ?").run(units(value), address);
    }
    return;
  }

  let ev: { eventName: string; args: Record<string, unknown> };
  try {
    ev = decodeEventLog({ abi: CORE_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] }) as unknown as typeof ev;
  } catch {
    return; // ownership/admin events we don't index
  }
  const a = ev.args as Record<string, any>;

  switch (ev.eventName) {
    case "Launched": {
      const token = lower(a.token);
      const quote = lower(a.quote);
      const tokenIs0 = BigInt(token) < BigInt(quote);
      const qd = quoteDecimals(quote);
      const startPrice = priceFromTick(Number(a.startTick), tokenIs0, 18, qd);
      db.prepare(
        `INSERT OR IGNORE INTO tokens (address, creator, quote, pool_id, name, symbol, metadata_uri, bonus_bps, fee_ppm,
          start_tick, token_is0, start_price, treasury, reserve, supply, price, launched_at, block, tx)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        token, lower(a.creator), quote, a.poolId, a.name, a.symbol, a.metadataURI, Number(a.bonusBps), Number(a.fee),
        Number(a.startTick), tokenIs0 ? 1 : 0, startPrice, units(a.treasury), units(a.treasury), 1_000_000_000,
        startPrice, ts, block, txHash,
      );
      return;
    }
    case "Trade": {
      const token = lower(a.token);
      const t = tokenRow(token);
      if (!t) return;
      const qd = quoteDecimals(t.quote);
      const price = priceFromSqrt(a.sqrtPriceX96, t.token_is0 === 1, 18, qd);
      const bonus = units(a.bonus);
      db.prepare(
        `INSERT OR IGNORE INTO trades (tx, log_index, token, trader, is_buy, quote_amount, token_amount, bonus, price, block, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(txHash, li, token, lower(a.trader), a.isBuy ? 1 : 0, units(a.quoteAmount, qd), units(a.tokenAmount), bonus, price, block, ts);
      db.prepare("UPDATE tokens SET price = ?, reserve = reserve - ? WHERE address = ?").run(price, bonus, token);
      return;
    }
    case "Refilled":
      db.prepare("UPDATE tokens SET reserve = ? WHERE address = ?").run(units(a.reserve), lower(a.token));
      return;
    case "Collected": {
      const token = lower(a.token);
      const t = tokenRow(token);
      if (!t) return;
      const qd = quoteDecimals(t.quote);
      db.prepare(
        `INSERT OR IGNORE INTO collects (tx, log_index, token, quote_fees, token_fees, to_holders, to_creator, to_platform, refilled, burned, block, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        txHash, li, token, units(a.quoteFees, qd), units(a.tokenFees), units(a.toHolders, qd), units(a.toCreator, qd),
        units(a.toPlatform, qd), units(a.refilled), units(a.burned), block, ts,
      );
      return;
    }
    case "RoundPaid": {
      const token = lower(a.token);
      const qd = quoteDecimals(tokenRow(token)?.quote ?? "");
      db.prepare(
        `INSERT OR IGNORE INTO rounds (tx, log_index, token, round, snapshot_block, inputs_hash, recipients, total, delivery_fee, block, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(txHash, li, token, Number(a.round), Number(a.snapshotBlock), a.inputsHash, Number(a.recipients), units(a.total, qd), units(a.deliveryFee, qd), block, ts);
      return;
    }
    case "Paid": {
      const token = lower(a.token);
      const qd = quoteDecimals(tokenRow(token)?.quote ?? "");
      db.prepare(
        `INSERT OR IGNORE INTO payouts (tx, log_index, token, round, account, amount, block, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(txHash, li, token, Number(a.round), lower(a.account), units(a.amount, qd), block, ts);
      return;
    }
  }
}

/** The Robinhood RPC sometimes returns blockTimestamp 0x0, so fill gaps from the block header. */
async function fillTimestamps(logs: RawLog[]) {
  const missing = [...new Set(logs.filter((l) => !l.blockTimestamp || BigInt(l.blockTimestamp) === 0n).map((l) => l.blockNumber))];
  const ts = new Map<string, Hex>();
  for (let i = 0; i < missing.length; i += 25) {
    const blocks = await Promise.all(missing.slice(i, i + 25).map((b) => client.getBlock({ blockNumber: BigInt(b) })));
    blocks.forEach((b, j) => ts.set(missing[i + j]!, `0x${b.timestamp.toString(16)}`));
  }
  for (const l of logs) if (ts.has(l.blockNumber)) l.blockTimestamp = ts.get(l.blockNumber)!;
}

// ───────────── loop ─────────────

let head = 0n;
export const indexerState = () => ({ indexed: Number(getMeta("lastBlock") ?? 0), head: Number(head) });

async function step(): Promise<boolean> {
  head = await client.getBlockNumber();
  const last = BigInt(getMeta("lastBlock") ?? network.deployment.startBlock - 1);
  if (last >= head) return false;
  const from = last + 1n;
  const to = from + config.chunk - 1n < head ? from + config.chunk - 1n : head;

  const core = await getLogs([contracts.launchpad, contracts.hook, contracts.distributor], from, to);
  const known = (db.prepare("SELECT address FROM tokens").all() as { address: string }[]).map((r) => r.address);
  const launched = core.filter((l) => lower(l.address) === lower(contracts.launchpad)).flatMap((l) => {
    try {
      const ev = decodeEventLog({ abi: onTopLaunchpadAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] });
      return ev.eventName === "Launched" ? [lower((ev.args as { token: string }).token)] : [];
    } catch {
      return [];
    }
  });
  const transfers = await getLogs([...known, ...launched], from, to, [TRANSFER]);
  const logs = [...core, ...transfers].sort(
    (x, y) => Number(x.blockNumber) - Number(y.blockNumber) || Number(x.logIndex) - Number(y.logIndex),
  );
  await fillTimestamps(logs);

  tx(() => {
    for (const l of logs) apply(l);
    setMeta("lastBlock", to.toString());
  });
  for (const t of launched) void resolveMetadata(t);
  return to < head;
}

export async function runIndexer() {
  for (;;) {
    try {
      const behind = await step();
      if (!behind) await new Promise((r) => setTimeout(r, config.pollMs));
    } catch (e) {
      console.error("[indexer]", (e as Error).message);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}
