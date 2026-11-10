import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useConfig, useStats, useTokens } from "../lib/api.ts";
import { chain, network } from "../lib/chain.ts";
import { amount } from "../lib/format.ts";
import { cx } from "./ui.tsx";

const KEY = "ontop-booted";
const MODEL = ["crt.gltf", "television_02.bin", "diff.webp", "nor_gl.webp", "arm.webp"].map((f) => `/models/crt/${f}`);
const CELL = 24;
const BLOCKS = 16;

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** First visit only (or any URL with ?splash): the station boots like an arcade cabinet, then dissolves into the site. */
export function Splash() {
  const [show, setShow] = useState(() => {
    try {
      return new URLSearchParams(location.search).has("splash") || !localStorage.getItem(KEY);
    } catch {
      return false;
    }
  });
  return show ? <Boot onDone={() => setShow(false)} /> : null;
}

function Boot({ onDone }: { onDone: () => void }) {
  const { data: cfg } = useConfig();
  const { data: tokens } = useTokens();
  const { data: stats } = useStats();
  const [warm, setWarm] = useState(false);
  const [tick, setTick] = useState(0);
  const [late, setLate] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  // the boot log runs while what the first screen needs loads for real
  useEffect(() => {
    const jobs: Promise<unknown>[] = [document.fonts.ready];
    if (location.pathname === "/") jobs.push(import("./CrtScene.tsx"), ...MODEL.map((u) => fetch(u)));
    void Promise.allSettled(jobs).then(() => setWarm(true));
    const t = setInterval(() => setTick((n) => n + 1), 280);
    // a slow API never holds the door shut
    const l = setTimeout(() => setLate(true), 5000);
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      clearInterval(t);
      clearTimeout(l);
      root.style.overflow = overflow;
    };
  }, []);

  // the black behind the cabinet is a grid of blocks, so it can dissolve away on the way in
  useEffect(() => {
    const c = canvas.current!;
    c.width = Math.ceil(innerWidth / CELL);
    c.height = Math.ceil(innerHeight / CELL);
    const g = c.getContext("2d")!;
    g.fillStyle = "#050605";
    g.fillRect(0, 0, c.width, c.height);
    if (!leaving) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now() + (reduced ? 0 : 220);
    const dur = reduced ? 1 : 700;
    let raf = 0;
    const frame = (now: number) => {
      const p = Math.max(0, (now - start) / dur);
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (hash(x, y) < p) g.clearRect(x, y, 1, 1);
      if (p < 1) raf = requestAnimationFrame(frame);
      else done.current();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [leaving]);

  const house = tokens?.find((t) => t.symbol === "ONTOP") ?? tokens?.[0];
  const steps = [
    { text: `LINK ${network.label.toUpperCase()} · CHAIN ${chain.id}`, ok: !!cfg },
    { text: cfg ? `SYNC BLOCK #${cfg.indexed.toLocaleString("en-US")}` : "SYNC BLOCKS", ok: !!cfg },
    { text: tokens ? (tokens.length ? `LOAD BOARD · ${tokens.length} TOKENS LIVE` : "BOARD OPEN · FIRST LAUNCH WINS") : "LOAD BOARD", ok: !!tokens },
    { text: house ? `ARM BONUS · +${house.bonusBps / 100}% ON TOP` : "ARM BONUS TREASURY", ok: !!tokens },
    { text: "WARM UP SCREENS", ok: warm },
  ];
  // lines print one beat apart and wait on whatever they report
  const waiting = late ? -1 : steps.findIndex((s) => !s.ok);
  const shown = Math.min(Math.max(0, tick - 2), waiting === -1 ? steps.length : waiting + 1);
  const settled = steps.slice(0, shown).filter((s) => s.ok || late).length;
  const ready = settled === steps.length && tick >= steps.length + 4;

  const enter = () => {
    if (leaving) return;
    setLeaving(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // the splash just shows again next time
    }
  };
  const enterRef = useRef(enter);
  enterRef.current = enter;

  useEffect(() => {
    const key = () => enterRef.current();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => enterRef.current(), 2400);
    return () => clearTimeout(t);
  }, [ready]);

  const corner = "absolute size-6 border-white/60";
  return (
    <div role="dialog" aria-modal aria-label="ONTOPPAD is starting" data-lenis-prevent onClick={enter} className="stage-dark fixed inset-0 z-[100] cursor-pointer select-none overflow-hidden">
      <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />

      {/* tube power-on: a line of light that snaps open into the picture */}
      <motion.div
        aria-hidden
        initial={{ scaleX: 0, scaleY: 1, opacity: 1 }}
        animate={{ scaleX: [0, 1, 1], scaleY: [1, 1, 320], opacity: [1, 1, 0] }}
        transition={{ duration: 0.7, times: [0, 0.45, 1], ease: "easeOut" }}
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-[#efffc4] shadow-[0_0_28px_#cbfd00]"
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={leaving ? { opacity: 0, scale: 1.25, filter: "blur(10px)" } : { opacity: 1 }}
        transition={leaving ? { duration: 0.35, ease: [0.4, 0, 1, 1] } : { delay: 0.45, duration: 0.4 }}
        className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6"
      >
        <span className={cx(corner, "left-4 top-4 rounded-tl-xl border-l border-t")} />
        <span className={cx(corner, "right-4 top-4 rounded-tr-xl border-r border-t")} />
        <span className={cx(corner, "bottom-4 left-4 rounded-bl-xl border-b border-l")} />
        <span className={cx(corner, "bottom-4 right-4 rounded-br-xl border-b border-r")} />
        <span className="num absolute left-9 top-8 text-[12px] text-ink-2">1UP</span>
        {stats && stats.bonusTokens > 0 && <span className="num absolute right-9 top-8 text-[12px] text-ink-2">HI-SCORE {amount(stats.bonusTokens)}</span>}
        <span className="num absolute bottom-8 left-9 text-[12px] text-ink-3">ONTOPPAD BIOS</span>
        <button
          type="button"
          autoFocus
          onClick={(e) => {
            e.stopPropagation();
            enter();
          }}
          className="num absolute bottom-7 right-8 rounded-md px-2 py-1 text-[12px] text-ink-2 hover:text-ink"
        >
          Skip ›
        </button>

        <motion.img
          src="/brand/logo-256.webp"
          alt=""
          width={104}
          height={104}
          initial={{ opacity: 0, y: -60, rotate: -20, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, rotate: -4, scale: 1 }}
          transition={{ delay: 0.6, type: "spring", bounce: 0.55, duration: 0.8 }}
          className="rounded-2xl border-2 border-[var(--sticker-shadow)] shadow-[5px_5px_0_var(--sticker-shadow),0_0_60px_rgb(203_253_0/0.35)]"
        />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8, duration: 0.5 }} className="flex flex-col items-center gap-2">
          <h1 className="glitch font-title text-[44px] leading-none text-lime md:text-[84px]">ONTOPPAD</h1>
          <p className="num text-[11px] tracking-[0.2em] text-ink-2 md:text-[13px]">GAME STATION · START AHEAD. STAY PAID.</p>
        </motion.div>

        <div aria-live="polite" className="num min-h-[9.5rem] w-full max-w-md rounded-xl border border-white/10 bg-black/50 p-4 text-[11px] leading-6 text-ink-2 md:text-[12px]">
          {steps.slice(0, shown).map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="flex justify-between gap-4">
              <span className="truncate">&gt; {s.text}</span>
              <span className={s.ok ? "text-lime" : "text-ink-3"}>[ {s.ok ? "OK" : late ? "SOON" : <span className="blink">··</span>} ]</span>
            </motion.div>
          ))}
        </div>

        <div className="flex w-full max-w-md gap-1" aria-hidden>
          {Array.from({ length: BLOCKS }, (_, i) => (
            <span key={i} className={cx("h-3 flex-1 rounded-[2px] transition-colors duration-300", i < Math.round((settled / steps.length) * BLOCKS) ? "bg-lime shadow-[0_0_8px_rgb(203_253_0/0.6)]" : "bg-white/10")} />
          ))}
        </div>

        <div className="flex h-14 flex-col items-center justify-center gap-1">
          <AnimatePresence mode="wait">
            {ready ? (
              <motion.div key="start" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-1">
                <span className="blink font-title text-[22px] text-lime md:text-[28px]">Press start</span>
                <span className="num text-[11px] text-ink-3">
                  <span className="hidden pointer-fine:inline">Click or press any key</span>
                  <span className="pointer-fine:hidden">Tap anywhere</span>
                </span>
              </motion.div>
            ) : (
              <motion.span key="loading" exit={{ opacity: 0 }} className="num text-[11px] tracking-[0.2em] text-ink-3">
                LOADING THE BOARD
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <motion.div aria-hidden animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: 0.3 }} className="crt-overlay crt-roll pointer-events-none absolute inset-0" />
    </div>
  );
}
