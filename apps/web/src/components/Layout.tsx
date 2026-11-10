import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useOutlet } from "react-router";
import { AnimatePresence, motion, MotionConfig, useScroll, useSpring } from "motion/react";
import { Activity, BookOpen, Gamepad2, Gift, Moon, Rocket, Search, Sun, UserRound, Wallet, X } from "lucide-react";
import { formatEther } from "viem";
import { useActivity, useConfig } from "../lib/api.ts";
import { chain, contracts, errorText, network } from "../lib/chain.ts";
import { ago, eth, short } from "../lib/format.ts";
import { useWallet } from "../lib/wallet.tsx";
import { Button, cx, Pill, Skeleton, SkeletonLine, TokenArt, usePill } from "./ui.tsx";
import { Splash } from "./Splash.tsx";
import { useToast } from "./toast.tsx";
import Lenis from "lenis";
import { smooth } from "../lib/scroll.ts";

const NAV = [
  { to: "/arcade", label: "Arcade", icon: Gamepad2 },
  { to: "/launch", label: "Launch", icon: Rocket },
  { to: "/rewards", label: "Rewards", icon: Gift },
  { to: "/feed", label: "Feed", icon: Activity },
  { to: "/portfolio", label: "Portfolio", icon: UserRound },
  { to: "/rules", label: "Rules", icon: BookOpen },
];

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0e0f0c" : "#f5f6f0");
    try {
      localStorage.setItem("ontop-theme", theme);
    } catch {
      // preference just won't persist
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))] as const;
}

function WalletButton() {
  const w = useWallet();
  const toast = useToast();
  if (!w.address) {
    return (
      <Button variant="primary" size="sm" onClick={w.openPicker}>
        <Wallet size={16} strokeWidth={1.5} />
        Connect<span className="hidden sm:inline">&nbsp;wallet</span>
      </Button>
    );
  }
  if (w.wrongChain) {
    return (
      <Button variant="secondary" size="sm" onClick={() => w.ensureChain().catch((e) => toast({ title: "Network not switched", body: errorText(e), tone: "error" }))}>
        Switch to {network.label}
      </Button>
    );
  }
  return (
    <Link to="/portfolio" className="flex h-8 items-center gap-2 rounded-lg border border-line-2 bg-raised pl-1 pr-3 shadow-[var(--highlight)] hover:bg-card transition-colors duration-150">
      <span className="num rounded-md bg-lime px-1.5 text-[12px] font-semibold leading-6 text-lime-ink">P1</span>
      <span className="num text-[13px] text-ink">{short(w.address)}</span>
      {w.balance !== undefined && <span className="num hidden lg:inline text-[13px] text-ink-3">{eth(Number(formatEther(w.balance)))}</span>}
    </Link>
  );
}

