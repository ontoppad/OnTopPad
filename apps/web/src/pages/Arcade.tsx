import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useStats, useTokens, type TokenSummary } from "../lib/api.ts";
import { amount, eth, or, usd } from "../lib/format.ts";
import { scrollToEl } from "../lib/scroll.ts";
import { Art, ChangeText, Poster, PosterSkeleton } from "../components/TokenCard.tsx";
import { artSrc, ButtonLink, cx, Logo, Segmented, Skeleton, SkeletonLine, Stamp } from "../components/ui.tsx";

type Sort = "hot" | "new" | "mcap" | "bonus" | "pot" | "holders";
const SORTS: { value: Sort; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "new", label: "New" },
  { value: "mcap", label: "Market cap" },
  { value: "bonus", label: "Biggest bonus" },
  { value: "pot", label: "Biggest payouts" },
  { value: "holders", label: "Most holders" },
];
const ORDER: Record<Sort, (a: TokenSummary, b: TokenSummary) => number> = {
  hot: (a, b) => b.volume24hUsd - a.volume24hUsd || (b.lastTradeAt ?? 0) - (a.lastTradeAt ?? 0),
  new: (a, b) => b.launchedAt - a.launchedAt,
  mcap: (a, b) => b.fdvUsd - a.fdvUsd,
  bonus: (a, b) => b.bonusBps - a.bonusBps || b.reservePct - a.reservePct,
  pot: (a, b) => b.paid + b.pot - (a.paid + a.pot),
  holders: (a, b) => b.holders - a.holders,
};
const PAGE = 12;

// ───────────── hero ─────────────

function Hero({ top }: { top?: TokenSummary }) {
  const { data: s } = useStats();
  const src = artSrc(top?.image);
  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      {src && <img src={src} alt="" aria-hidden className="absolute inset-0 -z-20 h-full w-full scale-125 object-cover opacity-60 blur-2xl [image-rendering:pixelated]" />}
      <div className="absolute inset-0 -z-10 bg-bg/70" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-b from-transparent to-bg" />
      <div className="flex min-h-[380px] flex-col items-center justify-center gap-5 px-4 py-16 text-center md:min-h-[440px]">
        <Logo size={72} className="rotate-[-4deg]" face="rounded-xl border-2 border-[var(--sticker-shadow)] shadow-[4px_4px_0_var(--sticker-shadow)]" />
        <h1 className="font-title text-[44px] leading-none md:text-[72px]">The arcade</h1>
        <p className="max-w-xl text-[16px] leading-7 text-ink-2">
          Every token on the board pays a bonus on buys and pays its holders from the trading. Pick one and press start.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="#hot" className="btn-press inline-flex h-11 items-center rounded-full border-2 border-[var(--sticker-shadow)] bg-lime px-5 text-[14px] font-semibold text-lime-ink">
            Hot right now
          </a>
          <ButtonLink to="/launch" variant="secondary" className="h-11 rounded-full px-5">
            Launch a token
          </ButtonLink>
        </div>
        {!s ? (
          <SkeletonLine className="w-80 max-w-full text-[12px]" />
        ) : (
          <p className="num text-[12px] text-ink-3">
            {s.tokens} tokens live · {or(s.bonusTokens, (v) => `${amount(v)} bonus tokens paid`, "bonus ready on the first buy")} · {s.paid ? `${eth(s.paid)} paid to holders` : or(s.pot, (v) => `${eth(v)} filling the pots`, "pots open")}
          </p>
        )}
      </div>
    </section>
  );
}

// ───────────── spotlight ─────────────

