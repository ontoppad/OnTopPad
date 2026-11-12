// Interactive verification run for screen recording: checks every OnTop contract on the RPC and on the explorer.
// Usage: node scripts/verify-contracts.mjs testnet|mainnet   (RPC_URL overrides the chain's RPC)
import { spawn } from "node:child_process";
import { emitKeypressEvents } from "node:readline";
import { networks } from "../packages/shared/src/networks.ts";

const net = networks[process.argv[2] ?? "testnet"];
if (!net) throw new Error("network must be testnet or mainnet");
const RPC = process.env.RPC_URL || net.chain.rpcUrls.default.http[0];
const EXPLORER = net.chain.blockExplorers.default.url;
const CONTRACTS = [
  { key: "launchpad", role: "Launches every token and its Uniswap v4 pool" },
  { key: "hook", role: "Pays the buy bonus and logs every trade" },
  { key: "router", role: "Buys and sells with slippage limits" },
  { key: "distributor", role: "Pushes holder payouts in public rounds" },
];
const XP_PER = 250;
const TTY = process.stdout.isTTY && process.stdin.isTTY;

const esc = (c) => (s) => `\x1b[${c}m${s}\x1b[0m`;
const rgb = (r, g, b) => esc(`38;2;${Math.round(r)};${Math.round(g)};${Math.round(b)}`);
const lime = rgb(203, 253, 0);
const dim = esc("2");
const bold = esc("1");
const green = rgb(34, 230, 120);
const red = rgb(255, 80, 80);
const cyan = rgb(80, 220, 255);
const gold = rgb(255, 200, 40);
const badge = (s, bg) => `\x1b[1;30;48;2;${bg}m ${s} \x1b[0m`;
const link = (url) => `\x1b]8;;${url}\x1b\\${cyan(url)}\x1b]8;;\x1b\\`;
const out = (s = "") => process.stdout.write(s + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, TTY ? ms : 0));

async function type(s, ms = 12) {
  if (!TTY) return out(s);
  for (const ch of s) {
    process.stdout.write(ch);
    await sleep(ms);
  }
  out();
}

async function spin(label, task) {
  const frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
  let i = 0;
  const t = TTY && setInterval(() => process.stdout.write(`\r  ${lime(frames[i++ % frames.length])} ${label}`), 70);
  try {
    const [v] = await Promise.all([task(), sleep(900)]);
    return v;
  } finally {
    if (t) clearInterval(t);
    if (TTY) process.stdout.write("\r\x1b[2K");
  }
}

function key() {
  if (!TTY) return Promise.resolve("q");
  return new Promise((r) => process.stdin.once("keypress", (s, k) => r(k?.ctrl && k.name === "c" ? "ctrl-c" : (k?.name ?? s))));
}

const bar = (n, total, w = 24) => lime("█".repeat(Math.round((n / total) * w))) + dim("░".repeat(w - Math.round((n / total) * w)));

async function rpc(method, params = []) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const { result, error } = await res.json();
  if (error) throw new Error(error.message);
  return result;
}

async function blockscoutInfo(address) {
  const res = await fetch(`${EXPLORER}/api/v2/smart-contracts/${address}`);
  if (!res.ok) throw new Error(`explorer HTTP ${res.status}`);
  return { ...(await res.json()), source: "Blockscout" };
}

// mainnet's Blockscout API answers scripts with a Cloudflare challenge; Sourcify holds the same verification and Blockscout reads it
async function sourcifyInfo(address) {
  const res = await fetch(`https://sourcify.dev/server/v2/contract/${net.chain.id}/${address}?fields=compilation`);
  if (res.status === 404) return { is_verified: false, source: "Sourcify" };
  if (!res.ok) throw new Error(`Sourcify HTTP ${res.status}`);
  const d = await res.json();
  const c = d.compilation ?? {};
  return {
    name: c.name,
    is_verified: !!d.match,
    is_partially_verified: d.match !== "exact_match",
    compiler_version: c.compilerVersion && `v${c.compilerVersion}`,
    optimization_runs: c.compilerSettings?.optimizer?.runs,
    evm_version: c.compilerSettings?.evmVersion,
    verified_at: d.verifiedAt,
    source: "Sourcify",
  };
}

const explorerInfo = (address) => blockscoutInfo(address).catch(() => sourcifyInfo(address));

function openUrl(url) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

const FONT = {
  O: [" ███ ", "█   █", "█   █", "█   █", " ███ "],
  N: ["█   █", "██  █", "█ █ █", "█  ██", "█   █"],
  T: ["█████", "  █  ", "  █  ", "  █  ", "  █  "],
  P: ["████ ", "█   █", "████ ", "█    ", "█    "],
  A: [" ███ ", "█   █", "█████", "█   █", "█   █"],
  D: ["████ ", "█   █", "█   █", "█   █", "████ "],
};

async function banner() {
  const word = "ONTOPPAD";
  for (let row = 0; row < 5; row++) {
    const line = [...word].map((c) => FONT[c][row]).join(" ");
    // lime → cyan gradient across the wordmark
    out("  " + [...line].map((ch, i) => rgb(203 - (i * 123) / line.length, 253 - (i * 33) / line.length, (i * 255) / line.length)(ch)).join(""));
    await sleep(60);
  }
  out();
  out(`  ${badge("SMART CONTRACT VERIFICATION QUEST", "203;253;0")}  ${dim(`${net.chain.name} · chain ${net.chain.id}`)}`);
  out();
}

