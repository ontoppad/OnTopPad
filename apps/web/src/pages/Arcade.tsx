import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Search } from "lucide-react";
import { useStats, useTokens } from "../lib/api.ts";
import { amount, eth, usd } from "../lib/format.ts";
import { TokenCard } from "../components/TokenCard.tsx";
import { ButtonLink, Segmented, Skeleton, Stamp, TokenArt } from "../components/ui.tsx";

const SORTS = [
  { value: "hot", label: "Hot" },
  { value: "new", label: "New" },
  { value: "mcap", label: "Market cap" },
  { value: "bonus", label: "Biggest bonus" },
  { value: "pot", label: "Biggest payouts" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

export default function Arcade() {
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<Sort>((params.get("sort") as Sort) ?? "hot");
  const [q, setQ] = useState(params.get("q") ?? "");
  const { data: tokens, isLoading } = useTokens(sort, q);
  const { data: stats } = useStats();
  const top = tokens?.[0];

  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-10 md:px-8">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="flex flex-col gap-2">
          <h1 className="text-[36px] leading-tight font-semibold tracking-tight">The arcade</h1>
          <p className="text-[15px] text-ink-2">Every token here pays a bonus on buys and pays its holders from the trading</p>
        </div>
        <ButtonLink to="/launch" variant="primary">
          Launch a token
        </ButtonLink>
      </div>

      {top && !q && (
        <Link to={`/token/${top.address}`} className="mt-8 grid gap-6 rounded-2xl border border-line bg-card p-6 transition-colors duration-150 hover:border-line-2 md:grid-cols-[auto_1fr_auto] md:items-center">
          <TokenArt src={top.image} address={top.address} symbol={top.symbol} size={96} />
          <div className="flex flex-col gap-2">
            <span className="num text-[12px] text-ink-3">Top of the board · {SORTS.find((s) => s.value === sort)?.label.toLowerCase()}</span>
            <span className="text-[28px] leading-tight font-semibold">
              {top.name} <span className="num text-[18px] text-ink-3">${top.symbol}</span>
            </span>
            <p className="max-w-xl text-[14px] text-ink-2">{top.description ?? `${top.holders} holders sharing every payout round.`}</p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <Stamp bps={top.bonusBps} />
            <span className="num text-[24px] font-medium">{usd(top.fdvUsd)}</span>
            <span className="num text-[12px] text-ink-3">
              {top.holders} holders · {top.paid > 0 ? `${eth(top.paid)} paid` : `${eth(top.pot)} in the pot`} · {amount(top.bonusPaid)} bonus paid
            </span>
          </div>
        </Link>
      )}

      <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          value={sort}
          onChange={(s) => {
            setSort(s);
            setParams((p) => (p.set("sort", s), p), { replace: true });
          }}
          options={[...SORTS]}
          className="max-w-full overflow-x-auto scrollbar-none"
        />
        <div className="relative">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ticker or address" aria-label="Search tokens" className="h-10 w-full rounded-[10px] border border-line bg-deep pl-9 pr-3 text-[13px] placeholder:text-ink-3 focus:outline-none focus:border-line-2 md:w-80" />
        </div>
      </div>
      {stats && (
        <p className="mt-3 num text-[12px] text-ink-3">
          {stats.tokens} tokens · {stats.trades} trades · {usd(stats.bonusUsd)} in bonus tokens paid · indexed block {stats.indexed.toLocaleString("en-US")}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {isLoading && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-64" />)}
        {tokens?.map((t, i) => <TokenCard key={t.address} t={t} rank={i + 1} />)}
      </div>
      {tokens && tokens.length === 0 && (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-12 text-center">
          <p className="text-[18px]">{q ? `Nothing matches "${q}"` : "The board is waiting for its first launch"}</p>
          <ButtonLink to="/launch" variant="primary">
            Launch the first one
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
