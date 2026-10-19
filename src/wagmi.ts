import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { RPC_URL, robinhoodChain } from './lib/chain'

export const config = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
  transports: { [robinhoodChain.id]: http(RPC_URL, { batch: true }) },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
