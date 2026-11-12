import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { ImagePlus, Shuffle } from "lucide-react";
import { parseEther } from "viem";
import { buyerEdge, feeFor, MAX_BONUS_BPS, MIN_BONUS_BPS, startTickForFdv, TREASURY_BPS, HOLDERS_BPS, CREATOR_BPS } from "@ontoppad/shared";
import { useConfig } from "../lib/api.ts";
import { errorText, launch } from "../lib/chain.ts";
import { eth, usd } from "../lib/format.ts";
import { useWallet } from "../lib/wallet.tsx";
import { useToast } from "../components/toast.tsx";
import { Button, Card, cx, PageHero, Pill, Reveal, Spec, Stamp, TokenArt, usePill } from "../components/ui.tsx";

const STEPS = ["Character", "Loadout", "Links", "Press start"] as const;
const FDVS = [0.05, 0.1, 0.5, 1, 5];

/** A 12×12 symmetric pixel sprite, seeded by the ticker, for creators without art. */
function sprite(seed: string): Promise<Blob> {
  let h = [...seed].reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381) || 1;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const bgs = ["#ff7a1a", "#39e6ff", "#ff5a5f", "#eceee2", "#181c0e", "#ffd600"];
  const bg = bgs[Math.floor(rnd() * bgs.length)]!;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 512);
  const cell = 512 / 16;
  for (let y = 2; y < 14; y++)
    for (let x = 2; x < 8; x++) {
      if (rnd() < 0.5) continue;
      g.fillStyle = rnd() < 0.7 ? "#cbfd00" : "#0e0f0c";
      g.fillRect(x * cell, y * cell, cell, cell);
      g.fillRect((15 - x) * cell, y * cell, cell, cell);
    }
  return new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[13px] text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}

const input = "h-11 rounded-full border border-line-2 bg-deep px-4 text-[14px] placeholder:text-ink-3 focus:outline-none focus:border-[var(--accent)]";

