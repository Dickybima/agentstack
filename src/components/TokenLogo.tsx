import { useEffect, useState } from 'react'
import { logoCandidates } from '../lib/format'

type Props = { logo?: string; token?: string; symbol: string; size?: number }

// Tries each candidate URL in turn (e.g. several IPFS gateways) before falling back to initials.
export default function TokenLogo({ logo, token, symbol, size = 48 }: Props) {
  const candidates = logoCandidates(logo, token)
  const key = candidates.join('|')
  const [idx, setIdx] = useState(0)
  useEffect(() => setIdx(0), [key])
  const style = { width: size, height: size }
  const src = candidates[idx]
  if (!src) {
    return (
      <div className="logo logo-fallback" style={style}>
        {symbol.slice(0, 2).toUpperCase()}
      </div>
    )
  }
  return <img className="logo" style={style} src={src} alt={symbol} onError={() => setIdx((i) => i + 1)} />
}
