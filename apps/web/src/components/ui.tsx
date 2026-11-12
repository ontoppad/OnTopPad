import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { TIERS } from "@ontoppad/shared";
import { addressUrl, HOUSE_SYMBOL } from "../lib/chain.ts";
import { short, span } from "../lib/format.ts";
import { useTokens, type NextTier } from "../lib/api.ts";
import { coinRain, COINS, coinSrc } from "../lib/fx.ts";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "btn-press bg-lime text-lime-ink border-2 border-[var(--sticker-shadow)] font-semibold",
  secondary: "bg-raised text-ink border border-line-2 hover:bg-card shadow-[var(--highlight)] transition-colors duration-150",
  ghost: "text-ink-2 hover:text-ink hover:bg-raised transition-colors duration-150",
};
const SIZES = { sm: "h-8 px-3 text-[13px] rounded-lg gap-2", md: "h-10 px-4 text-sm rounded-[10px] gap-2", lg: "h-12 px-5 text-[15px] rounded-xl gap-2" };

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return <button className={cx("inline-flex items-center justify-center whitespace-nowrap select-none", VARIANTS[variant], SIZES[size], className)} {...rest} />;
}

export function ButtonLink({ to, variant = "secondary", size = "md", className, children }: { to: string; variant?: Variant; size?: keyof typeof SIZES; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={cx("inline-flex items-center justify-center whitespace-nowrap", VARIANTS[variant], SIZES[size], className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-2xl border border-line bg-card", className)}>{children}</div>;
}

/** The signature: shown only where a bonus is quoted. */
export function Stamp({ bps, className, children }: { bps?: number; className?: string; children?: ReactNode }) {
  return (
    <span className={cx("stamp num text-[13px]", className)}>
      {children ?? `+${(bps! / 100).toFixed(bps! % 100 ? 1 : 0)}% on top`}
    </span>
  );
}

/** Numbers tween to their new value so live data reads as live. */
export function useTween(value: number, ms = 600) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - (1 - k) ** 3;
      const v = a + (value - a) * e;
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function Num({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const v = useTween(value);
  return <span className={cx("num", className)}>{format(v)}</span>;
}

/** Big figure with label. `empty` replaces a zero with words that say what will fill it. */
export function Stat({ label, value, format, sub, empty, accent, loading }: { label: string; value: number; format: (v: number) => string; sub?: ReactNode; empty: string; accent?: boolean; loading?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-ink-3">{label}</span>
      {loading ? (
        <Skeleton className="h-7 w-32 rounded-md" />
      ) : value > 0 ? (
        <Num value={value} format={format} className={cx("text-[24px] sm:text-[28px] leading-none font-medium tracking-tight", accent && "text-accent")} />
      ) : (
        <span className="text-[20px] leading-7 text-ink-2">{empty}</span>
      )}
      {sub && <span className="text-[13px] text-ink-3">{sub}</span>}
    </div>
  );
}

/** Our own uploads are served same-origin whichever host the app runs on; foreign art must be https. */
export function artSrc(src?: string | null): string | null {
  if (!src) return null;
  if (src.includes("/api/media/")) return src.slice(src.indexOf("/api/media/"));
  return src.startsWith("https://") ? src : null;
}

const hash = (s: string) => [...s.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Token picture, or a deterministic 5×5 pixel sprite from the address when there is none. */
export function TokenArt({ src, address, symbol, size = 48, className }: { src?: string | null; address: string; symbol: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const r = Math.max(6, Math.round(size / 5));
  src = artSrc(src);
  // the house token wears the OnTopPad logo, so it flips like the logo everywhere it shows up
  if (symbol === HOUSE_SYMBOL) return <Logo size={size} radius={r} alt="$ONTOP" className={className} face={cx("object-cover bg-raised", className)} />;
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={`$${symbol}`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cx("shrink-0 object-cover bg-raised", className)}
        style={{ width: size, height: size, borderRadius: r }}
      />
    );
  }
  let h = hash(address);
  const cells: boolean[] = [];
  for (let i = 0; i < 15; i++) {
    cells.push((h & 1) === 1);
    h = (h >>> 1) ^ (h & 1 ? 0xa3000000 : 0);
  }
  return (
    <svg viewBox="0 0 5 5" width={size} height={size} className={cx("shrink-0 bg-raised", className)} style={{ borderRadius: r }} shapeRendering="crispEdges" aria-label={`$${symbol}`} role="img">
      {cells.map((on, i) => {
        if (!on) return null;
        const x = Math.floor(i / 5);
        const y = i % 5;
        return (
          <g key={i} fill="var(--lime)">
            <rect x={x} y={y} width="1" height="1" />
            <rect x={4 - x} y={y} width="1" height="1" />
          </g>
        );
      })}
    </svg>
  );
}

export function AddressChip({ address, label, className }: { address: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={cx("inline-flex items-center gap-1 num text-[13px] text-ink-2", className)}>
      <a href={addressUrl(address)} target="_blank" rel="noreferrer" className="hover:text-ink transition-colors duration-150">
        {label ?? short(address)}
      </a>
      <button
        type="button"
        aria-label="Copy address"
        className="p-1 rounded-md text-ink-3 hover:text-ink hover:bg-raised transition-colors duration-150"
        onClick={() => {
          void navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
      </button>
    </span>
  );
}

export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cx("inline-flex items-center gap-1 text-ink-2 hover:text-ink transition-colors duration-150", className)}>
      {children}
      <ExternalLink size={14} strokeWidth={1.5} />
    </a>
  );
}

const TIER_INDEX = { rookie: 0, pro: 1, legend: 2 } as const;

/** Hold-time tier as three pips: the payout multiplier you're on and how long until the next one. */
export function TierMeter({ tier, next, compact }: { tier: keyof typeof TIER_INDEX; next?: NextTier | null; compact?: boolean }) {
  const idx = TIER_INDEX[tier];
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex gap-[3px]" aria-hidden>
        {TIERS.map((t, i) => (
          <span key={t.key} className={cx("h-3 w-2 rounded-[2px]", i <= idx ? "bg-lime" : "bg-raised border border-line-2")} />
        ))}
      </span>
      <span className="text-[13px] text-ink">
        {TIERS[idx]!.label} <span className="num text-ink-3">{TIERS[idx]!.mult}×</span>
      </span>
      {!compact && next && <span className="text-[13px] text-ink-3">{TIERS[idx + 1]!.label} in {span(next.in)}</span>}
    </span>
  );
}

/**
 * Box of the active child (marked by `selector`) inside `ref`, for a pill that slides between items.
 * Offsets are relative to the container, so page scroll never moves the pill; a shared-layout animation
 * measures against the page and flies in from far away when a click also changes scroll.
 */
type Box = { left: number; top: number; width: number; height: number };

export function usePill(ref: RefObject<HTMLElement | null>, selector: string, key: unknown) {
  const [pill, setPill] = useState<Box | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current?.querySelector<HTMLElement>(selector);
      setPill(el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null);
    };
    measure();
    void document.fonts.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref, selector, key]);
  return pill;
}

