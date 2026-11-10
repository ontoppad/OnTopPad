import { ShieldCheck } from "lucide-react";
import { addressUrl, contracts } from "../lib/chain.ts";
import { AddressChip } from "./ui.tsx";

const ROWS = [
  { name: "OnTopLaunchpad", key: "launchpad", role: "Deploys each token, seeds its Uniswap v4 pool, owns the locked liquidity and routes fees" },
  { name: "OnTopHook", key: "hook", role: "Uniswap v4 hook: pays the bonus on every buy from the token's treasury and logs every trade" },
  { name: "OnTopRouter", key: "router", role: "Buys and sells with slippage limits, forwards the buyer so the bonus lands in the same transaction" },
  { name: "OnTopDistributor", key: "distributor", role: "Holds each holder pot and pushes time-weighted payouts in public rounds" },
  { name: "PoolManager", key: "poolManager", role: "Uniswap v4 singleton every OnTop pool lives in", external: true },
  { name: "V4Quoter", key: "quoter", role: "Uniswap v4 quoter behind every price you see before signing", external: true },
] as const;

/** Every contract the app touches, linked to verified source. */
export function ContractsTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      {ROWS.map((r) => (
        <div key={r.key} className="grid gap-2 border-b border-line px-5 py-4 last:border-0 md:grid-cols-[220px_1fr_auto] md:items-center md:gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium">{r.name}</span>
            {"external" in r && <span className="text-[12px] text-ink-3">Uniswap</span>}
          </div>
          <span className="text-[13px] text-ink-2">{r.role}</span>
          <div className="flex items-center gap-3">
            <AddressChip address={contracts[r.key]} />
            <a href={`${addressUrl(contracts[r.key])}?tab=contract`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
              <ShieldCheck size={14} strokeWidth={1.5} />
              Source
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
