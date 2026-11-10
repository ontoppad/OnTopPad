import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAddress } from "viem";
import { useLeaderboard, useStats, useWalletView } from "../lib/api.ts";
import { txUrl } from "../lib/chain.ts";
import { scrollToEl } from "../lib/scroll.ts";
import { ago, amount, eth, isHouse, share, short, usd } from "../lib/format.ts";
import { AreaChart } from "../components/Chart.tsx";
import { Band, BandStat, Button, Card, cx, Heading, Num, PageHero, pill, Reveal, Skeleton, SkeletonLine, Stat, TierMeter, TokenArt } from "../components/ui.tsx";

function Lookup({ address }: { address: string }) {
  const { data, isLoading } = useWalletView(address.toLowerCase());
  const ref = useRef<HTMLDivElement>(null);
  const ready = !!data;
  useEffect(() => scrollToEl(ref.current), [address, ready]);
  if (isLoading || !data)
    return (
      <div aria-busy className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {["Bonus tokens received", "Holder payouts received", "Tokens held"].map((label) => (
          <Card key={label} className="p-5">
            <Stat label={label} value={0} format={String} empty="" loading />
          </Card>
        ))}
      </div>
    );
  const nothing = !data.payoutsCount && !data.bonusTokens && !data.holdings.length;
  return (
    <div ref={ref} className="flex scroll-mt-32 flex-col gap-4 text-left">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <Stat label="Bonus tokens received" value={data.bonusUsd} format={usd} sub={data.bonusTokens > 0 ? `${amount(data.bonusTokens)} tokens at today's price` : undefined} empty="No bonus yet, first buy gets it" />
        </Card>
        <Card className="p-5">
          <Stat label="Holder payouts received" value={data.payoutsTotal} format={(v) => eth(v)} sub={data.payoutsCount ? `${data.payoutsCount} payments · ${usd(data.payoutsUsd)}` : undefined} empty="Hold any token to join the next round" accent />
        </Card>
        <Card className="p-5">
          <Stat label="Tokens held" value={data.holdings.length} format={(v) => Math.round(v).toString()} sub={data.holdings.length ? `${usd(data.holdings.reduce((s, h) => s + h.valueUsd, 0))} total` : undefined} empty="Empty bag" />
        </Card>
      </div>
      {nothing && <p className="text-[14px] text-ink-2">This wallet hasn't touched an OnTop launch yet</p>}
      {data.payouts.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px] num">
            <thead>
              <tr className="text-left font-sans text-ink-3">
                <th className="px-5 py-3 font-normal">Token</th>
                <th className="px-5 py-3 font-normal">Round</th>
                <th className="px-5 py-3 text-right font-normal">Amount</th>
                <th className="px-5 py-3 text-right font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {data.payouts.map((p) => (
                <tr key={`${p.tx}${p.token}${p.round}`} className="border-t border-line">
                  <td className="px-5 py-3">
                    <Link to={`/token/${p.token}`} className="hover:text-ink text-ink-2">${p.symbol}</Link>
                  </td>
                  <td className="px-5 py-3 text-ink-2">#{p.round}</td>
                  <td className="px-5 py-3 text-right text-accent">{eth(p.amount, p.quote)}</td>
                  <td className="px-5 py-3 text-right">
                    <a href={txUrl(p.tx)} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink">{ago(p.ts)}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data.holdings.length > 0 && (
        <div className="grid gap-2">
          {data.holdings.map((h) => (
            <Link key={h.token} to={`/token/${h.token}`} className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-card px-4 py-3 transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-line-2">
              <TokenArt src={h.image} address={h.token} symbol={h.symbol} size={32} />
              <span className="w-24 num text-[13px]">${h.symbol}</span>
              <TierMeter tier={h.tier} next={h.next} />
              <span className="ml-auto num text-[13px] text-ink-2">{share(h.share)} of next round</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Rewards() {
  const { address } = useParams();
  const nav = useNavigate();
  const [v, setV] = useState(address ?? "");
  const { data: s } = useStats();
  const { data: lb } = useLeaderboard();

  let cum = 0;
  const points = (s?.series.payouts ?? []).map((p) => ({ t: p.d, v: (cum += p.paid) }));
  let bcum = 0;
  const bonusPoints = (s?.series.daily ?? []).map((p) => ({ t: p.d, v: (bcum += p.bonus * (s?.ethUsd ?? 0)) }));
  const chartPoints = points.length >= 1 ? points : bonusPoints;

  return (
    <div>
      <PageHero
        title="Rewards"
        sub="Everything the pad has paid out, rebuilt from on-chain events. Bonus on every buy, ETH to every holder."
      >
        <a href="#check" className={pill}>
          Check a wallet
        </a>
        {s ? <span className="num text-[12px] text-ink-3">Indexed to block {s.indexed.toLocaleString("en-US")}</span> : <SkeletonLine className="w-44 text-[12px]" />}
      </PageHero>

      <Band className="mt-10">
        <div className="grid gap-8 md:grid-cols-3">
          <BandStat label="Bonus tokens paid on buys" loading={!s} value={s?.bonusUsd ?? 0} format={usd} sub={s ? `${amount(s.bonusTokens)} tokens over ${s.buys} buys, at today's prices` : undefined} empty="First buy pending" />
          <BandStat label="Paid to holders" loading={!s} value={s?.paid ?? 0} format={(v) => eth(v)} sub={s?.paid ? `${s.rounds} rounds · ${s.payments} payments · ${s.paidWallets} wallets` : undefined} empty="Round 1 filling" />
          <BandStat label="In the pots right now" loading={!s} value={s?.pot ?? 0} format={(v) => eth(v)} sub={s ? `${usd(s.potUsd)} waiting for the next rounds` : undefined} empty="Fills with the next buy" />
        </div>
      </Band>

      <section className="grid gap-6 px-4 py-16 md:px-6 lg:grid-cols-[2fr_1fr]">
        <Reveal>
          <Card className="h-full p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <span className="text-[17px] font-semibold">{points.length ? "Holder payouts, cumulative ETH" : "Bonus paid to buyers, cumulative USD"}</span>
              {s ? <Num value={points.length ? s.paid : s.bonusUsd} format={points.length ? (v) => eth(v) : usd} className="text-[14px] text-ink-2" /> : <SkeletonLine className="w-20 text-[14px]" />}
            </div>
            {chartPoints.length ? <AreaChart points={chartPoints.length === 1 ? [{ t: chartPoints[0]!.t - 86_400, v: 0 }, chartPoints[0]!] : chartPoints} format={points.length ? (v) => eth(v, "") : usd} /> : !s ? (
              <Skeleton className="h-[280px]" />
            ) : (
              <div className="grid h-[280px] place-items-center rounded-xl border border-dashed border-line-2 px-6 text-center text-[14px] text-ink-2">The line starts with the first bonus. Every buy after that draws it higher</div>
            )}
          </Card>
        </Reveal>
        <Reveal delay={0.08}>
          <Card className="h-full p-6">
            <span className="text-[17px] font-semibold">High scores</span>
            <p className="mt-1 text-[13px] text-ink-3">{lb?.earners.length ? "Most ETH received from holder payouts" : "Most bonus received on buys, at today's prices"}</p>
            {!lb && (
              <div aria-busy className="mt-4 flex flex-col gap-1">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="flex h-10 items-center gap-3 px-3">
                    <Skeleton className="size-6 rounded-full" />
                    <SkeletonLine className="flex-1 text-[13px]" />
                    <SkeletonLine className="w-16 text-[13px]" />
                  </div>
                ))}
              </div>
            )}
            {lb && !lb.earners.length && !lb.bonus.length && <p className="mt-4 text-[14px] text-ink-2">The first buy puts a wallet on the board. Top spot is open</p>}
            <ol className="mt-4 flex flex-col gap-1">
              {(lb?.earners.length
                ? lb.earners.slice(0, 8).map((e) => ({ account: e.account, v: eth(e.amount) }))
                : (lb?.bonus ?? []).slice(0, 8).map((e) => ({ account: e.account, v: `${usd(e.valueUsd)} bonus` }))
              ).map((e, i) => (
                <li key={e.account}>
                  <Link to={isHouse(e.account) ? "/rules" : `/rewards/${e.account}`} className="group flex h-10 items-center gap-3 rounded-full px-3 transition-[background-color,transform] duration-200 hover:translate-x-1 hover:bg-raised">
                    <span className={cx("num grid size-6 place-items-center rounded-full text-[11px]", i === 0 ? "bg-lime font-semibold text-lime-ink" : i < 3 ? "border border-line-2 text-ink" : "text-ink-3")}>{i + 1}</span>
                    <span className="num flex-1 text-[13px] text-ink-2 group-hover:text-ink">{short(e.account)}</span>
                    <span className="num text-[13px]">{e.v}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
        </Reveal>
      </section>

      <section id="check" className="scroll-mt-28 border-t border-line bg-deep px-4 py-16 md:px-6">
        <Heading center title="Check a wallet" sub="Bonus tokens and holder payouts a wallet has received, per token, since the pad opened" />
        <form
          className="mx-auto mt-8 flex max-w-2xl flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (isAddress(v.trim())) nav(`/rewards/${v.trim()}`);
          }}
        >
          <input value={v} onChange={(e) => setV(e.target.value)} placeholder="0x wallet address" aria-label="Wallet address" className="num h-11 flex-1 rounded-full border border-line-2 bg-card px-5 text-[13px] placeholder:text-ink-3 focus:border-[var(--accent)] focus:outline-none" />
          <Button type="submit" variant="primary" disabled={!isAddress(v.trim())} className="h-11 rounded-full px-6">
            Look up
          </Button>
        </form>
        {address && isAddress(address) && (
          <div className="mt-10">
            <Lookup address={address} />
          </div>
        )}
        <p className="mt-6 text-center text-[12px] text-ink-3">Bonus tokens are valued at today's prices. Holder payouts are shown in the pair asset they were paid in.</p>
      </section>
    </div>
  );
}
