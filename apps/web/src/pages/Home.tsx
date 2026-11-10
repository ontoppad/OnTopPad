import { lazy, Suspense, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowDown } from "lucide-react";
import { formatUnits, isAddress, parseEther } from "viem";
import { TIERS, TREASURY_BPS, HOLDERS_BPS, CREATOR_BPS, PLATFORM_BPS, feeFor } from "@ontoppad/shared";
import { useStats, useTokens, useConfig, type TokenSummary } from "../lib/api.ts";
import { quote, txUrl } from "../lib/chain.ts";
import { amount, ago, eth, usd } from "../lib/format.ts";
import { ButtonLink, Card, Num, Stamp, Stat, TokenArt, Button } from "../components/ui.tsx";
import { TokenCard } from "../components/TokenCard.tsx";
import { ContractsTable } from "../components/Contracts.tsx";

const CoinScene = lazy(() => import("../components/CoinScene.tsx"));
const AMOUNTS = ["0.001", "0.005", "0.01"];

/** Live quote for the house token — the product view under the coin. */
function QuoteCard({ token, step, ethUsd }: { token?: TokenSummary; step: number; ethUsd: number }) {
  const amountIn = AMOUNTS[step % AMOUNTS.length]!;
  const { data } = useQuery({
    queryKey: ["hero-quote", token?.address, amountIn],
    queryFn: () => quote(token!, "buy", parseEther(amountIn)),
    enabled: !!token,
    refetchInterval: 15_000,
  });
  const base = data ? Number(formatUnits(data.out, 18)) : 0;
  const bonus = data ? Number(formatUnits(data.bonus, 18)) : 0;
  return (
    <div className="w-full max-w-[380px] rounded-2xl border border-line-2 bg-card/95 p-5 shadow-[0_24px_48px_rgb(0_0_0/0.35)] backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {token && <TokenArt src={token.image} address={token.address} symbol={token.symbol} size={28} />}
          <span className="text-[14px] font-medium">Buy ${token?.symbol ?? "ONTOP"}</span>
        </div>
        <span className="num text-[12px] text-ink-3">Live quote</span>
      </div>
      <div className="mt-4 flex flex-col gap-2 num text-[13px]">
        <div className="flex justify-between">
          <span className="text-ink-3">You pay</span>
          <span>{amountIn} ETH</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-3">Base from the pool</span>
          <span className="text-ink-2">{base > 0 ? amount(base) : "Quoting"}</span>
        </div>
        <div className="flex items-center justify-between">
          <motion.span key={step} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
            <Stamp bps={token?.bonusBps ?? 500} />
          </motion.span>
          <span className="text-accent">{bonus > 0 ? `+${amount(bonus)}` : "Quoting"}</span>
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <span className="text-[13px] text-ink">You get</span>
        {base > 0 ? <Num value={base + bonus} format={amount} className="text-[24px] font-medium" /> : <span className="text-ink-3">Quoting</span>}
      </div>
      {token && base > 0 && <p className="mt-1 num text-[12px] text-ink-3">≈ {usd((base + bonus) * token.price * ethUsd)} · read from Uniswap v4 just now</p>}
    </div>
  );
}

function Pillar({ kicker, title, body, proof, children, className }: { kicker: string; title: string; body: string; proof: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`flex flex-col gap-6 p-6 md:p-8 ${className ?? ""}`}>
      <div className="flex flex-col gap-2">
        <span className="num text-[12px] text-ink-3">{kicker}</span>
        <h3 className="text-[26px] leading-tight font-semibold tracking-tight">{title}</h3>
        <p className="max-w-md text-[15px] text-ink-2">{body}</p>
      </div>
      <div className="flex-1">{children}</div>
      <p className="text-[13px] text-ink-3">
        Proof: <span className="text-ink-2">{proof}</span>
      </p>
    </Card>
  );
}

