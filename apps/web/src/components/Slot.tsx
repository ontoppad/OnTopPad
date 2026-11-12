import { useMemo } from "react";
import { motion } from "motion/react";
import { cx } from "./ui.tsx";

/** When each digit reel lands, left to right; the last one ends the spin. */
export const REEL_MS = [700, 1000, 1300];
export const SPIN_MS = REEL_MS.at(-1)!;

const CELL = 44;

/** One reel: a strip of random digits whose last cell is the real one. */
function Reel({ to, i, pulls, spinning, revealed }: { to: string; i: number; pulls: number; spinning: boolean; revealed: boolean }) {
  // a fresh strip on every pull; the random digits are only the blur on the way to `to`
  const strip = useMemo(() => [...Array.from({ length: 10 + i * 4 }, () => String(Math.floor(Math.random() * 10))), to], [pulls, to, i]);
  return (
    <span className="relative block h-11 w-8 overflow-hidden rounded-md bg-[var(--sticker-shadow)] text-center text-[26px] leading-[44px] text-lime">
      {spinning ? (
        <motion.span key={pulls} className="absolute inset-x-0 top-0 flex flex-col" initial={{ y: 0 }} animate={{ y: -(strip.length - 1) * CELL }} transition={{ duration: REEL_MS[i]! / 1000, ease: [0.12, 0.7, 0.25, 1] }}>
          {strip.map((d, k) => (
            <span key={k} className="h-11">
              {d}
            </span>
          ))}
        </motion.span>
      ) : (
        <span className={cx(!revealed && "text-lime/50")}>{revealed ? to : "?"}</span>
      )}
      {/* glass: the reel curves away at top and bottom */}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/50" />
    </span>
  );
}

/** Lever Bonus: digit reels and a lever. The quote fixed the number before the pull; the reels only reveal it. */
export function Slot({ digits, pulls, spinning, revealed, onPull }: { digits: string; pulls: number; spinning: boolean; revealed: boolean; onPull: () => void }) {
  let reel = 0;
  return (
    <div className="flex items-center gap-2">
      <div className="num flex items-center gap-1 rounded-xl border-2 border-[var(--sticker-shadow)] bg-lime p-1.5 font-bold text-lime-ink shadow-[3px_3px_0_var(--sticker-shadow)]" aria-live="polite" aria-label={revealed ? `Bonus ${digits}%` : "Bonus reels"}>
        <span className="pl-0.5 text-[20px]">+</span>
        {[...digits].map((c, k) => (c === "." ? <span key={k} className="text-[22px]">.</span> : <Reel key={k} to={c} i={reel++} pulls={pulls} spinning={spinning} revealed={revealed} />))}
        <span className="pr-0.5 text-[20px]">%</span>
      </div>
      <button type="button" onClick={onPull} disabled={spinning} aria-label="Pull the lever" className="group relative h-[88px] w-9 shrink-0 disabled:cursor-wait">
        <span aria-hidden className="absolute bottom-[18px] left-1/2 h-5 w-7 -translate-x-1/2 rounded-md border-2 border-[var(--sticker-shadow)] bg-raised" />
        <motion.span
          key={`rod${pulls}`}
          aria-hidden
          className="absolute bottom-[30px] left-1/2 -ml-[3px] h-10 w-1.5 origin-bottom rounded-full bg-ink-3"
          animate={pulls ? { scaleY: [1, -0.6, 1] } : undefined}
          transition={{ duration: 0.7, times: [0, 0.3, 1] }}
        />
        <motion.span
          key={`knob${pulls}`}
          aria-hidden
          className="absolute left-1/2 top-[9px] -ml-[9px] size-[18px] rounded-full border-2 border-[var(--sticker-shadow)] bg-down transition-transform duration-150 group-hover:scale-110"
          animate={pulls ? { y: [0, 64, 0] } : undefined}
          transition={{ duration: 0.7, times: [0, 0.3, 1] }}
        />
      </button>
    </div>
  );
}
