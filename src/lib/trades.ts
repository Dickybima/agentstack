import { useEffect, useRef, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { decodeEventLog, formatUnits, type Address, type Hex, type PublicClient } from 'viem'
import { EXPLORER_URL, robinhoodChain } from './chain'
import { curveAbi } from './pons'

export type Trade = {
  type: 'buy' | 'sell'
  account: Address
  quote: bigint // ETH spent (buy) or received (sell), as in the event
  tokens: bigint
  price: number // curve price in quote per whole token, excluding fees/tax
  time: number // unix seconds
  block: bigint
  logIndex: number
  hash: `0x${string}`
}

type RawLog = { topics: Hex[]; data: Hex; block: bigint; logIndex: number; hash: Hex; time?: number }

const tradeEvents = curveAbi.filter((x) => x.type === 'event' && (x.name === 'CurveBuy' || x.name === 'CurveSell'))
const POLL_MS = 3_000
const MAX_TRADES = 5_000
const RPC_WINDOW = 50_000n // ≈ 1.4 hours of Robinhood Chain blocks
const RPC_MAX_WINDOWS = 60 // ≈ 3.5 days of history when Blockscout is unavailable
const RPC_PARALLEL = 4

function toTrade(log: RawLog, time: number, tokenDecimals: number, quoteDecimals: number): Trade | undefined {
  let decoded
  try {
    decoded = decodeEventLog({ abi: tradeEvents, data: log.data, topics: log.topics as [Hex, ...Hex[]] })
  } catch {
    return undefined // some other curve event
  }
  const a = decoded.args as Record<string, bigint | Address>
  const buy = decoded.eventName === 'CurveBuy'
  const quote = (buy ? a.quoteIn : a.quoteOut) as bigint
  const tokens = (buy ? a.tokensOut : a.tokensIn) as bigint
  const fee = ((a.fee as bigint) ?? 0n) + ((a.tax as bigint) ?? 0n)
  const grossQuote = buy ? quote - fee : quote + fee
  const t = Number(formatUnits(tokens, tokenDecimals))
  if (!t) return undefined
  return {
    type: buy ? 'buy' : 'sell',
    account: (buy ? a.buyer : a.seller) as Address,
    quote,
    tokens,
    price: Number(formatUnits(grossQuote > 0n ? grossQuote : quote, quoteDecimals)) / t,
    time,
    block: log.block,
    logIndex: log.logIndex,
    hash: log.hash,
  }
}

const hexNum = (v: string) => (v.startsWith('0x') ? Number.parseInt(v, 16) : Number(v))

// Blockscout's logs API returns timestamps with each log and pages at 1000 results.
async function blockscoutLogs(curve: Address): Promise<RawLog[]> {
  const out: RawLog[] = []
  const seen = new Set<string>()
  let from = 0n
  for (let page = 0; page < 30; page++) {
    const result = await fetchLogsPage(curve, from)
    for (const l of result) {
      const key = `${l.transactionHash}-${l.logIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        topics: l.topics.filter(Boolean) as Hex[],
        data: l.data as Hex,
        block: BigInt(hexNum(l.blockNumber)),
        logIndex: hexNum(l.logIndex),
        hash: l.transactionHash as Hex,
        time: hexNum(l.timeStamp),
      })
    }
    if (result.length < 1000) break
    from = out[out.length - 1].block // same block may hold more logs; duplicates are skipped
  }
  return out
}

type BlockscoutLog = { topics: (string | null)[]; data: string; blockNumber: string; logIndex: string; transactionHash: string; timeStamp: string }

async function fetchLogsPage(curve: Address, from: bigint): Promise<BlockscoutLog[]> {
  const errors: string[] = []
  const urls = [
    `/api/logs?address=${curve}&fromBlock=${from}`,
    `${EXPLORER_URL}/api?module=logs&action=getLogs&address=${curve}&fromBlock=${from}&toBlock=latest`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      if (Array.isArray(d?.result)) return d.result
      throw new Error(d?.error || d?.message || 'bad response')
    } catch (e) {
      errors.push((e as Error).message)
    }
  }
  throw new Error(`Blockscout: ${errors.join('; ')}`)
}

// Fallback: scan recent history over RPC in small windows, newest first.
async function rpcLogs(client: PublicClient, curve: Address, latest: bigint): Promise<RawLog[]> {
  const windows: [bigint, bigint][] = []
  for (let i = 0n; i < BigInt(RPC_MAX_WINDOWS); i++) {
    const to = latest - i * RPC_WINDOW
    if (to <= 0n) break
    windows.push([to - RPC_WINDOW + 1n > 0n ? to - RPC_WINDOW + 1n : 0n, to])
  }
  const out: RawLog[] = []
  let emptyStreak = 0
  for (let i = 0; i < windows.length; i += RPC_PARALLEL) {
    const batch = windows.slice(i, i + RPC_PARALLEL)
    const res = await Promise.all(
      batch.map(async ([from, to]) => {
        const logs = await client.getLogs({ address: curve, events: tradeEvents, fromBlock: from, toBlock: to })
        if (!logs.length) return []
        // One timestamp per window edge; blocks are evenly paced, so interpolate in between.
        const [b0, b1] = await Promise.all([client.getBlock({ blockNumber: from }), client.getBlock({ blockNumber: to })])
        const t0 = Number(b0.timestamp)
        const rate = (Number(b1.timestamp) - t0) / Number(to - from || 1n)
        return logs.map((l) => ({
          topics: l.topics as Hex[],
          data: l.data,
          block: l.blockNumber,
          logIndex: l.logIndex,
          hash: l.transactionHash,
          time: Math.round(t0 + Number(l.blockNumber - from) * rate),
        }))
      }),
    )
    const found = res.flat()
    out.push(...found)
    // Stop once we've walked well past the oldest trade (the curve's launch).
    emptyStreak = found.length ? 0 : emptyStreak + batch.length
    if (out.length && emptyStreak >= 8) break
  }
  return out.sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1))
}

async function withTimes(client: PublicClient, logs: RawLog[]) {
  const missing = [...new Set(logs.filter((l) => l.time === undefined).map((l) => l.block))]
  const times = new Map<bigint, number>()
  await Promise.all(
    missing.map(async (n) => {
      const b = await client.getBlock({ blockNumber: n }).catch(() => undefined)
      if (b) times.set(n, Number(b.timestamp))
    }),
  )
  return logs.map((l) => ({ ...l, time: l.time ?? times.get(l.block) ?? Math.floor(Date.now() / 1000) }))
}

// Full trade history of a bonding curve, then polls for new trades every few seconds.
export function useCurveTrades(curve: Address | undefined, tokenDecimals: number, quoteDecimals: number) {
  const client = usePublicClient({ chainId: robinhoodChain.id })
  const [trades, setTrades] = useState<Trade[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string>()
  const lastBlock = useRef(0n)

  useEffect(() => {
    if (!client || !curve) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const keys = new Set<string>()
    const convert = (logs: RawLog[]) =>
      logs
        .map((l) => toTrade(l, l.time!, tokenDecimals, quoteDecimals))
        .filter((t): t is Trade => !!t && !keys.has(`${t.hash}-${t.logIndex}`) && !!keys.add(`${t.hash}-${t.logIndex}`))

    setTrades([])
    setStatus('loading')
    setError(undefined)

    async function poll() {
      try {
        const latest = await client!.getBlockNumber()
        if (latest > lastBlock.current) {
          const logs = await client!.getLogs({ address: curve!, events: tradeEvents, fromBlock: lastBlock.current + 1n, toBlock: latest })
          const raw = logs.map((l) => ({ topics: l.topics as Hex[], data: l.data, block: l.blockNumber, logIndex: l.logIndex, hash: l.transactionHash }))
          const fresh = convert(await withTimes(client!, raw))
          lastBlock.current = latest
          if (!cancelled && fresh.length) setTrades((prev) => [...prev, ...fresh].slice(-MAX_TRADES))
        }
      } catch {
        // transient RPC error: try again next tick
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS)
    }

    async function init() {
      const problems: string[] = []
      try {
        const latest = await client!.getBlockNumber()
        let logs: RawLog[] | undefined
        try {
          logs = await blockscoutLogs(curve!)
        } catch (e) {
          problems.push((e as Error).message)
          logs = await rpcLogs(client!, curve!, latest)
        }
        if (cancelled) return
        lastBlock.current = latest
        setTrades(convert(logs).slice(-MAX_TRADES))
        setStatus('ready')
        timer = setTimeout(poll, POLL_MS)
      } catch (e) {
        if (cancelled) return
        problems.push(`RPC: ${(e as { shortMessage?: string }).shortMessage || (e as Error).message}`)
        setError(problems.join(' · '))
        setStatus('error')
        timer = setTimeout(init, 10_000)
      }
    }

    init()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [client, curve, tokenDecimals, quoteDecimals])

  return { trades, status, error }
}
