import { useSyncExternalStore } from "react";
import { useConfig, type TokenSummary } from "../lib/api.ts";
import { ago, eth, usd } from "../lib/format.ts";
import { countdown, potLevel, READY_AT } from "../lib/pot.ts";
import { Card, cx } from "./ui.tsx";

// one shared second hand for every meter on the page
let now = Math.floor(Date.now() / 1000);
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(f: () => void) {
  subs.add(f);
  timer ??= setInterval(() => {
    now = Math.floor(Date.now() / 1000);
    subs.forEach((s) => s());
  }, 1000);
  return () => {
    subs.delete(f);
    if (subs.size) return;
    clearInterval(timer);
    timer = undefined;
  };
}
const useNow = () => useSyncExternalStore(subscribe, () => now);

function useMeter(t: TokenSummary) {
  const { data: cfg } = useConfig();
  const m = potLevel(t.pot, t.potNeed, t.nextRoundAt, cfg?.keeperIntervalSec ?? 900, useNow());
  return { ...m, hot: m.phase === "jackpot" || m.phase === "paying" };
}

/** The tube: lime mercury over the dashed round-ready mark, the bulb glows when a payout is about to drop. */
function Thermo({ level, hot }: { level: number; hot: boolean }) {
  return (
    <div className="relative flex shrink-0 flex-col items-center" aria-hidden>
      <div className="relative h-32 w-5 overflow-hidden rounded-t-full border-2 border-b-0 border-[var(--sticker-shadow)] bg-deep">
        <div className={cx("absolute inset-x-0 bottom-0 bg-lime transition-[height] duration-1000 ease-out", hot && "animate-pulse")} style={{ height: `${level * 100}%` }} />
        {[0.2, 0.4, 0.8].map((k) => (
          <span key={k} className="absolute left-0 w-1.5 border-t border-ink-3/60" style={{ bottom: `${k * 100}%` }} />
        ))}
        <span className="absolute inset-x-0 border-t-2 border-dashed border-[var(--sticker-shadow)]" style={{ bottom: `${READY_AT * 100}%` }} />
      </div>
      <div className={cx("-mt-1 size-9 rounded-full border-2 border-[var(--sticker-shadow)] bg-lime transition-shadow duration-300", hot && "shadow-[0_0_20px_var(--lime)]")} />
    </div>
  );
}

/** Token page: the pot, and how close its next payout round is. */
export function PotMeter({ t }: { t: TokenSummary }) {
  const m = useMeter(t);
  const pct = Math.floor((t.pot / t.potNeed) * 100);
  return (
    <Card className="flex items-center gap-5 p-5">
      <Thermo level={m.level} hot={m.hot} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] text-ink-3">Pot meter</span>
        {m.phase === "empty" ? (
          <span className="text-[18px] font-medium leading-tight">The next buy starts the pot</span>
        ) : (
          <span className="num text-[22px] font-medium leading-tight">{eth(t.pot)}</span>
        )}
        {t.potUsd >= 0.01 && <span className="num text-[12px] text-ink-3">{usd(t.potUsd)} waiting for holders</span>}
        <span className="mt-1 text-[13px] leading-5">
          {m.phase === "empty" && <span className="text-ink-2">75% of the swap fees on every buy land here</span>}
          {m.phase === "filling" && (
            <span className="text-ink-2">
              <span className="num text-ink">{Math.max(1, pct)}%</span> of a round · <span className="num">{eth(t.potNeed - t.pot)}</span> to go
            </span>
          )}
          {m.phase === "ready" && (
            <span className="text-ink-2">
              Round-ready · {m.left > 0 ? <>next payout in <span className="num text-ink">{countdown(m.left)}</span></> : "pays on the keeper's next pass"}
            </span>
          )}
          {m.hot && (
            <>
              <span className="blink font-title text-[15px] text-accent">Jackpot incoming</span>{" "}
              <span className="num text-ink-2">{m.phase === "paying" ? "paying out now" : `in ${countdown(m.left)}`}</span>
            </>
          )}
        </span>
        <span className="text-[12px] leading-5 text-ink-3">
          {t.lastRoundAt ? `Last round ${ago(t.lastRoundAt)} · ${t.rounds} round${t.rounds > 1 ? "s" : ""} so far` : "Round one goes to every holder, weighted by hold time"}
        </span>
      </div>
    </Card>
  );
}

/** A poster's strip of the same meter, along the bottom edge of the art. */
export function PotBar({ t }: { t: TokenSummary }) {
  const m = useMeter(t);
  if (m.phase === "empty") return null;
  return (
    <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-black/45">
      <span className={cx("block h-full bg-lime transition-[width] duration-1000", m.hot && "blink")} style={{ width: `${m.level * 100}%` }} />
    </span>
  );
}
