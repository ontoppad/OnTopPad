import { Link } from "react-router";
import type { TokenSummary } from "../lib/api.ts";
import { ago, amount, eth, or, pct, usd } from "../lib/format.ts";
import { Spark } from "./Chart.tsx";
import { artSrc, cx, Stamp, TokenArt } from "./ui.tsx";

/** Change since launch when the token is younger than a day, otherwise 24h. */
function change(t: TokenSummary) {
  const young = Date.now() / 1000 - t.launchedAt < 86_400;
  const v = young ? ((t.price - t.startPrice) / t.startPrice) * 100 : t.change24h;
  return { v, label: young ? "since launch" : "24h" };
}

export function ChangeText({ t }: { t: TokenSummary }) {
  const c = change(t);
  if (Math.abs(c.v) < 0.005) return <span className="num text-[13px] text-ink-3">Holding at launch price</span>;
  return (
    <span className="num text-[13px]">
      <span className={c.v > 0 ? "text-up" : "text-down-ink"}>{pct(c.v)}</span> <span className="text-ink-3">{c.label}</span>
    </span>
  );
}

export function TokenCard({ t, rank }: { t: TokenSummary; rank?: number }) {
  return (
    <Link
      to={`/token/${t.address}`}
      className="group flex flex-col gap-4 rounded-2xl border border-line bg-card p-5 transition-colors duration-150 hover:border-line-2 hover:bg-raised/40"
    >
      <div className="flex items-start gap-3">
        <TokenArt src={t.image} address={t.address} symbol={t.symbol} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {rank !== undefined && <span className="num text-[12px] text-ink-3">#{rank}</span>}
            <span className="truncate text-[15px] font-semibold">{t.name}</span>
          </div>
          <span className="num text-[13px] text-ink-3">${t.symbol}</span>
        </div>
        <Stamp bps={t.bonusBps} className="mt-1 text-[12px]" />
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="num text-[20px] leading-none font-medium">{usd(t.fdvUsd)}</span>
          <ChangeText t={t} />
        </div>
        <Spark values={t.spark} />
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-line pt-4 text-[12px]">
        <div className="flex flex-col gap-1">
          <span className="text-ink-3">Holders</span>
          <span className="num text-ink">{or(t.holders, String, "Be first")}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-ink-3">{t.paid > 0 ? "Paid out" : "Pot"}</span>
          <span className={cx("num", t.paid > 0 || t.pot > 0 ? "text-ink" : "text-ink-3")}>{t.paid > 0 ? eth(t.paid) : t.pot > 0 ? eth(t.pot) : "Filling"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-ink-3">Bonus paid</span>
          <span className="num text-ink">{or(t.bonusPaid, amount, "Ready")}</span>
        </div>
      </div>
      <span className="num text-[12px] text-ink-3">
        {t.lastTradeAt ? `Last trade ${ago(t.lastTradeAt)}` : `Launched ${ago(t.launchedAt)}`} · {or(t.trades, (n) => `${n} trades`, "awaiting the first trade")}
      </span>
    </Link>
  );
}

/** Pixel art blown up edge to edge; it stays crisp because the browser scales it nearest-neighbour. */
export function Art({ t, className }: { t: { image: string | null; address: string; symbol: string }; className?: string }) {
  const src = artSrc(t.image);
  return src ? (
    <img src={src} alt="" loading="lazy" className={cx("h-full w-full object-cover [image-rendering:pixelated]", className)} />
  ) : (
    <TokenArt address={t.address} symbol={t.symbol} size={512} className={cx("!h-full !w-full !rounded-none", className)} />
  );
}

/** The arcade's poster tile: square art, bonus sticker, market cap, and a two-line caption. */
export function Poster({ t }: { t: TokenSummary }) {
  return (
    <Link to={`/token/${t.address}`} className="group flex flex-col gap-2">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-raised transition-[transform,border-color,box-shadow] duration-300 ease-out group-hover:-translate-y-1 group-hover:border-[var(--sticker-shadow)] group-hover:shadow-[4px_4px_0_var(--sticker-shadow)]">
        <Art t={t} className="transition-transform duration-500 ease-out group-hover:scale-[1.06]" />
        <Stamp bps={t.bonusBps} className="absolute left-2 top-2 text-[11px]" />
        <span className="num absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{usd(t.fdvUsd)}</span>
      </div>
      <span className="truncate text-[13px] text-ink">
        {t.name} <span className="num text-ink-3">${t.symbol}</span>
      </span>
      <span className="num -mt-1 text-[12px] text-ink-3">
        {or(t.holders, (n) => `${n} holders`, "first holder wins")} · {t.paid ? `${eth(t.paid)} paid` : "pot filling"}
      </span>
    </Link>
  );
}
