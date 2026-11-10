import { Link, useParams } from "react-router";
import { useWalletView } from "../lib/api.ts";
import { txUrl } from "../lib/chain.ts";
import { ago, amount, eth, share, short, usd } from "../lib/format.ts";
import { useWallet } from "../lib/wallet.tsx";
import { AddressChip, Button, ButtonLink, Card, Skeleton, Stat, TierMeter, TokenArt } from "../components/ui.tsx";

export default function Portfolio() {
  const params = useParams();
  const w = useWallet();
  const address = (params.address ?? w.address)?.toLowerCase();
  const own = !params.address || params.address.toLowerCase() === w.address?.toLowerCase();
  const { data, isLoading } = useWalletView(address);

  if (!address) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        <img src="/brand/logo-256.webp" alt="" width={96} height={96} className="rotate-[-4deg] rounded-xl" />
        <h1 className="text-[28px] font-semibold">Player one, insert coin</h1>
        <p className="text-[15px] text-ink-2">Connect a wallet to see your bags, your hold-time tiers and every payout you've received</p>
        <div className="flex gap-3">
          <Button variant="primary" size="lg" onClick={w.openPicker}>
            Insert coin
          </Button>
          <ButtonLink to="/rewards" variant="secondary" size="lg">
            Look up any wallet
          </ButtonLink>
        </div>
      </div>
    );
  }

  const value = data?.holdings.reduce((s, h) => s + h.valueUsd, 0) ?? 0;
  const next = data?.holdings.reduce((s, h) => s + h.nextPayout, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-10 md:px-8">
      <div className="flex flex-col gap-2">
        <span className="num text-[13px] text-ink-3">{own ? "P1 · your run" : "Player"}</span>
        <h1 className="num text-[30px] leading-tight font-semibold tracking-tight">{short(address)}</h1>
        <AddressChip address={address} label="View on explorer" />
      </div>

      {isLoading || !data ? (
        <Skeleton className="mt-8 h-64" />
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-6 rounded-2xl border border-line bg-card p-6 md:grid-cols-4">
            <Stat label="Bag value" value={value} format={usd} sub={data.holdings.length ? `${data.holdings.length} tokens` : undefined} empty="Empty bag" />
            <Stat label="Next payouts" value={next} format={(v) => eth(v)} sub={next > 0 ? "estimated share of current pots" : undefined} empty="Hold to qualify" accent />
            <Stat label="Payouts received" value={data.payoutsTotal} format={(v) => eth(v)} sub={data.payoutsCount ? `${data.payoutsCount} payments` : undefined} empty="First round soon" />
            <Stat label="Bonus received" value={data.bonusUsd} format={usd} sub={data.bonusTokens ? `${amount(data.bonusTokens)} tokens` : undefined} empty="Buy to get it" />
          </div>

          <h2 className="mt-12 text-[22px] font-semibold">Bags and tiers</h2>
          <div className="mt-4 grid gap-2">
            {data.holdings.map((h) => (
              <Link key={h.token} to={`/token/${h.token}`} className="grid items-center gap-3 rounded-xl border border-line bg-card px-4 py-4 transition-colors duration-150 hover:border-line-2 md:grid-cols-[2fr_2fr_1fr_1fr_1fr]">
                <span className="flex items-center gap-3">
                  <TokenArt src={h.image} address={h.token} symbol={h.symbol} size={36} />
                  <span className="flex flex-col">
                    <span className="text-[14px] font-medium">{h.name}</span>
                    <span className="num text-[12px] text-ink-3">${h.symbol}</span>
                  </span>
                </span>
                <TierMeter tier={h.tier} next={h.next} />
                <span className="num text-[13px] md:text-right">{amount(h.balance)}</span>
                <span className="num text-[13px] text-ink-2 md:text-right">{usd(h.valueUsd)}</span>
                <span className="num text-[13px] text-accent md:text-right">{h.nextPayout > 0 ? `${eth(h.nextPayout)} next` : `${share(h.share)} share`}</span>
              </Link>
            ))}
            {data.holdings.length === 0 && (
              <Card className="flex flex-col items-start gap-3 p-6">
                <p className="text-[15px]">{own ? "No bags yet. Every buy comes with a head start." : "This wallet holds no OnTop tokens right now."}</p>
                <ButtonLink to="/arcade" variant="primary">
                  Find a token
                </ButtonLink>
              </Card>
            )}
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-[22px] font-semibold">Payouts</h2>
              <Card className="mt-4 overflow-hidden">
                {data.payouts.length ? (
                  data.payouts.slice(0, 20).map((p) => (
                    <a key={`${p.tx}${p.token}`} href={txUrl(p.tx)} target="_blank" rel="noreferrer" className="flex items-center justify-between border-b border-line px-5 py-3 text-[13px] last:border-0 hover:bg-raised/50">
                      <span>
                        ${p.symbol} <span className="num text-ink-3">round {p.round}</span>
                      </span>
                      <span className="num text-accent">{eth(p.amount, p.quote)}</span>
                      <span className="num text-ink-3">{ago(p.ts)}</span>
                    </a>
                  ))
                ) : (
                  <p className="p-5 text-[14px] text-ink-2">Payouts land here automatically after each round. Nothing to claim.</p>
                )}
              </Card>
            </div>
            <div>
              <h2 className="text-[22px] font-semibold">Trades</h2>
              <Card className="mt-4 overflow-hidden">
                {data.trades.length ? (
                  data.trades.slice(0, 20).map((t) => (
                    <a key={`${t.tx}${t.ts}`} href={txUrl(t.tx)} target="_blank" rel="noreferrer" className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b border-line px-5 py-3 text-[13px] last:border-0 hover:bg-raised/50">
                      <span className={t.side === "buy" ? "text-up" : "text-down-ink"}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                      <span className="num text-ink-2">{amount(t.tokenAmount)}</span>
                      <span className="num text-accent">{t.bonus > 0 ? `+${amount(t.bonus)}` : ""}</span>
                      <span className="num text-ink-3">{ago(t.ts)}</span>
                    </a>
                  ))
                ) : (
                  <p className="p-5 text-[14px] text-ink-2">No trades yet</p>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
