import { useState } from "react";
import { Link } from "react-router";
import { buyerEdge, CREATOR_BPS, feeFor, HOLDERS_BPS, MAX_BONUS_BPS, MIN_BONUS_BPS, PLATFORM_BPS, TIERS, TREASURY_BPS } from "@ontoppad/shared";
import { useConfig } from "../lib/api.ts";
import { amount, usd } from "../lib/format.ts";
import { ContractsTable } from "../components/Contracts.tsx";
import { Band, Card, cx, Heading, Num, PageHero, pill, pillGhost, Reveal, Spec, Stamp } from "../components/ui.tsx";

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
            <input inputMode="numeric" value={base} onChange={(e) => setBase(Number(e.target.value.replace(/\D/g, "")) || 0)} className="num h-11 rounded-full border border-line-2 bg-deep px-5 text-[14px] focus:outline-none focus:border-[var(--accent)]" />
            <span className="flex flex-wrap gap-2">
              {[1_000, 10_000, 100_000, 1_000_000].map((n) => (
                <button key={n} type="button" onClick={() => setBase(n)} className={cx("num h-8 rounded-full border px-3 text-[12px] transition-colors duration-150", base === n ? "border-[var(--sticker-shadow)] bg-lime text-lime-ink" : "border-line text-ink-2 hover:text-ink")}>
                  {amount(n)}
                </button>
              ))}
            </span>
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

const STEPS = [
  ["Pick a token", "Browse the arcade. Every card shows its bonus, its holders and what it has paid out."],
  ["Read the quote", "Base tokens, bonus tokens and the total, straight from Uniswap v4, before you sign."],
  ["Buy and get more", "The bonus arrives with your swap, from the token's locked treasury, in the same block."],
  ["Hold and get paid", "Holder payouts land in ETH every few hours. The longer you hold, the bigger your share."],
];