function WalletCheck() {
  const nav = useNavigate();
  const [v, setV] = useState("");
  const ok = isAddress(v.trim());
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) nav(`/rewards/${v.trim()}`);
      }}
    >
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="0x wallet address" aria-label="Wallet address" className="num h-10 flex-1 rounded-[10px] border border-line-2 bg-deep px-3 text-[13px] placeholder:text-ink-3 focus:outline-none focus:border-[var(--accent)]" />
      <Button type="submit" variant="secondary" disabled={!ok}>
        Check wallet
      </Button>
    </form>
  );
}

const FAQ = [
  {
    q: "Where do the bonus tokens come from",
    a: `Every launch locks ${TREASURY_BPS / 100}% of its supply inside OnTopHook as a bonus treasury. Each buy pays its bonus out of that treasury in the same transaction, and sell-side fees refill it. Nobody can withdraw it.`,
  },
  {
    q: "Can someone farm the bonus by buying and selling",
    a: "No. The pool fee is derived from the bonus so a buy nets at least 1% ahead of the pre-trade price, while a buy-then-sell round trip always ends below where it started. The math is in OnTopLaunchpad.feeFor and fuzz-tested.",
  },
  {
    q: "How are holder payouts split",
    a: `${HOLDERS_BPS / 100}% of pair-asset fees go to holders, ${CREATOR_BPS / 100}% to the creator and ${PLATFORM_BPS / 100}% to the platform. Holders share by balance times hold time: ${TIERS.map((t) => `${t.mult}× ${t.label.toLowerCase()}`).join(", ")}.`,
  },
  {
    q: "Do I need to stake or claim",
    a: "No. Payouts are pushed to your wallet in rounds. If a wallet cannot receive ETH, its share is parked in OnTopDistributor for it to claim any time.",
  },
  {
    q: "Can liquidity be pulled",
    a: "No. OnTopLaunchpad owns every launch position and has no function that removes liquidity. Only fee collection touches the position.",
  },
];

