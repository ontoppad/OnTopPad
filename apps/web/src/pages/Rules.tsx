import { useState } from "react";
import { buyerEdge, CREATOR_BPS, feeFor, HOLDERS_BPS, MAX_BONUS_BPS, MIN_BONUS_BPS, PLATFORM_BPS, TIERS, TREASURY_BPS } from "@ontoppad/shared";
import { useConfig } from "../lib/api.ts";
import { amount, usd } from "../lib/format.ts";
import { ContractsTable } from "../components/Contracts.tsx";
import { ButtonLink, Card, Num, Spec, Stamp } from "../components/ui.tsx";

function Calculator() {
  const [bonus, setBonus] = useState(500);
  const [base, setBase] = useState(10_000);
  const fee = feeFor(bonus) / 1e6;
  const extra = (base * bonus) / 1e4;
  return (
    <Card className="p-6 md:p-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <label className="flex flex-col gap-2">
            <span className="text-[13px] text-ink-2">Base tokens out of the pool</span>
            <input inputMode="numeric" value={base} onChange={(e) => setBase(Number(e.target.value.replace(/\D/g, "")) || 0)} className="num h-10 rounded-[10px] border border-line-2 bg-deep px-3 text-[14px] focus:outline-none focus:border-[var(--accent)]" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="flex items-center justify-between text-[13px] text-ink-2">
              Bonus rate, set per launch <Stamp bps={bonus} />
            </span>
            <input type="range" min={MIN_BONUS_BPS} max={MAX_BONUS_BPS} step={50} value={bonus} onChange={(e) => setBonus(Number(e.target.value))} aria-label="Bonus rate" />
          </label>
        </div>
        <div className="flex flex-col gap-1">
          <Spec k="Base tokens" v={amount(base)} />
          <Spec k={`Bonus +${bonus / 100}%`} v={<span className="text-accent">+{amount(extra)}</span>} />
          <Spec k="Pool fee on this launch" v={`${(fee * 100).toFixed(2)}%`} />
          <Spec k="Net edge vs pre-trade price" v={`+${(buyerEdge(bonus) * 100).toFixed(2)}%`} />
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-[13px]">You receive</span>
            <Num value={base + extra} format={amount} className="text-[32px] font-medium" />
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Rules() {
  const { data: cfg } = useConfig();
  return (
    <div className="mx-auto px-4 pt-10 md:px-6">
      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div className="flex flex-col gap-4">
          <h1 className="text-[44px] leading-[1.05] font-extrabold tracking-[-0.03em] md:text-[56px]">
            Buy it, get more.
            <br />
            Hold it, get paid.
          </h1>
          <p className="max-w-2xl text-[17px] leading-7 text-ink-2">
            On ONTOPPAD, buying a token gives you bonus tokens on top of the swap, at a rate each launch sets. Holding it pays you a share of every trade in ETH, pushed to your wallet in rounds. Nothing to stake, nothing to claim.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 num text-[12px]">
          {[
            ["Supply per launch", "1,000,000,000"],
            ["Bonus treasury", `${TREASURY_BPS / 100}% locked`],
            ["Bonus range", `${MIN_BONUS_BPS / 100}% to ${MAX_BONUS_BPS / 100}%`],
            ["Fees to holders", `${HOLDERS_BPS / 100}%`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-card p-4">
              <p className="text-ink-3">{k}</p>
              <p className="mt-1 text-[16px] text-ink">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="mt-16 grid gap-4 md:grid-cols-4">
        {[
          ["Pick a token", "Browse the arcade. Every card shows its bonus, its holders and what it has paid out."],
          ["Read the quote", "Base tokens, bonus tokens and the total, straight from Uniswap v4, before you sign."],
          ["Buy and get more", "The bonus arrives with your swap, from the token's locked treasury, in the same block."],
          ["Hold and get paid", "Holder payouts land in ETH every few hours. The longer you hold, the bigger your share."],
        ].map(([t, b], i) => (
          <Card key={t} className="flex flex-col gap-3 p-6">
            <span className="num grid size-8 place-items-center rounded-md bg-raised text-[13px] text-ink-2">{i + 1}</span>
            <span className="text-[17px] font-semibold">{t}</span>
            <p className="text-[14px] text-ink-2">{b}</p>
          </Card>
        ))}
      </section>

      <section className="mt-16">
        <h2 className="text-[28px] font-semibold tracking-tight">Try the numbers</h2>
        <p className="mb-6 mt-1 text-[15px] text-ink-2">Change the base output and the rate. Same formula the contracts run.</p>
        <Calculator />
      </section>

      <section className="mt-16 grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-[20px] font-semibold">Your payout share</h3>
          <ul className="mt-4 flex flex-col gap-3 text-[14px] text-ink-2">
            <li>How much you hold. Shares are proportional, so splitting across wallets changes nothing.</li>
            <li>How long you have held. Buying more never resets your clock; selling only resets the tokens you sold.</li>
            <li>Wallets holding under {usd(cfg?.minHoldUsd ?? 1)} of a token sit out that round. Their share rolls into the next one.</li>
            <li>Payouts land in ETH, several times a day. No staking, no claiming, no points.</li>
          </ul>
          <div className="mt-6 grid grid-cols-3 gap-2">
            {TIERS.map((t, i) => (
              <div key={t.key} className="rounded-xl border border-line bg-deep p-4">
                <p className="num text-[22px] font-medium">{t.mult}×</p>
                <p className="text-[13px]">{t.label}</p>
                <p className="num text-[12px] text-ink-3">{i === 0 ? "0 to 3 days" : i === 1 ? "3 to 7 days" : "7+ days"}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-ink-3">Tiers change how a payout is split, never its size. A payout is exactly what the token's trading produced.</p>
        </Card>
        <Card className="p-6">
          <h3 className="text-[20px] font-semibold">What every launch locks in</h3>
          <ul className="mt-4 flex flex-col gap-3 text-[14px] text-ink-2">
            <li>The bonus rate, {MIN_BONUS_BPS / 100}% to {MAX_BONUS_BPS / 100}%, fixed forever at launch and the same for every wallet.</li>
            <li>A pool fee derived from that rate, so a buyer always starts at least 1% ahead and a flipper always pays.</li>
            <li>{TREASURY_BPS / 100}% of supply in OnTopHook as the bonus treasury. Sell fees refill it; any excess is burned.</li>
            <li>Pair-asset fees split {HOLDERS_BPS / 100}% holders, {CREATOR_BPS / 100}% creator, {PLATFORM_BPS / 100}% platform.</li>
            <li>93% of supply as Uniswap v4 liquidity owned by OnTopLaunchpad, which has no function to remove it.</li>
          </ul>
        </Card>
      </section>

      <section className="mt-16">
        <h2 className="mb-6 text-[28px] font-semibold tracking-tight">Contracts</h2>
        <ContractsTable />
      </section>

      <section className="mt-16 flex flex-wrap gap-3">
        <ButtonLink to="/arcade" variant="primary" size="lg">
          Enter the arcade
        </ButtonLink>
        <ButtonLink to="/launch" variant="secondary" size="lg">
          Launch a token
        </ButtonLink>
      </section>
    </div>
  );
}
