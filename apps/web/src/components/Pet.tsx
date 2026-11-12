import { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { DAY, tierFor, TIERS } from "@ontoppad/shared";
import { useWalletView, type TokenSummary, type WalletView } from "../lib/api.ts";
import { ago, span } from "../lib/format.ts";
import { petOf, pixels, spriteOf, STAGE_NAME, type Stage } from "../lib/pet.ts";
import { useWallet } from "../lib/wallet.tsx";
import { Card, cx, Heading, Reveal } from "./ui.tsx";

/** What the last trade on this page did to your position, so the pet reacts before the indexer catches up. */
export type Mood = { kind: "hatch" | "happy" | "run" | "flinch"; n: number };

/** A pet in crisp pixels. Idle pets bob and blink, eggs wobble; `still` freezes it. */
export function Pet({ token, stage, size = 64, still, className }: { token: string; stage: Stage; size?: number; still?: boolean; className?: string }) {
  const { species, colors } = petOf(token);
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={stage === "egg" ? "Unhatched egg" : `${STAGE_NAME[stage]} ${species}`}
      className={cx("shrink-0 overflow-visible", !still && (stage === "egg" ? "pet-wobble" : "pet-bob"), className)}
    >
      {pixels(spriteOf(species, stage), colors).map((p) => (
        <rect key={`${p.x}.${p.y}`} x={p.x} y={p.y} width={p.w} height={1} fill={p.c} className={p.eye && !still ? "pet-eye" : undefined} />
      ))}
    </svg>
  );
}

/** Hold time toward the final form, with the Pro and Legend marks: the payout tier clock. */
function Growth({ since, className }: { since: number; className?: string }) {
  const age = Date.now() / 1000 - since;
  return (
    <div className={cx("relative h-2 rounded-full bg-raised", className)} aria-hidden>
      <div className="h-full rounded-full bg-lime transition-[width] duration-700" style={{ width: `${Math.min(100, (age / (7 * DAY)) * 100)}%` }} />
      {TIERS.slice(1).map((t) => (
        <span key={t.key} className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border-2 border-[var(--sticker-shadow)] bg-card" style={{ left: `${(t.from / (7 * DAY)) * 100}%` }} />
      ))}
    </div>
  );
}

/** Pixel footprints heading off the card: where a pet was before its bag was sold. */
function Tracks() {
  return (
    <svg viewBox="0 0 16 8" width={80} height={40} shapeRendering="crispEdges" aria-label="Footprints leading away" role="img" className="relative mb-1 text-ink-3">
      {[0, 1, 2, 3].map((i) => (
        <g key={i} fill="currentColor" opacity={0.35 + i * 0.2}>
          <rect x={i * 4} y={i % 2 ? 2 : 5} width={2} height={1} />
          <rect x={i * 4 + 2} y={i % 2 ? 1 : 4} width={1} height={1} />
          <rect x={i * 4 + 2} y={i % 2 ? 3 : 6} width={1} height={1} />
        </g>
      ))}
    </svg>
  );
}

/** The pet with its moment: an egg cracking open, a happy hop, a flinch, or a sprint off the card. */
function PetStage({ token, stage, mood, size, onGone }: { token: string; stage: Stage; mood: Mood | null; size: number; onGone: () => void }) {
  const [phase, setPhase] = useState<"idle" | "shake" | "pop" | "run">("idle");
  useEffect(() => {
    if (!mood) return;
    if (mood.kind !== "hatch") return setPhase(mood.kind === "run" ? "run" : "idle");
    setPhase("shake");
    const t = setTimeout(() => setPhase("pop"), 700);
    return () => clearTimeout(t);
  }, [mood]);

  if (phase === "shake") return <Pet token={token} stage="egg" size={size} still className="pet-shake" />;
  if (phase === "run")
    return (
      <motion.div initial={{ x: 0 }} animate={{ x: size * 2.2 }} transition={{ duration: 1.1, ease: "easeIn" }} onAnimationComplete={onGone} className="relative">
        <Pet token={token} stage={stage} size={size} still className="pet-run" />
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="absolute bottom-0 size-2 rounded-full bg-ink-3" style={{ left: -6 - i * 10 }} initial={{ opacity: 0.6, scale: 0.6 }} animate={{ opacity: 0, scale: 1.8, y: -6 }} transition={{ duration: 0.5, delay: 0.15 + i * 0.18, repeat: 1 }} />
        ))}
      </motion.div>
    );
  return (
    <motion.div
      key={`${mood?.n ?? 0}`}
      className="relative"
      initial={phase === "pop" ? { scale: 0.2, y: size * 0.15 } : undefined}
      animate={mood?.kind === "happy" ? { y: [0, -size * 0.25, 0, -size * 0.12, 0] } : mood?.kind === "flinch" ? { x: [0, -5, 5, -3, 0] } : { scale: 1, y: 0 }}
      transition={phase === "pop" ? { type: "spring", bounce: 0.55, duration: 0.6 } : { duration: 0.55 }}
    >
      <Pet token={token} stage={stage} size={size} />
      {phase === "pop" &&
        [-1, 1].map((d) => (
          <motion.span key={d} className="absolute inset-0" style={{ clipPath: d < 0 ? "inset(0 50% 0 0)" : "inset(0 0 0 50%)" }} initial={{ x: 0, rotate: 0, opacity: 1 }} animate={{ x: d * size * 0.7, y: size * 0.1, rotate: d * 35, opacity: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}>
            <Pet token={token} stage="egg" size={size} still />
          </motion.span>
        ))}
    </motion.div>
  );
}