function Spotlight({ tokens }: { tokens: TokenSummary[] }) {
  const [lead, ...rest] = tokens;
  if (!lead) return null;
  return (
    <section className="relative isolate mt-16">
      <h2 className="font-title px-4 text-center text-[30px] leading-[1.05] md:text-[48px]">Top of the board right now</h2>
      <p className="mt-2 px-4 text-center text-[15px] text-ink-2">Ranked by 24h volume, straight from the chain</p>
      <div className="relative z-10 mt-10 px-4 md:px-[6%]">
        <Link to={`/token/${lead.address}`} className="group relative block">
          <div className="relative aspect-[21/9] overflow-hidden rounded-2xl border-2 border-[var(--sticker-shadow)] bg-raised md:aspect-[21/8]">
            <Art t={lead} className="transition-transform duration-500 ease-out group-hover:scale-[1.02]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <Stamp bps={lead.bonusBps} className="absolute right-4 top-4 text-[14px]" />
          </div>
        </Link>
      </div>
      <div className="relative px-4 md:px-[6%]">
        {/* the slanted band echoes the cut of the PAD box in the logo; anchored here so the copy always sits on it */}
        <div aria-hidden className="absolute inset-x-0 -top-24 bottom-0 -z-10 bg-lime [clip-path:polygon(0_18%,100%_0,100%_100%,0_100%)] md:-top-44" />
        <div className="relative grid gap-6 md:grid-cols-[minmax(0,360px)_1fr] md:items-start">
          <Link
            to={`/token/${lead.address}`}
            className="relative z-20 -mt-16 ml-4 block aspect-square w-40 overflow-hidden rounded-2xl border-2 border-[var(--sticker-shadow)] bg-raised shadow-[6px_6px_0_var(--sticker-shadow)] md:-mt-28 md:ml-10 md:w-72"
          >
            <Art t={lead} />
          </Link>
          <div className="flex flex-col gap-3 pb-10 text-lime-ink md:pt-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <h3 className="text-[28px] leading-tight font-semibold">{lead.name}</h3>
              <span className="num text-[15px] opacity-70">${lead.symbol}</span>
            </div>
            <p className="max-w-2xl text-[15px] leading-6 opacity-80">{lead.description ?? `${lead.holders} holders sharing every payout round.`}</p>
            <p className="num text-[13px]">
              <b>{usd(lead.fdvUsd)}</b> market cap · <b>{or(lead.holders, String, "first")}</b> holders · <b>{lead.paid ? eth(lead.paid) : eth(lead.pot)}</b> {lead.paid ? "paid to holders" : "in the pot"}
            </p>
            <Link to={`/token/${lead.address}`} className="mt-1 inline-flex h-10 w-fit items-center rounded-full bg-[var(--sticker-shadow)] px-5 text-[14px] font-semibold text-lime transition-opacity duration-150 hover:opacity-85">
              Play ${lead.symbol}
            </Link>
          </div>
        </div>

        <div className="grid gap-6 pb-16 md:grid-cols-2 md:gap-8">
          {rest.slice(0, 2).map((t) => (
            <Link key={t.address} to={`/token/${t.address}`} className="group flex flex-col gap-4 text-lime-ink">
              <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border-2 border-[var(--sticker-shadow)] bg-raised">
                <Art t={t} className="transition-transform duration-500 ease-out group-hover:scale-[1.02]" />
                <Stamp bps={t.bonusBps} className="absolute right-3 top-3" />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-[22px] font-semibold">
                  {t.name} <span className="num text-[14px] opacity-70">${t.symbol}</span>
                </h3>
                <p className="line-clamp-2 text-[14px] opacity-80">{t.description ?? `${t.holders} holders, ${t.trades} trades so far.`}</p>
                <p className="num text-[13px]">
                  <b>{usd(t.fdvUsd)}</b> · {or(t.holders, (n) => `${n} holders`, "first holder wins")} · {or(t.bonusPaid, (v) => `${amount(v)} bonus paid`, "bonus ready")}
                </p>
                <span className="mt-1 inline-flex h-9 w-fit items-center rounded-full bg-[var(--sticker-shadow)] px-4 text-[13px] font-semibold text-lime">Play ${t.symbol}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────── carousel ─────────────

function Carousel({ tokens }: { tokens: TokenSummary[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const card = el.firstElementChild as HTMLElement | null;
      if (card) setActive(Math.round(el.scrollLeft / (card.offsetWidth + 16)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const go = (dir: number, step = 2) => {
    const el = track.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    const atStart = el.scrollLeft <= 8;
    // wrap around at either end so the reel never dead-ends
    if (dir > 0 && atEnd) el.scrollTo({ left: 0, behavior: "smooth" });
    else if (dir < 0 && atStart) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    else el.scrollBy({ left: dir * (card.offsetWidth + 16) * step, behavior: "smooth" });
  };

  // autoplay one card at a time; pauses on hover, focus or touch, and stays still for reduced-motion users
  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      const el = track.current;
      if (el && el.scrollWidth > el.clientWidth + 8 && !document.hidden) go(1, 1);
    }, 3500);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <section id="hot" className="scroll-mt-28 bg-deep py-16">
      <div className="flex items-end justify-between gap-4 px-4 md:px-6">
        <div>
          <h2 className="font-title text-[26px] leading-[1.1] md:text-[34px]">Hot right now</h2>
          <p className="mt-1 text-[15px] text-ink-2">Where the trading, the bonus and the payouts are moving</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          {[-1, 1].map((d) => (
            <button key={d} onClick={() => go(d)} aria-label={d < 0 ? "Previous" : "Next"} className="grid size-10 place-items-center rounded-full border border-line-2 bg-card text-ink hover:bg-raised transition-colors duration-150">
              {d < 0 ? <ChevronLeft size={18} strokeWidth={1.5} /> : <ChevronRight size={18} strokeWidth={1.5} />}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={track}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        className="scrollbar-none mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 md:scroll-px-6 md:px-6">
        {tokens.map((t, i) => (
          <Link
            key={t.address}
            to={`/token/${t.address}`}
            className={cx(
              "group flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-card transition-colors duration-150 md:w-[280px]",
              i === active ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : "border-line hover:border-line-2",
            )}
          >
            <div className="relative aspect-[4/5] overflow-hidden bg-raised">
              <Art t={t} className="transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
              <Stamp bps={t.bonusBps} className="absolute bottom-3 left-3 text-[12px]" />
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <span className="text-[15px] font-semibold">
                {t.name} <span className="num text-[12px] text-ink-3">${t.symbol}</span>
              </span>
              <p className="line-clamp-3 text-[13px] leading-5 text-ink-2">{t.description ?? `${t.holders} holders on the board.`}</p>
              <div className="mt-auto flex items-baseline justify-between pt-2">
                <span className="num text-[15px] font-medium">{usd(t.fdvUsd)}</span>
                <ChangeText t={t} />
              </div>
              <span className="mt-2 inline-flex h-8 w-fit items-center rounded-full bg-lime px-4 text-[12px] font-semibold text-lime-ink">Play</span>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
        {tokens.map((t, i) => (
          <span key={t.address} className={cx("h-1 rounded-full transition-[width,background-color] duration-300", i === active ? "w-6 bg-lime" : "w-3 bg-line-2")} />
        ))}
      </div>
    </section>
  );
}

// ───────────── grid ─────────────

function Board({ tokens, sort, setSort, initialQ }: { tokens: TokenSummary[]; sort: Sort; setSort: (s: Sort) => void; initialQ: string }) {
  const [q, setQ] = useState(initialQ);
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const f = n ? tokens.filter((t) => t.name.toLowerCase().includes(n) || t.symbol.toLowerCase().includes(n) || t.address === n) : tokens;
    return [...f].sort(ORDER[sort]);
  }, [tokens, q, sort]);

  return (
    <section id="board" className="scroll-mt-28 px-4 py-16 md:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-title text-[26px] leading-[1.1] md:text-[34px]">Every token on the pad</h2>
          <p className="mt-1 text-[15px] text-ink-2">{list.length} on the board · sorted by {SORTS.find((s) => s.value === sort)!.label.toLowerCase()}</p>
        </div>
        <div className="relative">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ticker or address" aria-label="Search tokens" className="h-10 w-full rounded-full border border-line bg-deep pl-9 pr-4 text-[13px] placeholder:text-ink-3 focus:border-line-2 focus:outline-none md:w-80" />
        </div>
      </div>
      <Segmented value={sort} onChange={setSort} options={SORTS} className="scrollbar-none mt-6 max-w-full overflow-x-auto" />

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {list.slice(0, shown).map((t) => (
          <Poster key={t.address} t={t} />
        ))}
      </div>
      {list.length === 0 && (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-line bg-card p-12 text-center">
          <p className="text-[18px]">{q ? `Nothing matches "${q}"` : "The board is waiting for its first launch"}</p>
          <ButtonLink to="/launch" variant="primary">
            Launch one
          </ButtonLink>
        </div>
      )}
      {list.length > shown && (
        <button onClick={() => setShown((n) => n + PAGE)} className="mx-auto mt-10 flex h-10 items-center rounded-full border border-line-2 bg-card px-6 text-[14px] hover:bg-raised transition-colors duration-150">
          Load more
        </button>
      )}
    </section>
  );
}

// ───────────── game modes ─────────────

const MODES: { sort: Sort; title: string; line: string }[] = [
  { sort: "bonus", title: "Biggest head start", line: "Highest bonus on every buy" },
  { sort: "pot", title: "Payout machines", line: "Most ETH sent to holders" },
  { sort: "new", title: "Fresh launches", line: "Newest pools on the pad" },
  { sort: "holders", title: "Crowd favourites", line: "Most wallets holding" },
  { sort: "mcap", title: "Big caps", line: "Largest market caps" },
  { sort: "hot", title: "On fire", line: "Most volume in 24h" },
];

function Modes({ tokens, pick }: { tokens: TokenSummary[]; pick: (s: Sort) => void }) {
  return (
    <section className="border-t border-line bg-deep px-4 py-16 md:px-6">
      <h2 className="font-title text-[26px] leading-[1.1] md:text-[34px] text-center">Pick your game mode</h2>
      <p className="mt-2 text-center text-[15px] text-ink-2">Every mode reorders the board around the one number that matters</p>
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {MODES.map((m) => {
          const lead = [...tokens].sort(ORDER[m.sort])[0];
          const src = artSrc(lead?.image);
          return (
            <button
              key={m.sort}
              onClick={() => pick(m.sort)}
              className="group relative isolate flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-xl border border-line p-4 text-left transition-colors duration-150 hover:border-line-2"
            >
              {lead?.symbol === "ONTOP" ? (
                <Logo className="absolute inset-0 -z-20 !h-full !w-full opacity-80" face="object-cover" />
              ) : (
                src && <img src={src} alt="" aria-hidden className="absolute inset-0 -z-20 h-full w-full object-cover opacity-80 transition-transform duration-500 ease-out [image-rendering:pixelated] group-hover:scale-105" />
              )}
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/45 to-black/10" />
              <span className="text-[15px] font-semibold text-white">{m.title}</span>
              <span className="text-[12px] text-white/75">{lead ? `${m.line} · $${lead.symbol} leads` : m.line}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ───────────── page ─────────────

export default function Arcade() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("sort") as Sort | null;
  const [sort, setSortState] = useState<Sort>(SORTS.some((s) => s.value === initial) ? initial! : "hot");
  // the header search lands here as ?q=: it seeds the board's own search box, so it shows and can be cleared
  // shortcut: board and search cover the 60 hottest tokens (API default); page the API once the pad passes 60
  const q = params.get("q") ?? "";
  const { data: tokens, isLoading } = useTokens("hot");

  const setSort = (s: Sort) => {
    setSortState(s);
    setParams((p) => (p.set("sort", s), p), { replace: true });
  };
  const pick = (s: Sort) => {
    setSort(s);
    scrollToEl(document.getElementById("board"));
  };

  if (isLoading || !tokens)
    return (
      <div aria-busy>
        <Hero />
        <div className="mt-16 flex flex-col items-center gap-3 px-4">
          <Skeleton className="h-9 w-full max-w-lg md:h-12" />
          <SkeletonLine className="w-72 max-w-full text-[15px]" />
        </div>
        <div className="mt-10 px-4 md:px-[6%]">
          <Skeleton className="aspect-[21/9] rounded-2xl md:aspect-[21/8]" />
        </div>
        <section className="px-4 py-16 md:px-6">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="mt-6 h-10 w-full max-w-xl rounded-full" />
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <PosterSkeleton key={i} />
            ))}
          </div>
        </section>
      </div>
    );

  return (
    <div>
      <Hero top={tokens[0]} />
      <Spotlight tokens={tokens} />
      {tokens.length > 3 && <Carousel tokens={tokens.slice(0, 12)} />}
      <Board key={q} initialQ={q} tokens={tokens} sort={sort} setSort={setSort} />
      <Modes tokens={tokens} pick={pick} />
      <section className="flex flex-col items-center gap-4 px-4 py-16 text-center">
        <h2 className="font-title text-[26px] leading-[1.1] md:text-[34px]">Your token could be next on the board</h2>
        <p className="max-w-lg text-[15px] text-ink-2">One transaction deploys it, seeds the pool, locks the bonus treasury and switches payouts on</p>
        <ButtonLink to="/launch" variant="primary" size="lg">
          Launch a token
        </ButtonLink>
      </section>
    </div>
  );
}