export default function Home() {
  const { data: stats } = useStats();
  const { data: tokens } = useTokens("hot");
  const { data: cfg } = useConfig();
  const [step, setStep] = useState(0);
  const house = tokens?.find((t) => t.symbol === "ONTOP") ?? tokens?.[0];
  const ethUsd = cfg?.ethUsd ?? stats?.ethUsd ?? 0;

  return (
    <div>
      {/* ── hero: split, text on the left, coin + live quote on the right */}
      <section className="mx-auto grid max-w-[1440px] items-center gap-8 px-4 pt-12 md:px-8 lg:min-h-[min(calc(100dvh-100px),880px)] lg:grid-cols-[1fr_1.05fr] lg:pt-0">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col gap-6">
          <span className="num text-[13px] text-ink-3">Token launchpad on Robinhood Chain</span>
          <h1 className="text-[44px] leading-[1.02] font-extrabold tracking-[-0.03em] sm:text-[64px] lg:text-[80px]">
            Start ahead.
            <br />
            <span className="relative inline-block">
              Stay paid.
              <svg className="absolute -right-10 -top-2 hidden sm:block" width="36" height="40" viewBox="0 0 36 40" aria-hidden>
                <path d="M4 18 L30 2 L24 20 Z M8 30 L34 22 L26 36 Z" fill="var(--lime)" stroke="var(--sticker-shadow)" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </span>
          </h1>
          <p className="max-w-[34rem] text-[18px] leading-[1.6] text-ink-2">
            Every buy lands with bonus tokens on top. Every holder is paid ETH from the trading, and paid more the longer they hold. Every number lives on-chain where you can check it.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/arcade" variant="primary" size="lg">
              Enter the arcade
              <ArrowRight size={18} strokeWidth={1.5} />
            </ButtonLink>
            <ButtonLink to="/launch" variant="secondary" size="lg">
              Launch a token
            </ButtonLink>
          </div>
        </motion.div>
        <div className="relative flex min-h-[520px] items-end justify-center lg:min-h-[640px]">
          <Suspense fallback={null}>
            <CoinScene onFlip={() => setStep((s) => s + 1)} />
          </Suspense>
          <div className="pointer-events-none relative z-10 mb-4 flex w-full flex-col items-center gap-3">
            <div className="pointer-events-auto w-full max-w-[380px]">
              <QuoteCard token={house} step={step} ethUsd={ethUsd} />
            </div>
            <span className="num text-[12px] text-ink-3">Drag the coin to spin it, click it to change the amount</span>
          </div>
        </div>
      </section>

      {/* ── scoreboard */}
      <section className="mx-auto max-w-[1440px] px-4 md:px-8">
        <div className="grid grid-cols-2 gap-6 rounded-2xl border border-line bg-card p-6 md:grid-cols-4 md:p-8">
          <Stat label="Tokens launched" value={stats?.tokens ?? 0} format={(v) => Math.round(v).toString()} empty="First launch pending" />
          <Stat label="Bonus paid on buys" value={stats?.bonusUsd ?? 0} format={usd} sub={stats ? `${amount(stats.bonusTokens)} tokens over ${stats.buys} buys` : undefined} empty="Waiting on the first buy" accent />
          <Stat label="Paid to holders" value={stats?.paid ?? 0} format={(v) => eth(v)} sub={stats?.paid ? `${stats.payments} payments to ${stats.paidWallets} wallets` : stats ? `${eth(stats.pot)} filling the next rounds` : undefined} empty="First round filling" />
          <Stat label="Trades" value={stats?.trades ?? 0} format={(v) => Math.round(v).toLocaleString("en-US")} sub={stats ? `${usd(stats.volumeUsd)} volume` : undefined} empty="Market opens with the first buy" />
        </div>
        {stats && (
          <p className="mt-3 num text-[12px] text-ink-3">
            Indexed to block {stats.indexed.toLocaleString("en-US")} · {stats.head - stats.indexed < 120 ? "live" : "catching up"} · last trade {stats.lastTradeAt ? ago(stats.lastTradeAt) : "pending"}
          </p>
        )}
      </section>

      {/* ── pillars */}
      <section className="mx-auto mt-24 max-w-[1440px] px-4 md:px-8">
        <div className="mb-8 flex flex-col gap-2">
          <h2 className="text-[32px] leading-tight font-semibold tracking-tight md:text-[40px]">Three rules, enforced by code</h2>
          <p className="max-w-xl text-[15px] text-ink-2">No staking, no points, no claim buttons. The contracts do it on every trade.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <Pillar className="lg:col-span-7" kicker="01" title="Ahead from block one" body="You don't start from zero. You start with an edge. Every buy gets extra tokens from the launch treasury, on top of what the pool pays." proof="bonus shown in the quote before every buy">
            <div className="grid gap-2 sm:grid-cols-3">
              {(tokens ?? []).slice(0, 3).map((t) => {
                return (
                  <Link key={t.address} to={`/token/${t.address}`} className="flex flex-col gap-3 rounded-xl border border-line bg-deep p-4 hover:border-line-2 transition-colors duration-150">
                    <div className="flex items-center gap-2">
                      <TokenArt src={t.image} address={t.address} symbol={t.symbol} size={24} />
                      <span className="num text-[13px]">${t.symbol}</span>
                    </div>
                    <Stamp bps={t.bonusBps} className="self-start" />
                    <span className="num text-[12px] text-ink-3">{t.bonusBuys ? `${amount(t.bonusPaid)} paid over ${t.bonusBuys} buys` : `${(feeFor(t.bonusBps) / 1e4).toFixed(2)}% pool fee`}</span>
                  </Link>
                );
              })}
            </div>
            <p className="mt-4 num text-[12px] text-ink-3">bonus = tokens bought × bonusBps ÷ 10,000, paid by OnTopHook.afterSwap, capped by the treasury left</p>
          </Pillar>
          <Pillar className="lg:col-span-5" kicker="02" title="Paid for patience" body="Not for the fastest. For the ones who stay. Your share of every payout grows with how long your tokens have sat in your wallet." proof="time-weighted payout tiers">
            <div className="flex flex-col gap-2">
              {TIERS.map((t, i) => (
                <div key={t.key} className="flex items-center gap-4 rounded-xl border border-line bg-deep px-4 py-3">
                  <span className="inline-flex gap-[3px]" aria-hidden>
                    {TIERS.map((x, j) => (
                      <span key={x.key} className={`h-4 w-2 rounded-[2px] ${j <= i ? "bg-lime" : "bg-raised"}`} />
                    ))}
                  </span>
                  <span className="flex-1 text-[14px]">{t.label}</span>
                  <span className="num text-[13px] text-ink-3">{i === 0 ? "day 0 to 3" : i === 1 ? "day 3 to 7" : "day 7 on"}</span>
                  <span className="num w-12 text-right text-[18px] font-medium">{t.mult}×</span>
                </div>
              ))}
              <p className="text-[12px] text-ink-3">Buying more never resets your clock. Selling only resets the tokens you sold.</p>
            </div>
          </Pillar>
          <Pillar className="lg:col-span-12" kicker="03" title="Proof, not promises" body="Every bonus and payout is public and checkable. Look up any wallet and see exactly what it got, round by round, with the transaction for each." proof="public rewards dashboard and wallet lookup">
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="flex flex-col gap-3">
                <WalletCheck />
                <Link to="/rewards" className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
                  Open the rewards dashboard <ArrowRight size={14} strokeWidth={1.5} />
                </Link>
              </div>
              <div className="flex flex-col gap-2 num text-[12px] text-ink-3">
                <span>Every round commits on-chain to: snapshot block · inputs hash · recipients · total</span>
                <span>Weights = balance × tier multiplier, rebuilt from public Transfer logs</span>
                <span>Payments that can't be delivered are parked in OnTopDistributor, never lost</span>
              </div>
            </div>
          </Pillar>
        </div>
      </section>

      {/* ── hot tokens */}
      <section className="mx-auto mt-24 max-w-[1440px] px-4 md:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-[32px] leading-tight font-semibold tracking-tight">On the board now</h2>
            <p className="text-[15px] text-ink-2">Ranked by 24h volume, straight from the indexer</p>
          </div>
          <Link to="/arcade" className="hidden sm:inline-flex items-center gap-1 text-[14px] text-ink-2 hover:text-ink">
            All tokens <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(tokens ?? []).slice(0, 6).map((t, i) => (
            <TokenCard key={t.address} t={t} rank={i + 1} />
          ))}
        </div>
      </section>

      {/* ── how a buy lands */}
      <section className="mx-auto mt-24 max-w-[1440px] px-4 md:px-8">
        <h2 className="mb-2 text-[32px] leading-tight font-semibold tracking-tight">What happens when you press buy</h2>
        <p className="mb-8 max-w-xl text-[15px] text-ink-2">One transaction, four contracts. The bonus and the trade settle together, so there is nothing to claim later.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <span className="num text-[12px] text-ink-3">The buy</span>
            <ol className="mt-4 flex flex-col">
              {[
                ["Your wallet", "sends ETH with a minimum out"],
                ["OnTopRouter.buy", "opens a Uniswap v4 unlock, passes you as the buyer"],
                ["PoolManager.swap", "fills against the locked launch liquidity"],
                ["OnTopHook.afterSwap", "pays the bonus from the token treasury"],
                ["Your wallet", "receives base + bonus in the same block"],
              ].map(([k, v], i, a) => (
                <li key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className={`grid size-7 place-items-center rounded-md num text-[12px] ${i === 3 ? "bg-lime text-lime-ink" : "bg-raised text-ink-2"}`}>{i + 1}</span>
                    {i < a.length - 1 && <span className="w-px flex-1 bg-line-2 my-1" />}
                  </div>
                  <div className="pb-4">
                    <p className="num text-[13px] text-ink">{k}</p>
                    <p className="text-[13px] text-ink-2">{v}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="p-6">
            <span className="num text-[12px] text-ink-3">The fees</span>
            <div className="mt-4 flex flex-col gap-4">
              <div className="rounded-xl border border-line bg-deep p-4">
                <p className="num text-[13px]">Pool LP fee, set per launch from its bonus</p>
                <p className="mt-1 text-[13px] text-ink-2">Accrues to the position OnTopLaunchpad owns. Anyone can call collect.</p>
              </div>
              <ArrowDown size={16} strokeWidth={1.5} className="mx-auto text-ink-3" />
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  [`${HOLDERS_BPS / 100}%`, "Holders", "OnTopDistributor pot"],
                  [`${CREATOR_BPS / 100}%`, "Creator", "claimable"],
                  [`${PLATFORM_BPS / 100}%`, "Platform", "operations"],
                ].map(([p, k, s], i) => (
                  <div key={k} className={`rounded-xl border p-3 ${i === 0 ? "border-[var(--accent)]" : "border-line"} bg-deep`}>
                    <p className={`num text-[20px] font-medium ${i === 0 ? "text-accent" : ""}`}>{p}</p>
                    <p className="text-[13px]">{k}</p>
                    <p className="text-[12px] text-ink-3">{s}</p>
                  </div>
                ))}
              </div>
              <p className="text-[13px] text-ink-2">Fees paid in the token on sells refill the bonus treasury back to its starting size. Anything beyond that is burned.</p>
            </div>
          </Card>
        </div>
      </section>

      {/* ── contracts */}
      <section className="mx-auto mt-24 max-w-[1440px] px-4 md:px-8">
        <div className="mb-6 flex flex-col gap-2">
          <h2 className="text-[32px] leading-tight font-semibold tracking-tight">The contracts behind every number</h2>
          <p className="max-w-xl text-[15px] text-ink-2">Verified source on the Robinhood Chain explorer. Read them, call them, or rebuild the numbers yourself.</p>
        </div>
        <ContractsTable />
      </section>

      {/* ── faq */}
      <section className="mx-auto mt-24 grid max-w-[1440px] gap-8 px-4 md:px-8 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-2">
          <h2 className="text-[32px] leading-tight font-semibold tracking-tight">Straight answers</h2>
          <p className="text-[15px] text-ink-2">The questions every degen asks first</p>
        </div>
        <div className="flex flex-col">
          {FAQ.map((f) => (
            <details key={f.q} className="group border-b border-line py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium">
                {f.q}
                <span className="num text-ink-3 transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-[14px] leading-6 text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── final call */}
      <section className="mx-auto mt-24 max-w-[1440px] px-4 md:px-8">
        <div className="flex flex-col items-start gap-6 rounded-2xl border border-line bg-card p-8 md:flex-row md:items-center md:justify-between md:p-12">
          <div className="flex items-center gap-6">
            <img src="/brand/logo-256.webp" alt="" width={88} height={88} className="hidden rotate-[-4deg] rounded-xl sm:block" />
            <div>
              <h2 className="text-[32px] leading-tight font-semibold tracking-tight">Your move, player one</h2>
              <p className="mt-1 text-[15px] text-ink-2">
                {house ? (
                  <>
                    ${house.symbol} pays a <span className="num">{house.bonusBps / 100}%</span> head start right now.{" "}
                    {house.lastTradeAt ? (
                      <a href={txUrl(house.launchTx)} target="_blank" rel="noreferrer" className="underline decoration-line-2 underline-offset-4 hover:text-ink">
                        See its launch
                      </a>
                    ) : null}
                  </>
                ) : (
                  "Pick a token, take the head start, hold for the payouts."
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <ButtonLink to="/arcade" variant="primary" size="lg">
              Enter the arcade
            </ButtonLink>
            <ButtonLink to="/rules" variant="secondary" size="lg">
              Read the rules
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
