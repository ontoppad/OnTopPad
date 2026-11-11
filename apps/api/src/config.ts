import { getNetwork } from "@ontoppad/shared";

const env = process.env;
export const network = getNetwork(env.NETWORK ?? "testnet");
export const config = {
  port: Number(env.PORT ?? 8787),
  host: env.HOST ?? "127.0.0.1",
  webDir: env.WEB_DIR,
  dataDir: env.DATA_DIR ?? "./data",
  publicUrl: env.PUBLIC_URL ?? network.appUrl,
  rpcUrl: env.RPC_URL || network.chain.rpcUrls.default.http[0],
  privateKey: env.PRIVATE_KEY as `0x${string}` | undefined,
  keeperIntervalSec: Number(env.KEEPER_INTERVAL_SEC ?? 900),
  // mainnet: the keeper's gas comes out of the fees it moves instead of a wallet someone keeps topping up
  selfFundedKeeper: env.KEEPER_SELF_FUNDED === "1",
  minHoldUsd: Number(env.MIN_HOLD_USD ?? 1),
  uploadsPerHour: Number(env.UPLOADS_PER_HOUR ?? 10),
  pollMs: 2_000,
  chunk: 20_000n,
};
