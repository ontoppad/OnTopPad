import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router";
import { Check, Copy, ExternalLink } from "lucide-react";
import { TIERS } from "@ontoppad/shared";
import { addressUrl } from "../lib/chain.ts";
import { short, span } from "../lib/format.ts";
import type { NextTier } from "../lib/api.ts";

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
export function Stat({ label, value, format, sub, empty, accent }: { label: string; value: number; format: (v: number) => string; sub?: ReactNode; empty: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-ink-3">{label}</span>
      {value > 0 ? (
        <Num value={value} format={format} className={cx("text-[24px] sm:text-[28px] leading-none font-medium tracking-tight", accent && "text-accent")} />
      ) : (
        <span className="text-[20px] leading-7 text-ink-2">{empty}</span>
      )}
      {sub && <span className="text-[13px] text-ink-3">{sub}</span>}
    </div>
  );
}

const hash = (s: string) => [...s.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Token picture, or a deterministic 5×5 pixel sprite from the address when there is none. */
export function TokenArt({ src, address, symbol, size = 48, className }: { src?: string | null; address: string; symbol: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const r = Math.max(6, Math.round(size / 5));
  // our own uploads are served same-origin, whichever host the app runs on
  if (src?.includes("/api/media/")) src = src.slice(src.indexOf("/api/media/"));
  if (src && !broken && (src.startsWith("https://") || src.startsWith("/api/media/"))) {
    return (
      <img
        src={src}
        alt={`$${symbol}`}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className={cx("shrink-0 object-cover [image-rendering:pixelated] bg-raised", className)}
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

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("inline-flex rounded-[10px] border border-line bg-deep p-1 gap-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 px-3 rounded-md text-[13px] transition-colors duration-150",
            value === o.value ? "bg-raised text-ink shadow-[var(--highlight)]" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("rounded-xl bg-raised/70", className)} />;
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
