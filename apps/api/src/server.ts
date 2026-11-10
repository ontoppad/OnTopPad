import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFile } from "node:fs/promises";
import { isAddress } from "viem";
import { MAX_BONUS_BPS, MIN_BONUS_BPS, SUPPLY, TREASURY_BPS, HOLDERS_BPS, CREATOR_BPS, PLATFORM_BPS, TIERS } from "@ontoppad/shared";
import { config, network } from "./config.ts";
import { contracts, wallet } from "./chain.ts";
import { runIndexer, indexerState } from "./indexer.ts";
import { runKeeper } from "./keeper.ts";
import { runPriceFeed, getEthUsd } from "./price.ts";
import { allowUpload, createMetadata, getMetadata, mediaDir, MetaError } from "./metadata.ts";
import * as q from "./queries.ts";

const app = new Hono().basePath("/api");
// public read API: anyone can verify the numbers from their own tools
app.use("*", cors({ origin: "*", allowMethods: ["GET"] }));

// The operator wallet (deployer/keeper) never appears on the site: every API response swaps it for "house".
const hidden = [wallet?.account.address, ...(process.env.HIDE_ADDRESSES ?? "").split(",")]
  .filter((a): a is string => !!a && isAddress(a))
  .map((a) => new RegExp(a, "gi"));
app.use("*", async (c, next) => {
  await next();
  if (!hidden.length || !c.res.headers.get("content-type")?.includes("application/json")) return;
  let body = await c.res.text();
  for (const re of hidden) body = body.replace(re, "house");
  const headers = new Headers(c.res.headers);
  headers.delete("content-length");
  c.res = new Response(body, { status: c.res.status, headers });
});

/** shortcut: per-process 4s memo for the heavy read models; swap for real caching if traffic outgrows one VPS. */
const memo = new Map<string, { at: number; v: unknown }>();
function cached<T>(key: string, fn: () => T, ttl = 4_000): T {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.v as T;
  const v = fn();
  // keys carry search text and addresses from the request; drop everything at once before it can pile up
  if (memo.size >= 1_000) memo.clear();
  memo.set(key, { at: Date.now(), v });
  return v;
}

const addr = (s: string) => (isAddress(s) ? s.toLowerCase() : null);
const clamp = (v: string | undefined, d: number, max: number) => Math.min(Math.max(Number(v) || d, 1), max);

app.get("/health", (c) => c.json({ ok: true, ...indexerState() }));

app.get("/config", (c) =>
  c.json({
    network: network.name,
    label: network.label,
    chainId: network.chain.id,
    rpc: network.chain.rpcUrls.default.http[0],
    explorer: network.chain.blockExplorers.default.url,
    contracts,
    quotes: network.quotes,
    constants: { SUPPLY, TREASURY_BPS, MIN_BONUS_BPS, MAX_BONUS_BPS, HOLDERS_BPS, CREATOR_BPS, PLATFORM_BPS, TIERS },
    keeperIntervalSec: config.keeperIntervalSec,
    minHoldUsd: config.minHoldUsd,
    ethUsd: getEthUsd(),
    ...indexerState(),
  }),
);

app.get("/stats", (c) => c.json({ ...cached("stats", q.stats), ...indexerState() }));

app.get("/tokens", (c) => {
  const sort = c.req.query("sort") ?? "hot";
  const search = c.req.query("q") ?? "";
  const limit = clamp(c.req.query("limit"), 60, 200);
  return c.json({ items: cached(`tokens:${sort}:${search}:${limit}`, () => q.listTokens(sort, search, limit)) });
});

app.get("/tokens/:address", (c) => {
  const a = addr(c.req.param("address"));
  const t = a && cached(`token:${a}`, () => q.getToken(a));
  return t ? c.json(t) : c.json({ error: "not found" }, 404);
});

app.get("/tokens/:address/candles", (c) => {
  const a = addr(c.req.param("address"));
  const tf = [60, 300, 900, 3600, 14400].includes(Number(c.req.query("tf"))) ? Number(c.req.query("tf")) : 300;
  return a ? c.json({ tf, candles: cached(`candles:${a}:${tf}`, () => q.candles(a, tf)) }) : c.json({ error: "bad address" }, 400);
});