export default function Rules() {
  const { data: cfg } = useConfig();
  const [tier, setTier] = useState(0);
  return (
    <div>
      <PageHero
        title={
          <>
            Buy it, get more.
            <br />
            Hold it, get paid.
          </>
        }
        sub="Buying a token gives you bonus tokens on top of the swap, at a rate each launch sets. Holding it pays you a share of every trade in ETH, pushed to your wallet in rounds."
      >
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/arcade" className={pill}>
            Enter the arcade
          </Link>
          <a href="#numbers" className={pillGhost}>
            Try the numbers
          </a>
        </div>
      </PageHero>

      <Band className="mt-10">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {[
            ["Supply per launch", "1,000,000,000"],
            ["Bonus treasury", `${TREASURY_BPS / 100}% locked`],
            ["Bonus range", `${MIN_BONUS_BPS / 100}% to ${MAX_BONUS_BPS / 100}%`],
            ["Fees to holders", `${HOLDERS_BPS / 100}%`],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1">
              <span className="text-[13px] opacity-70">{k}</span>
              <span className="num text-[22px] leading-tight font-semibold md:text-[30px]">{v}</span>
            </div>
          ))}
        </div>
      </Band>

      <section className="px-4 py-16 md:px-6">
        <Heading center title="How to play" sub="Four moves, all on-chain, nothing to stake or claim" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, b], i) => (
            <Reveal key={t} delay={i * 0.06}>
              <div className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-card p-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-[var(--sticker-shadow)] hover:shadow-[6px_6px_0_var(--sticker-shadow)]">
                <span className="num grid size-10 place-items-center rounded-xl border-2 border-[var(--sticker-shadow)] bg-lime text-[15px] font-semibold text-lime-ink transition-transform duration-300 group-hover:rotate-[-6deg]">{i + 1}</span>
                <span className="text-[18px] font-semibold">{t}</span>
                <p className="text-[14px] leading-6 text-ink-2">{b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="numbers" className="scroll-mt-28 border-y border-line bg-deep px-4 py-16 md:px-6">
        <Heading center title="Try the numbers" sub="Change the base output and the rate. Same formula the contracts run." className="mb-10" />
        <Reveal className="mx-auto max-w-5xl">
          <Calculator />
        </Reveal>
      </section>

      <section className="grid gap-6 px-4 py-16 md:px-6 lg:grid-cols-2">
        <Reveal>
          <Card className="h-full p-6 md:p-8">
            <h3 className="text-[22px] font-semibold">Your payout share</h3>
            <ul className="mt-4 flex flex-col gap-3 text-[14px] text-ink-2">
              <li>How much you hold. Shares are proportional, so splitting across wallets changes nothing.</li>
              <li>How long you have held. Buying more never resets your clock; selling only resets the tokens you sold.</li>
              <li>Wallets holding under {usd(cfg?.minHoldUsd ?? 1)} of a token sit out that round. Their share rolls into the next one.</li>
              <li>Payouts land in ETH, several times a day. No staking, no claiming, no points.</li>
            </ul>
            <div className="mt-6 grid grid-cols-3 gap-2" role="tablist" aria-label="Hold-time tiers">
              {TIERS.map((t, i) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tier === i}
                  onClick={() => setTier(i)}
                  className={cx(
                    "rounded-xl border p-4 text-left transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5",
                    tier === i ? "border-[var(--sticker-shadow)] bg-lime text-lime-ink shadow-[4px_4px_0_var(--sticker-shadow)]" : "border-line bg-deep",
                  )}
                >
                  <p className="num text-[24px] font-semibold">{t.mult}×</p>
                  <p className="text-[13px]">{t.label}</p>
                  <p className={cx("num text-[12px]", tier === i ? "opacity-70" : "text-ink-3")}>{i === 0 ? "0 to 3 days" : i === 1 ? "3 to 7 days" : "7+ days"}</p>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-ink-2">
              A {TIERS[tier]!.label} holding counts <span className="num text-accent">{TIERS[tier]!.mult}×</span> its balance when the round is split.{" "}
              <span className="text-ink-3">Tiers change how a payout is split, never its size.</span>
            </p>
          </Card>
        </Reveal>
        <Reveal delay={0.08}>
          <Card className="h-full p-6 md:p-8">
            <h3 className="text-[22px] font-semibold">What every launch locks in</h3>
            <ul className="mt-4 flex flex-col gap-3 text-[14px] text-ink-2">
              <li>The bonus rate, {MIN_BONUS_BPS / 100}% to {MAX_BONUS_BPS / 100}%, fixed forever at launch and the same for every wallet.</li>
              <li>A pool fee derived from that rate, so a buyer always starts at least 1% ahead and a flipper always pays.</li>
              <li>{TREASURY_BPS / 100}% of supply in OnTopHook as the bonus treasury. Sell fees refill it; any excess is burned.</li>
              <li>Pair-asset fees split {HOLDERS_BPS / 100}% holders, {CREATOR_BPS / 100}% creator, {PLATFORM_BPS / 100}% platform.</li>
              <li>93% of supply as Uniswap v4 liquidity owned by OnTopLaunchpad, which has no function to remove it.</li>
            </ul>
          </Card>
        </Reveal>
      </section>

      <section className="border-t border-line bg-deep px-4 py-16 md:px-6">
        <Heading center title="The machines behind it" sub="Every contract the app touches, verified on the explorer" className="mb-10" />
        <Reveal>
          <ContractsTable />
        </Reveal>
      </section>

      <section className="flex flex-col items-center gap-4 px-4 py-16 text-center">
        <h2 className="text-[30px] leading-tight font-semibold tracking-tight">Rules read. Time to play.</h2>
        <p className="max-w-lg text-[15px] text-ink-2">Pick a token from the board, or launch your own with the bonus rate you want</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/arcade" className={pill}>
            Enter the arcade
          </Link>
          <Link to="/launch" className={pillGhost}>
            Launch a token
          </Link>
        </div>
      </section>
    </div>
  );
}
