import { useEffect, useRef, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { formatUnits, type Address, type PublicClient } from 'viem'
import { robinhoodChain } from './chain'
import { FACTORY_DEPLOY_BLOCK, PONS, curveAbi, factoryAbi } from './pons'

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

const launchedEvent = factoryAbi.find((x) => x.type === 'event' && x.name === 'TokenLaunched')!
const tradeEvents = curveAbi.filter((x) => x.type === 'event' && (x.name === 'CurveBuy' || x.name === 'CurveSell'))
const POLL_MS = 3_000
const MAX_TRADES = 3_000

async function getLogsSplit(client: PublicClient, address: Address, from: bigint, to: bigint): Promise<Awaited<ReturnType<typeof client.getLogs<undefined, typeof tradeEvents>>>> {
  try {
    return await client.getLogs({ address, events: tradeEvents, fromBlock: from, toBlock: to })
  } catch (e) {
    // Too many logs / too wide a range: split in half and retry.
    if (to - from < 1_000n) throw e
    const mid = from + (to - from) / 2n
    return [...(await getLogsSplit(client, address, from, mid)), ...(await getLogsSplit(client, address, mid + 1n, to))]
  }
}

async function blockTimes(client: PublicClient, blocks: bigint[]) {
  const times = new Map<bigint, number>()
  const unique = [...new Set(blocks)]
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50)
    const res = await Promise.all(chunk.map((n) => client.getBlock({ blockNumber: n }).catch(() => undefined)))
    res.forEach((b, j) => b && times.set(chunk[j], Number(b.timestamp)))
  }
  return times
}

async function toTrades(client: PublicClient, logs: Awaited<ReturnType<typeof getLogsSplit>>, tokenDecimals: number, quoteDecimals: number) {
  const recent = logs.slice(-MAX_TRADES)
  const times = await blockTimes(client, recent.map((l) => l.blockNumber))
  const out: Trade[] = []
  for (const log of recent) {
    const a = log.args as Record<string, bigint | Address>
    const buy = log.eventName === 'CurveBuy'
    const quote = (buy ? a.quoteIn : a.quoteOut) as bigint
    const tokens = (buy ? a.tokensOut : a.tokensIn) as bigint
    const fee = ((a.fee as bigint) ?? 0n) + ((a.tax as bigint) ?? 0n)
    const grossQuote = buy ? quote - fee : quote + fee
    const t = Number(formatUnits(tokens, tokenDecimals))
    const time = times.get(log.blockNumber)
    if (!t || time === undefined) continue
    out.push({
      type: buy ? 'buy' : 'sell',
      account: (buy ? a.buyer : a.seller) as Address,
      quote,
      tokens,
      price: Number(formatUnits(grossQuote > 0n ? grossQuote : quote, quoteDecimals)) / t,
      time,
      block: log.blockNumber,
      logIndex: log.logIndex,
      hash: log.transactionHash,
    })
  }
  return out
}

// Full trade history of a bonding curve, then polls for new trades every few seconds.
export function useCurveTrades(token: Address, curve: Address | undefined, tokenDecimals: number, quoteDecimals: number) {
  const client = usePublicClient({ chainId: robinhoodChain.id })
  const [trades, setTrades] = useState<Trade[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string>()
  const lastBlock = useRef<bigint>(0n)

  useEffect(() => {
    if (!client || !curve) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    setTrades([])
    setStatus('loading')

    async function poll() {
      try {
        const latest = await client!.getBlockNumber()
        if (latest > lastBlock.current) {
          const logs = await getLogsSplit(client!, curve!, lastBlock.current + 1n, latest)
          const fresh = await toTrades(client!, logs, tokenDecimals, quoteDecimals)
          lastBlock.current = latest
          if (!cancelled && fresh.length) setTrades((prev) => [...prev, ...fresh].slice(-MAX_TRADES))
        }
      } catch {
        // transient RPC error: try again next tick
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS)
    }

    async function init() {
      try {
        const latest = await client!.getBlockNumber()
        const [launch] = await client!.getLogs({
          address: PONS.factory,
          event: launchedEvent,
          args: { token },
          fromBlock: FACTORY_DEPLOY_BLOCK,
          toBlock: latest,
        })
        const from = launch?.blockNumber ?? (latest > 2_000_000n ? latest - 2_000_000n : 0n)
        const logs = await getLogsSplit(client!, curve!, from, latest)
        const all = await toTrades(client!, logs, tokenDecimals, quoteDecimals)
        if (cancelled) return
        lastBlock.current = latest
        setTrades(all)
        setStatus('ready')
        timer = setTimeout(poll, POLL_MS)
      } catch (e) {
        if (cancelled) return
        setError((e as Error).message)
        setStatus('error')
        timer = setTimeout(init, 10_000)
      }
    }

    init()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [client, token, curve, tokenDecimals, quoteDecimals])

  return { trades, status, error }
}