export function Pill({ at }: { at: Box | null }) {
  return at ? <span aria-hidden className="absolute rounded-full bg-lime transition-[left,top,width,height] duration-300 ease-out" style={at} /> : null;
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pill = usePill(ref, '[aria-selected="true"]', value);
  return (
    <div ref={ref} className={cx("relative inline-flex gap-1 rounded-full border border-line bg-deep p-1", className)} role="tablist">
      <Pill at={pill} />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("relative h-8 whitespace-nowrap rounded-full px-4 text-[13px] transition-colors duration-150", value === o.value ? "font-semibold text-lime-ink" : "text-ink-2 hover:text-ink")}
        >
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Fades a block up the first time it scrolls into view. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

const nextCoin = (c?: string) => {
  const pool = COINS.filter((x) => x !== c);
  return pool[Math.floor(Math.random() * pool.length)]!;
};

/** The OnTopPad sticker, and $ONTOP's art. Hovered, it flips over to a random meme coin; three quick clicks make it rain coins.
 *  Without a size it fills whatever box className gives it. */
export function Logo({ size, className, face, radius, alt = "" }: { size?: number; className?: string; face?: string; radius?: number; alt?: string }) {
  const [coin, setCoin] = useState(() => nextCoin());
  const clicks = useRef<number[]>([]);
  // every coin is in cache before the first hover, so the back face never shows up blank or late
  useEffect(() => COINS.forEach((c) => void (new Image().src = coinSrc(c))), []);
  return (
    <span
      className={cx("logo-flip", className)}
      style={size ? { width: size, height: size } : undefined}
      onClick={() => {
        const now = Date.now();
        clicks.current = [...clicks.current.filter((t) => now - t < 900), now];
        if (clicks.current.length >= 3) {
          clicks.current = [];
          coinRain();
        }
      }}
    >
      {/* the next coin is dealt only once the logo faces front again, so a swap never happens in view */}
      <span onTransitionEnd={(e) => e.target === e.currentTarget && getComputedStyle(e.currentTarget).transform === "none" && setCoin(nextCoin)}>
        <img src={size && size <= 128 ? "/brand/logo-256.webp" : "/brand/logo-512.webp"} alt={alt} width={size} height={size} className={face ?? "rounded-lg"} style={radius === undefined ? undefined : { borderRadius: radius }} />
        <img src={coinSrc(coin)} alt="" width={size} height={size} />
      </span>
    </span>
  );
}

/** The name in pixel type; the letters hop when the logo's link is hovered. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("wordmark font-logo", className)}>
      <span className="sr-only">OnTopPad</span>
      {[..."OnTopPad"].map((ch, i) => (
        <span key={i} aria-hidden style={{ animationDelay: `${i * 45}ms` }} className={i > 4 ? "text-accent" : undefined}>
          {ch}
        </span>
      ))}
    </span>
  );
}

/** The arcade's page opener: full-bleed, a token's art blurred behind, the sticker logo and a big title. Falls back to the hottest token's art. */
export function PageHero({ art, badge, kicker, title, sub, children }: { art?: string | null; badge?: ReactNode; kicker?: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  const { data: tokens } = useTokens();
  const src = art?.startsWith("blob:") ? art : artSrc(art ?? tokens?.[0]?.image);
  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      {src && <motion.img key={src} src={src} alt="" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} transition={{ duration: 0.8 }} className="absolute inset-0 -z-20 h-full w-full scale-125 object-cover blur-2xl will-change-transform [image-rendering:pixelated]" />}
      <div className="absolute inset-0 -z-10 bg-bg/70" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-b from-transparent to-bg" />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex min-h-[300px] flex-col items-center justify-center gap-5 px-4 py-14 text-center md:min-h-[360px]">
        {badge ?? <Logo size={64} className="rotate-[-4deg] transition-transform duration-300 hover:rotate-[4deg] hover:scale-110" face="rounded-xl border-2 border-[var(--sticker-shadow)] shadow-[4px_4px_0_var(--sticker-shadow)]" />}
        {kicker && <span className="num text-[13px] text-ink-3">{kicker}</span>}
        <h1 className="font-title text-[36px] leading-[1.05] md:text-[64px]">{title}</h1>
        {sub && <p className="max-w-xl text-[16px] leading-7 text-ink-2">{sub}</p>}
        {children}
      </motion.div>
    </section>
  );
}

