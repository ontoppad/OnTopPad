import { useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useActivity, useStats, type ActivityItem } from "../lib/api.ts";
import { txUrl } from "../lib/chain.ts";
import { ago, amount, eth, isHouse, or, short, usd } from "../lib/format.ts";
import { Art } from "../components/TokenCard.tsx";
import { cx, Heading, PageHero, pill, Reveal, Segmented, Skeleton, SkeletonLine, TokenArt } from "../components/ui.tsx";

const TYPES = [
  { value: "all", label: "All" },
  { value: "buy", label: "Buys" },
  { value: "sell", label: "Sells" },
  { value: "payout", label: "Payouts" },
  { value: "launch", label: "Launches" },
] as const;

const KIND = { buy: "Buy", sell: "Sell", payout: "Payout", launch: "Launch" } as const;
const TONE = {
  buy: "bg-lime text-lime-ink",
  sell: "bg-down/15 text-down-ink",
  payout: "border border-[var(--accent)] text-accent",
  launch: "bg-raised text-ink",
} as const;
const PAGE = 40;

const art = (a: ActivityItem) => ({ image: a.image, address: a.token, symbol: a.symbol ?? "" });
const size = (a: ActivityItem) => (a.quoteUsd && a.quoteUsd >= 0.01 ? usd(a.quoteUsd) : eth(a.quoteAmount ?? 0));

