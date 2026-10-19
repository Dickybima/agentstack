import type { Address, Hex } from 'viem'
import { EXPLORER_URL } from './chain'

export type ExplorerLog = { topics: Hex[]; data: Hex; block: bigint; logIndex: number; hash: Hex; time: number }

type RawBlockscoutLog = { topics: (string | null)[]; data: string; blockNumber: string; logIndex: string; transactionHash: string; timeStamp: string }

const hexNum = (v: string) => (v.startsWith('0x') ? Number.parseInt(v, 16) : Number(v))

// Optional topic filters, e.g. { topic0: eventSig, topic3: paddedAddress } (AND-combined).
export type TopicFilter = Partial<Record<'topic0' | 'topic1' | 'topic2' | 'topic3', Hex>>

function query(address: Address, from: bigint, topics: TopicFilter) {
  const p = new URLSearchParams({ address, fromBlock: from.toString(), toBlock: 'latest' })
  const names = Object.keys(topics) as (keyof TopicFilter)[]
  for (const k of names) p.set(k, topics[k]!)
  // Blockscout needs an explicit operator for each pair of topics used together.
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) p.set(`${names[i]}_${names[j].slice(5)}_opr`, 'and')
  return p
}

async function fetchPage(address: Address, from: bigint, topics: TopicFilter): Promise<RawBlockscoutLog[]> {
  const q = query(address, from, topics)
  const urls = [`/api/logs?${q}`, `${EXPLORER_URL}/api?module=logs&action=getLogs&${q}`]
  const errors: string[] = []
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

// All logs of a contract via Blockscout's logs API (timestamps included), paging at 1000 results.
export async function explorerLogs(address: Address, topics: TopicFilter = {}, fromBlock = 0n): Promise<ExplorerLog[]> {
  const out: ExplorerLog[] = []
  const seen = new Set<string>()
  let from = fromBlock
  for (let page = 0; page < 30; page++) {
    const result = await fetchPage(address, from, topics)
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
