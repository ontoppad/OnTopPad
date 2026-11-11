import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function theme() {
  return {
    text: css("--ink-3"),
    grid: css("--line"),
    up: css("--up"),
    down: css("--down"),
    accent: css("--lime"),
    accentLine: css("--accent"),
    vol: document.documentElement.dataset.theme === "light" ? "rgba(21,23,15,0.12)" : "rgba(238,240,230,0.12)",
  };
}

function useThemeKey() {
  const [k, setK] = useState(document.documentElement.dataset.theme);
  useEffect(() => {
    const o = new MutationObserver(() => setK(document.documentElement.dataset.theme));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => o.disconnect();
  }, []);
  return k;
}

function baseChart(el: HTMLElement, fmt: (v: number) => string) {
  const t = theme();
  return createChart(el, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: t.text, fontFamily: "JetBrains Mono Variable, monospace", fontSize: 11, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: t.grid } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.22 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4 },
    crosshair: { mode: CrosshairMode.Normal, vertLine: { color: t.text, labelBackgroundColor: t.text }, horzLine: { color: t.text, labelBackgroundColor: t.text } },
    localization: { priceFormatter: fmt },
    // wheel and vertical swipes belong to the page, or scrolling stalls whenever the cursor crosses the chart; drag and pinch still pan and zoom
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
  });
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * Launch prices are often 1e-7 or smaller, below what the chart's price scale can step through,
 * so series are drawn scaled into the hundreds and every label divides the scale back out.
 */
function scaleFor(values: number[]): number {
  const max = Math.max(...values.filter((v) => v > 0), 0);
  return max > 0 ? 10 ** (2 - Math.floor(Math.log10(max))) : 1;
}

/** Price candles. Down candles are hollow so direction never rests on color alone. */
export function CandleChart({ candles, format, height = 360 }: { candles: Candle[]; format: (v: number) => string; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const scale = useRef(1);
  const chart = useRef<IChartApi>(null);
  const series = useRef<{ c: ISeriesApi<"Candlestick">; v: ISeriesApi<"Histogram"> }>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const themeKey = useThemeKey();
  const fmtRef = useRef(format);
  fmtRef.current = format;

  useEffect(() => {
    const c = baseChart(el.current!, (v) => fmtRef.current(v / scale.current));
    const t = theme();
    const cs = c.addSeries(CandlestickSeries, {
      upColor: t.up,
      downColor: "transparent",
      borderUpColor: t.up,
      borderDownColor: t.down,
      wickUpColor: t.up,
      wickDownColor: t.down,
      priceFormat: { type: "custom", formatter: (v: number) => fmtRef.current(v / scale.current), minMove: 0.0001 },
    });
    const vs = c.addSeries(HistogramSeries, { priceScaleId: "vol", color: t.vol, priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    c.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(cs) as { open: number; high: number; low: number; close: number; time: number } | undefined;
      const v = p.seriesData.get(vs) as { value: number } | undefined;
      const k = scale.current;
      setHover(d ? { t: d.time, o: d.open / k, h: d.high / k, l: d.low / k, c: d.close / k, v: v?.value ?? 0 } : null);
    });
    chart.current = c;
    series.current = { c: cs, v: vs };
    return () => {
      c.remove();
      chart.current = null;
    };
  }, [themeKey]);

  useEffect(() => {
    if (!series.current) return;
    const k = (scale.current = scaleFor(candles.map((c) => c.h)));
    series.current.c.setData(candles.map((c) => ({ time: c.t as UTCTimestamp, open: c.o * k, high: c.h * k, low: c.l * k, close: c.c * k })));
    series.current.v.setData(candles.map((k) => ({ time: k.t as UTCTimestamp, value: k.v })));
    // young tokens have few bars: spread them over the width instead of a sliver at the right edge
    if (candles.length < 120) chart.current?.timeScale().fitContent();
  }, [candles, themeKey]);

  const shown = hover ?? candles[candles.length - 1];
  return (
    <div className="relative" style={{ height }}>
      {shown && (
        <div className="pointer-events-none absolute left-0 top-0 z-10 flex flex-wrap gap-x-3 num text-[12px] text-ink-3">
          <span>O <span className="text-ink-2">{format(shown.o)}</span></span>
          <span>H <span className="text-ink-2">{format(shown.h)}</span></span>
          <span>L <span className="text-ink-2">{format(shown.l)}</span></span>
          <span>C <span className={shown.c >= shown.o ? "text-up" : "text-down-ink"}>{format(shown.c)}</span></span>
        </div>
      )}
      <div ref={el} className="absolute inset-0" />
    </div>
  );
}

/** Cumulative line for a single running total. */
export function AreaChart({ points, format, height = 280 }: { points: { t: number; v: number }[]; format: (v: number) => string; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const s = useRef<ISeriesApi<"Area">>(null);
  const chartRef = useRef<IChartApi>(null);
  const themeKey = useThemeKey();
  const fmtRef = useRef(format);
  fmtRef.current = format;

  useEffect(() => {
    // float noise near the baseline would print as a subscript; leave that tick unlabeled
    const c = baseChart(el.current!, (v) => (Math.abs(v) < 1e-9 ? "" : fmtRef.current(v)));
    c.applyOptions({ rightPriceScale: { scaleMargins: { top: 0.15, bottom: 0.05 } }, timeScale: { timeVisible: true } });
    const t = theme();
    s.current = c.addSeries(AreaSeries, {
      lineColor: t.accentLine,
      lineWidth: 2,
      topColor: document.documentElement.dataset.theme === "light" ? "rgba(79,102,0,0.16)" : "rgba(203,253,0,0.14)",
      bottomColor: "rgba(0,0,0,0)",
      priceFormat: { type: "custom", formatter: (v: number) => fmtRef.current(v), minMove: 1e-12 },
      crosshairMarkerRadius: 4,
    });
    chartRef.current = c;
    return () => c.remove();
  }, [themeKey]);

  useEffect(() => {
    s.current?.setData(points.map((p) => ({ time: p.t as UTCTimestamp, value: p.v })));
    chartRef.current?.timeScale().fitContent();
  }, [points, themeKey]);

  return <div ref={el} style={{ height }} />;
}