/** Three posters pulled from the live stream: the biggest buy, the latest payout, the newest launch. */
function Highlights({ items }: { items: ActivityItem[] }) {
  const buys = items.filter((a) => a.kind === "buy");
  const picks = [
    { label: "Biggest buy lately", a: [...buys].sort((x, y) => (y.quoteAmount ?? 0) - (x.quoteAmount ?? 0))[0], line: (a: ActivityItem) => `${size(a)} into $${a.symbol}`, sub: (a: ActivityItem) => (a.bonus ? `+${amount(a.bonus)} bonus on top` : `bought ${ago(a.ts)}`) },
    { label: "Latest payout", a: items.find((a) => a.kind === "payout"), line: (a: ActivityItem) => `${eth(a.quoteAmount ?? 0)} to ${a.recipients} holders`, sub: (a: ActivityItem) => `$${a.symbol} · ${ago(a.ts)}` },
    { label: "Newest launch", a: items.find((a) => a.kind === "launch"), line: (a: ActivityItem) => `${a.name} $${a.symbol}`, sub: (a: ActivityItem) => `${(a.bonusBps ?? 0) / 100}% bonus on every buy · ${ago(a.ts)}` },
  ].filter((p) => p.a);
  if (!picks.length) return null;
  return (
    <section className="bg-deep px-4 py-16 md:px-6">
      <Heading center title="Moments worth a replay" sub="Pulled live from the last blocks" />
      <div className={cx("mt-10 grid gap-4", picks.length === 3 ? "md:grid-cols-3" : picks.length === 2 ? "md:grid-cols-2" : "mx-auto max-w-xl")}>
        {picks.map((p, i) => (
          <Reveal key={p.label} delay={i * 0.08}>
            <Link to={`/token/${p.a!.token}`} className="group relative isolate flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-2xl border border-line p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[6px_6px_0_var(--sticker-shadow)]">
              <div className="absolute inset-0 -z-20">
                <Art t={art(p.a!)} className="transition-transform duration-500 ease-out group-hover:scale-105" />
              </div>
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/50 to-black/10" />
              <span className="num w-fit rounded-full bg-lime px-2.5 py-0.5 text-[11px] font-semibold text-lime-ink">{p.label}</span>
              <span className="mt-3 text-[20px] leading-tight font-semibold text-white">{p.line(p.a!)}</span>
              <span className="num mt-1 text-[12px] text-white/75">{p.sub(p.a!)}</span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Row({ a }: { a: ActivityItem }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-card px-4 py-3 transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-line-2 md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <Link to={`/token/${a.token}`} className="row-span-2 transition-transform duration-200 hover:scale-110 md:row-span-1">
        <TokenArt src={a.image} address={a.token} symbol={a.symbol ?? ""} size={40} />
      </Link>
      <div className="flex min-w-0 items-center gap-2">
        <span className={cx("num shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", TONE[a.kind])}>{KIND[a.kind]}</span>
        <Link to={`/token/${a.token}`} className="truncate text-[14px] hover:text-accent transition-colors duration-150">
          {a.name} <span className="num text-[12px] text-ink-3">${a.symbol}</span>
        </Link>
      </div>
      <span className="num text-right text-[14px] md:text-left">{a.kind === "launch" ? <span className="text-ink-3">new pool</span> : size(a)}</span>
      <span className="num col-start-2 text-[12px] text-ink-2 md:col-start-auto md:text-[13px]">
        {a.kind === "payout" ? (
          `${a.recipients} holders paid`
        ) : a.account && !isHouse(a.account) ? (
          <Link to={`/portfolio/${a.account}`} className="hover:text-ink">
            {short(a.account)}
          </Link>
        ) : (
          short(a.account) || "Keeper"
        )}
        {a.kind === "buy" && a.bonus ? <span className="text-accent"> · +{amount(a.bonus)} bonus</span> : null}
        {a.kind === "launch" ? <span className="text-ink-3"> · {(a.bonusBps ?? 0) / 100}% on buys</span> : null}
      </span>
      <a href={txUrl(a.tx)} target="_blank" rel="noreferrer" className="num text-right text-[12px] text-ink-3 hover:text-ink">
        {ago(a.ts)}
      </a>
    </div>
  );
}

/** A feed row still loading: art, kind badge and name, size, account, time. */
function RowSkeleton() {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-card px-4 py-3 md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <Skeleton className="row-span-2 size-10 rounded-lg md:row-span-1" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-12 rounded-full" />
        <SkeletonLine className="w-36 text-[14px]" />
      </div>
      <SkeletonLine className="w-16 justify-self-end text-[14px] md:justify-self-start" />
      <SkeletonLine className="col-start-2 w-24 text-[13px] md:col-start-auto" />
      <SkeletonLine className="w-12 justify-self-end text-[12px]" />
    </div>
  );
}

export default function Feed() {
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("all");
  const [shown, setShown] = useState(PAGE);
  const { data, isLoading } = useActivity(type, 120);
  const { data: all } = useActivity("all", 120);
  const { data: s } = useStats();

  return (
    <div>
      <PageHero art={all?.find((a) => a.image)?.image} title="The feed" sub="Launches, trades and holder payouts across the pad, the moment the blocks land">
        <span className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-card/80 px-3 py-1 text-[12px] text-ink-2 backdrop-blur">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-lime" />
          </span>
          Live from the chain
        </span>
        {!s ? (
          <SkeletonLine className="w-96 max-w-full text-[12px]" />
        ) : (
          <p className="num text-[12px] text-ink-3">
            {or(s.trades, (n) => `${n} trades`, "First trade pending")} · {or(s.bonusTokens, (v) => `${amount(v)} bonus tokens to buyers`, "bonus ready on the first buy")} · {s.paid ? `${eth(s.paid)} paid to holders` : or(s.pot, (v) => `${eth(v)} filling holder pots`, "holder pots open")}
          </p>
        )}
      </PageHero>

      {all ? (
        <Highlights items={all} />
      ) : (
        <section aria-busy className="bg-deep px-4 py-16 md:px-6">
          <Skeleton className="mx-auto h-10 w-full max-w-md" />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-[16/10] rounded-2xl" />
            ))}
          </div>
        </section>
      )}

      <section className="px-4 py-16 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <Heading title="Every move on the pad" sub={data ? `${data.length} latest events · newest first` : "Reading the chain"} />
          <Segmented
            value={type}
            onChange={(v) => {
              setType(v);
              setShown(PAGE);
            }}
            options={[...TYPES]}
            className="scrollbar-none max-w-full overflow-x-auto"
          />
        </div>

        {isLoading && (
          <div aria-busy className="mt-6 flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        )}
        {/* keyed by filter so a switch swaps the list in one fade; inside it, new events slide in on top */}
        <motion.div key={type} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="mt-6 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {data?.slice(0, shown).map((a) => (
              <motion.div key={`${a.tx}${a.kind}${a.account}${a.ts}`} layout="position" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                <Row a={a} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
        {data && data.length === 0 && (
          <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-12 text-center">
            <p className="text-[18px]">The next {TYPES.find((t) => t.value === type)!.label.toLowerCase()} land here as they happen</p>
            <Link to="/arcade" className={pill}>
              Make the first move
            </Link>
          </div>
        )}
        {data && data.length > shown && (
          <button onClick={() => setShown((n) => n + PAGE)} className="mx-auto mt-10 flex h-10 items-center rounded-full border border-line-2 bg-card px-6 text-[14px] transition-colors duration-150 hover:bg-raised">
            Load more
          </button>
        )}
      </section>
    </div>
  );
}
