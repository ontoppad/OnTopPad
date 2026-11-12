import { Link, useParams } from "react-router";
import { useWalletView, type WalletView } from "../lib/api.ts";
import { txUrl } from "../lib/chain.ts";
import { ago, amount, eth, share, short, usd } from "../lib/format.ts";
import { useWallet } from "../lib/wallet.tsx";
import { Art, PosterSkeleton } from "../components/TokenCard.tsx";
import { PetPen } from "../components/Pet.tsx";
import { AddressChip, Band, BandStat, Card, Heading, PageHero, pill, pillGhost, Reveal, Skeleton, SkeletonRows, Stamp, TierMeter } from "../components/ui.tsx";

/** A bag on the shelf: the token's poster with your value on it, your tier and your next cut underneath. */
function Bag({ h }: { h: WalletView["holdings"][number] }) {
  return (
    <Link to={`/token/${h.token}`} className="group flex flex-col gap-2">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-line bg-raised transition-[transform,border-color,box-shadow] duration-300 ease-out group-hover:-translate-y-1 group-hover:border-[var(--sticker-shadow)] group-hover:shadow-[4px_4px_0_var(--sticker-shadow)]">
        <Art t={{ image: h.image, address: h.token, symbol: h.symbol }} className="transition-transform duration-500 ease-out group-hover:scale-[1.06]" />
        <Stamp bps={h.bonusBps} className="absolute left-2 top-2 text-[11px]" />
        <span className="num absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{usd(h.valueUsd)}</span>
      </div>
      <span className="truncate text-[13px] text-ink">
        {h.name} <span className="num text-ink-3">${h.symbol}</span>
      </span>
      <TierMeter tier={h.tier} compact />
      <span className="num text-[12px] text-ink-3">
        {amount(h.balance)} · <span className="text-accent">{h.nextPayout > 0 ? `${eth(h.nextPayout)} next` : `${share(h.share)} share`}</span>
      </span>
    </Link>
  );
}

