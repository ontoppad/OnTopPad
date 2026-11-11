import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Globe, Send } from "lucide-react";
import { buyerEdge, feeFor } from "@ontoppad/shared";
import { AnimatePresence, motion } from "motion/react";
import { useCandles, useConfig, useHolders, useRounds, useToken, useTokens, useTrades } from "../lib/api.ts";
import { addressUrl, txUrl } from "../lib/chain.ts";
import { ago, amount, eth, isHouse, or, price, share, short, usd } from "../lib/format.ts";
import { CandleChart } from "../components/Chart.tsx";
import { TradePanel } from "../components/TradePanel.tsx";
import { ChangeText, Poster, PosterSkeleton } from "../components/TokenCard.tsx";
import { AddressChip, artSrc, ButtonLink, Card, cx, Heading, Reveal, Segmented, Skeleton, SkeletonLine, SkeletonRows, Spec, Stamp, TierMeter, TokenArt } from "../components/ui.tsx";

const TF = [
  { value: "60", label: "1m" },
  { value: "300", label: "5m" },
  { value: "900", label: "15m" },
  { value: "3600", label: "1h" },
] as const;

function Trades({ address, symbol }: { address: string; symbol: string }) {
  const { data, isLoading } = useTrades(address);
  if (isLoading) return <SkeletonRows />;
  if (!data?.length) return <p className="p-6 text-[14px] text-ink-2">The first trade after launch shows up here within a few seconds</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="text-left text-ink-3">
            <th className="px-5 py-3 font-normal">Trader</th>
            <th className="px-5 py-3 font-normal">Side</th>
            <th className="px-5 py-3 text-right font-normal">ETH</th>
            <th className="px-5 py-3 text-right font-normal">${symbol}</th>
            <th className="px-5 py-3 text-right font-normal">Bonus</th>
            <th className="px-5 py-3 text-right font-normal">When</th>
          </tr>
        </thead>
        <tbody className="num">
          {data.map((t) => (
            <tr key={`${t.tx}${t.ts}${t.trader}`} className="border-t border-line transition-colors duration-150 hover:bg-raised/60">
              <td className="px-5 py-3">
                {isHouse(t.trader) ? (
                  <span className="text-ink-2">{short(t.trader)}</span>
                ) : (
                  <Link to={`/portfolio/${t.trader}`} className="text-ink-2 hover:text-ink">
                    {short(t.trader)}
                  </Link>
                )}
              </td>
              <td className={cx("px-5 py-3", t.side === "buy" ? "text-up" : "text-down-ink")}>{t.side === "buy" ? "Buy" : "Sell"}</td>
              <td className="px-5 py-3 text-right">{eth(t.quoteAmount, "")}</td>
              <td className="px-5 py-3 text-right">{amount(t.tokenAmount)}</td>
              <td className="px-5 py-3 text-right text-accent">{t.bonus > 0 ? `+${amount(t.bonus)}` : <span className="text-ink-3">sell</span>}</td>
              <td className="px-5 py-3 text-right">
                <a href={txUrl(t.tx)} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink">
                  {ago(t.ts)}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Holders({ address }: { address: string }) {
  const { data, isLoading } = useHolders(address);
  if (isLoading) return <SkeletonRows />;
  if (!data?.items.length) return <p className="p-6 text-[14px] text-ink-2">Holders appear here as soon as the first buy settles</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className="text-left text-ink-3">
            <th className="px-5 py-3 font-normal">Holder</th>
            <th className="px-5 py-3 font-normal">Tier</th>
            <th className="px-5 py-3 text-right font-normal">Balance</th>
            <th className="px-5 py-3 text-right font-normal">Supply</th>
            <th className="px-5 py-3 text-right font-normal">Payout share</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((h) => (
            <tr key={h.account} className="border-t border-line transition-colors duration-150 hover:bg-raised/60">
              <td className="px-5 py-3 num">
                {isHouse(h.account) ? (
                  <span className="text-ink-2">{short(h.account)}</span>
                ) : (
                  <Link to={`/portfolio/${h.account}`} className="text-ink-2 hover:text-ink">
                    {short(h.account)}
                  </Link>
                )}
              </td>
              <td className="px-5 py-3">
                <TierMeter tier={h.tier} next={h.next} compact />
              </td>
              <td className="px-5 py-3 text-right num">{amount(h.balance)}</td>
              <td className="px-5 py-3 text-right num text-ink-2">{share(h.pct)}</td>
              <td className="px-5 py-3 text-right num">
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-raised">
                    <span className="block h-full bg-lime" style={{ width: `${Math.min(100, h.share)}%` }} />
                  </span>
                  {share(h.share)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rounds({ address }: { address: string }) {
  const { data, isLoading } = useRounds(address);
  if (isLoading) return <SkeletonRows />;
  if (!data?.length)
    return <p className="p-6 text-[14px] text-ink-2">The first payout round goes out once the pot fills. Every round is listed here with its snapshot block and transaction</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px] num">
        <thead>
          <tr className="text-left text-ink-3 font-sans">
            <th className="px-5 py-3 font-normal">Round</th>
            <th className="px-5 py-3 text-right font-normal">Paid</th>
            <th className="px-5 py-3 text-right font-normal">Holders</th>
            <th className="px-5 py-3 text-right font-normal">Snapshot block</th>
            <th className="px-5 py-3 font-normal">Inputs hash</th>
            <th className="px-5 py-3 text-right font-normal">When</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.round} className="border-t border-line transition-colors duration-150 hover:bg-raised/60">
              <td className="px-5 py-3">#{r.round}</td>
              <td className="px-5 py-3 text-right text-accent">{eth(r.total)}</td>
              <td className="px-5 py-3 text-right">{r.recipients}</td>
              <td className="px-5 py-3 text-right text-ink-2">{r.snapshot.toLocaleString("en-US")}</td>
              <td className="px-5 py-3 text-ink-3">{short(r.inputs_hash)}</td>
              <td className="px-5 py-3 text-right">
                <a href={txUrl(r.tx)} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink">
                  {ago(r.ts)}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The token page's frame while the token loads: header, stat strip, chart, tabs and the trade panel. */
function TokenSkeleton() {
  return (
    <div aria-busy>
      <section className="border-b border-line px-4 pb-10 pt-6 md:px-6 md:pt-8">
        <Skeleton className="h-7 w-24 rounded-full" />
        <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-5">
            <Skeleton className="size-20 shrink-0 rounded-2xl md:size-28" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-56 rounded-md md:h-12 md:w-80" />
              <SkeletonLine className="w-64 text-[13px]" />
            </div>
          </div>
          <div className="flex flex-col gap-2 md:items-end">
            <Skeleton className="h-9 w-40 rounded-md" />
            <SkeletonLine className="w-28 text-[13px]" />
          </div>
        </div>
      </section>
      <div className="px-4 md:px-6">
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 bg-card p-4">
              <SkeletonLine className="w-16 text-[12px]" />
              <SkeletonLine className="w-24 text-[18px]" />
              <SkeletonLine className="w-20 text-[12px]" />
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <SkeletonLine className="w-28 text-[17px]" />
                <Skeleton className="h-10 w-48 rounded-full" />
              </div>
              <Skeleton className="h-[360px]" />
            </Card>
            <Card className="overflow-hidden">
              <div className="border-b border-line p-3">
                <Skeleton className="h-10 w-80 max-w-full rounded-full" />
              </div>
              <SkeletonRows />
            </Card>
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-[420px] rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Token() {
  const { address = "" } = useParams();
  const { data: t, isLoading, error } = useToken(address.toLowerCase());
  const { data: cfg } = useConfig();
  const [tf, setTf] = useState<(typeof TF)[number]["value"]>("300");
  const [tab, setTab] = useState<"trades" | "holders" | "rounds" | "specs">("trades");
  const { data: candles } = useCandles(address.toLowerCase(), Number(tf));
  const { data: all } = useTokens();
  const ethUsd = cfg?.ethUsd ?? 0;

  if (error)
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        <p className="font-title text-[26px] leading-[1.1]">This address isn't an OnTop launch</p>
        <ButtonLink to="/arcade" variant="secondary">
          Back to the arcade
        </ButtonLink>
      </div>
    );
  if (isLoading || !t) return <TokenSkeleton />;

  const edge = buyerEdge(t.bonusBps) * 100;
  const src = artSrc(t.image);
  const more = (all ?? []).filter((x) => x.address !== t.address).slice(0, 6);
  return (
    <div>
      <section className="relative isolate overflow-hidden border-b border-line">
        {src && <motion.img key={src} src={src} alt="" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} transition={{ duration: 0.8 }} className="absolute inset-0 -z-20 h-full w-full scale-125 object-cover blur-2xl will-change-transform [image-rendering:pixelated]" />}
        <div className="absolute inset-0 -z-10 bg-bg/70" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-b from-transparent to-bg" />
        <div className="px-4 pb-10 pt-6 md:px-6 md:pt-8">
          <Link to="/arcade" className="group inline-flex items-center gap-1 rounded-full border border-line-2 bg-card/80 px-3 py-1 text-[13px] text-ink-2 backdrop-blur transition-colors duration-150 hover:text-ink">
            <ArrowLeft size={14} strokeWidth={1.5} className="transition-transform duration-200 group-hover:-translate-x-0.5" /> Arcade
          </Link>
          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-5">
              <motion.div initial={{ rotate: -12, scale: 0.8, opacity: 0 }} animate={{ rotate: -4, scale: 1, opacity: 1 }} whileHover={{ rotate: 3, scale: 1.05 }} transition={{ type: "spring", bounce: 0.4, duration: 0.6 }} className="shrink-0 overflow-hidden rounded-2xl border-2 border-[var(--sticker-shadow)] shadow-[5px_5px_0_var(--sticker-shadow)]">
                <TokenArt src={t.image} address={t.address} symbol={t.symbol} size={112} className="!rounded-none max-md:!size-20" />
              </motion.div>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-title text-[30px] leading-none md:text-[48px]">{t.name}</h1>
                  <span className="num text-[16px] text-ink-2">${t.symbol}</span>
                  <Stamp bps={t.bonusBps} />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <AddressChip address={t.address} />
                  <span className="text-[13px] text-ink-3">
                    by{" "}
                    {isHouse(t.creator) ? (
                      <span className="text-ink-2">{short(t.creator)}</span>
                    ) : (
                      <Link to={`/portfolio/${t.creator}`} className="num text-ink-2 hover:text-ink">
                        {short(t.creator)}
                      </Link>
                    )}{" "}
                    · launched {ago(t.launchedAt)}
                  </span>
                  {t.links.x && (
                    <a href={t.links.x} target="_blank" rel="noreferrer" className="text-[13px] text-ink-2 hover:text-ink">
                      X
                    </a>
                  )}
                  {t.links.telegram && (
                    <a href={t.links.telegram} target="_blank" rel="noreferrer" aria-label="Telegram" className="text-ink-2 hover:text-ink">
                      <Send size={14} strokeWidth={1.5} />
                    </a>
                  )}
                  {t.links.website && (
                    <a href={t.links.website} target="_blank" rel="noreferrer" aria-label="Website" className="text-ink-2 hover:text-ink">
                      <Globe size={14} strokeWidth={1.5} />
                    </a>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-start gap-1 md:items-end">
              {cfg ? <span className="num text-[34px] leading-none font-medium">{price(t.price * ethUsd)}</span> : <Skeleton className="h-[34px] w-40 rounded-md" />}
              <ChangeText t={t} />
            </div>
          </div>
        </div>
      </section>

      <div className="px-4 md:px-6">
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Market cap", usd(t.fdvUsd), `${eth(t.fdv)}`],
            ["Volume 24h", t.volume24h > 0 ? usd(t.volume24hUsd) : "Quiet today", t.volume > 0 ? `${usd(t.volumeUsd)} all time` : "First trade pending"],
            ["Holders", or(t.holders, String, "First buyer wins"), or(t.traders, (n) => `${n} traders`, "Market just opened")],
            ["Paid to holders", t.paid > 0 ? eth(t.paid) : "Round 1 filling", t.rounds > 0 ? `${t.rounds} round${t.rounds > 1 ? "s" : ""}` : `${eth(t.pot)} in the pot`],
            ["Bonus paid", or(t.bonusPaid, amount, `${t.bonusBps / 100}% ready`), or(t.bonusBuys, (n) => `${n} buys got it`, "Waiting on the first buy")],
            ["Treasury left", `${t.reservePct.toFixed(1)}%`, `${amount(t.reserve)} tokens`],
          ].map(([k, v, s]) => (
            <div key={k} className="flex flex-col gap-1 bg-card p-4 transition-colors duration-150 hover:bg-raised">
              <span className="text-[12px] text-ink-3">{k}</span>
              <span className="num text-[18px] font-medium">{v}</span>
              <span className="num text-[12px] text-ink-3">{s}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <span className="whitespace-nowrap text-[17px] font-semibold">Price in USD</span>
                <Segmented value={tf} onChange={setTf} options={[...TF]} />
              </div>
              {candles && cfg ? <CandleChart candles={candles.map((c) => ({ ...c, o: c.o * ethUsd, h: c.h * ethUsd, l: c.l * ethUsd, c: c.c * ethUsd, v: c.v * ethUsd }))} format={price} /> : <Skeleton className="h-[360px]" />}
              <p className="mt-3 num text-[12px] text-ink-3">Candles from on-chain trades · USD at the live ETH price · down candles hollow</p>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-line p-3">
                <Segmented
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "trades", label: "Trades" },
                    { value: "holders", label: t.holders ? `Holders ${t.holders}` : "Holders" },
                    { value: "rounds", label: "Payout rounds" },
                    { value: "specs", label: "Specs" },
                  ]}
                  className="max-w-full overflow-x-auto scrollbar-none"
                />
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                  {tab === "trades" && <Trades address={t.address} symbol={t.symbol} />}
                  {tab === "holders" && <Holders address={t.address} />}
                  {tab === "rounds" && <Rounds address={t.address} />}
                  {tab === "specs" && (
                    <div className="grid gap-x-8 p-5 md:grid-cols-2">
                      <div>
                        <Spec k="Bonus on buys" v={`${t.bonusBps / 100}%`} />
                        <Spec k="Pool LP fee" v={`${(feeFor(t.bonusBps) / 1e4).toFixed(4)}%`} />
                        <Spec k="Net edge per buy" v={`+${edge.toFixed(2)}%`} />
                        <Spec k="Supply" v={amount(t.supply)} />
                        <Spec k="Burned" v={t.burned > 0.5 ? amount(t.burned) : "Burns start with sell fees"} />
                        <Spec k="Treasury at launch" v={amount(t.treasury)} />
                      </div>
                      <div>
                        <Spec k="Pair asset" v={t.quote} />
                        <Spec k="Start tick" v={t.startTick.toLocaleString("en-US")} />
                        <Spec k="Pool id" v={short(t.poolId)} />
                        <Spec k="Token" v={<a href={addressUrl(t.address)} target="_blank" rel="noreferrer" className="hover:text-ink">{short(t.address)}</a>} />
                        <Spec k="Launch tx" v={<a href={txUrl(t.launchTx)} target="_blank" rel="noreferrer" className="hover:text-ink">{short(t.launchTx)}</a>} />
                        <Spec k="Creator earned" v={t.creatorEarned > 0 ? eth(t.creatorEarned) : "15% of fees, from the first collect"} />
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </Card>
          </div>

          <div className="flex flex-col gap-4 lg:sticky lg:top-28 lg:self-start">
            <TradePanel token={t} ethUsd={ethUsd} />
            {t.description && (
              <Card className="p-5">
                <span className="text-[13px] text-ink-3">About</span>
                <p className="mt-2 text-[14px] leading-6 text-ink-2">{t.description}</p>
              </Card>
            )}
            <Card className="p-5">
              <span className="text-[13px] text-ink-3">Next payout</span>
              <p className="mt-2 num text-[22px] font-medium">{t.pot > 0 ? eth(t.pot) : "Pot fills with the next buy"}</p>
              <p className="mt-1 text-[13px] text-ink-2">
                {t.lastRoundAt ? `Last round ${ago(t.lastRoundAt)}. ` : ""}Pushed to holders automatically every few hours, weighted by hold time
              </p>
            </Card>
          </div>
        </div>
      </div>

      {!all && (
        <section aria-busy className="mt-16 border-t border-line bg-deep px-4 py-16 md:px-6">
          <Skeleton className="h-10 w-64" />
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <PosterSkeleton key={i} />
            ))}
          </div>
        </section>
      )}
      {more.length > 0 && (
        <section className="mt-16 border-t border-line bg-deep px-4 py-16 md:px-6">
          <div className="flex items-end justify-between gap-4">
            <Heading title="Keep playing" sub="More tokens on the board right now" />
            <Link to="/arcade" className="text-[14px] text-ink-2 transition-colors duration-150 hover:text-ink">
              All tokens
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {more.map((x, i) => (
              <Reveal key={x.address} delay={i * 0.05}>
                <Poster t={x} />
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
