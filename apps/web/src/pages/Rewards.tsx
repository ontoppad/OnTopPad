import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAddress } from "viem";
import { useLeaderboard, useStats, useWalletView } from "../lib/api.ts";
import { txUrl } from "../lib/chain.ts";
import { ago, amount, eth, short, usd } from "../lib/format.ts";
import { AreaChart } from "../components/Chart.tsx";
import { Button, Card, Num, Skeleton, Stat, TierMeter, TokenArt } from "../components/ui.tsx";

function Lookup({ address }: { address: string }) {
  const { data, isLoading } = useWalletView(address.toLowerCase());
  if (isLoading || !data) return <Skeleton className="h-40" />;
  const nothing = !data.payoutsCount && !data.bonusTokens && !data.holdings.length;
  return (
    <div className="flex flex-col gap-4">
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
      {nothing && <p className="text-[14px] text-ink-2">This wallet hasn't touched an OnTop launch yet.</p>}
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
            <Link key={h.token} to={`/token/${h.token}`} className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-card px-4 py-3 hover:border-line-2 transition-colors duration-150">
              <TokenArt src={h.image} address={h.token} symbol={h.symbol} size={32} />
              <span className="w-24 num text-[13px]">${h.symbol}</span>
              <TierMeter tier={h.tier} next={h.next} />
              <span className="ml-auto num text-[13px] text-ink-2">{h.share.toFixed(2)}% of next round</span>
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
    <div className="mx-auto max-w-[1440px] px-4 pt-10 md:px-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="flex flex-col gap-2">
          <h1 className="text-[36px] leading-tight font-semibold tracking-tight">Rewards</h1>
          <p className="max-w-2xl text-[15px] text-ink-2">Everything the pad has paid out, rebuilt from on-chain events. Check any wallet below.</p>
        </div>
        {s && <span className="num text-[12px] text-ink-3">Indexed to block {s.indexed.toLocaleString("en-US")}</span>}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card className="p-6">
          <Stat label="Bonus tokens paid on buys" value={s?.bonusUsd ?? 0} format={usd} sub={s ? `${amount(s.bonusTokens)} tokens over ${s.buys} buys, at today's prices` : undefined} empty="First buy pending" />
        </Card>
        <Card className="p-6">
          <Stat label="Paid to holders" value={s?.paid ?? 0} format={(v) => eth(v)} sub={s?.paid ? `${s.rounds} rounds · ${s.payments} payments · ${s.paidWallets} wallets` : undefined} empty="Round 1 filling" accent />
        </Card>
        <Card className="p-6">
          <Stat label="In the pots right now" value={s?.pot ?? 0} format={(v) => eth(v)} sub={s ? `${usd(s.potUsd)} waiting for the next rounds` : undefined} empty="Fills with the next buy" />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <span className="text-[14px] font-medium">{points.length ? "Holder payouts, cumulative ETH" : "Bonus paid to buyers, cumulative USD"}</span>
            {s && <Num value={points.length ? s.paid : s.bonusUsd} format={points.length ? (v) => eth(v) : usd} className="text-[14px] text-ink-2" />}
          </div>
          {chartPoints.length ? <AreaChart points={chartPoints.length === 1 ? [{ t: chartPoints[0]!.t - 86_400, v: 0 }, chartPoints[0]!] : chartPoints} format={points.length ? (v) => eth(v, "") : usd} /> : <Skeleton className="h-[280px]" />}
        </Card>
        <Card className="p-6">
          <span className="text-[14px] font-medium">High scores</span>
          <p className="mt-1 text-[13px] text-ink-3">{lb?.earners.length ? "Most ETH received from holder payouts" : "Most bonus received on buys, at today's prices"}</p>
          <ol className="mt-4 flex flex-col gap-1">
            {(lb?.earners.length ? lb.earners : []).slice(0, 8).map((e, i) => (
              <li key={e.account}>
                <Link to={`/rewards/${e.account}`} className="flex h-9 items-center gap-3 rounded-lg px-2 hover:bg-raised transition-colors duration-150">
                  <span className={`num w-6 text-[12px] ${i === 0 ? "text-accent" : "text-ink-3"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="num flex-1 text-[13px] text-ink-2">{short(e.account)}</span>
                  <span className="num text-[13px]">{eth(e.amount)}</span>
                </Link>
              </li>
            ))}
            {!lb?.earners.length &&
              (lb?.bonus ?? []).slice(0, 8).map((e, i) => (
                <li key={e.account}>
                  <Link to={`/rewards/${e.account}`} className="flex h-9 items-center gap-3 rounded-lg px-2 hover:bg-raised transition-colors duration-150">
                    <span className="num w-6 text-[12px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                    <span className="num flex-1 text-[13px] text-ink-2">{short(e.account)}</span>
                    <span className="num text-[13px]">{usd(e.valueUsd)} bonus</span>
                  </Link>
                </li>
              ))}
          </ol>
        </Card>
      </div>

      <Card className="mt-4 p-6">
        <span className="text-[14px] font-medium">Check a wallet</span>
        <p className="mt-1 text-[13px] text-ink-3">Bonus tokens and holder payouts a wallet has received, per token, since the pad opened</p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (isAddress(v.trim())) nav(`/rewards/${v.trim()}`);
          }}
        >
          <input value={v} onChange={(e) => setV(e.target.value)} placeholder="0x wallet address" aria-label="Wallet address" className="num h-10 flex-1 rounded-[10px] border border-line-2 bg-deep px-3 text-[13px] placeholder:text-ink-3 focus:outline-none focus:border-[var(--accent)]" />
          <Button type="submit" variant="primary" disabled={!isAddress(v.trim())}>
            Look up
          </Button>
        </form>
        {address && isAddress(address) && (
          <div className="mt-6">
            <Lookup address={address} />
          </div>
        )}
      </Card>
      <p className="mt-3 text-[12px] text-ink-3">Bonus tokens are valued at today's prices. Holder payouts are shown in the pair asset they were paid in.</p>
    </div>
  );
}