function WalletPicker() {
  const w = useWallet();
  const toast = useToast();
  const { picker, closePicker } = w;
  useEffect(() => {
    if (!picker) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closePicker();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [picker, closePicker]);
  return (
    <AnimatePresence>
      {w.picker && (
        <motion.div data-lenis-prevent className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={w.closePicker}>
          <motion.div
            role="dialog"
            aria-label="Choose a wallet"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-sm rounded-2xl border border-line-2 bg-card p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Insert coin</h2>
              <button aria-label="Close" onClick={w.closePicker} className="rounded-md p-1 text-ink-3 hover:text-ink hover:bg-raised">
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <p className="mt-1 text-[13px] text-ink-2">Pick a wallet to play on {network.label}</p>
            <div className="mt-4 flex flex-col gap-2">
              {w.providers.map((p) => (
                <button
                  key={p.info.uuid}
                  onClick={() => void w.connect(p).then(w.ensureChain).catch((e) => toast({ title: "Wallet not connected", body: errorText(e), tone: "error" }))}
                  className="flex h-12 items-center gap-3 rounded-[10px] border border-line bg-raised px-3 text-left text-sm hover:border-line-2 hover:bg-deep transition-colors duration-150"
                >
                  {p.info.icon ? <img src={p.info.icon} alt="" className="size-6 rounded-md" /> : <Wallet size={18} strokeWidth={1.5} className="text-ink-2" />}
                  {p.info.name}
                </button>
              ))}
              {w.providers.length === 0 && (
                <p className="rounded-[10px] border border-line bg-raised p-4 text-[13px] text-ink-2">
                  No browser wallet found. Install MetaMask, Rabby or OKX Wallet, or open this page in your wallet app's browser.
                </p>
              )}
            </div>
            <p className="mt-4 num text-[12px] text-ink-3">
              {chain.name} · chain id {chain.id}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SearchBox() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      className="relative hidden xl:block"
      onSubmit={(e) => {
        e.preventDefault();
        nav(`/arcade?q=${encodeURIComponent(q)}`);
      }}
    >
      <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        aria-label="Search tokens"
        className="h-8 w-52 rounded-lg border border-line bg-deep pl-9 pr-3 text-[13px] placeholder:text-ink-3 focus:border-line-2 focus:outline-none"
      />
    </form>
  );
}

/** Live trade marquee. It only moves because the data underneath is live. */
function Ticker() {
  const { data } = useActivity("all", 24);
  if (!data)
    return (
      <div aria-busy className="flex h-9 items-center gap-8 overflow-hidden border-b border-line bg-deep pl-4">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="flex shrink-0 items-center gap-2">
            <Skeleton className="size-[18px] rounded-md" />
            <SkeletonLine className="w-40 text-[12px]" />
          </span>
        ))}
      </div>
    );
  if (!data.length) return <div className="h-9 border-b border-line" />;
  const items = [...data, ...data];
  return (
    <div className="group relative h-9 overflow-hidden border-b border-line bg-deep" aria-label="Latest activity">
      <div className="flex h-full w-max items-center gap-8 pl-4 animate-[ticker_60s_linear_infinite] group-hover:[animation-play-state:paused]">
        {items.map((a, i) => (
          <Link key={`${a.tx}-${i}`} to={`/token/${a.token}`} className="flex items-center gap-2 text-[12px] text-ink-2 hover:text-ink">
            <TokenArt src={a.image} address={a.token} symbol={a.symbol ?? ""} size={18} />
            <span className="num text-ink-3">{a.account ? short(a.account) : "Keeper"}</span>
            {a.kind === "buy" && (
              <>
                <span>bought ${a.symbol}</span>
                {a.bonus ? <span className="num text-accent">+{Math.round(a.bonus).toLocaleString("en-US")} bonus</span> : null}
              </>
            )}
            {a.kind === "sell" && <span>sold ${a.symbol}</span>}
            {a.kind === "payout" && (
              <span>
                paid {a.recipients} ${a.symbol} holders <span className="num">{eth(a.quoteAmount ?? 0)}</span>
              </span>
            )}
            {a.kind === "launch" && <span>launched ${a.symbol}</span>}
            <span className="num text-ink-3">{ago(a.ts)}</span>
          </Link>
        ))}
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
    </div>
  );
}

function NetworkStatus() {
  const { data } = useConfig();
  const live = data && data.head - data.indexed < 120;
  return (
    <span className="hidden md:inline-flex items-center gap-2 h-8 rounded-lg border border-line px-3 text-[13px] text-ink-2" title={data ? `Indexed to block ${data.indexed.toLocaleString("en-US")}` : undefined}>
      <span className={cx("size-2 rounded-full", live ? "bg-lime" : "bg-ink-3")} />
      {network.label}
    </span>
  );
}

