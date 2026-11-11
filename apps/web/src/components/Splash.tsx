import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useConfig, useStats, useTokens } from "../lib/api.ts";
import { chain, network } from "../lib/chain.ts";
import { amount } from "../lib/format.ts";
import { cx, Logo, Wordmark } from "./ui.tsx";

const KEY = "ontop-booted";
const MODEL = ["crt.gltf", "television_02.bin", "diff.webp", "nor_gl.webp", "arm.webp"].map((f) => `/models/crt/${f}`);
const CELL = 8; // the portal's edge is drawn on a canvas this coarse, so it stays pixel-art
const BLOCKS = 16;
const TAU = Math.PI * 2;
const T = 2.1; // seconds from the press to the site
const OPEN = 1.15; // the portal starts opening here
const ARRIVE = 1.45; // the landing starts assembling here, inside the opening portal

export const ENTER_EVENT = "ontop:enter";
let entered = false;

/** True until the splash has let the visitor in: pages with an entrance of their own hold it back until then. */
export function splashDue() {
  try {
    return !entered && (new URLSearchParams(location.search).has("splash") || !localStorage.getItem(KEY));
  } catch {
    return false;
  }
}

function arrive() {
  entered = true;
  dispatchEvent(new Event(ENTER_EVENT));
}

/** First visit only (or any URL with ?splash): the station boots like an arcade cabinet, then you dive through the screen into the site. */
export function Splash() {
  const [show, setShow] = useState(splashDue);
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
  const warp = useRef<HTMLCanvasElement>(null);
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

  // the black behind the cabinet is a coarse pixel canvas, so the portal can be cut out of it
  useEffect(() => {
    const c = canvas.current!;
    c.width = Math.ceil(innerWidth / CELL);
    c.height = Math.ceil(innerHeight / CELL);
    const g = c.getContext("2d")!;
    g.fillStyle = "#050605";
    g.fillRect(0, 0, c.width, c.height);
  }, []);

  // the dive: a tunnel of light rushes past, the stage sign swells out of it, then a lime-ringed portal opens from the centre onto the site.
  // Everything but the portal is drawn on one half-resolution canvas (the browser scales it up): a full-screen layer is what stutters on phones.
  useEffect(() => {
    if (!leaving) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      arrive();
      done.current();
      return;
    }
    const iris = canvas.current!;
    const ig = iris.getContext("2d")!;
    const wc = warp.current!;
    const res = 0.5;
    const W = (wc.width = Math.ceil(innerWidth * res));
    const H = (wc.height = Math.ceil(innerHeight * res));
    const g = wc.getContext("2d")!;
    g.lineCap = "round";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const cx = W / 2;
    const cy = H / 2;
    const f = Math.min(W, H) * 0.5;
    const ix = iris.width / 2;
    const iy = iris.height / 2;
    const reach = Math.hypot(ix, iy) + 3;
    const size = Math.min(104, innerWidth * 0.13) * res;
    const out = (x: number) => 1 - (1 - x) ** 3;
    const star = (z = 0.1 + Math.random() * 0.9) => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z, hot: Math.random() < 0.3 });
    const stars = Array.from({ length: 260 }, () => star());
    let phase = 0;
    let last = 0;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      // depth per second: a slow drift for the first beat, then it climbs hard
      const k = Math.min(1, Math.max(0, (t - 0.15) / (T - 0.15)));
      const v = 0.2 + 5.5 * k ** 3;
      const fade = (t < 1.55 ? 1 : Math.max(0, 1 - (t - 1.55) / (T - 1.55))) * Math.min(1, t / 0.4);
      g.clearRect(0, 0, W, H);

      // the light at the end of the tunnel; it swells into the lime flash as we break through (one soft pulse, never a strobe)
      const pulse = t < OPEN - 0.06 ? 0 : t < OPEN + 0.12 ? (t - OPEN + 0.06) / 0.18 : Math.max(0, (1.7 - t) / 0.58);
      const r = f * (0.25 + 2.2 * k ** 2 + 1.6 * pulse);
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      glow.addColorStop(0, "rgba(239,255,196,0.9)");
      glow.addColorStop(0.35, "rgba(203,253,0,0.35)");
      glow.addColorStop(1, "rgba(203,253,0,0)");
      g.globalAlpha = Math.min(1, t / 0.6) * Math.min(1, 0.8 * (t < 1.55 ? 1 : fade) + 0.55 * pulse);
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);

      // screen-shaped frames rush toward the camera: the walls of the tunnel
      phase += v * dt * 0.5;
      g.strokeStyle = "#cbfd00";
      for (let i = 0; i < 9; i++) {
        const z = (((i / 9 - phase) % 1) + 1) % 1;
        if (z < 0.06) continue;
        const hw = (W * 0.1) / z;
        const hh = (H * 0.1) / z;
        g.globalAlpha = (1 - z) ** 1.4 * 0.85 * fade;
        g.lineWidth = (1.5 + (1 - z) * 4) * res;
        g.beginPath();
        g.roundRect(cx - hw, cy - hh, hw * 2, hh * 2, hw * 0.12);
        g.stroke();
      }

      // stars streak outward; the streak is the last 40ms of travel, so it lengthens as speed climbs
      for (const s of stars) {
        s.z -= v * dt;
        if (s.z < 0.03) Object.assign(s, star(1));
        const z0 = s.z + v * 0.04 + 0.004;
        g.globalAlpha = Math.min(1, (1 - s.z) * 1.8) * fade;
        g.strokeStyle = s.hot ? "#ffffff" : "#cbfd00";
        g.lineWidth = (1.5 + (1 - s.z) * 3.5) * res;
        g.beginPath();
        g.moveTo(cx + (s.x / z0) * f, cy + (s.y / z0) * f);
        g.lineTo(cx + (s.x / s.z) * f, cy + (s.y / s.z) * f);
        g.stroke();
      }

      // the stage sign hangs in the tunnel, swells as we near it, and we fly through
      const p = (t - 0.5) / 1.0;
      if (p > 0 && p < 1) {
        const s = p < 0.6 ? 0.1 + 0.9 * out(p / 0.6) : p < 0.72 ? 1 + ((p - 0.6) / 0.12) * 0.12 : 1.12 + 7.88 * ((p - 0.72) / 0.28) ** 2;
        g.globalAlpha = p < 0.6 ? out(p / 0.6) : p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28;
        g.fillStyle = "#cbfd00";
        g.font = `${size * s}px Bungee, sans-serif`;
        g.fillText("STAGE 1", cx, cy);
        g.font = `${Math.max(11, size * 0.16) * s}px "JetBrains Mono Variable", monospace`;
        g.letterSpacing = `${0.3 * Math.max(11, size * 0.16) * s}px`;
        g.fillStyle = "#a7ab9b";
        g.fillText("GET READY", cx, cy - size * 0.95 * s);
        g.fillStyle = "#ffffff";
        g.fillText("THE ARCADE", cx, cy + size * 0.95 * s);
        g.letterSpacing = "0px";
      }

      // the portal: a lime ring on a black sheet, the hole grows faster as we fall through
      const o = Math.min(1, Math.max(0, (t - OPEN) / (T - OPEN)));
      if (o > 0) {
        const hole = reach * o ** 1.6;
        ig.globalCompositeOperation = "source-over";
        ig.fillStyle = "#050605";
        ig.fillRect(0, 0, iris.width, iris.height);
        ig.fillStyle = "#cbfd00";
        ig.beginPath();
        ig.arc(ix, iy, hole + 1.6, 0, TAU);
        ig.fill();
        ig.globalCompositeOperation = "destination-out";
        ig.beginPath();
        ig.arc(ix, iy, hole, 0, TAU);
        ig.fill();
      }
      if (!entered && t >= ARRIVE) arrive();
      if (t < T) raf = requestAnimationFrame(frame);
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

  // only an explicit press opens the site: Enter or Space, a click or a tap (never a timer, never Tab or a shortcut)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") enterRef.current();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

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
        animate={leaving ? { scale: [1, 1.05, 2.4], opacity: [1, 1, 0], x: [0, -6, 5, -3, 0] } : { opacity: 1 }}
        transition={leaving ? { duration: 0.9, times: [0, 0.27, 1], ease: ["easeOut", [0.6, 0, 1, 0.7]], x: { duration: 0.3 } } : { delay: 0.45, duration: 0.4 }}
        // a bitmap scaled by the compositor: a 6x re-raster (or a blur) of the whole screen every frame would stutter on phones
        style={{ willChange: "transform, opacity" }}
        className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6"
      >
        <span className={cx(corner, "left-4 top-4 rounded-tl-xl border-l border-t")} />
        <span className={cx(corner, "right-4 top-4 rounded-tr-xl border-r border-t")} />
        <span className={cx(corner, "bottom-4 left-4 rounded-bl-xl border-b border-l")} />
        <span className={cx(corner, "bottom-4 right-4 rounded-br-xl border-b border-r")} />
        <span className="num absolute left-9 top-8 text-[12px] text-ink-2">1UP</span>
        {stats && stats.bonusTokens > 0 && <span className="num absolute right-9 top-8 text-[12px] text-ink-2">HI-SCORE {amount(stats.bonusTokens)}</span>}
        <span className="num absolute bottom-8 left-9 text-[12px] text-ink-3">ONTOPPAD BIOS · FREE PLAY</span>
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

        <motion.div
          initial={{ opacity: 0, y: -60, rotate: -20, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, rotate: -4, scale: 1 }}
          transition={{ delay: 0.6, type: "spring", bounce: 0.55, duration: 0.8 }}
        >
          <Logo size={104} face="rounded-2xl border-2 border-[var(--sticker-shadow)] shadow-[5px_5px_0_var(--sticker-shadow),0_0_60px_rgb(203_253_0/0.35)]" />
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8, duration: 0.5 }} className="flex flex-col items-center gap-2">
          <h1 className="glitch text-lime">
            <Wordmark className="text-[30px] leading-none md:text-[60px]" />
          </h1>
          <p className="num text-[11px] tracking-[0.2em] text-ink-2 md:text-[13px]">START AHEAD. STAY PAID.</p>
          <p className="num text-[10px] tracking-[0.2em] text-ink-3 md:text-[11px]">LIVE ON ROBINHOOD CHAIN</p>
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
            {leaving ? (
              <motion.span key="go" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="blink font-title text-[22px] text-lime md:text-[28px]" style={{ animationDuration: "0.25s" }}>
                Player 1 ready
              </motion.span>
            ) : ready ? (
              <motion.div key="start" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-1">
                <span className="blink font-title text-[22px] text-lime md:text-[28px]">Press start</span>
                <span className="num text-[11px] text-ink-3">
                  <span className="hidden pointer-fine:inline">
                    Press <kbd className="rounded border border-white/30 bg-white/10 px-1.5 py-0.5 text-ink">ENTER</kbd> or click
                  </span>
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

      <canvas ref={warp} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />

      <motion.div aria-hidden animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: 0.3 }} className="crt-overlay crt-roll pointer-events-none absolute inset-0" />
    </div>
  );
}