/** Token page: your pet for this token, from egg to final form on the payout tier clock. */
export function PetCard({ t, mood }: { t: TokenSummary; mood: Mood | null }) {
  const w = useWallet();
  const { data } = useWalletView(w.address?.toLowerCase());
  const [gone, setGone] = useState(false);
  useEffect(() => setGone(false), [mood]);
  const h = data?.holdings.find((x) => x.token === t.address);
  const ran = data?.runaways.find((x) => x.token === t.address);
  // a trade on this page wins until the indexer has caught up with it
  const sold = mood?.kind === "run";
  const hatched = !sold && (mood?.kind === "hatch" || mood?.kind === "happy");
  const holding = sold ? undefined : h;
  const alive = !!holding || hatched;
  const stage: Stage = holding ? holding.tier : hatched ? "rookie" : "egg";
  const runaway = !alive && (sold || ran);
  const sym = `$${t.symbol}`;

  return (
    <Card className="flex items-center gap-5 p-5">
      <div className="relative grid size-[104px] shrink-0 place-items-end justify-center overflow-hidden rounded-xl border border-line bg-deep pb-3">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-3 border-t-2 border-dashed border-line-2 bg-raised" />
        {runaway && (gone || !sold) ? (
          <Tracks />
        ) : (
          <PetStage token={t.address} stage={sold ? (h?.tier ?? "rookie") : stage} mood={mood} size={72} onGone={() => setGone(true)} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] text-ink-3">Hold pet</span>
        {alive ? (
          <>
            <span className="text-[16px] font-semibold leading-tight">
              {STAGE_NAME[stage]} <span className="num text-[13px] font-normal text-ink-2">{sym}</span>
            </span>
            <Growth since={holding?.heldSince ?? Date.now() / 1000} className="my-1" />
            <span className="text-[12px] leading-5 text-ink-2">
              {holding?.next
                ? `Grows into ${holding.next.tier.label} ${holding.next.tier.mult}× in ${span(holding.next.in)}`
                : holding
                  ? "Final form: paid at 2× weight"
                  : "Hatched just now. Grows into Pro 1.5× at day 3"}
            </span>
          </>
        ) : runaway ? (
          <>
            <span className="text-[16px] font-semibold leading-tight">Ran away</span>
            <span className="text-[12px] leading-5 text-ink-2">
              Your {sym} pet left {ran ? ago(ran.leftAt) : "just now"} when you sold out. Buy back and a new egg hatches
            </span>
          </>
        ) : (
          <>
            <span className="text-[16px] font-semibold leading-tight">Buy to hatch</span>
            <span className="text-[12px] leading-5 text-ink-2">Every bag hatches a {sym} pet. Pro at day 3, Legend at day 7, the same clock as your payout tier. Sell out and it runs away</span>
          </>
        )}
      </div>
    </Card>
  );
}

/** Portfolio: one pet per bag, oldest bag first, plus the pets that ran away when their bag was sold. */
export function PetPen({ view, own }: { view: WalletView; own: boolean }) {
  const pets = [...view.holdings].sort((a, b) => a.heldSince - b.heldSince);
  if (!pets.length && !view.runaways.length) return null;
  return (
    <section className="px-4 pt-16 md:px-6">
      <Heading title={own ? "Your pet pen" : "Pet pen"} sub="One pet per bag. It grows on the payout tier clock: Pro at day 3, Legend at day 7" />
      {pets.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {pets.map((h, i) => (
            <Reveal key={h.token} delay={Math.min(i, 8) * 0.04}>
              <Link to={`/token/${h.token}`} className="group flex flex-col gap-2">
                <div className="relative grid h-32 place-items-end justify-center overflow-hidden rounded-xl border border-line bg-deep pb-3 transition-[transform,border-color,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:border-[var(--sticker-shadow)] group-hover:shadow-[4px_4px_0_var(--sticker-shadow)]">
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-3 border-t-2 border-dashed border-line-2 bg-raised" />
                  <Pet token={h.token} stage={h.tier} size={88} className="relative" />
                </div>
                <span className="truncate text-[13px]">
                  {STAGE_NAME[h.tier]} <span className="num text-ink-3">${h.symbol}</span>
                </span>
                <Growth since={h.heldSince} />
                <span className="num text-[12px] text-ink-3">{h.next ? `${h.next.tier.label} in ${span(h.next.in)}` : "Final form · 2×"}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
      {view.runaways.length > 0 && (
        <div className="mt-8 flex flex-col gap-3">
          <span className="text-[13px] text-ink-3">Ran away when the bag was sold</span>
          <div className="flex flex-wrap gap-2">
            {view.runaways.map((r) => (
              <Link key={r.token} to={`/token/${r.token}`} className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-1.5 pr-3 text-[13px] transition-colors duration-150 hover:bg-raised">
                <Pet token={r.token} stage={tierFor(r.leftAt - r.since).key} size={24} still className="-scale-x-100 opacity-50 grayscale" />
                <span>${r.symbol}</span>
                <span className="num text-[12px] text-ink-3">left {ago(r.leftAt)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
