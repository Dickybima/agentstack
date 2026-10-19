import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from 'wagmi'
import { robinhoodChain } from '../lib/chain'
import { shortAddr } from '../lib/format'

export default function ConnectButton() {
  const { address, isConnected, chainId } = useConnection()
  const connectors = useConnectors()
  const connect = useConnect()
  const disconnect = useDisconnect()
  const switchChain = useSwitchChain()

  if (!isConnected) {
    const injected = connectors[0]
    return (
      <button
        className="btn primary"
        disabled={connect.isPending}
        onClick={() => injected && connect.mutate({ connector: injected, chainId: robinhoodChain.id })}
      >
        {connect.isPending ? 'Connecting…' : 'Connect wallet'}
      </button>
    )
  }

  if (chainId !== robinhoodChain.id) {
    return (
      <button className="btn warn" onClick={() => switchChain.mutate({ chainId: robinhoodChain.id })}>
        Switch to Robinhood Chain
      </button>
    )
  }

  return (
    <button className="btn ghost" title="Disconnect" onClick={() => disconnect.mutate()}>
      {shortAddr(address)}
    </button>
  )
}
