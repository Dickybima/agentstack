import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain, type Connector } from 'wagmi'
import { robinhoodChain } from '../lib/chain'
import { errMsg, shortAddr } from '../lib/format'

// Shown when the wallet isn't installed: install page on desktop, in-app browser deep link on mobile.
const SUGGESTED = [
  {
    name: 'MetaMask',
    color: '#f6851b',
    rdns: 'io.metamask',
    install: 'https://metamask.io/download/',
    deeplink: (url: string) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}`,
  },
  {
    name: 'Rabby',
    color: '#7084ff',
    rdns: 'io.rabby',
    install: 'https://rabby.io/',
    deeplink: undefined,
  },
  {
    name: 'OKX Wallet',
    color: '#ffffff',
    rdns: 'com.okex.wallet',
    install: 'https://www.okx.com/web3',
    deeplink: (url: string) => `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`,
  },
  {
    name: 'Trust Wallet',
    color: '#3375bb',
    rdns: 'com.trustwallet.app',
    install: 'https://trustwallet.com/download',
    deeplink: (url: string) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`,
  },
]

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export default function ConnectButton() {
  const { address, isConnected, chainId, connector } = useConnection()
  const disconnect = useDisconnect()
  const switchChain = useSwitchChain()
  const [open, setOpen] = useState(false)

  if (!isConnected) {
    return (
      <>
        <button className="btn primary" onClick={() => setOpen(true)}>
          Connect wallet
        </button>
        {open && <WalletModal onClose={() => setOpen(false)} />}
      </>
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
    <button className="btn ghost wallet-btn" title="Disconnect" onClick={() => disconnect.mutate()}>
      {connector?.icon && <img src={connector.icon} alt="" />}
      {shortAddr(address)}
    </button>
  )
}

function WalletModal({ onClose }: { onClose: () => void }) {
  const connectors = useConnectors()
  const connect = useConnect()
  const [pendingId, setPendingId] = useState<string>()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // EIP-6963 wallets carry an rdns id; the generic `injected` entry is only useful when none announced themselves.
  const announced = connectors.filter((c) => c.type === 'injected' && c.id !== 'injected')
  const generic = connectors.find((c) => c.id === 'injected')
  const walletConnect = connectors.find((c) => c.type === 'walletConnect')
  const hasLegacyInjected = typeof window !== 'undefined' && !!(window as { ethereum?: unknown }).ethereum
  const installed: Connector[] = announced.length ? announced : generic && hasLegacyInjected ? [generic] : []
  const installedIds = new Set(installed.map((c) => c.id))
  const suggestions = SUGGESTED.filter((w) => !installedIds.has(w.rdns))

  function pick(c: Connector) {
    setPendingId(c.uid)
    if (c.type === 'walletConnect') onClose() // its own QR modal takes over
    connect.mutate(
      { connector: c, chainId: robinhoodChain.id },
      { onSuccess: onClose, onSettled: () => setPendingId(undefined) },
    )
  }

  // Portal to <body>: the sticky header's backdrop-filter would otherwise trap `position: fixed`.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label="Connect a wallet" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 className="modal-title">Connect a wallet</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        {installed.length > 0 && (
          <>
            <p className="muted small modal-label">Installed</p>
            <div className="wallet-list">
              {installed.map((c) => (
                <button key={c.uid} className="wallet-item" disabled={connect.isPending} onClick={() => pick(c)}>
                  <WalletIcon src={c.icon} name={c.name} />
                  <span className="wallet-name">{c.id === 'injected' ? 'Browser wallet' : c.name}</span>
                  {pendingId === c.uid ? <span className="muted small">Connecting…</span> : <span className="tag">Detected</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {walletConnect && (
          <>
            <p className="muted small modal-label">Mobile & other wallets</p>
            <div className="wallet-list">
              <button className="wallet-item" disabled={connect.isPending} onClick={() => pick(walletConnect)}>
                <WalletIcon src="/walletconnect.svg" name="WalletConnect" />
                <span className="wallet-name">WalletConnect</span>
                <span className="muted small">Scan QR</span>
              </button>
            </div>
          </>
        )}

        {suggestions.length > 0 && (
          <>
            <p className="muted small modal-label">{installed.length ? 'More wallets' : 'Get a wallet'}</p>
            <div className="wallet-list">
              {suggestions.map((w) => {
                const href = isMobile() && w.deeplink ? w.deeplink(window.location.href) : w.install
                return (
                  <a key={w.rdns} className="wallet-item" href={href} target="_blank" rel="noreferrer noopener">
                    <WalletIcon name={w.name} color={w.color} />
                    <span className="wallet-name">{w.name}</span>
                    <span className="muted small">{isMobile() && w.deeplink ? 'Open app' : 'Install'} ↗</span>
                  </a>
                )
              })}
            </div>
          </>
        )}

        {connect.error && <p className="error small">{errMsg(connect.error)}</p>}
        <p className="muted small">
          Robinhood Chain will be added to your wallet automatically if it isn't there yet.
        </p>
      </div>
    </div>,
    document.body,
  )
}

function WalletIcon({ src, name, color }: { src?: string; name: string; color?: string }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken)
    return (
      <span className="wallet-icon fallback" style={color ? { borderColor: color, color } : undefined}>
        {name.slice(0, 1)}
      </span>
    )
  return <img className="wallet-icon" src={src} alt="" onError={() => setBroken(true)} />
}