app.get("/tokens/:address/trades", (c) => {
  const a = addr(c.req.param("address"));
  return a ? c.json({ items: q.tokenTrades(a, clamp(c.req.query("limit"), 50, 200)) }) : c.json({ error: "bad address" }, 400);
});

app.get("/tokens/:address/holders", (c) => {
  const a = addr(c.req.param("address"));
  return a ? c.json(cached(`holders:${a}`, () => q.holders(a))) : c.json({ error: "bad address" }, 400);
});

app.get("/tokens/:address/rounds", (c) => {
  const a = addr(c.req.param("address"));
  return a ? c.json({ items: q.tokenRounds(a) }) : c.json({ error: "bad address" }, 400);
});

app.get("/activity", (c) => {
  const type = ["all", "buy", "sell", "payout", "launch"].includes(c.req.query("type") ?? "") ? c.req.query("type")! : "all";
  const limit = clamp(c.req.query("limit"), 60, 200);
  return c.json({ items: cached(`activity:${type}:${limit}`, () => q.activity(type, limit), 2_000) });
});

app.get("/wallet/:address", (c) => {
  const a = addr(c.req.param("address"));
  return a ? c.json(cached(`wallet:${a}`, () => q.wallet(a))) : c.json({ error: "bad address" }, 400);
});

app.get("/leaderboard", (c) => c.json(cached("leaderboard", q.leaderboard, 15_000)));

app.post("/metadata", async (c) => {
  const ip = c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowUpload(ip)) return c.json({ error: "too many uploads, try again in an hour" }, 429);
  const body = await c.req.parseBody();
  const image = body.image;
  if (!(image instanceof File)) return c.json({ error: "image is required" }, 400);
  try {
    const created = createMetadata(body, new Uint8Array(await image.arrayBuffer()));
    return c.json(created, 201);
  } catch (e) {
    if (e instanceof MetaError) return c.json({ error: e.message }, 400);
    throw e;
  }
});

app.get("/metadata/:id", (c) => {
  const m = /^[a-f0-9]{24}$/.test(c.req.param("id")) ? getMetadata(c.req.param("id")) : undefined;
  return m ? c.json(m) : c.json({ error: "not found" }, 404);
});

// nginx serves /api/media straight from disk in production; this keeps local dev self-contained
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
app.get("/media/:file", async (c) => {
  const m = c.req.param("file").match(/^([a-f0-9]{32})\.(png|jpg|gif|webp)$/);
  if (!m) return c.notFound();
  try {
    const buf = await readFile(`${mediaDir}/${m[0]}`);
    return c.body(buf, 200, { "content-type": TYPES[m[2]!]!, "cache-control": "public, max-age=31536000, immutable" });
  } catch {
    return c.notFound();
  }
});

app.onError((e, c) => {
  console.error("[api]", e);
  return c.json({ error: "internal error" }, 500);
});

// one process per network: the API plus, in production, the built web app (Traefik terminates TLS in front)
const root = new Hono();
root.use("*", secureHeaders({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false }));
root.route("/", app);
if (config.webDir) {
  const web = config.webDir;
  root.use("/assets/*", async (c, next) => {
    await next();
    c.header("cache-control", "public, max-age=31536000, immutable");
  });
  // the app shell is never cached, so a deploy shows up on the next load
  root.use("*", async (c, next) => {
    await next();
    if (c.res.headers.get("content-type")?.startsWith("text/html")) c.header("cache-control", "no-cache");
  });
  root.use("*", serveStatic({ root: web }));
  root.get("*", serveStatic({ path: `${web}/index.html` })); // SPA fallback
}

serve({ fetch: root.fetch, port: config.port, hostname: config.host }, () =>
  console.log(`[api] ${network.label} on ${config.host}:${config.port}${config.webDir ? " (serving web)" : ""}`),
);
runPriceFeed();
void runIndexer();
runKeeper();
