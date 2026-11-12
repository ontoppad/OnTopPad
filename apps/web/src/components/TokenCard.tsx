import { Link } from "react-router";
import type { TokenSummary } from "../lib/api.ts";
import { HOUSE_SYMBOL } from "../lib/chain.ts";
import { eth, or, pct, usd } from "../lib/format.ts";
import { artSrc, cx, Logo, Skeleton, SkeletonLine, Stamp, TokenArt } from "./ui.tsx";

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

/** Token art edge to edge, smoothly scaled so any style (pixel, vector, photo) holds up at every size. */
export function Art({ t, className }: { t: { image: string | null; address: string; symbol: string }; className?: string }) {
  const src = artSrc(t.image);
  if (t.symbol === HOUSE_SYMBOL) return <Logo className={cx("!h-full !w-full", className)} face="object-cover" />;
  return src ? (
    <img src={src} alt="" loading="lazy" decoding="async" className={cx("h-full w-full object-cover", className)} />
  ) : (
    <TokenArt address={t.address} symbol={t.symbol} size={512} className={cx("!h-full !w-full !rounded-none", className)} />
  );
}

/** The arcade's poster tile: square art, bonus sticker, market cap, and a two-line caption. */
export function Poster({ t }: { t: TokenSummary }) {
  return (
    <Link to={`/token/${t.address}`} className="group flex flex-col gap-2 transition-transform duration-150 active:scale-[0.97]">
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

/** A poster tile still loading: same square, same two caption lines. */
export function PosterSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="aspect-square" />
      <SkeletonLine className="w-3/4 text-[13px]" />
      <SkeletonLine className="w-1/2 text-[12px]" />
    </div>
  );
}
