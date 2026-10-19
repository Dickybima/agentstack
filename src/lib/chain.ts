import { defineChain } from 'viem'

export const PUBLIC_RPC_URL = 'https://rpc.mainnet.chain.robinhood.com'

// Order the app tries RPCs in: a custom one if configured, then our same-origin proxy
// (api/rpc.js on Vercel, avoids browser CORS/rate-limit issues), then the public endpoint.
export const RPC_URLS: string[] = [
  import.meta.env.VITE_RPC_URL,
  typeof window !== 'undefined' ? `${window.location.origin}/api/rpc` : undefined,
  PUBLIC_RPC_URL,
].filter((u): u is string => !!u)

export const EXPLORER_URL = 'https://robinhoodchain.blockscout.com'

// Robinhood Chain mainnet (Arbitrum Orbit L2, ETH gas, ~100ms blocks)
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [PUBLIC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: EXPLORER_URL, apiUrl: `${EXPLORER_URL}/api` },
  },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
})

export const explorerAddress = (a: string) => `${EXPLORER_URL}/address/${a}`
export const explorerTx = (h: string) => `${EXPLORER_URL}/tx/${h}`
