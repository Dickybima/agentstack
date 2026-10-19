import { formatUnits } from 'viem'

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export function fmt(value: bigint, decimals = 18, maxFrac = 4) {
  const n = Number(formatUnits(value, decimals))
  if (n === 0) return '0'
  if (n < 10 ** -maxFrac) return `<${10 ** -maxFrac}`
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac })
}

export function logoUrl(logo?: string) {
  if (!logo) return undefined
  if (logo.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${logo.slice(7)}`
  if (logo.startsWith('https://') || logo.startsWith('data:image/')) return logo
  return undefined
}

export function safeUrl(url?: string) {
  if (!url) return undefined
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined
  } catch {
    return undefined
  }
}

export function errMsg(e: unknown) {
  if (!e) return ''
  const anyE = e as { shortMessage?: string; message?: string; details?: string }
  const base = anyE.shortMessage || anyE.message || String(e)
  return anyE.details && !base.includes(anyE.details) ? `${base} ${anyE.details}` : base
}
