/**
 * Testnet-only: launches the house token plus a few demo tokens and drives real trades from throwaway wallets,
 * so every chart and counter on testnet.ontoppad.com is backed by on-chain activity.
 *
 *   PRIVATE_KEY=0x.. IMG_DIR=./art node --experimental-strip-types scripts/seed-testnet.ts launch
 *   PRIVATE_KEY=0x.. node --experimental-strip-types scripts/seed-testnet.ts fund
 *   node --experimental-strip-types scripts/seed-testnet.ts trade [rounds] [delaySec]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { networks, onTopLaunchpadAbi, onTopRouterAbi, onTopTokenAbi, startTickForFdv } from "@ontoppad/shared";

const net = networks.testnet;
const API = process.env.API ?? "http://localhost:8787/api";
const WALLETS = new URL("../../../.secrets/seed-wallets.json", import.meta.url).pathname;
const client = createPublicClient({ chain: net.chain, transport: http() });
const d = net.deployment;

const TOKENS = [
  { file: "ontop.png", name: "OnTopPad", symbol: "ONTOP", bonus: 500, fdv: 0.08, description: "The house token of ONTOPPAD. Same rules as every launch: a head start on every buy, holders paid from every trade.", x: "https://x.com/OnTopPad", website: "https://ontoppad.com" },
  { file: "boo.png", name: "Lime Ghost", symbol: "BOO", bonus: 700, fdv: 0.04, description: "Haunts the chart, never the holders. Bought in the dark, paid in daylight." },
  { file: "meow.png", name: "Coin Cat", symbol: "MEOW", bonus: 400, fdv: 0.04, description: "Nine lives, one bag. Lands on its feet every payout round." },
  { file: "hop.png", name: "Rocket Frog", symbol: "HOP", bonus: 900, fdv: 0.04, description: "Hops from block to block. Ribbit means up." },
  { file: "zoom.png", name: "Pixel Rocket", symbol: "ZOOM", bonus: 600, fdv: 0.04, description: "Fuel: bonus tokens. Destination: the top of the board." },
  { file: "bolt.png", name: "Hodl Bot", symbol: "BOLT", bonus: 300, fdv: 0.04, description: "Programmed to never sell. Runs on time-weighted payouts." },
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

async function listed(): Promise<Map<string, Address>> {
  const { items } = (await (await fetch(`${API}/tokens?limit=200`)).json()) as { items: { symbol: string; address: Address }[] };
  return new Map(items.map((t) => [t.symbol, t.address]));
}

function deployerWallet() {
  const pk = process.env.PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("PRIVATE_KEY required");
  return createWalletClient({ chain: net.chain, transport: http(), account: privateKeyToAccount(pk) });
}

async function launch() {
  const w = deployerWallet();
  const have = await listed();
  for (const t of TOKENS) {
    if (have.has(t.symbol)) continue;
    const form = new FormData();
    form.set("name", t.name);
    form.set("symbol", t.symbol);
    form.set("description", t.description);
    if (t.x) form.set("x", t.x);
    if (t.website) form.set("website", t.website);
    form.set("image", new Blob([readFileSync(`${process.env.IMG_DIR}/${t.file}`)]), t.file);
    const res = await fetch(`${API}/metadata`, { method: "POST", body: form });
    const { uri } = (await res.json()) as { uri: string };
    const hash = await w.writeContract({
      address: d.launchpad as Address,
      abi: onTopLaunchpadAbi,
      functionName: "launch",
      value: parseEther("0.0002"),
      args: [
        {
          name: t.name,
          symbol: t.symbol,
          metadataURI: uri,
          quote: "0x0000000000000000000000000000000000000000",
          bonusBps: t.bonus,
          startTick: startTickForFdv(t.fdv, false),
          firstBuyMinOut: 0n,
          salt: `0x${Buffer.from(t.symbol).toString("hex").padEnd(64, "0")}`,
        },
      ],
    });
    await client.waitForTransactionReceipt({ hash });
    console.log(`launched $${t.symbol} ${hash}`);
  }
}

async function fund(count = 8, each = "0.0004") {
  const w = deployerWallet();
  const keys: Hex[] = existsSync(WALLETS) ? JSON.parse(readFileSync(WALLETS, "utf8")) : [];
  while (keys.length < count) keys.push(generatePrivateKey());
  writeFileSync(WALLETS, JSON.stringify(keys), { mode: 0o600 });
  for (const k of keys) {
    const to = privateKeyToAccount(k).address;
    if ((await client.getBalance({ address: to })) >= parseEther(each) / 2n) continue;
    await client.waitForTransactionReceipt({ hash: await w.sendTransaction({ to, value: parseEther(each) }) });
    console.log(`funded ${to}`);
  }
}

async function trade(rounds: number, delay: number) {
  const keys: Hex[] = JSON.parse(readFileSync(WALLETS, "utf8"));
  const tokens = [...(await listed()).values()];
  for (let i = 0; i < rounds; i++) {
    const account = privateKeyToAccount(keys[Math.floor(Math.random() * keys.length)]!);
    const w = createWalletClient({ chain: net.chain, transport: http(), account });
    const token = tokens[Math.floor(Math.random() * tokens.length)]!;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    try {
      const held = await client.readContract({ address: token, abi: onTopTokenAbi, functionName: "balanceOf", args: [account.address] });
      const eth = await client.getBalance({ address: account.address });
      // holders mostly hold: sells are rarer and partial, so payouts have patient wallets to reward
      if (held > 0n && (Math.random() < 0.3 || eth < parseEther("0.00008"))) {
        const amount = (held * BigInt(Math.floor(rand(20, 60)))) / 100n;
        await client.waitForTransactionReceipt({ hash: await w.writeContract({ address: token, abi: onTopTokenAbi, functionName: "approve", args: [d.router as Address, amount] }) });
        const hash = await w.writeContract({ address: d.router as Address, abi: onTopRouterAbi, functionName: "sell", args: [token, amount, 0n, account.address, deadline] });
        await client.waitForTransactionReceipt({ hash });
        console.log(`${i} sell ${account.address.slice(0, 8)} ${token.slice(0, 8)}`);
      } else if (eth > parseEther("0.00008")) {
        const amount = parseEther(rand(0.00002, 0.00006).toFixed(8));
        const hash = await w.writeContract({ address: d.router as Address, abi: onTopRouterAbi, functionName: "buy", value: amount, args: [token, amount, 0n, account.address, deadline] });
        await client.waitForTransactionReceipt({ hash });
        console.log(`${i} buy  ${account.address.slice(0, 8)} ${token.slice(0, 8)}`);
      }
    } catch (e) {
      console.error(`${i} skipped: ${(e as Error).message.split("\n")[0]}`);
    }
    await sleep(rand(delay * 0.5, delay * 1.5));
  }
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "launch") await launch();
else if (cmd === "fund") await fund();
else if (cmd === "trade") await trade(Number(a ?? 30), Number(b ?? 20));
else console.log("usage: seed-testnet.ts launch|fund|trade [rounds] [delaySec]");
