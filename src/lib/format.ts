import { TOKEN_LOGOS } from './brand'
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

const IPFS_GATEWAYS = ['https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/', 'https://dweb.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/']
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})(\/.*)?$/

// Every URL worth trying for a token logo, best first. Handles https, ipfs://, bare CIDs,
// gateway URLs (re-tried on other gateways), ar://, and inline images.
export function logoCandidates(logo?: string, token?: string): string[] {
  const out: string[] = []
  const override = token ? TOKEN_LOGOS[token.toLowerCase()] : undefined
  const raw = (logo ?? '').trim()
  let ipfsPath: string | undefined
  if (raw.startsWith('ipfs://')) ipfsPath = raw.slice(7).replace(/^ipfs\//, '')
  else if (CID.test(raw)) ipfsPath = raw
  else {
    const m = raw.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/)
    if (m) {
      out.push(raw)
      ipfsPath = m[1]
    } else if (raw.startsWith('ar://')) out.push(`https://arweave.net/${raw.slice(5)}`)
    else if (/^https?:\/\//.test(raw) || raw.startsWith('data:image/')) out.push(raw)
  }
  if (ipfsPath) for (const g of IPFS_GATEWAYS) out.push(g + ipfsPath)
  if (override) out.push(override)
  return [...new Set(out)]
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