export default function Launch() {
  const w = useWallet();
  const toast = useToast();
  const nav = useNavigate();
  const { data: cfg } = useConfig();
  const ethUsd = cfg?.ethUsd ?? 0;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<Blob | null>(null);
  const [bonus, setBonus] = useState(500);
  const [fdv, setFdv] = useState(0.1);
  const [firstBuy, setFirstBuy] = useState("0.001");
  const [links, setLinks] = useState({ x: "", telegram: "", website: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const steps = useRef<HTMLOListElement>(null);
  const uploaded = useRef<{ key: string; image: Blob | null; uri: string }>(null);
  const stepPill = usePill(steps, '[aria-current="step"]', step);

  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const nameOk = name.trim().length >= 2 && name.trim().length <= 32;
  const symOk = /^[A-Z0-9]{2,10}$/.test(symbol);
  const linkOk = Object.values(links).every((l) => !l || /^https:\/\/\S+$/.test(l));
  const buyOk = firstBuy === "" || Number(firstBuy) >= 0;
  const valid = [nameOk && symOk && !!image && description.length <= 280, buyOk, linkOk, true];
  const fee = feeFor(bonus);
  const edge = buyerEdge(bonus) * 100;
  const roundTrip = ((1 - fee / 1e6) ** 2 * (1 + bonus / 1e4) - 1) * 100;

  async function submit() {
    if (!w.client) return w.openPicker();
    try {
      await w.ensureChain();
      // a cancelled signature must not burn another upload from the hourly limit: reuse while nothing changed
      const key = JSON.stringify([name.trim(), symbol, description.trim(), links]);
      if (uploaded.current?.key !== key || uploaded.current.image !== image) {
        setBusy("Uploading artwork");
        const form = new FormData();
        form.set("name", name.trim());
        form.set("symbol", symbol);
        form.set("description", description.trim());
        for (const [k, v] of Object.entries(links)) if (v) form.set(k, v);
        form.set("image", image!, "art.png");
        const res = await fetch("/api/metadata", { method: "POST", body: form });
        // a proxy error page is HTML, not JSON
        const meta = await res.json().catch(() => null);
        if (!res.ok) throw new Error(meta?.error ?? `Upload failed (${res.status})`);
        uploaded.current = { key, image, uri: meta.uri };
      }
      setBusy("Confirm the launch in your wallet");
      const r = await launch(w.client, {
        name: name.trim(),
        symbol,
        metadataURI: uploaded.current.uri,
        bonusBps: bonus,
        startTick: startTickForFdv(fdv, false),
        firstBuy: firstBuy ? parseEther(firstBuy) : 0n,
      });
      toast({ title: `$${symbol} is live`, body: "Pool seeded, treasury locked, bonus switched on", tx: r.hash });
      nav(`/token/${r.token.toLowerCase()}`);
    } catch (e) {
      toast({ title: "Launch not sent", body: errorText(e), tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHero
        art={preview}
        title="Launch a token"
        sub="Four steps. The last one deploys the token, seeds its Uniswap v4 pool, locks the bonus treasury and switches holder payouts on, all in one transaction from your wallet."
      />

      <section className="px-4 py-12 md:px-6">
        <ol ref={steps} className="relative flex flex-wrap gap-2" aria-label="Steps">
          <Pill at={stepPill} />
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                onClick={() => (i <= step || valid.slice(0, i).every(Boolean) ? setStep(i) : undefined)}
                aria-current={i === step ? "step" : undefined}
                className={cx(
                  "relative flex h-10 items-center gap-2 rounded-full border px-4 text-[13px] transition-colors duration-150",
                  i === step ? "border-[var(--sticker-shadow)] font-semibold text-lime-ink" : "border-line text-ink-3 hover:text-ink",
                )}
              >
                  <span className={cx("num relative grid size-5 place-items-center rounded-full text-[11px]", i === step ? "bg-[var(--sticker-shadow)] text-lime" : i < step ? "bg-lime text-lime-ink" : "bg-deep")}>{i + 1}</span>
                <span className="relative">{s}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-raised" aria-hidden>
          <motion.div className="h-full rounded-full bg-lime" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ type: "spring", bounce: 0, duration: 0.5 }} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]">
          <Card className="self-start p-6 md:p-8">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col gap-6">
                {step === 0 && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                      <Field label="Token name" hint="2 to 32 characters">
                        <input className={input} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Arcade Cat" />
                      </Field>
                      <Field label="Ticker" hint="2 to 10 letters or digits">
                        <input className={cx(input, "num uppercase")} value={symbol} maxLength={10} onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="ACAT" />
                      </Field>
                    </div>
                    <Field label="Story" hint={`${description.length}/280`}>
                      <textarea className={cx(input, "h-28 resize-none !rounded-2xl py-3")} maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's the play, and who's it for" />
                    </Field>
                    <div className="flex flex-col gap-2">
                      <span className="text-[13px] text-ink-2">Artwork</span>
                      <div className="flex items-center gap-4">
                        <div className="grid size-24 place-items-center overflow-hidden rounded-xl border-2 border-[var(--sticker-shadow)] bg-deep shadow-[4px_4px_0_var(--sticker-shadow)]">
                          {preview ? <motion.img key={preview} initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", bounce: 0.4, duration: 0.5 }} src={preview} alt="Token artwork preview" className="size-full object-cover" /> : <ImagePlus size={24} strokeWidth={1.5} className="text-ink-3" />}
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="inline-flex h-9 cursor-pointer items-center rounded-full border border-line-2 bg-raised px-4 text-[13px] transition-colors duration-150 hover:bg-card">
                            Upload image
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="sr-only"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f && f.size > 2 * 1024 * 1024) toast({ title: "Image too large", body: "Keep it under 2 MB", tone: "error" });
                                else if (f) setImage(f);
                              }}
                            />
                          </label>
                          <button onClick={() => void sprite(`${symbol}${Date.now()}`).then(setImage)} className="group inline-flex items-center gap-2 text-[13px] text-ink-2 hover:text-ink">
                            <Shuffle size={14} strokeWidth={1.5} className="transition-transform duration-300 group-hover:rotate-180" /> Roll a pixel sprite
                          </button>
                        </div>
                      </div>
                      <span className="text-[12px] text-ink-3">Square PNG, JPEG, WebP or GIF under 2 MB</span>
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] text-ink-2">Bonus on every buy</span>
                        <Stamp bps={bonus} />
                      </div>
                      <input type="range" min={MIN_BONUS_BPS} max={MAX_BONUS_BPS} step={50} value={bonus} onChange={(e) => setBonus(Number(e.target.value))} aria-label="Bonus percent" />
                      <div className="grid grid-cols-3 gap-2 num text-[12px]">
                        <div className="rounded-xl border border-line bg-deep p-3">
                          <span className="text-ink-3">Pool fee</span>
                          <p className="mt-1 text-[16px]">{(fee / 1e4).toFixed(2)}%</p>
                        </div>
                        <div className="rounded-xl border border-line bg-deep p-3">
                          <span className="text-ink-3">Buyer edge</span>
                          <p className="mt-1 text-[16px] text-accent">+{edge.toFixed(2)}%</p>
                        </div>
                        <div className="rounded-xl border border-line bg-deep p-3">
                          <span className="text-ink-3">Flip round trip</span>
                          <p className="mt-1 text-[16px] text-down-ink">{roundTrip.toFixed(2)}%</p>
                        </div>
                      </div>
                      <p className="text-[12px] text-ink-3">Higher bonus means a higher pool fee, so more ETH flows to holders per trade. Flippers always pay the round trip</p>
                    </div>
                    <div className="flex flex-col gap-3">
                      <span className="text-[13px] text-ink-2">Starting market cap</span>
                      <div className="flex flex-wrap gap-2">
                        {FDVS.map((f) => (
                          <button key={f} onClick={() => setFdv(f)} className={cx("num h-9 rounded-full border px-4 text-[13px] transition-colors duration-150", fdv === f ? "border-[var(--sticker-shadow)] bg-lime font-semibold text-lime-ink" : "border-line text-ink-2 hover:text-ink")}>
                            {f} ETH
                          </button>
                        ))}
                      </div>
                      <span className="num text-[12px] text-ink-3">
                        ≈ {usd(fdv * ethUsd)} · price can only go up from here: all 93% of liquidity sits above it
                      </span>
                    </div>
                    <Field label="Your first buy (optional)" hint="Bought in the launch transaction, bonus included, so nobody gets in before you">
                      <div className="flex h-11 items-center rounded-full border border-line-2 bg-deep px-4 focus-within:border-[var(--accent)]">
                        <input inputMode="decimal" className="num min-w-0 flex-1 bg-transparent text-[14px] outline-none" value={firstBuy} onChange={(e) => setFirstBuy(e.target.value.replace(/[^0-9.]/g, ""))} />
                        <span className="num text-[13px] text-ink-3">ETH</span>
                      </div>
                    </Field>
                  </>
                )}

                {step === 2 && (
                  <>
                    {(["x", "telegram", "website"] as const).map((k) => (
                      <Field key={k} label={k === "x" ? "X" : k === "telegram" ? "Telegram" : "Website"} hint="Optional, https only">
                        <input className={input} value={links[k]} onChange={(e) => setLinks({ ...links, [k]: e.target.value.trim() })} placeholder={k === "x" ? "https://x.com/yourtoken" : k === "telegram" ? "https://t.me/yourtoken" : "https://yourtoken.xyz"} />
                      </Field>
                    ))}
                  </>
                )}

                {step === 3 && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      {preview && <img src={preview} alt="" className="size-16 rounded-xl object-cover" />}
                      <div>
                        <p className="text-[20px] font-semibold">{name || "Unnamed"}</p>
                        <p className="num text-[14px] text-ink-3">${symbol || "TICKER"}</p>
                      </div>
                      <Stamp bps={bonus} className="ml-auto" />
                    </div>
                    <div>
                      <Spec k="Supply" v="1,000,000,000 fixed, no mint" />
                      <Spec k="Pool liquidity" v="93%, locked in Uniswap v4" />
                      <Spec k="Bonus treasury" v={`${TREASURY_BPS / 100}%, locked in OnTopHook`} />
                      <Spec k="Pool fee" v={`${(fee / 1e4).toFixed(2)}%`} />
                      <Spec k="Fee split" v={`${HOLDERS_BPS / 100}% holders · ${CREATOR_BPS / 100}% you · 10% platform`} />
                      <Spec k="Starting market cap" v={`${fdv} ETH (${usd(fdv * ethUsd)})`} />
                      <Spec k="First buy" v={Number(firstBuy) > 0 ? eth(Number(firstBuy)) : "Skipped"} />
                    </div>
                    {busy && <p className="num text-[13px] text-accent">{busy}</p>}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
              <Button variant="ghost" disabled={step === 0 || !!busy} onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
              {step < 3 ? (
                <Button variant="primary" disabled={!valid[step]} onClick={() => setStep((s) => s + 1)}>
                  Continue
                </Button>
              ) : (
                <Button variant="primary" size="lg" disabled={!!busy || !valid.every(Boolean)} onClick={() => void submit()}>
                  {w.address ? (busy ? "Working" : "Press start") : "Insert coin to launch"}
                </Button>
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-4 lg:sticky lg:top-28 lg:self-start">
            <Reveal>
              <span className="text-[13px] text-ink-3">How it shows up on the board</span>
              <div className="group mt-3 overflow-hidden rounded-2xl border-2 border-[var(--sticker-shadow)] bg-card shadow-[6px_6px_0_var(--sticker-shadow)] transition-transform duration-300 hover:-rotate-1">
                <div className="relative aspect-[16/10] overflow-hidden bg-raised">
                  {preview ? (
                    <img src={preview} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <TokenArt address={symbol || name || "ONTOP"} symbol={symbol} size={512} className="!h-full !w-full !rounded-none" />
                  )}
                  <motion.span key={bonus} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5, duration: 0.4 }} className="absolute bottom-3 left-3">
                    <Stamp bps={bonus} className="text-[12px]" />
                  </motion.span>
                </div>
                <div className="flex flex-col gap-2 p-4">
                  <span className="text-[16px] font-semibold">
                    {name || "Your token"} <span className="num text-[12px] text-ink-3">${symbol || "TICKER"}</span>
                  </span>
                  <p className="line-clamp-2 text-[13px] leading-5 text-ink-2">{description || "Your story goes here. Tell players what the play is."}</p>
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="num text-[15px] font-medium">{ethUsd ? usd(fdv * ethUsd) : eth(fdv)}</span>
                    <span className="num text-[12px] text-ink-3">starting market cap</span>
                  </div>
                  <span className="mt-1 inline-flex h-8 w-fit items-center rounded-full bg-lime px-4 text-[12px] font-semibold text-lime-ink">Play</span>
                </div>
              </div>
            </Reveal>
            <Card className="p-5">
              <span className="text-[13px] text-ink-3">What every launch gets</span>
              <ul className="mt-3 flex flex-col gap-3 text-[14px] text-ink-2">
                <li>A Uniswap v4 pool on the OnTop hook, live the moment the transaction lands</li>
                <li>A bonus treasury that pays buyers on every buy and refills from sell fees</li>
                <li>Holder payouts in ETH, pushed in rounds, weighted 1× to 2× by hold time</li>
                <li>15% of pool fees to you, claimable whenever you like</li>
                <li>Liquidity nobody can pull, including you</li>
              </ul>
            </Card>
            <Card className="p-5">
              <span className="text-[13px] text-ink-3">Gas on {cfg?.label ?? "Robinhood Chain"}</span>
              <p className="mt-2 text-[14px] text-ink-2">A launch costs about 1.6M gas, a few cents of ETH at current Robinhood Chain prices</p>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
