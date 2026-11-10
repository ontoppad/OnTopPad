import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";
import { db } from "./db.ts";

export const mediaDir = `${config.dataDir}/media`;
mkdirSync(mediaDir, { recursive: true });

export interface TokenMeta {
  name: string;
  symbol: string;
  description: string;
  image: string;
  links: { x?: string; telegram?: string; website?: string };
}

const MAX_IMAGE = 2 * 1024 * 1024;

/** Sniff the real format from magic bytes; never trust the client's content type. SVG is refused (script risk). */
export function sniffImage(b: Uint8Array): "png" | "jpg" | "gif" | "webp" | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

function cleanUrl(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" && v.length <= 200 ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export class MetaError extends Error {}

export function createMetadata(fields: Record<string, unknown>, image: Uint8Array): { id: string; uri: string; meta: TokenMeta } {
  const name = String(fields.name ?? "").trim();
  const symbol = String(fields.symbol ?? "").trim().replace(/^\$/, "").toUpperCase();
  const description = String(fields.description ?? "").trim();
  if (name.length < 2 || name.length > 32) throw new MetaError("name must be 2-32 characters");
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) throw new MetaError("ticker must be 2-10 letters or digits");
  if (description.length > 280) throw new MetaError("description must be 280 characters or less");
  if (image.byteLength > MAX_IMAGE) throw new MetaError("image must be under 2 MB");
  const ext = sniffImage(image);
  if (!ext) throw new MetaError("image must be PNG, JPEG, WebP or GIF");

  const file = `${createHash("sha256").update(image).digest("hex").slice(0, 32)}.${ext}`;
  writeFileSync(`${mediaDir}/${file}`, image);

  const id = randomBytes(12).toString("hex");
  const meta: TokenMeta = {
    name,
    symbol,
    description,
    image: `${config.publicUrl}/api/media/${file}`,
    links: { x: cleanUrl(fields.x), telegram: cleanUrl(fields.telegram), website: cleanUrl(fields.website) },
  };
  db.prepare("INSERT INTO metadata (id, json, created_at) VALUES (?, ?, ?)").run(id, JSON.stringify(meta), Date.now());
  return { id, uri: `${config.publicUrl}/api/metadata/${id}`, meta };
}

export function getMetadata(id: string): TokenMeta | undefined {
  const row = db.prepare("SELECT json FROM metadata WHERE id = ?").get(id) as { json: string } | undefined;
  return row ? JSON.parse(row.json) : undefined;
}

/** Launchers pick metadata URIs freely, so refuse IP literals and local names before fetching (SSRF). */
export function isPublicHttps(uri: string): boolean {
  try {
    const u = new URL(uri);
    const h = u.hostname;
    return u.protocol === "https:" && h.includes(".") && !/^[\d.]+$/.test(h) && !h.includes(":") && !h.endsWith(".local") && !h.endsWith("localhost");
  } catch {
    return false;
  }
}

/** Copies a token's metadata into its row. Our own URIs resolve locally; foreign https URIs are fetched once, capped. */
export async function resolveMetadata(token: string) {
  const row = db.prepare("SELECT metadata_uri FROM tokens WHERE address = ?").get(token) as { metadata_uri: string } | undefined;
  if (!row) return;
  const own = row.metadata_uri.match(/\/api\/metadata\/([a-f0-9]{24})$/);
  let json: string | undefined;
  if (own) {
    const m = getMetadata(own[1]!);
    json = m && JSON.stringify(m);
  } else if (isPublicHttps(row.metadata_uri)) {
    try {
      const res = await fetch(row.metadata_uri, { signal: AbortSignal.timeout(4_000) });
      const text = await res.text();
      if (res.ok && text.length < 64_000) json = JSON.stringify(JSON.parse(text));
    } catch {
      // unreachable or malformed metadata: the UI falls back to a generated cartridge
    }
  }
  if (json) db.prepare("UPDATE tokens SET meta_json = ? WHERE address = ?").run(json, token);
}

const uploads = new Map<string, number[]>();
/** shortcut: in-memory per-IP hourly limit; move to the proxy if the API ever runs multi-process. */
export function allowUpload(ip: string): boolean {
  const now = Date.now();
  const recent = (uploads.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= config.uploadsPerHour) return false;
  recent.push(now);
  uploads.set(ip, recent);
  return true;
}
