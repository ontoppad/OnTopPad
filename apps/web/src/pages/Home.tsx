import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Link, useNavigate } from "react-router";
import { animate, AnimatePresence, motion, useInView, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { formatUnits, isAddress, parseEther } from "viem";
import { CREATOR_BPS, HOLDERS_BPS, MAX_BONUS_BPS, MIN_BONUS_BPS, ONTOP, PLATFORM_BPS, robinhoodMainnet, TIERS, TREASURY_BPS } from "@ontoppad/shared";
import { useConfig, useStats, useTokens, type TokenSummary } from "../lib/api.ts";
import { HOUSE_SYMBOL, quote } from "../lib/chain.ts";
import { ago, amount, eth, or, short, usd } from "../lib/format.ts";
import { Art } from "../components/TokenCard.tsx";
import { ContractsTable } from "../components/Contracts.tsx";
import { ChainMarket } from "../components/ChainMarket.tsx";
import { cx, Segmented, Skeleton, SkeletonLine, Stamp, TokenArt, useTween } from "../components/ui.tsx";
import { ENTER_EVENT, splashDue } from "../components/Splash.tsx";
import type { Hover } from "../components/CrtScene.tsx";

const CrtScene = lazy(() => import("../components/CrtScene.tsx"));

const EASE = [0.22, 1, 0.36, 1] as const;
const two = (n: number) => String(n).padStart(2, "0");
const btn = "btn-press inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--sticker-shadow)] bg-lime px-5 text-[14px] font-semibold text-lime-ink";
const btnGhost = "inline-flex h-11 items-center gap-2 rounded-xl border border-white/35 bg-black/30 px-5 text-[14px] text-ink backdrop-blur transition-colors duration-150 hover:border-white/70 hover:bg-black/50";
// the landing's screening rooms; the header plus ticker above them is 100px
const ROOM = "stage-dark relative isolate h-[calc(100svh-92px)] min-h-[600px] overflow-hidden";

// ───────────── chrome: camera HUD and cursor label ─────────────

/** The viewfinder the whole landing is shot through: corner marks and the channel we're on. */
function Hud({ ready }: { ready: boolean }) {
  const [ch, setCh] = useState<{ n: number; name: string }>();
  // the room crossing the middle of the screen is the channel we're on
  useEffect(() => {
    const rooms = [...document.querySelectorAll<HTMLElement>("[data-ch]")];
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) setCh({ n: rooms.indexOf(e.target as HTMLElement) + 1, name: (e.target as HTMLElement).dataset.ch! });
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    rooms.forEach((r) => io.observe(r));
    return () => io.disconnect();
  }, [ready]);
  const corner = "absolute size-5 border-white/70";
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-3 bottom-4 top-[102px] z-30 font-mono text-[11px] text-white mix-blend-difference md:inset-x-4 md:text-[12px]">
      <span className={cx(corner, "left-0 top-0 rounded-tl-lg border-l border-t")} />
      <span className={cx(corner, "right-0 top-0 rounded-tr-lg border-r border-t")} />
      {/* on a phone the bottom of every room is busy with buttons; the frame keeps only its top */}
      <span className={cx(corner, "bottom-0 left-0 hidden rounded-bl-lg border-b border-l md:block")} />
      <span className={cx(corner, "bottom-0 right-0 hidden rounded-br-lg border-b border-r md:block")} />
      <AnimatePresence mode="wait">
        {ch && (
          <motion.span key={ch.n} initial={{ opacity: 0, x: -6 }} animate={{ opacity: [0, 1, 0.4, 1], x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap">
            CH {two(ch.n)}
            <span className="hidden sm:inline"> · {ch.name.toUpperCase()}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A lime tag that rides the pointer: what the thing under it does. Fine pointers only. */
function CursorPill({ label }: { label: string | null }) {
  const x = useMotionValue(-200);
  const y = useMotionValue(-200);
  const sx = useSpring(x, { stiffness: 600, damping: 40 });
  const sy = useSpring(y, { stiffness: 600, damping: 40 });
  useEffect(() => {
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, [x, y]);
  return (
    <motion.div style={{ x: sx, y: sy }} className="pointer-events-none fixed left-0 top-0 z-50 hidden pointer-fine:block">
      <AnimatePresence>
        {label && (
          <motion.span
            key={label}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.18 }}
            className="ml-5 mt-5 block origin-top-left whitespace-nowrap rounded-full border-2 border-[var(--sticker-shadow)] bg-lime px-3 py-1 text-[13px] font-semibold text-lime-ink"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Pixel dissolve between two rooms, driven by scroll: blocks of the neighbouring room's colour
 * break up as the seam travels up the screen. `bottom` mirrors it onto the end of a room.
 */
function PixelEdge({ from, bottom }: { from: string; bottom?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext("2d")!;
    const CELL = 20;
    let raf = 0;
    // getComputedStyle on every scroll frame forces a style recalc; the colour only changes with the theme
    const fill = () => (from.startsWith("--") ? getComputedStyle(document.documentElement).getPropertyValue(from) : from);
    let color = fill();
    const draw = () => {
      raf = 0;
      const r = c.getBoundingClientRect();
      if (r.bottom < -40 || r.top > innerHeight + 40) return;
      const w = Math.ceil(r.width / CELL);
      const h = Math.ceil(r.height / CELL);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const p = bottom ? (innerHeight - r.bottom) / (innerHeight * 0.6) : (innerHeight - r.top) / (innerHeight * 0.7);
      const cover = bottom ? Math.min(1, Math.max(0, p)) : 1 - Math.min(1, Math.max(0, p));
      g.clearRect(0, 0, w, h);
      g.fillStyle = color;
      for (let y = 0; y < h; y++) {
        const row = bottom ? h - 1 - y : y;
        for (let x = 0; x < w; x++) if ((1 - row / h) * 0.75 + hash(x, row) * 0.25 > 0.85 - cover * 0.6) g.fillRect(x, y, 1, 1);
      }
    };
    const kick = () => {
      raf ||= requestAnimationFrame(draw);
    };
    kick();
    addEventListener("scroll", kick, { passive: true });
    addEventListener("resize", kick);
    const mo = new MutationObserver(() => {
      color = fill();
      kick();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", kick);
      removeEventListener("resize", kick);
      mo.disconnect();
    };
  }, [from, bottom]);
  return <canvas ref={ref} aria-hidden className={cx("pointer-events-none absolute inset-x-0 z-[5] h-48 w-full [image-rendering:pixelated]", bottom ? "bottom-0" : "top-0")} />;
}

/** CSS stand-in for a set, used where WebGL isn't available and for the small floating prints. */
function CssTv({ t, className }: { t?: TokenSummary; className?: string }) {
  return (
    // padding in cqw: a percentage would be measured against the room, not the set
    <div className={cx("@container rounded-[12%/15%] bg-gradient-to-b from-[#45483f] to-[#151612] shadow-[0_24px_48px_rgb(0_0_0/0.6)]", className)}>
      <div className="p-[6cqw]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[9%/12%] bg-black">
        {t ? <Art t={t} className="opacity-90" /> : <div className="h-full w-full bg-[linear-gradient(90deg,#c0c0c0_14%,#c0c000_14%_28%,#00c0c0_28%_42%,#00c000_42%_57%,#c000c0_57%_71%,#c00000_71%_85%,#0000c0_85%)]" />}
        <div className="crt-overlay absolute inset-0" />
      </div>
      </div>
    </div>
  );
}

function CssWall({ tokens }: { tokens: TokenSummary[] }) {
  const spots = ["left-[3%] top-[12%] w-[22%] rotate-[-5deg]", "left-[8%] bottom-[10%] w-[18%] rotate-[4deg]", "right-[4%] top-[10%] w-[24%] rotate-[5deg]", "right-[9%] bottom-[12%] w-[18%] rotate-[-4deg]", "left-[27%] top-[46%] w-[12%] rotate-[3deg] opacity-60", "right-[28%] top-[44%] w-[12%] rotate-[-3deg] opacity-60"];
  return (
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,#1a2422,#070908_70%)]">
      {spots.map((s, i) => (
        <CssTv key={s} t={tokens[i]} className={cx("absolute", s)} />
      ))}
    </div>
  );
}

/** A room scrolling away: its picture lags, shrinks and dims, so the next room slides over it like a curtain. */
function useLeave(ref: RefObject<HTMLElement | null>) {
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  return {
    p: scrollYProgress,
    y: useTransform(scrollYProgress, [0, 1], ["0%", "42%"]),
    scale: useTransform(scrollYProgress, [0, 1], [1, 0.9]),
    shade: useTransform(scrollYProgress, [0, 0.9], [0, 0.85]),
  };
}

/** A room arriving from below settles out of a slight zoom as its top edge climbs the screen. */
function useArrive(ref: RefObject<HTMLElement | null>) {
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start start"] });
  return useTransform(scrollYProgress, [0, 1], [1.14, 1]);
}

const RISE = { hide: { y: "110%" }, show: { y: "0%", transition: { duration: 0.75, ease: EASE } } };

/** Display heading whose words climb out of a mask as it scrolls in, in the brand green. A newline breaks the line. */
function Rise({ text, className, flicker }: { text: string; className?: string; flicker?: boolean }) {
  let n = 0;
  return (
    <motion.h2 className={cx("text-accent", className)} initial="hide" whileInView="show" viewport={{ once: true, margin: "0px 0px -12% 0px" }} variants={{ hide: {}, show: { transition: { staggerChildren: 0.06 } } }}>
      {text.split("\n").map((line, l) => (
        <Fragment key={l}>
          {l > 0 && <br />}
          {line.split(" ").map((w) => {
            const i = n++;
            return (
              <Fragment key={i}>
                <span className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
                  <motion.span variants={RISE} className="inline-block">
                    {flicker ? <Flicker text={w} seed={i + 3} /> : w}
                  </motion.span>
                </span>{" "}
              </Fragment>
            );
          })}
        </Fragment>
      ))}
    </motion.h2>
  );
}

const STAGGER = { hide: {}, show: { transition: { staggerChildren: 0.08 } } };
const LIFT = { hide: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } };

// ───────────── 1 · the wall ─────────────

/** On a first visit the title waits for the splash's portal to open, so it assembles as you arrive. */
function useArrived() {
  const [go, setGo] = useState(() => !splashDue());
  useEffect(() => {
    if (go) return;
    const on = () => setGo(true);
    addEventListener(ENTER_EVENT, on);
    return () => removeEventListener(ENTER_EVENT, on);
  }, [go]);
  return go;
}

/** $ONTOP's contract address, one tap to copy; it trades on Robinhood Chain mainnet whichever network this build is. */
function OntopCa({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="num inline-flex items-center rounded-xl border border-white/35 bg-black/40 text-[12px] text-ink-2 backdrop-blur md:text-[13px]">
      <button
        type="button"
        aria-label="Copy the $ONTOP contract address"
        className="inline-flex h-9 items-center gap-2 rounded-l-xl pl-3 pr-2 transition-colors duration-150 hover:text-ink"
        onClick={() => {
          void navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        <span className="text-lime">$ONTOP CA</span>
        <span className="sm:hidden">{short(address)}</span>
        <span className="hidden sm:inline">{address}</span>
        {copied ? <Check size={14} strokeWidth={1.5} className="text-lime" /> : <Copy size={14} strokeWidth={1.5} />}
      </button>
      <a
        href={`${robinhoodMainnet.blockExplorers.default.url}/token/${address}`}
        target="_blank"
        rel="noreferrer"
        aria-label="$ONTOP on the explorer"
        className="inline-flex h-9 items-center border-l border-white/20 px-3 transition-colors duration-150 hover:text-ink"
      >
        <ExternalLink size={14} strokeWidth={1.5} />
      </a>
    </span>
  );
}

function Hero({ tokens, onHover, onPick }: { tokens: TokenSummary[]; onHover: (h: Hover) => void; onPick: (to: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const leave = useLeave(ref);
  const push = useRef(0);
  useMotionValueEvent(leave.p, "change", (v) => (push.current = v));
  const copy = useTransform(leave.p, [0, 0.55], [1, 0]);
  const [failed, setFailed] = useState(false);
  const arrived = useArrived();
  return (
    <section ref={ref} data-ch="Start ahead" className={cx(ROOM, "bg-[#0b0f0e]")}>
      <motion.div style={{ y: leave.y, scale: leave.scale }} className="absolute inset-0 origin-top">
        {failed ? (
          <CssWall tokens={tokens} />
        ) : (
          <Suspense fallback={null}>
            <CrtScene mode="wall" tokens={tokens} progress={push} onHover={onHover} onPick={onPick} onFail={() => setFailed(true)} />
          </Suspense>
        )}
        <div aria-hidden className="crt-overlay pointer-events-none absolute inset-0" />
        <motion.div style={{ opacity: copy }} className="pointer-events-none relative z-10 flex h-full flex-col items-center justify-end px-4 pb-24 text-center md:pb-16">
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <motion.h1
              initial={{ opacity: 0, filter: "blur(14px)", scale: 1.04 }}
              animate={arrived ? { opacity: 1, filter: "blur(0px)", scale: 1 } : undefined}
              transition={{ duration: 1.1, ease: EASE }}
              className="text-glow font-title text-[38px] leading-[1.05] text-lime sm:text-[68px] lg:text-[104px]"
            >
              Start ahead.
              <br />
              Stay paid.
            </motion.h1>
          </div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={arrived ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 0.7, delay: 0.5, ease: EASE }} className="flex flex-col items-center gap-5">
            <span aria-hidden className="text-[30px] font-thin leading-none text-ink-2">
              +
            </span>
            <p className="max-w-md text-[15px] leading-6 text-ink-2 md:text-[16px]">
              Every buy lands with bonus tokens on top. Every holder is paid ETH from the trading, and paid more the longer they hold.
            </p>
            <div className="pointer-events-auto flex flex-wrap justify-center gap-3">
              <Link to="/arcade" className={btn}>
                Enter the arcade
              </Link>
              <Link to="/launch" className={btnGhost}>
                Launch a token
              </Link>
            </div>
            {ONTOP ? (
              <div className="pointer-events-auto">
                <OntopCa address={ONTOP} />
              </div>
            ) : null}
            <span className="num hidden text-[11px] text-ink-3 pointer-fine:block">Point at a screen to tune in</span>
          </motion.div>
        </motion.div>
      </motion.div>
      <motion.div aria-hidden style={{ opacity: leave.shade }} className="pointer-events-none absolute inset-0 z-20 bg-black" />
    </section>
  );
}

// ───────────── 2 · the line that scrolls past ─────────────

const PRINTS = [
  "left-[14%] top-[52%]",
  "left-[38%] top-[66%]",
  "left-[61%] top-[50%]",
  "left-[24%] top-[80%]",
  "left-[80%] top-[70%]",
  "left-[50%] top-[86%]",
];

function Print({ t, i, p }: { t: TokenSummary; i: number; p: MotionValue<number> }) {
  const y = useTransform(p, [0, 1], [140 + i * 50, -220 - i * 40]);
  const rotate = useTransform(p, [0, 1], [i % 2 ? -12 : 10, i % 2 ? 8 : -9]);
  const rotateY = useTransform(p, [0, 1], [i % 2 ? 28 : -28, i % 2 ? -18 : 18]);
  return (
    <motion.div style={{ y, rotate, rotateY, transformPerspective: 600 }} className={cx("absolute w-[24vw] max-w-[140px]", PRINTS[i])}>
      <Link to={`/token/${t.address}`} className="group block">
        <div className="aspect-square overflow-hidden rounded-md border border-white/15 shadow-[0_18px_40px_rgb(0_0_0/0.6)] transition-transform duration-300 group-hover:scale-110">
          <Art t={t} />
        </div>
      </Link>
    </motion.div>
  );
}

function Marquee({ tokens }: { tokens: TokenSummary[] }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], ["3%", "-71%"]);
  const { scrollYProgress: enter } = useScroll({ target: ref, offset: ["start end", "start start"] });
  const glow = useTransform(enter, [0.35, 1], [0, 1]);
  // the tube vignette waits until the room is pinned, or its dark rim would show as a seam over the hero
  const tube = useTransform(enter, [0.8, 1], [0, 1]);
  return (
    <section ref={ref} data-ch="Get more" className="stage-dark relative z-10 h-[240vh] bg-[#0b0f0e]">
      {/* a soft lip instead of a hard edge where this room rides over the hero */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-40 bg-gradient-to-b from-transparent to-[#0b0f0e]" />
      <div className="sticky top-[92px] h-[calc(100svh-92px)] overflow-hidden">
        <motion.div aria-hidden style={{ opacity: glow }} className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[#3d4e0b] via-[#18200a]/70 to-transparent [mask-image:linear-gradient(to_bottom,transparent,black_30%)]" />
        <motion.p style={{ x }} className="font-title relative mt-[6vh] w-max whitespace-nowrap text-[22vw] leading-[0.95] text-ink/90 md:text-[15vw]">
          Buy it, get more. Hold it, get paid.
        </motion.p>
        {tokens.slice(0, 6).map((t, i) => (
          <Print key={t.address} t={t} i={i} p={scrollYProgress} />
        ))}
        <motion.div aria-hidden style={{ opacity: tube }} className="crt-overlay pointer-events-none absolute inset-0" />
      </div>
    </section>
  );
}

// ───────────── 3 · now playing ─────────────

function NowPlaying({ tokens, onHover, onPick }: { tokens: TokenSummary[]; onHover: (h: Hover) => void; onPick: (to: string) => void }) {
  const list = tokens.slice(0, 8);
  return list.length ? <NowPlayingRoom list={list} onHover={onHover} onPick={onPick} /> : null;
}

function NowPlayingRoom({ list, onHover, onPick }: { list: TokenSummary[]; onHover: (h: Hover) => void; onPick: (to: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const leave = useLeave(ref);
  const arrive = useArrive(ref);
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState(false);
  const step = (d: number) => setI((x) => (x + d + list.length) % list.length);
  const t = list[i]!;
  const tags = [`+${t.bonusBps / 100}% on top`, or(t.holders, (n) => `${n} holders`, "first holder wins"), t.paid ? `${eth(t.paid)} paid out` : t.pot ? `${eth(t.pot)} in the pot` : "pot filling", `${usd(t.fdvUsd)} cap`];
  const side = "pointer-events-auto absolute top-1/2 z-10 hidden h-10 -translate-y-1/2 items-center rounded-lg border px-4 text-[14px] transition-colors duration-150 md:inline-flex";
  return (
    <section
      ref={ref}
      data-ch="Now playing"
      className={cx(ROOM, "min-h-[680px] bg-[#090b07]")}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") step(-1);
        if (e.key === "ArrowRight") step(1);
      }}
    >
      <motion.div style={{ y: leave.y, scale: leave.scale }} className="absolute inset-0 origin-top">
        <motion.div style={{ scale: arrive }} className="absolute inset-0">
          {failed ? (
            <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(#3d4e0b,#090b07_45%)]">
              <CssTv t={t} className="w-[min(70vw,460px)]" />
            </div>
          ) : (
            <Suspense fallback={null}>
              <CrtScene mode="feature" tokens={list} index={i} onStep={step} onPick={onPick} onHover={(h) => onHover(h && (h.to ? { label: `Play $${t.symbol}` } : h))} onFail={() => setFailed(true)} />
            </Suspense>
          )}
        </motion.div>
        <PixelEdge from="#0b0f0e" />
        <div aria-hidden className="crt-overlay pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 to-transparent" />
        <button onClick={() => step(-1)} className={cx(side, "left-[7%] border-white/40 bg-black/40 text-ink backdrop-blur hover:bg-black/60")}>
          Previous
        </button>
        <button onClick={() => step(1)} className={cx(side, "right-[7%] border-[var(--sticker-shadow)] bg-lime font-semibold text-lime-ink hover:brightness-110")}>
          Next
        </button>
        <div className="pointer-events-none relative z-10 flex h-full flex-col items-center justify-between px-4 pb-20 pt-10 text-center md:pb-14">
          <div>
            <Rise text="Now playing" className="font-title text-[36px] leading-none md:text-[60px]" />
            <span className="num mt-3 block text-[13px] text-ink-2">
              [ {two(i + 1)} / {two(list.length)} ]
            </span>
          </div>
          <div className="flex flex-col items-center gap-4">
            <AnimatePresence mode="wait">
              <motion.div key={t.address} initial={{ opacity: 0, y: 10, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(6px)" }} transition={{ duration: 0.3 }}>
                <h3 className="font-title text-[26px] leading-none md:text-[34px]">{t.name}</h3>
                <div className="num mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
                  {tags.map((x) => (
                    <span key={x}>[ {x} ]</span>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="pointer-events-auto flex items-center gap-2">
              <button onClick={() => step(-1)} aria-label="Previous token" className="grid size-11 place-items-center rounded-xl border border-white/35 bg-black/30 text-ink backdrop-blur md:hidden">
                <ChevronLeft size={18} strokeWidth={1.5} />
              </button>
              <Link to={`/token/${t.address}`} className={btn}>
                Play ${t.symbol}
              </Link>
              <Link to={`/token/${t.address}`} aria-label={`Open $${t.symbol}`} className={cx(btn, "px-3")}>
                <ArrowRight size={18} strokeWidth={2} />
              </Link>
              <button onClick={() => step(1)} aria-label="Next token" className="grid size-11 place-items-center rounded-xl border border-white/35 bg-black/30 text-ink backdrop-blur md:hidden">
                <ChevronRight size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
      <motion.div aria-hidden style={{ opacity: leave.shade }} className="pointer-events-none absolute inset-0 z-20 bg-black" />
    </section>
  );
}

// ───────────── 4 · how the game pays, drag to explore ─────────────

const ICON = {
  plus: ["...XX...", "...XX...", "...XX...", "XXXXXXXX", "XXXXXXXX", "...XX...", "...XX...", "...XX..."],
  gem: ["...XX...", "..XXXX..", ".XXXXXX.", "XXXXXXXX", "XXX..XXX", ".XXXXXX.", "..XXXX..", "...XX..."],
  tiers: [".......X", "......XX", "......XX", "...XX.XX", "...XX.XX", "XX.XX.XX", "XX.XX.XX", "XX.XX.XX"],
  lock: ["..XXXX..", ".X....X.", ".X....X.", "XXXXXXXX", "XXX..XXX", "XXX..XXX", "XXXXXXXX", "XXXXXXXX"],
  down: ["...XX...", "...XX...", "...XX...", "...XX...", "XXXXXXXX", ".XXXXXX.", "..XXXX..", "...XX..."],
  crown: ["X..XX..X", "XX.XX.XX", "XXXXXXXX", "XXXXXXXX", ".XXXXXX.", ".XXXXXX.", "........", "XXXXXXXX"],
  refill: ["XXXXXXXX", "X......X", "X.XXXX.X", "X.XXXX.X", "X.XXXX.X", "X.XXXX.X", "X......X", "XXXXXXXX"],
};

const RULES = [
  { icon: ICON.plus, big: `+${MIN_BONUS_BPS / 100}–${MAX_BONUS_BPS / 100}%`, name: "Bonus on every buy", tags: ["paid by OnTopHook", "same block as the swap", "rate set per launch"] },
  { icon: ICON.gem, big: `${HOLDERS_BPS / 100}%`, name: "Holders paid in ETH", tags: ["of every pool fee", "pushed in rounds", "nothing to claim"] },
  { icon: ICON.tiers, big: `${TIERS[TIERS.length - 1]!.mult}×`, name: "Hold longer, earn more", tags: TIERS.map((t) => `${t.label} ${t.mult}×`) },
  { icon: ICON.lock, big: "93%", name: "Liquidity locked for good", tags: ["Uniswap v4 position", "owned by OnTopLaunchpad", "no remove function"] },
  { icon: ICON.down, big: "+1%", name: "Buyers ahead, flippers pay", tags: ["fee derived from the bonus", "every buy nets at least 1% ahead", "round trips always lose"] },
  { icon: ICON.refill, big: `${TREASURY_BPS / 100}%`, name: "A treasury that refills", tags: [`${TREASURY_BPS / 100}% of supply locked`, "sell fees top it up", "the excess is burned"] },
  { icon: ICON.crown, big: `${CREATOR_BPS / 100}%`, name: "Creators earn every trade", tags: [`${CREATOR_BPS / 100}% of pool fees`, "claimable any time", "launch in one transaction"] },
];

function PixelIcon({ rows, className }: { rows: string[]; className?: string }) {
  return (
    <svg viewBox="0 0 8 8" className={className} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((r, y) => [...r].map((c, x) => (c === "X" ? <rect key={`${x}${y}`} x={x} y={y} width="1" height="1" fill="var(--lime)" /> : null)))}
    </svg>
  );
}

/** Signed distance from the centre on a loop of RULES.length cards, so the reel has no ends. */
const wrap = (o: number) => {
  const n = RULES.length;
  return ((((o + n / 2) % n) + n) % n) - n / 2;
};

function RuleCard({ r, i, pos, gap, onPick }: { r: (typeof RULES)[number]; i: number; pos: MotionValue<number>; gap: number; onPick: () => void }) {
  const x = useTransform(pos, (p) => wrap(i - p) * gap);
  const rotateY = useTransform(pos, (p) => wrap(i - p) * -16);
  const z = useTransform(pos, (p) => -Math.abs(wrap(i - p)) * 130);
  // fades out before the seam, so a card never visibly jumps from one end to the other
  const opacity = useTransform(pos, (p) => Math.max(0, 1 - Math.abs(wrap(i - p)) * 0.31));
  return (
    <motion.button type="button" tabIndex={-1} onClick={onPick} style={{ x, rotateY, z, opacity }} className="absolute left-[calc(50%-85px)] top-0 w-[170px] md:left-[calc(50%-115px)] md:w-[230px]">
      <div className="flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(120%_85%_at_50%_0%,#33440a,#0d0f0a_72%)] p-5 text-left shadow-[0_30px_60px_rgb(0_0_0/0.7)]">
        <PixelIcon rows={r.icon} className="size-14 md:size-20" />
        <span className="font-display whitespace-nowrap text-[40px] leading-none font-[800] text-lime md:text-[64px]">{r.big}</span>
      </div>
    </motion.button>
  );
}

function HowItPays({ onHover }: { onHover: (h: Hover) => void }) {
  // the reel starts a few cards back and spins to the first rule when it comes into view
  const pos = useMotionValue(-3);
  const reel = useRef<HTMLDivElement>(null);
  const seen = useInView(reel, { once: true, amount: 0.5 });
  const [active, setActive] = useState(0);
  const [gap, setGap] = useState(250);
  const drag = useRef<{ x: number; p: number; t: number; v: number; moved: number } | null>(null);
  const moved = useRef(0);
  useMotionValueEvent(pos, "change", (v) => setActive(((Math.round(v) % RULES.length) + RULES.length) % RULES.length));
  useEffect(() => {
    const q = matchMedia("(min-width: 768px)");
    const f = () => setGap(q.matches ? 280 : 200);
    f();
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  const go = (to: number) => void animate(pos, to, { type: "spring", stiffness: 240, damping: 30 });
  useEffect(() => {
    if (seen) void animate(pos, 0, { type: "spring", stiffness: 60, damping: 18 });
  }, [seen, pos]);
  const onDown = (e: ReactPointerEvent) => {
    pos.stop();
    drag.current = { x: e.clientX, p: pos.get(), t: performance.now(), v: 0, moved: 0 };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const next = d.p - (e.clientX - d.x) / gap;
    d.v = ((next - pos.get()) / Math.max(1, now - d.t)) * 1000;
    d.t = now;
    d.moved = Math.max(d.moved, Math.abs(e.clientX - d.x));
    // capture only once it is a drag, so a plain click still reaches the card under the pointer
    if (d.moved > 5 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
    pos.set(next);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    moved.current = d?.moved ?? 0;
    if (d) go(Math.round(pos.get() + (d.moved > 5 ? d.v * 0.12 : 0)));
  };
  const r = RULES[active]!;
  return (
    <section data-ch="How it pays" className="stage-dark relative isolate z-10 overflow-x-clip bg-black px-4 pb-24 pt-20">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-40 bg-gradient-to-b from-transparent to-black" />
      <div className="text-center">
        <Rise text="How the game pays" className="font-title text-[34px] leading-[1.05] md:text-[60px]" />
        <div className="num mt-3 flex items-center justify-center gap-3 text-[13px] text-ink-2">
          <button onClick={() => go(Math.round(pos.get()) - 1)} aria-label="Previous rule" className="grid size-8 place-items-center rounded-lg hover:bg-white/10">
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          [ {two(active + 1)} / {two(RULES.length)} ]
          <button onClick={() => go(Math.round(pos.get()) + 1)} aria-label="Next rule" className="grid size-8 place-items-center rounded-lg hover:bg-white/10">
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div
        ref={reel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerEnter={() => onHover({ label: "Drag to explore" })}
        onPointerLeave={() => onHover(null)}
        className="relative mx-auto mt-14 h-[240px] cursor-grab touch-pan-y select-none [perspective:1200px] [transform-style:preserve-3d] active:cursor-grabbing md:h-[320px]"
      >
        {RULES.map((x, i) => (
          <RuleCard key={x.name} r={x} i={i} pos={pos} gap={gap} onPick={() => moved.current <= 5 && go(Math.round(pos.get() + wrap(i - pos.get())))} />
        ))}
        <div aria-hidden className="pointer-events-none absolute left-[calc(50%-97px)] top-[-14px] h-[254px] w-[194px] rounded-[22px] border border-white/60 md:left-[calc(50%-131px)] md:top-[-16px] md:h-[339px] md:w-[262px]" />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={r.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="mt-14 text-center">
          <h3 className="font-title text-[22px] leading-tight md:text-[30px]">{r.name}</h3>
          <div className="num mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
            {r.tags.map((x) => (
              <span key={x}>[ {x} ]</span>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

// ───────────── 5 · the pitch, lit word by word ─────────────

// *starred* words light up lime instead of white
const PITCH = "ONTOPPAD is a launchpad where every buy lands with *bonus *tokens *on *top and every holder is *paid *in *ETH from the trading. No staking, no claiming, no points. The contracts do it on every trade, and every number lives on-chain for anyone to check.";

function Word({ w, i, n, p }: { w: string; i: number; n: number; p: MotionValue<number> }) {
  const start = (i / n) * 0.8;
  const opacity = useTransform(p, [start, start + 0.08], [0.2, 1]);
  const hot = w.startsWith("*");
  return <motion.span style={{ opacity }} className={hot ? "text-lime" : undefined}>{`${hot ? w.slice(1) : w} `}</motion.span>;
}

function Pitch() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const blur = useTransform(scrollYProgress, [0, 0.4, 1], ["blur(6px)", "blur(1px)", "blur(3px)"]);
  const words = useMemo(() => PITCH.split(" "), []);
  return (
    <section ref={ref} data-ch="The pitch" className="stage-dark relative h-[200vh] bg-black">
      <div className="sticky top-[92px] flex h-[calc(100svh-92px)] items-center px-4 md:px-[8%]">
        <motion.span aria-hidden style={{ filter: blur }} className="font-title absolute left-[4%] top-1/2 hidden -translate-y-1/2 text-[44px] text-ink/45 lg:block">
          The pitch
        </motion.span>
        <p className="mx-auto max-w-[780px] text-[26px] leading-[1.35] font-medium tracking-tight text-ink md:text-[36px] lg:ml-[34%] lg:max-w-[640px]">
          {words.map((w, i) => (
            <Word key={i} w={w} i={i} n={words.length} p={scrollYProgress} />
          ))}
        </p>
      </div>
    </section>
  );
}

// ───────────── 6 · the receipts ─────────────

const AMOUNTS = ["0.001", "0.005", "0.01"] as const;

/** Live quote for the house token, read from Uniswap v4: the product in one card. */
function QuoteCard({ token, ethUsd }: { token?: TokenSummary; ethUsd: number }) {
  const [amountIn, setAmountIn] = useState<(typeof AMOUNTS)[number]>("0.001");
  const { data } = useQuery({
    queryKey: ["hero-quote", token?.address, amountIn],
    queryFn: () => quote(token!, "buy", parseEther(amountIn)),
    enabled: !!token,
    refetchInterval: 15_000,
  });
  const base = data ? Number(formatUnits(data.out, 18)) : 0;
  const bonus = data ? Number(formatUnits(data.bonus, 18)) : 0;
  const total = useTween(base + bonus);
  return (
    <div className="w-full rounded-2xl border border-line-2 bg-card p-6 shadow-[0_30px_60px_rgb(0_0_0/0.35)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {token && <TokenArt src={token.image} address={token.address} symbol={token.symbol} size={32} />}
          <span className="text-[15px] font-medium">{token ? `Buy $${token.symbol}` : "Buy the first launch"}</span>
        </div>
        <span className="num text-[12px] text-ink-3">[ live quote ]</span>
      </div>
      <Segmented value={amountIn} onChange={setAmountIn} options={AMOUNTS.map((a) => ({ value: a, label: `${a} ETH` }))} className="mt-5" />
      <div className="num mt-5 flex flex-col gap-2 text-[13px]">
        <div className="flex justify-between">
          <span className="text-ink-3">Base from the pool</span>
          <span className="text-ink-2">{base > 0 ? amount(base) : "Quoting"}</span>
        </div>
        <div className="flex items-center justify-between">
          <Stamp bps={token?.bonusBps ?? 500} />
          <span className="text-accent">{bonus > 0 ? `+${amount(bonus)}` : "Quoting"}</span>
        </div>
      </div>
      <div className="mt-5 flex items-baseline justify-between border-t border-line pt-5">
        <span className="text-[14px]">You get</span>
        {base > 0 ? <span className="font-display text-[48px] leading-none font-[800] text-ink">{amount(total)}</span> : <span className="text-ink-3">Quoting</span>}
      </div>
      {token && base > 0 && <p className="num mt-2 text-[12px] text-ink-3">≈ {usd((base + bonus) * token.price * ethUsd)} · read from Uniswap v4 just now</p>}
    </div>
  );
}

function WalletCheck() {
  const nav = useNavigate();
  const [v, setV] = useState("");
  const ok = isAddress(v.trim());
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) nav(`/rewards/${v.trim()}`);
      }}
    >
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Check any wallet, 0x…" aria-label="Wallet address" className="num h-11 flex-1 rounded-xl border border-line-2 bg-deep px-4 text-[13px] placeholder:text-ink-3 focus:border-[var(--accent)] focus:outline-none" />
      <button type="submit" disabled={!ok} className={cx(btn, "justify-center disabled:opacity-50")}>
        Look up
      </button>
    </form>
  );
}

function BigStat({ label, value, format, empty, loading }: { label: string; value: number; format: (v: number) => string; empty: string; loading?: boolean }) {
  const v = useTween(value);
  return (
    <div className="flex flex-col gap-2">
      <span className="num text-[12px] text-ink-3">[ {label} ]</span>
      {loading ? <Skeleton className="h-[34px] w-32 rounded-md sm:h-[46px] md:h-[56px] md:w-44" /> : value > 0 ? <span className="font-display whitespace-nowrap text-[34px] leading-none font-[800] text-ink sm:text-[46px] md:text-[56px]">{format(v)}</span> : <span className="text-[18px] leading-7 text-ink-2">{empty}</span>}
    </div>
  );
}

function Receipts({ house, ethUsd }: { house?: TokenSummary; ethUsd: number }) {
  const { data: s } = useStats();
  return (
    <section data-ch="Receipts" className="relative overflow-x-clip px-4 pb-24 pt-40 md:px-6">
      <PixelEdge from="#000000" />
      <div className="relative z-10 grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <span className="num text-[13px] text-ink-3">[ the receipts ]</span>
          <Rise text={"Every number,\non-chain."} className="font-title mt-3 text-[38px] leading-[1.02] md:text-[64px]" />
          <motion.div initial="hide" whileInView="show" viewport={{ once: true, margin: "0px 0px -10% 0px" }} variants={STAGGER} className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8">
            <motion.div variants={LIFT}>
              <BigStat label="tokens launched" loading={!s} value={s?.tokens ?? 0} format={(v) => Math.round(v).toString()} empty="First launch pending" />
            </motion.div>
            <motion.div variants={LIFT}>
              <BigStat label="bonus paid on buys" loading={!s} value={s?.bonusUsd ?? 0} format={usd} empty="Waiting on the first buy" />
            </motion.div>
            <motion.div variants={LIFT}>
              <BigStat label="paid to holders" loading={!s} value={s?.paid ?? 0} format={(v) => eth(v)} empty="First round filling" />
            </motion.div>
            <motion.div variants={LIFT}>
              <BigStat label="trades" loading={!s} value={s?.trades ?? 0} format={(v) => Math.round(v).toLocaleString("en-US")} empty="Market opens with the first buy" />
            </motion.div>
          </motion.div>
          {!s ? (
            <SkeletonLine className="mt-6 w-80 max-w-full text-[12px]" />
          ) : (
            <p className="num mt-6 text-[12px] text-ink-3">
              Indexed to block {s.indexed.toLocaleString("en-US")} · {s.head - s.indexed < 120 ? "live" : "catching up"} · last trade {s.lastTradeAt ? ago(s.lastTradeAt) : "pending"}
            </p>
          )}
          <div className="mt-8 max-w-xl">
            <WalletCheck />
          </div>
        </div>
        <motion.div initial={{ opacity: 0, y: 60, rotate: 2 }} whileInView={{ opacity: 1, y: 0, rotate: 0 }} viewport={{ once: true, margin: "0px 0px -10% 0px" }} transition={{ duration: 0.8, ease: EASE }}>
          <QuoteCard token={house} ethUsd={ethUsd} />
        </motion.div>
      </div>
    </section>
  );
}

// ───────────── 7 · what a buy does ─────────────

const FLOW = [
  ["Your wallet", "sends ETH with a minimum out"],
  ["OnTopRouter.buy", "opens a Uniswap v4 unlock, passes you as the buyer"],
  ["PoolManager.swap", "fills against the locked launch liquidity"],
  ["OnTopHook.afterSwap", "pays the bonus from the token treasury"],
  ["Your wallet", "receives base + bonus in the same block"],
];

function PressBuy() {
  return (
    <section data-ch="Press buy" className="px-4 py-24 md:px-6">
      <span className="num text-[13px] text-ink-3">[ one transaction, four contracts ]</span>
      <Rise text="What happens when you press buy" className="font-title mt-3 text-[32px] leading-[1.05] md:text-[56px]" />
      <div className="mt-12 grid gap-4 lg:grid-cols-5">
        {FLOW.map(([k, v], i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
            className={cx("flex flex-col gap-3 rounded-2xl border p-5", i === 3 ? "border-[var(--sticker-shadow)] bg-lime text-lime-ink shadow-[5px_5px_0_var(--sticker-shadow)]" : "border-line bg-card")}
          >
            <span className="font-display text-[40px] leading-none font-[800]">{two(i + 1)}</span>
            <span className="num text-[13px] font-medium">{k}</span>
            <span className={cx("text-[13px]", i === 3 ? "opacity-80" : "text-ink-2")}>{v}</span>
          </motion.div>
        ))}
      </div>
      <motion.div initial="hide" whileInView="show" viewport={{ once: true, margin: "0px 0px -8% 0px" }} variants={STAGGER} className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <motion.div variants={LIFT} className="rounded-2xl border border-line bg-card p-5">
          <span className="num text-[13px]">Then the pool fee splits</span>
          <p className="mt-2 text-[13px] text-ink-2">Fees accrue to the position OnTopLaunchpad owns. Token-side fees refill the bonus treasury and the excess burns.</p>
        </motion.div>
        {[
          [`${HOLDERS_BPS / 100}%`, "Holders", "pushed in ETH rounds"],
          [`${CREATOR_BPS / 100}%`, "Creator", "claimable any time"],
          [`${PLATFORM_BPS / 100}%`, "Platform", "keeps the lights on"],
        ].map(([p, k, s], i) => (
          <motion.div key={k} variants={LIFT} className={cx("flex flex-col gap-1 rounded-2xl border p-5", i === 0 ? "border-[var(--accent)]" : "border-line", "bg-card")}>
            <span className={cx("font-display text-[52px] leading-none font-[800]", i === 0 && "text-accent")}>{p}</span>
            <span className="text-[14px]">{k}</span>
            <span className="text-[12px] text-ink-3">{s}</span>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

// ───────────── 8 · answers ─────────────

const FAQ = [
  {
    q: "Where do the bonus tokens come from",
    a: `Every launch locks ${TREASURY_BPS / 100}% of its supply inside OnTopHook as a bonus treasury. Each buy pays its bonus out of that treasury in the same transaction, and sell-side fees refill it. Nobody can withdraw it.`,
  },
  {
    q: "Can someone farm the bonus by buying and selling",
    a: "No. The pool fee is derived from the bonus so a buy nets at least 1% ahead of the pre-trade price, while a buy-then-sell round trip always ends below where it started. The math is in OnTopLaunchpad.feeFor and fuzz-tested.",
  },
  {
    q: "How are holder payouts split",
    a: `${HOLDERS_BPS / 100}% of pair-asset fees go to holders, ${CREATOR_BPS / 100}% to the creator and ${PLATFORM_BPS / 100}% to the platform. Holders share by balance times hold time: ${TIERS.map((t) => `${t.mult}× ${t.label.toLowerCase()}`).join(", ")}.`,
  },
  {
    q: "Do I need to stake or claim",
    a: "No. Payouts are pushed to your wallet in rounds. If a wallet cannot receive ETH, its share is parked in OnTopDistributor for it to claim any time.",
  },
  {
    q: "Can liquidity be pulled",
    a: "No. OnTopLaunchpad owns every launch position and has no function that removes liquidity. Only fee collection touches the position.",
  },
];

// ───────────── 9 · the close ─────────────

/** Display line where a few letters flicker like a tired tube. */
function Flicker({ text, seed }: { text: string; seed: number }) {
  return (
    <>
      {[...text].map((c, i) => (
        <span key={i} className={hash(i, seed) > 0.86 && c !== " " ? "flicker" : undefined} style={{ animationDelay: `${(hash(seed, i) * 4).toFixed(2)}s` }}>
          {c}
        </span>
      ))}
    </>
  );
}

function Close({ tokens, onHover, onPick }: { tokens: TokenSummary[]; onHover: (h: Hover) => void; onPick: (to: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const arrive = useArrive(ref);
  const [failed, setFailed] = useState(false);
  return (
    <section ref={ref} data-ch="Insert coin" className={cx(ROOM, "bg-[#0a0e0e]")}>
      <motion.div style={{ scale: arrive }} className="absolute inset-0">
        {failed ? (
          <div className="absolute right-[-8%] top-1/2 w-[58%] -translate-y-1/2 rotate-[-5deg] max-md:hidden">
            <CssTv />
          </div>
        ) : (
          <Suspense fallback={null}>
            <CrtScene mode="cta" tokens={tokens} onHover={onHover} onPick={onPick} onFail={() => setFailed(true)} />
          </Suspense>
        )}
      </motion.div>
      <PixelEdge from="--bg" />
      <div aria-hidden className="crt-overlay pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 to-transparent md:hidden" />
      <div className="pointer-events-none relative z-10 flex h-full flex-col justify-end px-4 pb-24 md:justify-center md:px-[6%] md:pb-0">
        <Rise text={"Got a token\nin mind?"} flicker className="font-title text-[38px] leading-[1.02] md:text-[72px]" />
        <p className="mt-4 text-[20px] text-ink-2 md:text-[24px]">Launch it in one transaction.</p>
        <div className="mt-6 h-px w-full max-w-md bg-white/20" />
        <div className="pointer-events-auto mt-6 flex flex-wrap gap-3">
          <Link to="/launch" className={btn}>
            Launch a token
          </Link>
          <Link to="/rules" className={btnGhost}>
            Read the rules
          </Link>
        </div>
      </div>
    </section>
  );
}

// ───────────── page ─────────────

export default function Home() {
  const nav = useNavigate();
  const { data: tokens } = useTokens("hot");
  const { data: cfg } = useConfig();
  const [pill, setPill] = useState<string | null>(null);
  const list = useMemo(() => tokens ?? [], [tokens]);
  const house = list.find((t) => t.symbol === HOUSE_SYMBOL) ?? list[0];
  const onHover = (h: Hover) => setPill(h?.label ?? null);
  const onPick = (to: string) => {
    setPill(null);
    nav(to);
  };
  return (
    <div>
      <Hud ready={list.length > 0} />
      <CursorPill label={pill} />
      <Hero tokens={list} onHover={onHover} onPick={onPick} />
      <Marquee tokens={list} />
      <NowPlaying tokens={list} onHover={onHover} onPick={onPick} />
      <ChainMarket />
      <HowItPays onHover={onHover} />
      <Pitch />
      <Receipts house={house} ethUsd={cfg?.ethUsd ?? 0} />
      <PressBuy />

      <section data-ch="The machines" className="px-4 py-24 md:px-6">
        <span className="num text-[13px] text-ink-3">[ verified source ]</span>
        <Rise text="The machines behind every number" className="font-title mb-10 mt-3 text-[32px] leading-[1.05] md:text-[56px]" />
        <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -10% 0px" }} transition={{ duration: 0.7, ease: EASE }}>
          <ContractsTable />
        </motion.div>
      </section>

      <section data-ch="Answers" className="grid gap-8 px-4 pb-40 pt-24 md:px-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <span className="num text-[13px] text-ink-3">[ straight answers ]</span>
          <Rise text="The questions every degen asks first" className="font-title mt-3 text-[30px] leading-[1.05] md:text-[44px]" />
        </div>
        <motion.div initial="hide" whileInView="show" viewport={{ once: true, margin: "0px 0px -10% 0px" }} variants={STAGGER} className="flex flex-col">
          {FAQ.map((f) => (
            <motion.details key={f.q} variants={LIFT} className="group border-b border-line py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-medium">
                {f.q}
                <span className="num text-[20px] text-ink-3 transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-[14px] leading-6 text-ink-2">{f.a}</p>
            </motion.details>
          ))}
        </motion.div>
      </section>

      <Close tokens={list} onHover={onHover} onPick={onPick} />
    </div>
  );
}