function Footer() {
  const { data } = useConfig();
  return (
    <footer className="mt-24 border-t border-line pb-24 md:pb-8">
      <div className="mx-auto grid gap-8 px-4 py-10 md:grid-cols-[1.2fr_0.6fr_1fr_1fr] md:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <img src="/brand/logo-256.webp" alt="ONTOPPAD" width={40} height={40} className="rounded-lg" />
            <span className="text-[15px] font-semibold">ONTOPPAD</span>
          </div>
          <p className="max-w-xs text-[13px] text-ink-2">Start ahead. Stay paid. Every bonus and payout, public and verifiable on {chain.name}.</p>
          <a href="https://x.com/OnTopPad" target="_blank" rel="noreferrer" className="text-[13px] text-ink-2 hover:text-ink">
            @OnTopPad on X
          </a>
        </div>
        {/* every page, Rules included: the phone tab bar only fits five */}
        <nav className="grid grid-cols-2 content-start gap-2 text-[13px] md:grid-cols-1" aria-label="Pages">
          <span className="col-span-full text-ink-3">Play</span>
          {NAV.map(({ to, label }) => (
            <Link key={to} to={to} className="text-ink-2 hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 text-[13px]">
          <span className="text-ink-3">Contracts</span>
          {(["launchpad", "hook", "router", "distributor"] as const).map((k) => (
            <a key={k} href={`${chain.blockExplorers.default.url}/address/${contracts[k]}`} target="_blank" rel="noreferrer" className="flex justify-between gap-4 text-ink-2 hover:text-ink">
              <span>OnTop{k[0]!.toUpperCase() + k.slice(1)}</span>
              <span className="num text-ink-3">{short(contracts[k])}</span>
            </a>
          ))}
        </div>
        <div className="flex flex-col gap-2 text-[13px]">
          <span className="text-ink-3">Chain</span>
          <span className="text-ink-2">
            {chain.name} · <span className="num">{chain.id}</span>
          </span>
          <span className="text-ink-2">Uniswap v4 pools with the OnTop hook</span>
          {data && (
            <span className="num text-ink-3">
              Indexed block {data.indexed.toLocaleString("en-US")}
              {data.ethUsd > 0 && ` · ETH $${data.ethUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

function MobileTabs() {
  const tabs = [NAV[0]!, NAV[1]!, NAV[2]!, NAV[3]!, NAV[4]!];
  const { pathname } = useLocation();
  const idx = tabs.findIndex((t) => pathname.startsWith(t.to));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Main">
      {/* positioned by column, not by a shared-layout animation: those measure against page scroll and fly in from below after a scroll reset */}
      {idx >= 0 && <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-lime transition-[left] duration-300 ease-out" style={{ left: `calc(${idx * 20 + 10}% - 16px)` }} />}
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => cx("relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-150", isActive ? "text-ink" : "text-ink-3")}>
          {({ isActive }) => (
            <>
              <Icon size={18} strokeWidth={1.5} className={cx("transition-transform duration-200", isActive && "-translate-y-0.5 text-accent")} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Lime reading bar along the bottom of the header. */
function ScrollBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
  return <motion.div aria-hidden style={{ scaleX }} className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-lime" />;
}

export function Layout() {
  const [theme, toggle] = useTheme();
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const navRef = useRef<HTMLElement>(null);
  const pill = usePill(navRef, 'a[aria-current="page"]', pathname);
  // a wallet lookup on Rewards stays on the same page; anything else is a new screen
  const page = pathname.startsWith("/rewards") ? "/rewards" : pathname;
  // every page scrolls on rails: wheel input eases instead of jumping. Touch keeps native momentum.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // lerp 0.1 glides without trailing the wheel; nested scrollers (tables, carousels) keep their own wheel; #links ease too
    const l = new Lenis({ autoRaf: true, lerp: 0.1, allowNestedScroll: true, anchors: true });
    smooth.lenis = l;
    return () => {
      smooth.lenis = null;
      l.destroy();
    };
  }, []);
  useEffect(() => {
    // a plain scrollTo would be undone by leftover inertia from the last page
    if (smooth.lenis) smooth.lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);
  }, [page]);
  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/95">
        <div className="mx-auto flex h-16 items-center gap-4 px-4 md:px-6">
          <Link to="/" className="flex items-center gap-3 shrink-0" aria-label="ONTOPPAD home">
            <img src="/brand/logo-256.webp" alt="" width={36} height={36} className="rounded-lg" />
            <span className="hidden sm:block text-[16px] font-semibold tracking-tight">ONTOPPAD</span>
          </Link>
          <nav ref={navRef} className="relative ml-4 hidden md:flex items-center gap-1" aria-label="Main">
            <Pill at={pill} />
            {NAV.map(({ to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => cx("relative h-8 rounded-full px-3 text-[14px] leading-8 transition-colors duration-150", isActive ? "font-semibold text-lime-ink" : "text-ink-2 hover:text-ink")}>
                <span className="relative">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SearchBox />
            <NetworkStatus />
            <button onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} className="grid size-8 place-items-center rounded-lg text-ink-2 hover:text-ink hover:bg-raised transition-colors duration-150">
              {theme === "dark" ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
            </button>
            <WalletButton />
          </div>
        </div>
        <Ticker />
        <ScrollBar />
      </header>
      <main>
        {/* the landing page keeps its own entrance; every other page slides in */}
        {pathname === "/" ? (
          outlet
        ) : (
          <motion.div key={page} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            {outlet}
          </motion.div>
        )}
      </main>
      <Footer />
      <MobileTabs />
      <WalletPicker />
      <Splash />
    </div>
    </MotionConfig>
  );
}

