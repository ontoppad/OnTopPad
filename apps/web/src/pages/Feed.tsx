import { useState } from "react";
import { Link } from "react-router";
import { useActivity, useStats } from "../lib/api.ts";
import { txUrl } from "../lib/chain.ts";
import { ago, amount, eth, isHouse, or, short, usd } from "../lib/format.ts";
import { Card, cx, Segmented, Skeleton, TokenArt } from "../components/ui.tsx";

const TYPES = [
  { value: "all", label: "All" },
  { value: "buy", label: "Buys" },
  { value: "sell", label: "Sells" },
  { value: "payout", label: "Payouts" },
  { value: "launch", label: "Launches" },
] as const;

const KIND = { buy: "Buy", sell: "Sell", payout: "Payout", launch: "Launch" } as const;

export default function Feed() {
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("all");
  const { data, isLoading } = useActivity(type, 120);
  const { data: s } = useStats();

  return (
    <div className="mx-auto px-4 pt-10 md:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-[36px] leading-tight font-semibold tracking-tight">Feed</h1>
        <p className="text-[15px] text-ink-2">Launches, trades and holder payouts across the pad as blocks land</p>
        {s && (
          <p className="num text-[12px] text-ink-3">
            {or(s.trades, (n) => `${n} trades`, "First trade pending")} · {or(s.bonusTokens, (v) => `${amount(v)} bonus tokens to buyers`, "bonus ready on the first buy")} · {s.paid ? `${eth(s.paid)} paid to holders` : or(s.pot, (v) => `${eth(v)} filling holder pots`, "holder pots open")}
          </p>
        )}
      </div>
      <Segmented value={type} onChange={setType} options={[...TYPES]} className="mt-6 max-w-full overflow-x-auto scrollbar-none" />
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="px-5 py-3 font-normal">When</th>
              <th className="px-5 py-3 font-normal">Type</th>
              <th className="px-5 py-3 font-normal">Token</th>
              <th className="px-5 py-3 font-normal">Account</th>
              <th className="px-5 py-3 text-right font-normal">Amount</th>
              <th className="px-5 py-3 text-right font-normal">Bonus</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-5">
                  <Skeleton className="h-40" />
                </td>
              </tr>
            )}
            {data?.map((a) => (
              <tr key={`${a.tx}${a.kind}${a.account}${a.ts}`} className="border-t border-line">
                <td className="px-5 py-3 num">
                  <a href={txUrl(a.tx)} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink">
                    {ago(a.ts)}
                  </a>
                </td>
                <td className={cx("px-5 py-3", a.kind === "buy" && "text-up", a.kind === "sell" && "text-down-ink", a.kind === "payout" && "text-accent")}>{KIND[a.kind]}</td>
                <td className="px-5 py-3">
                  <Link to={`/token/${a.token}`} className="inline-flex items-center gap-2 hover:text-ink">
                    <TokenArt src={a.image} address={a.token} symbol={a.symbol ?? ""} size={20} />
                    <span>{a.name}</span>
                    <span className="num text-ink-3">${a.symbol}</span>
                  </Link>
                </td>
                <td className="px-5 py-3 num text-ink-2">
                  {a.kind === "payout" ? `${a.recipients} holders` : a.account ? isHouse(a.account) ? short(a.account) : <Link to={`/portfolio/${a.account}`} className="hover:text-ink">{short(a.account)}</Link> : null}
                </td>
                <td className="px-5 py-3 text-right num">{a.kind === "launch" ? <span className="text-ink-3">new pool</span> : a.quoteUsd && a.quoteUsd >= 0.01 ? usd(a.quoteUsd) : eth(a.quoteAmount ?? 0)}</td>
                <td className="px-5 py-3 text-right num">
                  {a.kind === "buy" && a.bonus ? <span className="text-accent">+{amount(a.bonus)}</span> : a.kind === "launch" ? <span className="text-ink-3">{(a.bonusBps ?? 0) / 100}% on buys</span> : <span className="text-ink-3">{a.kind === "payout" ? "pushed" : "sell"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