async function main() {
  if (TTY) {
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
  }
  out("\x1b[2J\x1b[H");
  await banner();
  await type(`  ${dim("Mission:")} prove every OnTop contract is live on-chain and its source is ${green("verified & published")}.`);
  out();
  if (TTY) {
    out(`  ${lime("▶")} Press ${badge("ENTER", "203;253;0")} to start`);
    await key();
    process.stdout.write("\x1b[1A\x1b[2K");
  }

  out(bold("  STAGE 0 · CONNECT TO RPC"));
  const [chainHex, blockHex] = await spin(`dialing ${RPC}`, () => Promise.all([rpc("eth_chainId"), rpc("eth_blockNumber")]));
  const chainId = Number(chainHex);
  if (chainId !== net.chain.id) throw new Error(`RPC is on chain ${chainId}, expected ${net.chain.id}`);
  out(`  ${green("✔")} RPC online  ${dim("chain")} ${lime(chainId)}  ${dim("block")} ${lime("#" + Number(blockHex).toLocaleString("en-US"))}`);
  out(`  ${dim(RPC)}`);
  out();

  const results = [];
  let xp = 0;
  const maxXp = CONTRACTS.length * XP_PER;
  for (const [i, c] of CONTRACTS.entries()) {
    const address = net.deployment[c.key];
    const url = `${EXPLORER}/address/${address}?tab=contract`;
    out(bold(`  LEVEL ${i + 1}/${CONTRACTS.length}`) + dim(` · ${c.role}`));
    const code = await spin("reading bytecode from RPC", () => rpc("eth_getCode", [address, "latest"]));
    const bytes = (code.length - 2) / 2;
    const info = await spin("checking source on explorer", () => explorerInfo(address).catch((e) => ({ error: e.message })));
    const name = info.name ?? "unknown";
    // a partial match still shows "Verify & Publish" on Blockscout, so only an exact match passes
    const ok = bytes > 0 && info.is_verified === true && !info.is_partially_verified;

    out(`  ${dim("Name    ")} ${bold(lime(name))}`);
    out(`  ${dim("Address ")} ${bold(address)}`);
    out(`  ${dim("Explorer")} ${link(url)}`);
    out(`  ${dim("Bytecode")} ${bytes.toLocaleString("en-US")} bytes on-chain`);
    if (info.compiler_version) out(`  ${dim("Compiler")} solc ${info.compiler_version.split("+")[0].slice(1)} · optimizer ${info.optimization_runs} runs · ${info.evm_version}`);
    if (info.verified_at) out(`  ${dim("Verified")} ${new Date(info.verified_at).toUTCString()} ${dim(`· ${info.source}`)}`);
    if (ok) {
      xp += XP_PER;
      out(`  ${badge("✔ VERIFIED", "34;230;120")} ${badge("✔ PUBLISHED", "34;230;120")} ${badge("✔ EXACT MATCH", "34;230;120")}  ${gold(`+${XP_PER} XP`)}`);
    } else {
      const why = info.error ?? (!bytes ? "no bytecode at this address" : info.is_verified ? "partial match only" : "source not on explorer");
      out(`  ${badge("✘ NOT VERIFIED", "255;80;80")}  ${red(why)}`);
    }
    out(`  ${bar(xp, maxXp)} ${gold(`${xp}/${maxXp} XP`)}`);
    out();
    results.push({ name, address, url, ok });
    await sleep(400);
  }

  const passed = results.filter((r) => r.ok).length;
  out(bold("  SCOREBOARD"));
  for (const [i, r] of results.entries()) {
    out(`  ${lime(`[${i + 1}]`)} ${r.ok ? green("✔") : red("✘")} ${bold(r.name.padEnd(17))} ${r.address}`);
    out(`      ${link(r.url)}`);
  }
  out();
  if (passed === results.length) {
    out(`  ${gold("★ ★ ★")}  ${badge(`ACHIEVEMENT UNLOCKED · ${passed}/${results.length} CONTRACTS VERIFIED`, "255;200;40")}  ${gold("★ ★ ★")}`);
  } else {
    out(`  ${badge(`${passed}/${results.length} VERIFIED`, "255;80;80")}`);
  }
  out();

  if (TTY) {
    out(`  ${dim("Press")} ${lime(`1-${results.length}`)} ${dim("to open a contract in the explorer,")} ${lime("A")} ${dim("for all,")} ${lime("Q")} ${dim("to quit")}`);
    for (;;) {
      const k = String(await key()).toLowerCase();
      if (k === "q" || k === "escape" || k === "ctrl-c") break;
      const picks = k === "a" ? results : results[Number(k) - 1] ? [results[Number(k) - 1]] : [];
      for (const r of picks) {
        openUrl(r.url);
        out(`  ${lime("↗")} opening ${bold(r.name)} on the explorer`);
      }
    }
    process.stdin.setRawMode(false);
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  out(`\n  ${badge("✘ RUN FAILED", "255;80;80")} ${red(e.message)}`);
  process.exit(1);
});
