import { defineChain } from 'viem'

export const RPC_URL: string =
  import.meta.env.VITE_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'

export const EXPLORER_URL = 'https://robinhoodchain.blockscout.com'

// Robinhood Chain mainnet (Arbitrum Orbit L2, ETH gas, ~100ms blocks)
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
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
