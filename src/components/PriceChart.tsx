import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Trade } from '../lib/trades'
import { fmtSmall, fmtUsd } from '../lib/price'

const INTERVALS = [
  ['1m', 60],
  ['5m', 300],
  ['15m', 900],
  ['1h', 3600],
  ['4h', 14400],
  ['1d', 86400],
] as const

type Mode = 'mcap' | 'price'

type Props = {
  trades: Trade[]
  supply: number // whole tokens
  ethUsd?: number
  quoteSymbol: string
  quoteDecimals: number
  status: 'loading' | 'ready' | 'error'
}

type Candle = { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number; up: boolean }

function buildCandles(trades: Trade[], interval: number, scale: number, volScale: number, quoteDecimals: number): Candle[] {
  const candles: Candle[] = []
  let prevClose: number | undefined
  for (const t of trades) {
    const bucket = (Math.floor(t.time / interval) * interval) as UTCTimestamp
    const v = t.price * scale
    const vol = (Number(t.quote) / 10 ** quoteDecimals) * volScale
    let c = candles[candles.length - 1]
    if (!c || c.time !== bucket) {
      const open = prevClose ?? v
      c = { time: bucket, open, high: Math.max(open, v), low: Math.min(open, v), close: v, volume: 0, up: true }
      candles.push(c)
    }
    c.high = Math.max(c.high, v)
    c.low = Math.min(c.low, v)
    c.close = v
    c.volume += vol
    c.up = c.close >= c.open
    prevClose = v
  }
  return candles
}

export default function PriceChart({ trades, supply, ethUsd, quoteSymbol, quoteDecimals, status }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null)
  const [interval, setBucket] = useState(60)
  const [mode, setMode] = useState<Mode>('mcap')
  const usd = ethUsd ?? 0
  const inUsd = usd > 0 && quoteSymbol === 'ETH'

  // Price per token in USD (or quote), multiplied by supply for market cap.
  const scale = (inUsd ? usd : 1) * (mode === 'mcap' ? supply : 1)
  const volScale = inUsd ? usd : 1
  const candles = useMemo(
    () => buildCandles(trades, interval, scale, volScale, quoteDecimals),
    [trades, interval, scale, volScale, quoteDecimals],
  )
  const fmt = useMemo(
    () => (v: number) => (inUsd ? (mode === 'mcap' ? fmtUsd(v) : fmtSmall(v, '$')) : `${fmtSmall(v)} ${quoteSymbol}`),
    [inUsd, mode, quoteSymbol],
  )

  useEffect(() => {
    if (!box.current) return
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#8a9a8f', attributionLogo: false },
      grid: { vertLines: { color: '#1a231d' }, horzLines: { color: '#1a231d' } },
      rightPriceScale: { borderColor: '#243028' },
      timeScale: { borderColor: '#243028', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      // Explicit locale: some browsers report tags like 'en-US@posix' that Intl rejects.
      localization: { locale: 'en-US' },
    })
    candleSeries.current = c.addSeries(CandlestickSeries, {
      upColor: '#c3f53c',
      downColor: '#ff5a5f',
      borderUpColor: '#c3f53c',
      borderDownColor: '#ff5a5f',
      wickUpColor: '#c3f53c',
      wickDownColor: '#ff5a5f',
    })
    volumeSeries.current = c.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    candleSeries.current.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } })
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    candleSeries.current?.applyOptions({
      priceFormat: { type: 'custom', formatter: fmt, minMove: 1e-15 },
    })
  }, [fmt])

  // Re-fit only when the view changes, not on every new trade, so users can pan freely.
  const fitKey = `${interval}-${mode}-${candles.length > 0}`
  const lastFit = useRef('')
  useEffect(() => {
    candleSeries.current?.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })))
    volumeSeries.current?.setData(
      candles.map((c) => ({ time: c.time, value: c.volume, color: c.up ? 'rgba(195,245,60,0.35)' : 'rgba(255,90,95,0.35)' })),
    )
    if (lastFit.current !== fitKey && candles.length) {
      chart.current?.timeScale().fitContent()
      lastFit.current = fitKey
    }
  }, [candles, fitKey])

  const last = candles[candles.length - 1]

  return (
    <div className="chart-card">
      <div className="chart-bar">
        <div className="seg-mini">
          {(['mcap', 'price'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {m === 'mcap' ? 'Market cap' : 'Price'}
            </button>
          ))}
        </div>
        <div className="seg-mini">
          {INTERVALS.map(([label, secs]) => (
            <button key={label} className={interval === secs ? 'active' : ''} onClick={() => setBucket(secs)}>
              {label}
            </button>
          ))}
        </div>
        <span className="live">
          <span className="dot" /> Live
        </span>
      </div>
      {last && (
        <div className="chart-legend small">
          <span>O <b>{fmt(last.open)}</b></span>
          <span>H <b>{fmt(last.high)}</b></span>
          <span>L <b>{fmt(last.low)}</b></span>
          <span>C <b className={last.up ? 'up' : 'down'}>{fmt(last.close)}</b></span>
        </div>
      )}
      <div className="chart-box" ref={box}>
        {status === 'loading' && <div className="chart-overlay muted small">Loading trades…</div>}
        {status === 'error' && <div className="chart-overlay error small">Couldn't load trades, retrying…</div>}
        {status === 'ready' && candles.length === 0 && <div className="chart-overlay muted small">No trades yet</div>}
      </div>
    </div>
  )
}
