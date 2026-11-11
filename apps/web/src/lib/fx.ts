// Arcade juice: pixel sparks on every press and a coin shower for the curious. DOM-only, nothing to render.

/** The meme coins the logo flips into: the best known on any chain, then Robinhood Chain's own. */
export const COINS = ["doge", "shib", "pepe", "bonk", "wif", "pons", "cashcat"];
export const coinSrc = (c: string) => `/brand/coins/${c}.webp`;

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function spawn(tag: "span" | "img", css: Partial<CSSStyleDeclaration>) {
  const el = document.createElement(tag);
  el.setAttribute("aria-hidden", "");
  Object.assign(el.style, { position: "fixed", pointerEvents: "none", zIndex: "200" }, css);
  document.body.append(el);
  return el;
}

/** A burst of lime pixels where the press landed. */
export function sparks(x: number, y: number) {
  if (calm()) return;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
    const d = 18 + Math.random() * 22;
    const el = spawn("span", { left: `${x - 3}px`, top: `${y - 3}px`, width: "6px", height: "6px", background: "var(--lime)", border: "1px solid var(--sticker-shadow)" });
    el.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(0.3)`, opacity: 0 }], { duration: 420, easing: "cubic-bezier(0.22,1,0.36,1)" }).onfinish = () => el.remove();
  }
}

/** Coins tumble down the whole screen. */
export function coinRain(n = 28) {
  if (calm()) return;
  for (let i = 0; i < n; i++) {
    const s = 28 + Math.random() * 28;
    const el = spawn("img", { left: `${Math.random() * 100}vw`, top: `-${s}px`, width: `${s}px`, height: `${s}px`, borderRadius: "9999px", border: "2px solid var(--sticker-shadow)" }) as HTMLImageElement;
    el.src = coinSrc(COINS[i % COINS.length]!);
    const spin = (Math.random() - 0.5) * 720;
    el.animate([{ transform: "translateY(0) rotate(0)" }, { transform: `translateY(${innerHeight + s * 2}px) rotate(${spin}deg)` }], { duration: 1400 + Math.random() * 1200, delay: Math.random() * 700, easing: "cubic-bezier(0.5,0,0.9,0.6)", fill: "backwards" }).onfinish = () => el.remove();
  }
}

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

/** Sparks on every button and link press, coin rain on the Konami code. Returns the cleanup. */
export function playful() {
  let at = 0;
  const press = (e: PointerEvent) => {
    if ((e.target as Element).closest?.("button, a, [role=button], summary")) sparks(e.clientX, e.clientY);
  };
  const key = (e: KeyboardEvent) => {
    // a third ArrowUp keeps the two already typed
    at = e.key === KONAMI[at] ? at + 1 : e.key === "ArrowUp" ? (at === 2 ? 2 : 1) : 0;
    if (at === KONAMI.length) {
      at = 0;
      coinRain();
    }
  };
  addEventListener("pointerdown", press);
  addEventListener("keydown", key);
  return () => {
    removeEventListener("pointerdown", press);
    removeEventListener("keydown", key);
  };
}
