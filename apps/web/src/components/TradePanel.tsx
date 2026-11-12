import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, formatUnits, parseEther } from "viem";
import { buyerEdge, feeFor } from "@ontoppad/shared";
import type { TokenSummary } from "../lib/api.ts";
import { buy, errorText, quote, sell, tokenBalance } from "../lib/chain.ts";
import { amount as fmtAmount, eth, or, usd } from "../lib/format.ts";
import { useWallet } from "../lib/wallet.tsx";
import { clunk, coin, tick } from "../lib/sound.ts";
import type { Mood } from "./Pet.tsx";
import { REEL_MS, Slot, SPIN_MS } from "./Slot.tsx";
import { useToast } from "./toast.tsx";
import { Button, cx, Num, Segmented, Stamp } from "./ui.tsx";

const SLIPPAGE = [100, 300, 500] as const;

/** One-shot pixel coin burst when a buy lands. */
function Burst() {
  return (
    <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute size-2 bg-lime border border-[var(--sticker-shadow)]"
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: Math.cos(a) * 90, y: Math.sin(a) * 50 - 10, opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        );
      })}
    </span>
  );
}

export function TradePanel({ token, ethUsd, onTrade }: { token: TokenSummary; ethUsd: number; onTrade?: (kind: Mood["kind"]) => void }) {
  const w = useWallet();
  const toast = useToast();
  const qc = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [input, setInput] = useState("0.001");
  const [slip, setSlip] = useState<(typeof SLIPPAGE)[number]>(300);
  const [busy, setBusy] = useState(false);
  const [bursts, setBursts] = useState(0);
  const [debounced, setDebounced] = useState(input);
  const [pulls, setPulls] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data: held = 0n } = useQuery({
    queryKey: ["held", token.address, w.address],
    queryFn: () => tokenBalance(token.address, w.address!),
    enabled: !!w.address,
    refetchInterval: 10_000,
  });

  const amountIn = useMemo(() => {
    try {
      const v = parseEther(debounced || "0");
      return v > 0n ? v : 0n;
    } catch {
      return 0n;
    }
  }, [debounced]);

  const q = useQuery({
    queryKey: ["quote", token.address, side, amountIn.toString(), w.address],
    queryFn: () => quote(token, side, amountIn, w.address),
    enabled: amountIn > 0n,
    refetchInterval: 12_000,
    retry: false,
  });

  const out = q.data ? Number(formatUnits(q.data.out, 18)) : 0;
  const bonus = q.data ? Number(formatUnits(q.data.bonus, 18)) : 0;
  const total = out + bonus;
  const ethBal = w.balance ? Number(formatEther(w.balance)) : 0;
  const tokBal = Number(formatUnits(held, 18));
  const inputNum = Number(debounced) || 0;
  const over = side === "buy" ? !!w.address && inputNum > ethBal : !!w.address && inputNum > tokBal;
  // the reels show the bonus this exact quote pays, to the hundredth of a percent
  const digits = q.data && q.data.out > 0n ? (Number((q.data.bonus * 10_000n) / q.data.out) / 100).toFixed(2) : "0.00";
  // a refetch that only moves the amounts keeps the reels revealed; a new amount or a new rate re-arms the lever
  const quoteKey = q.data ? `${amountIn}:${digits}` : null;
  const needsPull = side === "buy" && bonus > 0 && shownFor !== quoteKey;

  /** Spins the reels onto the quoted bonus; resolves once the last reel has landed. */
  async function pull() {
    if (!quoteKey || spinning) return;
    const key = quoteKey;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPulls((n) => n + 1);
      setSpinning(true);
      const ticking = setInterval(tick, 70);
      REEL_MS.forEach((ms) => setTimeout(clunk, ms));
      await new Promise((r) => setTimeout(r, SPIN_MS));
      clearInterval(ticking);
      setSpinning(false);
    }
    setShownFor(key);
  }

  async function submit() {
    if (!w.client || !q.data) return;
    // Lever Bonus: a buy pulls the lever first, so the bonus is on the reels before the wallet opens
    if (needsPull) await pull();
    setBusy(true);
    try {
      await w.ensureChain();
      const minOut = (q.data.out * BigInt(10_000 - slip)) / 10_000n;
      const r = side === "buy" ? await buy(w.client, token, amountIn, minOut) : await sell(w.client, token, amountIn, minOut);
      if (side === "buy") {
        setBursts((n) => n + 1);
        coin();
      }
      onTrade?.(side === "buy" ? (held === 0n ? "hatch" : "happy") : amountIn >= held ? "run" : "flinch");
      const b = r.trade ? Number(formatUnits(r.trade.bonus, 18)) : 0;
      toast({
        title: side === "buy" ? `Bought $${token.symbol}` : `Sold $${token.symbol}`,
        body:
          side === "buy" ? (
            <span>
              <span className="num">{fmtAmount(Number(formatUnits(r.trade?.tokenAmount ?? 0n, 18)))}</span> base +{" "}
              <span className="num text-accent">{fmtAmount(b)}</span> bonus landed in your wallet
            </span>
          ) : (
            <span className="num">{eth(Number(formatEther(r.trade?.quoteAmount ?? 0n)))} received</span>
          ),
        tx: r.hash,
      });
      void qc.invalidateQueries();
    } catch (e) {
      toast({ title: "Trade not sent", body: errorText(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const chips = side === "buy" ? ["0.0005", "0.001", "0.005", "0.01"] : null;
  const edge = buyerEdge(token.bonusBps) * 100;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center justify-between">
        <Segmented
          value={side}
          onChange={(s) => {
            setSide(s);
            setInput(s === "buy" ? "0.001" : tokBal > 0 ? String(Math.floor(tokBal / 2)) : "");
          }}
          options={[
            { value: "buy", label: "Buy" },
            { value: "sell", label: "Sell" },
          ]}
        />
        <span className="num text-[12px] text-ink-3">
          {w.address ? (side === "buy" ? or(ethBal, eth, "Wallet needs ETH") : or(tokBal, (v) => `${fmtAmount(v)} $${token.symbol}`, `No $${token.symbol} yet`)) : "Wallet not connected"}
        </span>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-[13px] text-ink-3">{side === "buy" ? "You pay" : "You sell"}</span>
        <div className="flex h-12 items-center rounded-[10px] border border-line-2 bg-deep px-3 focus-within:border-[var(--accent)]">
          <input
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^0-9.]/g, ""))}
            className="num min-w-0 flex-1 bg-transparent text-[18px] text-ink outline-none"
            aria-label={side === "buy" ? "ETH amount" : "Token amount"}
          />
          <span className="num text-[13px] text-ink-2">{side === "buy" ? "ETH" : `$${token.symbol}`}</span>
        </div>
      </label>
      <div className="flex flex-wrap gap-2">
        {chips
          ? chips.map((c) => (
              <button key={c} onClick={() => setInput(c)} className={cx("h-8 rounded-lg border px-3 num text-[12px] transition-colors duration-150", input === c ? "border-line-2 bg-raised text-ink" : "border-line text-ink-2 hover:text-ink")}>
                {c}
              </button>
            ))
          : [25, 50, 100].map((p) => (
              <button key={p} disabled={tokBal <= 0} onClick={() => setInput(formatUnits((held * BigInt(p)) / 100n, 18))} className="h-8 rounded-lg border border-line px-3 num text-[12px] text-ink-2 hover:text-ink disabled:opacity-40">
                {p}%
              </button>
            ))}
      </div>

      {/* the quote: base, bonus on top, total — before you sign anything */}
      <div className="relative flex flex-col gap-2 rounded-xl border border-line bg-deep p-4">
        {side === "buy" ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-ink-3">Base from the pool</span>
              <span className="num text-[14px] text-ink-2">{out > 0 ? fmtAmount(out) : q.isFetching ? "Quoting" : "Enter an amount"}</span>
            </div>
            {bonus > 0 ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] text-ink-3">Bonus on top</span>
                  <span className="num text-[14px] text-accent">{needsPull ? (spinning ? "Reels spinning" : "Pull the lever") : `+${fmtAmount(bonus)}`}</span>
                </div>
                <div className="flex justify-center py-1">
                  <Slot digits={digits} pulls={pulls} spinning={spinning} revealed={!needsPull} onPull={() => void pull()} />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <Stamp bps={token.bonusBps} />
                <span className="num text-[14px] text-accent">{q.isFetching || !q.data ? "Quoting" : "Treasury refilling"}</span>
              </div>
            )}
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-[13px] text-ink">You get</span>
              {total > 0 && !needsPull ? (
                <Num value={total} format={fmtAmount} className="text-[22px] font-medium" />
              ) : (
                <span className="text-[13px] text-ink-3">{total > 0 ? "Revealed by the lever" : "Waiting for a quote"}</span>
              )}
            </div>
            <span className="num text-[12px] text-ink-3">
              {total > 0 && !needsPull && <>≈ {usd(total * token.price * ethUsd)} · </>}
              {edge.toFixed(2)}% ahead of the pre-trade price after the {(feeFor(token.bonusBps) / 1e4).toFixed(2)}% swap fee
            </span>
          </>
        ) : (
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-ink">You receive</span>
            <span className="num text-[18px]">{out > 0 ? eth(out) : q.isFetching ? "Quoting" : "Enter an amount"}</span>
          </div>
        )}
        {bursts > 0 && <Burst key={bursts} />}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[13px] text-ink-3">Max slippage</span>
        <div className="flex gap-1">
          {SLIPPAGE.map((s) => (
            <button key={s} onClick={() => setSlip(s)} className={cx("h-7 rounded-md px-2 num text-[12px] transition-colors duration-150", slip === s ? "bg-raised text-ink" : "text-ink-3 hover:text-ink")}>
              {s / 100}%
            </button>
          ))}
        </div>
      </div>

      {!w.address ? (
        <Button variant="primary" size="lg" onClick={w.openPicker}>
          Insert coin to trade
        </Button>
      ) : w.wrongChain ? (
        <Button variant="secondary" size="lg" onClick={() => w.ensureChain().catch((e) => toast({ title: "Network not switched", body: errorText(e), tone: "error" }))}>
          Switch network
        </Button>
      ) : (
        <Button variant="primary" size="lg" disabled={busy || spinning || !q.data || over || input !== debounced} onClick={() => void submit()}>
          {busy ? "Confirm in wallet" : over ? "Not enough balance" : spinning ? "Reels spinning" : side === "buy" ? (needsPull ? `Pull and buy $${token.symbol}` : `Buy $${token.symbol}`) : `Sell $${token.symbol}`}
        </Button>
      )}
      {q.error && <p className="text-[12px] text-down-ink">{errorText(q.error)}</p>}
    </div>
  );
}