/** Section title in the arcade's voice. */
export function Heading({ title, sub, center, className }: { title: ReactNode; sub?: ReactNode; center?: boolean; className?: string }) {
  return (
    <div className={cx(center && "text-center", className)}>
      <h2 className="font-title text-[26px] leading-[1.1] md:text-[34px]">{title}</h2>
      {sub && <p className={cx("text-[15px] text-ink-2", center ? "mt-2" : "mt-1")}>{sub}</p>}
    </div>
  );
}

/** The slanted lime band from the arcade spotlight, cut like the PAD box in the logo. Copy on it is lime-ink. */
export function Band({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("relative isolate px-4 pb-14 pt-20 text-lime-ink md:px-[6%] md:pt-28", className)}>
      <div aria-hidden className="absolute inset-0 -z-10 bg-lime [clip-path:polygon(0_22%,100%_0,100%_100%,0_100%)]" />
      {children}
    </section>
  );
}

/** A big figure sitting on the lime band. */
export function BandStat({ label, value, format, sub, empty, loading }: { label: string; value: number; format: (v: number) => string; sub?: ReactNode; empty: string; loading?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] opacity-70">{label}</span>
      {loading ? (
        <>
          <Skeleton className="my-1 h-8 w-40 rounded-md bg-lime-ink/15 md:h-10" />
          <Skeleton className="h-3 w-48 rounded-md bg-lime-ink/10" />
        </>
      ) : value > 0 ? <Num value={value} format={format} className="text-[28px] leading-tight font-semibold tracking-tight md:text-[36px]" /> : <span className="text-[22px] leading-tight font-semibold md:text-[28px]">{empty}</span>}
      {sub && <span className="num text-[12px] opacity-70">{sub}</span>}
    </div>
  );
}

/** Rounded lime call-to-action, the arcade's "press start". */
export const pill = "btn-press inline-flex h-11 items-center gap-2 rounded-full border-2 border-[var(--sticker-shadow)] bg-lime px-5 text-[14px] font-semibold text-lime-ink";
export const pillGhost = "inline-flex h-11 items-center gap-2 rounded-full border border-line-2 bg-card px-5 text-[14px] text-ink transition-colors duration-150 hover:bg-raised";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton rounded-xl", className)} />;
}

/** Text-height bar for a line that is still loading. */
export const SkeletonLine = ({ className }: { className?: string }) => <Skeleton className={cx("h-[1em] rounded-md", className)} />;

/** Placeholder rows shaped like the tables and lists they stand in for. */
export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div aria-busy className={cx("flex flex-col text-[13px]", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-6 border-t border-line px-5 py-3.5 first:border-0">
          <SkeletonLine className="w-24" />
          <SkeletonLine className="flex-1" />
          <SkeletonLine className={i % 2 ? "w-12" : "w-20"} />
        </div>
      ))}
    </div>
  );
}

/** One technical spec line in mono; fills space with something you can check. */
export function Spec({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-line last:border-0">
      <span className="text-[13px] text-ink-3">{k}</span>
      <span className="num text-[13px] text-ink-2 text-right">{v}</span>
    </div>
  );
}
