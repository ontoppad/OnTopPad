import { ExternalLink } from "lucide-react";
import { useMarket } from "../lib/api.ts";
import { ago, pct, price, usd } from "../lib/format.ts";
import { ButtonLink, cx, SkeletonRows, TokenArt } from "./ui.tsx";

const COLS = "grid grid-cols-[28px_1fr_auto] items-center gap-3 md:grid-cols-[36px_1.6fr_1fr_0.8fr_1fr_1fr_0.7fr_24px] md:gap-4";

/** What the rest of Robinhood Chain is trading right now, so the pad sits inside a live market. */
export function ChainMarket({ limit = 12, className }: { limit?: number; className?: string }) {
  const { data } = useMarket();
  if (data && !data.items.length) return null;
  const rows = data?.items.slice(0, limit);
  return (
    <section data-ch="On chain" className={cx("px-4 py-24 md:px-6", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="num text-[13px] text-ink-3">[ robinhood chain · live ]</span>
          <h2 className="font-title mt-3 text-[30px] leading-[1.05] md:text-[48px]">What the chain is trading</h2>
          <p className="mt-2 max-w-xl text-[15px] text-ink-2">The busiest and newest pools across Robinhood Chain mainnet, every DEX, refreshed every 2 minutes. None of them pay a bonus on buys. Yours can.</p>
        </div>
        <ButtonLink to="/launch" variant="primary">
          Launch with a bonus
        </ButtonLink>
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-line bg-card">
        <div className={cx(COLS, "num border-b border-line px-5 py-3 text-[12px] text-ink-3")}>
          <span>#</span>
          <span>token</span>
          <span className="text-right md:text-left">price · 24h</span>
          <span className="hidden md:block">24h</span>
          <span className="hidden md:block">volume 24h</span>
          <span className="hidden md:block">liquidity</span>
          <span className="hidden md:block">txns</span>
          <span className="hidden md:block" />
        </div>
        {!rows ? (
          <SkeletonRows rows={8} />
        ) : (
          rows.map((t, i) => (
            <a
              key={t.address}
              href={`https://www.geckoterminal.com/robinhood/pools/${t.pool}`}
              target="_blank"
              rel="noreferrer"
              className={cx(COLS, "group border-b border-line px-5 py-3 transition-colors duration-150 last:border-0 hover:bg-raised")}
            >
              <span className="num text-[13px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex min-w-0 items-center gap-3">
                <TokenArt src={t.image} address={t.address} symbol={t.symbol} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{t.name}</span>
                  <span className="num block truncate text-[12px] text-ink-3">
                    ${t.symbol} · {t.dex} · {usd(t.fdvUsd)} cap
                  </span>
                </span>
              </span>
              <span className="num flex flex-col items-end text-[13px] md:items-start">
                {price(t.priceUsd)}
                <span className={cx("text-[12px] md:hidden", t.change24h >= 0 ? "text-up" : "text-down-ink")}>{t.change24h ? pct(t.change24h, 1) : "flat"}</span>
              </span>
              <span className={cx("num hidden text-[13px] md:block", t.change24h >= 0 ? "text-up" : "text-down-ink")}>{t.change24h ? pct(t.change24h, 1) : "flat"}</span>
              <span className="num hidden text-[13px] md:block">{usd(t.volume24hUsd)}</span>
              <span className="num hidden text-[13px] md:block">{usd(t.liquidityUsd)}</span>
              <span className="num hidden text-[13px] text-ink-2 md:block">{t.txns24h.toLocaleString("en-US")}</span>
              <ExternalLink size={14} strokeWidth={1.5} className="hidden text-ink-3 transition-colors duration-150 group-hover:text-ink md:block" />
            </a>
          ))
        )}
      </div>
      {data?.updatedAt ? <p className="num mt-4 text-[12px] text-ink-3">GeckoTerminal feed · updated {ago(data.updatedAt)}</p> : null}
    </section>
  );
}
