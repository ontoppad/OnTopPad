import { useSyncExternalStore } from "react";

// Arcade sounds, synthesised on the spot: square-wave blips, no files to load. Mute is remembered per browser.

const KEY = "ontop-sound";
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
})();
const subs = new Set<() => void>();

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? "off" : "on");
  } catch {
    // preference just won't persist
  }
  subs.forEach((f) => f());
  // called from the toggle's click, which is the gesture the browser wants before audio starts
  if (!m) coin();
}

export const useMuted = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => muted,
  );

let ctx: AudioContext | null = null;

/** null while muted, or until the browser allows audio (it needs one click or key on the page first). */
function audio(): AudioContext | null {
  if (muted || typeof AudioContext === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx.state === "running" ? ctx : null;
}

// the first press anywhere unlocks audio, so a payout that lands later can still be heard
if (typeof window !== "undefined") addEventListener("pointerdown", () => !muted && audio(), { once: true });

function blip(c: AudioContext, at: number, freq: number, dur: number, vol = 0.06, type: OscillatorType = "square") {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** The classic two-note coin: a buy landed. */
export function coin() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  blip(c, t, 988, 0.08);
  blip(c, t + 0.08, 1319, 0.4);
}

/** A cascade of coins hitting the tray: a payout round went out. */
export function spill(n = 16) {
  const c = audio();
  if (!c) return;
  let t = c.currentTime;
  for (let i = 0; i < n; i++) {
    blip(c, t, 1400 + Math.random() * 1400, 0.09, 0.045 * (1 - i / (n * 1.4)));
    t += 0.035 + Math.random() * 0.05;
  }
}

/** One notch of a spinning reel. */
export function tick() {
  const c = audio();
  if (c) blip(c, c.currentTime, 1900, 0.025, 0.03, "triangle");
}

/** A reel or the claw locking into place. */
export function clunk() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  blip(c, t, 220, 0.12, 0.08, "triangle");
  blip(c, t + 0.01, 660, 0.06, 0.03);
}

/** The claw's motor while it travels. Returns the stop. */
export function whirr(): () => void {
  const c = audio();
  if (!c) return () => {};
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sawtooth";
  o.frequency.value = 70;
  g.gain.value = 0.018;
  o.connect(g).connect(c.destination);
  o.start();
  return () => {
    g.gain.setTargetAtTime(0, c.currentTime, 0.03);
    o.stop(c.currentTime + 0.2);
  };
}
