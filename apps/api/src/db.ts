import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { config } from "./config.ts";

mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(`${config.dataDir}/ontoppad.db`);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS tokens (
  address TEXT PRIMARY KEY,
  creator TEXT NOT NULL,
  quote TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  meta_json TEXT,
  bonus_bps INTEGER NOT NULL,
  fee_ppm INTEGER NOT NULL,
  start_tick INTEGER NOT NULL,
  token_is0 INTEGER NOT NULL,
  start_price REAL NOT NULL,
  treasury REAL NOT NULL,
  reserve REAL NOT NULL,
  supply REAL NOT NULL,
  price REAL NOT NULL,
  launched_at INTEGER NOT NULL,
  block INTEGER NOT NULL,
  tx TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
  tx TEXT NOT NULL, log_index INTEGER NOT NULL,
  token TEXT NOT NULL, trader TEXT NOT NULL, is_buy INTEGER NOT NULL,
  quote_amount REAL NOT NULL, token_amount REAL NOT NULL, bonus REAL NOT NULL, price REAL NOT NULL,
  block INTEGER NOT NULL, ts INTEGER NOT NULL,
  PRIMARY KEY (tx, log_index)
);
CREATE INDEX IF NOT EXISTS trades_token_ts ON trades(token, ts);
CREATE INDEX IF NOT EXISTS trades_ts ON trades(ts);
CREATE INDEX IF NOT EXISTS trades_trader ON trades(trader);

CREATE TABLE IF NOT EXISTS collects (
  tx TEXT NOT NULL, log_index INTEGER NOT NULL, token TEXT NOT NULL,
  quote_fees REAL NOT NULL, token_fees REAL NOT NULL, to_holders REAL NOT NULL, to_creator REAL NOT NULL,
  to_platform REAL NOT NULL, refilled REAL NOT NULL, burned REAL NOT NULL,
  block INTEGER NOT NULL, ts INTEGER NOT NULL,
  PRIMARY KEY (tx, log_index)
);

CREATE TABLE IF NOT EXISTS rounds (
  tx TEXT NOT NULL, log_index INTEGER NOT NULL, token TEXT NOT NULL, round INTEGER NOT NULL,
  snapshot_block INTEGER NOT NULL, inputs_hash TEXT NOT NULL, recipients INTEGER NOT NULL,
  total REAL NOT NULL, delivery_fee REAL NOT NULL, block INTEGER NOT NULL, ts INTEGER NOT NULL,
  PRIMARY KEY (tx, log_index)
);

CREATE TABLE IF NOT EXISTS payouts (
  tx TEXT NOT NULL, log_index INTEGER NOT NULL, token TEXT NOT NULL, round INTEGER NOT NULL,
  account TEXT NOT NULL, amount REAL NOT NULL, block INTEGER NOT NULL, ts INTEGER NOT NULL,
  PRIMARY KEY (tx, log_index)
);
CREATE INDEX IF NOT EXISTS payouts_account ON payouts(account);
CREATE INDEX IF NOT EXISTS payouts_token ON payouts(token, ts);

-- exact balances and holding lots (wei strings) for time-weighted payouts
CREATE TABLE IF NOT EXISTS balances (
  token TEXT NOT NULL, account TEXT NOT NULL, amount TEXT NOT NULL,
  PRIMARY KEY (token, account)
);
CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL, account TEXT NOT NULL, amount TEXT NOT NULL, since INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lots_holder ON lots(token, account);

CREATE TABLE IF NOT EXISTS metadata (id TEXT PRIMARY KEY, json TEXT NOT NULL, created_at INTEGER NOT NULL);
`);

export function getMeta(k: string): string | undefined {
  return (db.prepare("SELECT v FROM meta WHERE k = ?").get(k) as { v: string } | undefined)?.v;
}

export function setMeta(k: string, v: string | number) {
  db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, String(v));
}

export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
