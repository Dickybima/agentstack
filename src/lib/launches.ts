import { robinhoodChain } from './chain'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { decodeEventLog, pad, toEventSelector, type Address, type Hex, type PublicClient } from 'viem'
import { explorerLogs } from './blockscout'
import { FACTORY_DEPLOY_BLOCK, PONS, ZERO_ADDRESS, curveAbi, factoryAbi, tokenAbi } from './pons'

export type Launch = {
  token: Address
  curve: Address
  deployer: Address
  pairToken: Address
  blockNumber: bigint
  name: string
  symbol: string
  logo: string
  description: string
  raised: bigint
  threshold: bigint
  graduated: boolean
}

const launchedEvent = factoryAbi.find((x) => x.type === 'event' && x.name === 'TokenLaunched')!

// ~100ms blocks: 200k blocks ≈ 5.5 hours. Factory logs are sparse enough for wide spans.
const WINDOW = 200_000n
const MAX_WINDOWS_PER_PAGE = 12
const PAGE_SIZE = 24

type Raw = Pick<Launch, 'token' | 'curve' | 'deployer' | 'pairToken' | 'blockNumber'>

async function enrich(client: PublicClient, raw: Raw[]) {
  if (raw.length === 0) return []
  const calls = raw.flatMap((l) => [
    { address: l.token, abi: tokenAbi, functionName: 'name' },
    { address: l.token, abi: tokenAbi, functionName: 'symbol' },
    { address: l.token, abi: tokenAbi, functionName: 'getTokenInfo' },
    { address: l.curve, abi: curveAbi, functionName: 'realQuoteReserve' },
    { address: l.curve, abi: curveAbi, functionName: 'graduationThreshold' },
    { address: l.curve, abi: curveAbi, functionName: 'graduated' },
  ] as const)
  const res = await client.multicall({ contracts: calls, allowFailure: true })
  return raw.map((l, i) => {
    const r = res.slice(i * 6, i * 6 + 6).map((x) => (x.status === 'success' ? x.result : undefined))
    const info = r[2] as readonly [Address, string, string, unknown] | undefined
    return {
      ...l,
      name: (r[0] as string) ?? 'Unknown',
      symbol: (r[1] as string) ?? '???',
      logo: info?.[1] ?? '',
      description: info?.[2] ?? '',
      raised: (r[3] as bigint) ?? 0n,
      threshold: (r[4] as bigint) ?? 0n,
      graduated: (r[5] as boolean) ?? false,
    }
  })
}

// Scans TokenLaunched logs backwards from `toBlock` until a page is filled.
async function fetchLaunchPage(client: PublicClient, toBlock: bigint) {
  const raw = []
  let to = toBlock
  for (let i = 0; i < MAX_WINDOWS_PER_PAGE && to >= FACTORY_DEPLOY_BLOCK && raw.length < PAGE_SIZE; i++) {
    const from = to - WINDOW + 1n > FACTORY_DEPLOY_BLOCK ? to - WINDOW + 1n : FACTORY_DEPLOY_BLOCK
    const logs = await client.getLogs({ address: PONS.factory, event: launchedEvent, fromBlock: from, toBlock: to })
    for (const log of logs.reverse()) {
      raw.push({
        token: log.args.token!,
        curve: log.args.curve!,
        deployer: log.args.deployer!,
        pairToken: log.args.pairToken ?? ZERO_ADDRESS,
        blockNumber: log.blockNumber,
      })
    }
    to = from - 1n
  }
  return { launches: await enrich(client, raw), nextTo: to >= FACTORY_DEPLOY_BLOCK ? to : undefined }
}

export function useLaunches() {
  const client = usePublicClient({ chainId: robinhoodChain.id })
  return useInfiniteQuery({
    queryKey: ['launches'],
    enabled: !!client,
    initialPageParam: undefined as bigint | undefined,
    queryFn: async ({ pageParam }) => {
      const to = pageParam ?? (await client!.getBlockNumber())
      return fetchLaunchPage(client!, to)
    },
    getNextPageParam: (last) => last.nextTo,
    refetchInterval: 30_000,
  })
}

async function launchLogsBy(client: PublicClient, deployer: Address, from: bigint, to: bigint): Promise<Raw[]> {
  const logs = await client.getLogs({ address: PONS.factory, event: launchedEvent, args: { deployer }, fromBlock: from, toBlock: to })
  return logs.map((log) => ({
    token: log.args.token!,
    curve: log.args.curve!,
    deployer: log.args.deployer!,
    pairToken: log.args.pairToken ?? ZERO_ADDRESS,
    blockNumber: log.blockNumber,
  }))
}

// Scans factory history a few windows at a time; when the RPC rejects a span, shrinks
// the window for everything that follows instead of re-splitting each range.
async function scanLaunchesBy(client: PublicClient, deployer: Address): Promise<Raw[]> {
  const latest = await client.getBlockNumber()
  const out: Raw[] = []
  let size = 1_000_000n
  let cursor = FACTORY_DEPLOY_BLOCK
  while (cursor <= latest) {
    const ranges: [bigint, bigint][] = []
    for (let f = cursor; f <= latest && ranges.length < 6; f += size) ranges.push([f, f + size - 1n < latest ? f + size - 1n : latest])
    try {
      const res = await Promise.all(ranges.map(([f, t]) => launchLogsBy(client, deployer, f, t)))
      out.push(...res.flat())
      cursor = ranges[ranges.length - 1][1] + 1n
    } catch (e) {
      if (size <= 5_000n) throw e
      size /= 2n
    }
  }
  return out
}

async function launchesByDeployer(client: PublicClient, deployer: Address): Promise<Raw[]> {
  try {
    const logs = await explorerLogs(PONS.factory, {
      topic0: toEventSelector(launchedEvent),
      topic3: pad(deployer.toLowerCase() as Hex),
    })
    return logs.map((l) => {
      const { args } = decodeEventLog({ abi: [launchedEvent], data: l.data, topics: l.topics as [Hex, ...Hex[]] })
      return { token: args.token, curve: args.curve, deployer: args.deployer, pairToken: args.pairToken, blockNumber: l.block }
    })
  } catch {
    return scanLaunchesBy(client, deployer) // explorer unavailable
  }
}

export function useLaunchesBy(deployer?: Address) {
  const client = usePublicClient({ chainId: robinhoodChain.id })
  return useQuery({
    queryKey: ['launchesBy', deployer],
    enabled: !!client && !!deployer,
    queryFn: async () => {
      const raw = await launchesByDeployer(client!, deployer!)
      return enrich(client!, raw.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1)))
    },
  })
}
