import { createConfig, http, type CreateConnectorFn } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { RPC_URL, robinhoodChain } from './lib/chain'

// Free project id from https://dashboard.reown.com — enables QR / mobile wallet connections.
export const WALLETCONNECT_PROJECT_ID: string = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ''

const connectors: CreateConnectorFn[] = [injected()]
if (WALLETCONNECT_PROJECT_ID) {
  connectors.push(
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: 'LOOSE AGENT',
        description: 'Token launchpad on Pons V2, Robinhood Chain',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://agentstack-sandy.vercel.app',
        icons: [typeof window !== 'undefined' ? `${window.location.origin}/logo.png` : ''],
      },
    }),
  )
}

// Installed browser wallets (MetaMask, Rabby, OKX, …) are discovered automatically via EIP-6963.
export const config = createConfig({
  chains: [robinhoodChain],
  connectors,
  transports: { [robinhoodChain.id]: http(RPC_URL, { batch: true }) },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
