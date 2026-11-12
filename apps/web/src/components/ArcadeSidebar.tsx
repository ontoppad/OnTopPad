import { useState } from "react";
import { Link } from "react-router";
import { useActivity, useStats, useTokens, type ActivityItem, type TokenSummary } from "../lib/api.ts";
import { HOUSE_SYMBOL, network } from "../lib/chain.ts";
import { ago, bps, eth, or, pct, short, usd } from "../lib/format.ts";
import { change } from "./TokenCard.tsx";
import { cx, Segmented, Skeleton, SkeletonLine, TokenArt } from "./ui.tsx";

type Tab = "hot" | "new" | "trades";
const TABS: { value: Tab; label: string }[] = [
  { value: "hot", label: "Trending" },
  { value: "new", label: "New" },
  { value: "trades", label: "Trades" },
];

function TokenRow({ t, rank }: { t: TokenSummary; rank?: number }) {
  const c = change(t).v;
  return (
    <Link
      to={`/token/${t.address}`}
      className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-raised", rank === undefined && "border-2 border-[var(--sticker-shadow)] bg-card")}
    >
      {rank !== undefined && <span className="num w-5 shrink-0 text-right text-[11px] text-ink-3">{rank}</span>}
      <span className="relative shrink-0">
        <TokenArt src={t.image} address={t.address} symbol={t.symbol} size={36} />
        <span className="num absolute -bottom-1.5 -right-2 rounded-md border border-[var(--sticker-shadow)] bg-lime px-1 text-[9px] font-bold leading-[13px] text-lime-ink">+{bps(t.bonusBps)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">${t.symbol}</span>
        <span className="num block truncate text-[11px] text-ink-3">
          {or(t.volume24hUsd, (v) => `Vol ${usd(v)}`, `${t.holders} holders`)} · {t.name}
        </span>
      </span>
      <span className="num shrink-0 text-right">
        <span className="block text-[13px]">{usd(t.fdvUsd)}</span>
        <span className={cx("block text-[11px]", Math.abs(c) < 0.05 ? "text-ink-3" : c > 0 ? "text-up" : "text-down-ink")}>{Math.abs(c) < 0.05 ? "flat" : pct(c, 1)}</span>
      </span>
    </Link>
  );
}

const VERB = { buy: ["Buy", "text-up"], sell: ["Sell", "text-down-ink"], payout: ["Payout", "text-accent"], launch: ["Launch", "text-accent"] } as const;

function TradeRow({ a }: { a: ActivityItem }) {
  const [verb, tone] = VERB[a.kind];
  return (
    <Link to={`/token/${a.token}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-raised">
      <TokenArt src={a.image} address={a.token} symbol={a.symbol ?? ""} size={30} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">
          <span className={cx("font-semibold", tone)}>{verb}</span> ${a.symbol}
        </span>
        <span className="num block truncate text-[11px] text-ink-3">
          {a.account ? short(a.account) : "Keeper"} · {ago(a.ts)}
        </span>
      </span>
      <span className="num shrink-0 text-right text-[12px]">
        {a.kind === "payout" ? `${a.recipients} holders` : a.quoteAmount ? eth(a.quoteAmount) : "new"}
      </span>
    </Link>
  );
}

const Rows = () => (
  <div aria-busy className="flex flex-col gap-1 px-3">
    {Array.from({ length: 10 }, (_, i) => (
      <div key={i} className="flex items-center gap-3 py-2.5">
        <Skeleton className="size-9 rounded-lg" />
        <span className="flex flex-1 flex-col gap-1.5">
          <SkeletonLine className="w-20 text-[13px]" />
          <SkeletonLine className="w-32 text-[11px]" />
        </span>
      </div>
    ))}
  </div>
);

/** The arcade's left rail, after the board apps traders keep open: trending, newest and the live tape, always in view. Desktop only. */
export function ArcadeSidebar() {
  const [tab, setTab] = useState<Tab>("hot");
  const hot = useTokens("hot");
  const fresh = useTokens("new");
  const tape = useActivity("all", 40);
  const { data: s } = useStats();
  const list = tab === "new" ? fresh.data : hot.data;
  // the house token is pinned above the ranking on trending, like the board's own flagship
  const house = tab === "hot" && HOUSE_SYMBOL ? list?.find((t) => t.symbol === HOUSE_SYMBOL) : undefined;
  const ranked = list?.filter((t) => t !== house);
  const live = !!s && s.head - s.indexed < 120;

  return (
    <aside className="sticky top-[92px] hidden h-[calc(100dvh-92px)] flex-col border-r border-line bg-deep xl:flex" aria-label="Token board">
      <div className="p-3">
        <Segmented value={tab} onChange={setTab} options={TABS} className="w-full [&>button]:flex-1" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
        {tab === "trades" ? (
          !tape.data ? (
            <Rows />
          ) : (
            <div className="flex flex-col px-2">{tape.data.map((a) => <TradeRow key={`${a.tx}-${a.kind}-${a.token}`} a={a} />)}</div>
          )
        ) : !ranked ? (
          <Rows />
        ) : (
          <div className="flex flex-col gap-0.5 px-2">
            {house && (
              <div className="mb-1">
                <TokenRow t={house} />
              </div>
            )}
            {ranked.map((t, i) => (
              <TokenRow key={t.address} t={t} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
      <div className="num flex items-center gap-2 border-t border-line px-4 py-3 text-[11px] text-ink-3">
        <span className={cx("size-2 rounded-full", live ? "bg-lime" : "bg-ink-3")} />
        {live ? "LIVE" : "SYNCING"} · {network.label.toUpperCase()}
        {s && <span className="ml-auto">#{s.indexed.toLocaleString("en-US")}</span>}
      </div>
    </aside>
  );
}
