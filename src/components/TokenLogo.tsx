import { useState } from 'react'

export default function TokenLogo({ src, symbol, size = 48 }: { src?: string; symbol: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  const style = { width: size, height: size }
  if (!src || broken) {
    return (
      <div className="logo logo-fallback" style={style}>
        {symbol.slice(0, 2).toUpperCase()}
      </div>
    )
  }
  return <img className="logo" style={style} src={src} alt={symbol} onError={() => setBroken(true)} />
}