export default function Portfolio() {
  const params = useParams();
  const w = useWallet();
  const address = (params.address ?? w.address)?.toLowerCase();
  const own = !params.address || params.address.toLowerCase() === w.address?.toLowerCase();
  const { data, isLoading } = useWalletView(address);

  if (!address) {
    return (
      <PageHero title="Player one, insert coin" sub="Connect a wallet to see your bags, your hold-time tiers and every payout you've received">
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={w.openPicker} className={pill}>
            Insert coin
          </button>
          <Link to="/rewards" className={pillGhost}>
            Look up any wallet
          </Link>
        </div>
      </PageHero>
    );
  }

  const bags = [...(data?.holdings ?? [])].sort((a, b) => b.valueUsd - a.valueUsd);
  const value = bags.reduce((s, h) => s + h.valueUsd, 0);
  const next = bags.reduce((s, h) => s + h.nextPayout, 0);

  return (
    <div>
      <PageHero art={bags[0]?.image} kicker={own ? "P1 · your run" : "Player profile"} title={<span className="num text-[34px] md:text-[52px]">{short(address)}</span>}>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <AddressChip address={address} label="View on explorer" className="rounded-full border border-line-2 bg-card/80 px-3 py-1 backdrop-blur" />
          <Link to={`/rewards/${address}`} className="rounded-full border border-line-2 bg-card/80 px-3 py-1.5 text-[13px] text-ink-2 backdrop-blur transition-colors duration-150 hover:text-ink">
            Rewards breakdown
          </Link>
        </div>
      </PageHero>

      {isLoading || !data ? (
        <div aria-busy>
          <Band className="mt-10">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {["Bag value", "Next payouts", "Payouts received", "Bonus received"].map((label) => (
                <BandStat key={label} label={label} value={0} format={String} empty="" loading />
              ))}
            </div>
          </Band>
          <section className="px-4 py-16 md:px-6">
            <Skeleton className="h-10 w-64" />
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <PosterSkeleton key={i} />
              ))}
            </div>
          </section>
          <section className="grid gap-6 border-t border-line bg-deep px-4 py-16 md:px-6 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i}>
                <Skeleton className="h-10 w-48" />
                <Card className="mt-6 overflow-hidden">
                  <SkeletonRows rows={5} />
                </Card>
              </div>
            ))}
          </section>
        </div>
      ) : (
        <>
          <Band className="mt-10">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              <BandStat label="Bag value" value={value} format={usd} sub={bags.length ? `${bags.length} tokens` : undefined} empty="Empty bag" />
              <BandStat label="Next payouts" value={next} format={(v) => eth(v)} sub={next > 0 ? "estimated share of current pots" : undefined} empty="Hold to qualify" />
              <BandStat label="Payouts received" value={data.payoutsTotal} format={(v) => eth(v)} sub={data.payoutsCount ? `${data.payoutsCount} payments` : undefined} empty="First round soon" />
              <BandStat label="Bonus received" value={data.bonusUsd} format={usd} sub={data.bonusTokens ? `${amount(data.bonusTokens)} tokens` : undefined} empty="Buy to get it" />
            </div>
          </Band>

          <PetPen view={data} own={own} />

          <section className="px-4 py-16 md:px-6">
            <Heading title="Bags and tiers" sub={bags.length ? "Biggest bag first · hold longer to climb from Rookie to Legend" : undefined} />
            {bags.length ? (
              <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {bags.map((h, i) => (
                  <Reveal key={h.token} delay={Math.min(i, 8) * 0.04}>
                    <Bag h={h} />
                  </Reveal>
                ))}
              </div>
            ) : (
              <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-12 text-center">
                <p className="text-[18px]">{own ? "No bags yet. Every buy comes with a head start." : "This wallet holds no OnTop tokens right now."}</p>
                <Link to="/arcade" className={pill}>
                  Find a token
                </Link>
              </div>
            )}
          </section>

          <section className="grid gap-6 border-t border-line bg-deep px-4 py-16 md:px-6 lg:grid-cols-2">
            <Reveal>
              <Heading title="Payouts" sub="Pushed to the wallet every round, nothing to claim" />
              <Card className="mt-6 overflow-hidden">
                {data.payouts.length ? (
                  data.payouts.slice(0, 20).map((p) => (
                    <a key={`${p.tx}${p.token}`} href={txUrl(p.tx)} target="_blank" rel="noreferrer" className="flex items-center justify-between border-b border-line px-5 py-3 text-[13px] transition-colors duration-150 last:border-0 hover:bg-raised">
                      <span>
                        ${p.symbol} <span className="num text-ink-3">round {p.round}</span>
                      </span>
                      <span className="num text-accent">{eth(p.amount, p.quote)}</span>
                      <span className="num text-ink-3">{ago(p.ts)}</span>
                    </a>
                  ))
                ) : (
                  <p className="p-5 text-[14px] text-ink-2">Payouts land here automatically after each round</p>
                )}
              </Card>
            </Reveal>
            <Reveal delay={0.08}>
              <Heading title="Trades" sub="Every buy shows the bonus that came with it" />
              <Card className="mt-6 overflow-hidden">
                {data.trades.length ? (
                  data.trades.slice(0, 20).map((t) => (
                    <a key={`${t.tx}${t.ts}`} href={txUrl(t.tx)} target="_blank" rel="noreferrer" className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b border-line px-5 py-3 text-[13px] transition-colors duration-150 last:border-0 hover:bg-raised">
                      <span className={t.side === "buy" ? "text-up" : "text-down-ink"}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                      <span className="num text-ink-2">{amount(t.tokenAmount)}</span>
                      <span className="num text-accent">{t.bonus > 0 ? `+${amount(t.bonus)}` : ""}</span>
                      <span className="num text-ink-3">{ago(t.ts)}</span>
                    </a>
                  ))
                ) : (
                  <p className="p-5 text-[14px] text-ink-2">The first trade shows up here a few seconds after it lands</p>
                )}
              </Card>
            </Reveal>
          </section>
        </>
      )}
    </div>
  );
}
